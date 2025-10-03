import {TypeError} from './errors.js'
import {Duration, UnsignedInt} from './functions.js'

/**
 * TypeChecker performs static type analysis on CEL expressions
 * without executing them. It validates:
 * - Variable existence and types
 * - Function signatures and overloads
 * - Operator compatibility using the actual overload registry
 * - Property and index access validity
 */
export class TypeChecker {
  constructor({environment, variables, functions, types, overloads}) {
    this.environment = environment
    this.variables = variables
    this.functions = functions
    this.types = types
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
        if (value instanceof Uint8Array) return 'bytes'
        if (value instanceof Date) return 'google.protobuf.Timestamp'
        if (value instanceof Duration) return 'google.protobuf.Duration'
        if (value instanceof UnsignedInt) return 'uint'
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

    if (ast[0] === '.') {
      // Property access is allowed on maps, lists (arrays), and custom types
      // At runtime, . is converted to [] and handled by objectGet
      if (leftType === 'map' || leftType === 'list' || this.types.has(leftType)) {
        return 'dyn'
      }
      throw new TypeError(`Cannot access property on type '${leftType}'`, ast)
    }

    if (ast[0] === '[]') {
      const indexType = this.check(ast[2])

      if (leftType === 'list') {
        if (indexType !== 'int' && indexType !== 'uint' && indexType !== 'dyn') {
          throw new TypeError(`List index must be int or uint, got '${indexType}'`, ast)
        }
        return 'dyn'
      }

      if (leftType === 'map') return 'dyn'

      // No other types support [] indexing
      throw new TypeError(`Cannot index type '${leftType}'`, ast)
    }

    return 'dyn'
  }

  checkCall(ast) {
    const functionName = ast[1]
    const fn = this.functions.standalone[functionName]
    if (!fn) throw new TypeError(`Function not found: '${functionName}'`, ast)

    if (!fn.macro) {
      const args = ast[2]
      const argTypes = args.map((arg) => this.check(arg))

      let current = fn
      for (const argType of argTypes) {
        if (!current) {
          throw new TypeError(
            `No matching overload for '${functionName}(${argTypes.join(', ')})'`,
            ast
          )
        }
        current = current[argType] || current['dyn']
      }

      if (current?.handler) return current.returnType || 'dyn'
      throw new TypeError(`No matching overload for '${functionName}(${argTypes.join(', ')})'`, ast)
    }

    return this.functions.returnTypes[functionName] || 'dyn'
  }

  checkMethodCall(ast) {
    const methodName = ast[1]
    const receiverType = this.check(ast[2])
    if (receiverType === 'dyn') return 'dyn'

    const fn = this.functions[receiverType]?.[methodName]
    if (!fn) {
      throw new TypeError(`Method not found: '${methodName}' for type '${receiverType}'`, ast)
    }

    if (!fn.macro) {
      const args = ast[3]
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

      if (!current || !current.handler) {
        throw new TypeError(
          `No matching overload for '${receiverType}.${methodName}(${argTypes.join(', ')})'`,
          ast
        )
      }

      return current.returnType || 'dyn'
    }

    return this.functions.returnTypes[methodName] || 'dyn'
  }

  checkList(ast) {
    const elements = ast[1]
    for (let i = 0; i < elements.length; i++) this.check(elements[i])
    return 'list'
  }

  checkMap(ast) {
    const entries = ast[1]
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i]
      this.check(key)
      this.check(value)
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
    throw new TypeError(`Unary operator '${op[0]}' not defined for type '${operandType}'`, ast)
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

    throw new TypeError(
      `Operator '${op}' not defined for types '${leftType}' and '${rightType}'`,
      ast
    )
  }
}
