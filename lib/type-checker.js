import {TypeError} from './errors.js'

/**
 * TypeChecker performs static type analysis on CEL expressions
 * without executing them. It validates:
 * - Variable existence and types
 * - Function signatures and overloads
 * - Operator compatibility using the actual overload registry
 * - Property and index access validity
 */
export class TypeChecker {
  constructor({
    environment,
    variables,
    functions,
    objectTypes,
    objectTypesByConstructor,
    overloads
  }) {
    this.environment = environment
    this.variables = variables
    this.functions = functions
    this.objectTypes = objectTypes
    this.objectTypesByConstructor = objectTypesByConstructor
    this.overloads = overloads
  }

  /**
   * Check an expression and return its inferred type
   * @param {Array|any} ast - The AST node to check
   * @returns {string} The inferred type name
   * @throws {TypeError} If type checking fails
   */
  check(ast) {
    if (!Array.isArray(ast)) return this.inferLiteralType(ast)

    switch (ast[0]) {
      case 'id':
        return this.checkVariable(ast)
      case '.':
      case '[]':
        return this.checkAccess(ast)
      case 'call':
        return this.checkCall(ast)
      case 'rcall':
        return this.checkMethodCall(ast)
      case 'list':
        return this.checkList(ast)
      case 'map':
        return this.checkMap(ast)
      case '?:':
        return this.checkTernary(ast)
      case '||':
      case '&&':
        return this.checkLogicalOp(ast)
      case '!_':
      case '-_':
        return this.checkUnaryOperator(ast)
      case '==':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
      case 'in':
        return this.checkBinaryOperator(ast)
      default:
        throw new TypeError(`Unknown operation: ${ast[0]}`, ast)
    }
  }

  inferLiteralType(value) {
    switch (typeof value) {
      case 'string':
        return 'string'
      case 'bigint':
        return 'int'
      case 'number':
        return 'double'
      case 'boolean':
        return 'bool'
      case 'object':
        if (value === null) return 'null'
        const type = this.objectTypesByConstructor.get(value.constructor)
        if (type) return type
        throw new TypeError(`Unexpected object in AST: ${value.constructor?.name || value}`)
      default:
        return 'dyn'
    }
  }

  checkVariable(ast) {
    const varName = ast[1]
    const varType = this.variables.get(varName)
    if (varType !== undefined) return varType
    throw new TypeError(`Unknown variable: ${varName}`, ast)
  }

  checkAccess(ast) {
    const leftType = this.check(ast[1])
    if (leftType === 'dyn') return 'dyn'

    const indexType = ast[0] === '[]' ? this.check(ast[2]) : 'string'

    const listTypeMatch = leftType.match(/^list<(.+)>$/)
    if (listTypeMatch || leftType === 'list') {
      if (indexType !== 'int' && indexType !== 'dyn') {
        throw new TypeError(`List index must be int, got '${indexType}'`, ast)
      }
      // Return element type if available, otherwise 'dyn'
      return listTypeMatch ? listTypeMatch[1] : 'dyn'
    }

    // Extract value type from map<K, V> notation
    const mapTypeMatch = leftType.match(/^map<.+,\s*(.+)>$/)
    if (mapTypeMatch || leftType === 'map') return mapTypeMatch ? mapTypeMatch[1] : 'dyn'

    // Custom types support property access
    if (this.objectTypes.has(leftType)) return 'dyn'

    // No other types support indexing/property access
    throw new TypeError(`Cannot index type '${leftType}'`, ast)
  }

  checkCall(ast) {
    const functionName = ast[1]
    const fn = this.functions.standalone[functionName]
    if (!fn) throw new TypeError(`Function not found: '${functionName}'`, ast)
    if (fn.unknownargs) return 'dyn'
    if (fn.macro) return this.functions.returnTypes[functionName] || 'dyn'

    const args = ast[2]
    const argTypes = args.map((arg) => this.check(arg))
    let current = fn
    for (const argType of argTypes) {
      if (argType === 'dyn') return this.functions.returnTypes[functionName]
      if (!current) break
      current = current?.[argType]
    }

    if (current?.handler) return current.returnType || 'dyn'
    throw new TypeError(`No matching overload for '${functionName}(${argTypes.join(', ')})'`, ast)
  }

  checkMethodCall(ast) {
    const methodName = ast[1]
    const receiverType = this.check(ast[2])
    if (receiverType === 'dyn') return 'dyn'

    const receiverBaseType = receiverType
      .replace(/^list<(.+)>$/, 'list')
      .replace(/^map<.+>$/, 'map')

    const fn = this.functions[receiverBaseType]?.[methodName]
    if (!fn) {
      throw new TypeError(`Method not found: '${methodName}' for type '${receiverType}'`, ast)
    }

    const args = ast[3]

    if (!fn.macro) {
      const argTypes = args.map((arg) => this.check(arg))

      let current = fn
      for (const argType of argTypes) {
        if (!current) {
          throw new TypeError(
            `No matching overload for '${receiverType}.${methodName}(${argTypes.join(', ')})'`,
            ast
          )
        }
        current = current[argType] || current['dyn']
      }

      if (!current?.handler) {
        throw new TypeError(
          `No matching overload for '${receiverType}.${methodName}(${argTypes.join(', ')})'`,
          ast
        )
      }

      return current.returnType || 'dyn'
    }

    // For macro functions, find the handler by traversing with 'ast' args
    let current = fn
    for (let i = 0; i < args.length; i++) {
      current = current?.['ast']
      if (!current) break
    }

    // If a custom typeCheck function is registered, use it
    if (current?.typeCheck) return current.typeCheck(this, receiverType, args)

    // Fallback to default return type
    return this.functions.returnTypes[methodName] || 'dyn'
  }

  checkList(ast) {
    const elements = ast[1]
    if (elements.length === 0) return 'list'

    // Infer element type if all elements have the same type
    const firstType = this.check(elements[0])
    let allSameType = true

    for (let i = 1; i < elements.length; i++) {
      const elemType = this.check(elements[i])
      if (elemType !== firstType) {
        allSameType = false
        break
      }
    }

    if (allSameType && firstType !== 'dyn') return `list<${firstType}>`
    return 'list'
  }

  checkMap(ast) {
    const entries = ast[1]
    if (entries.length === 0) return 'map'

    // Infer key and value types if all keys and values have consistent types
    const firstKeyType = this.check(entries[0][0])
    const firstValueType = this.check(entries[0][1])
    let allSameKeyType = true
    let allSameValueType = true

    for (let i = 1; i < entries.length; i++) {
      const [key, value] = entries[i]
      const keyType = this.check(key)
      const valueType = this.check(value)
      if (keyType !== firstKeyType) {
        allSameKeyType = false
      }
      if (valueType !== firstValueType) {
        allSameValueType = false
      }
    }

    if (allSameKeyType && allSameValueType && firstKeyType !== 'dyn' && firstValueType !== 'dyn') {
      return `map<${firstKeyType}, ${firstValueType}>`
    }
    return 'map'
  }

  checkTernary(ast) {
    const condType = this.check(ast[1])
    if (condType !== 'bool' && condType !== 'dyn') {
      throw new TypeError(`Ternary condition must be bool, got '${condType}'`, ast)
    }

    const trueType = this.check(ast[2])
    const falseType = this.check(ast[3])
    if (trueType === falseType) return trueType
    return 'dyn'
  }

  checkLogicalOp(ast) {
    const leftType = this.check(ast[1])
    const rightType = this.check(ast[2])

    if (leftType !== 'bool' && leftType !== 'dyn') {
      throw new TypeError(`Logical operator requires bool operands, got '${leftType}'`, ast)
    }
    if (rightType !== 'bool' && rightType !== 'dyn') {
      throw new TypeError(`Logical operator requires bool operands, got '${rightType}'`, ast)
    }

    return 'bool'
  }

  checkUnaryOperator(ast) {
    const op = ast[0]
    const operandType = this.check(ast[1])
    if (operandType === 'dyn') return op === '!_' ? 'bool' : 'dyn'

    const overload = this.overloads[op]?.[operandType]
    if (overload) return overload.returnType || operandType
    throw new TypeError(`no such overload: ${op[0]}${operandType}`, ast)
  }

  checkBinaryOperator(ast) {
    const leftType = this.check(ast[1])
    const rightType = this.check(ast[2])
    const op = ast[0]

    if (leftType === 'dyn' || rightType === 'dyn') {
      if (
        op === '<' ||
        op === '<=' ||
        op === '>' ||
        op === '>=' ||
        op === '==' ||
        op === '!=' ||
        op === 'in'
      ) {
        return 'bool'
      }
      return 'dyn'
    }

    const overload = this.overloads[op]?.[leftType]?.[rightType]
    if (overload) return overload.returnType

    throw new TypeError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
  }
}
