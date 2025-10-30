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
  constructor({ctx, objectTypes, objectTypesByConstructor, registry}) {
    this.ctx = ctx
    this.objectTypes = objectTypes
    this.objectTypesByConstructor = objectTypesByConstructor
    this.registry = registry
  }

  /**
   * Get a TypeDeclaration instance for a type name
   * @param {string} typeName - The type name (e.g., 'string', 'int', 'dyn')
   * @returns {TypeDeclaration} The type declaration instance
   */
  getType(typeName) {
    return this.registry.getType(typeName)
  }

  /**
   * Check an expression and return its inferred type
   * @param {Array|any} ast - The AST node to check
   * @returns {Object} The inferred type declaration
   * @throws {TypeError} If type checking fails
   */
  check(ast) {
    if (ast.checkedType) return ast.checkedType

    switch (ast[0]) {
      case 'value':
        return (ast.checkedType ??= this.inferLiteralType(ast[1]))
      case 'id':
        return (ast.checkedType ??= this.checkVariable(ast))
      case '.':
      case '[]':
        return (ast.checkedType ??= this.checkAccess(ast))
      case 'call':
        return (ast.checkedType ??= this.checkCall(ast))
      case 'rcall':
        return (ast.checkedType ??= this.checkReceiverCall(ast))
      case 'list':
        return (ast.checkedType ??= this.checkList(ast))
      case 'map':
        return (ast.checkedType ??= this.checkMap(ast))
      case '?:':
        return (ast.checkedType ??= this.checkTernary(ast))
      case '||':
      case '&&':
        return (ast.checkedType ??= this.checkLogicalOp(ast))
      case '!_':
      case '-_':
        return (ast.checkedType ??= this.checkUnaryOperator(ast))
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
        return (ast.checkedType ??= this.checkBinaryOperator(ast))
      default:
        throw new TypeError(`Unknown operation: ${ast[0]}`, ast)
    }
  }

  inferLiteralType(value) {
    switch (typeof value) {
      case 'string':
        return this.getType('string')
      case 'bigint':
        return this.getType('int')
      case 'number':
        return this.getType('double')
      case 'boolean':
        return this.getType('bool')
      case 'object':
        if (value === null) return this.getType('null')
        const type = this.objectTypesByConstructor.get(value.constructor)?.type
        if (type) return type
        throw new TypeError(`Unsupported type: ${value.constructor?.name || typeof value}`)
      default:
        throw new TypeError(`Unsupported type: ${typeof value}`)
    }
  }

  checkVariable(ast) {
    const varName = ast[1]
    const varType = this.ctx.getType(varName)
    if (varType !== undefined) return varType
    throw new TypeError(`Unknown variable: ${varName}`, ast)
  }

  checkAccess(ast) {
    const leftType = this.check(ast[1])
    if (leftType.kind === 'dyn') return leftType

    const indexType = ast[0] === '[]' ? this.check(ast[2]) : this.getType('string')
    const indexTypeName = indexType.type

    if (leftType.kind === 'list') {
      if (indexTypeName !== 'int' && indexTypeName !== 'dyn') {
        throw new TypeError(`List index must be int, got '${indexTypeName}'`, ast)
      }
      return leftType.valueType
    }

    if (leftType.kind === 'map') return leftType.valueType

    const customType = this.objectTypes.get(leftType.name)
    if (customType) {
      if (!(indexTypeName === 'string' || indexTypeName === 'dyn')) {
        throw new TypeError(
          `Cannot index type '${leftType.name}' with type '${indexTypeName}'`,
          ast
        )
      }

      if (customType.fields) {
        const keyName = ast[0] === '.' ? ast[2] : undefined
        if (keyName) {
          const fieldType = customType.fields[keyName]
          if (fieldType) return fieldType
          throw new TypeError(`No such key: ${keyName}`, ast)
        }
      }
      return this.getType('dyn')
    }

    // No other types support indexing/property access
    throw new TypeError(`Cannot index type '${leftType}'`, ast)
  }

  checkCall(ast) {
    const functionName = ast[1]
    const args = ast[2]
    const byReceiver = (ast.functionCandidates ??= this.registry.getFunctionCandidates(
      null,
      functionName,
      args.length
    )).filterByReceiverType(null)

    if (!byReceiver.exists) throw new TypeError(`Function not found: '${functionName}'`, ast)
    if (byReceiver.hasMacro) return this.#returnMacroType(null, byReceiver, args)

    const argTypes = args.map(this.check, this)
    const decl = byReceiver.findMatch(argTypes)

    if (!decl) {
      throw new TypeError(
        `found no matching overload for '${functionName}(${argTypes.join(', ')})'`,
        ast
      )
    }

    return decl.returnType
  }

  #returnMacroType(receiverType, byReceiver, args) {
    const candidate = byReceiver.functions[0]
    if (candidate.typeCheck) return candidate.typeCheck(this, receiverType, args)
    return candidate.returnType
  }

  checkReceiverCall(ast) {
    const methodName = ast[1]
    const args = ast[3]
    const receiverType = this.check(ast[2])

    const functionCandidates = (ast.functionCandidates ??= this.registry.getFunctionCandidates(
      receiverType,
      methodName,
      args.length
    ))

    if (!functionCandidates.exists) {
      throw new TypeError(
        `Function not found: '${methodName}' for value of type '${receiverType}'`,
        ast
      )
    }

    if (receiverType.kind === 'dyn') return functionCandidates.returnType || receiverType

    const byReceiver = functionCandidates.filterByReceiverType(receiverType)
    if (byReceiver.hasMacro) return this.#returnMacroType(receiverType, byReceiver, args)

    const argTypes = args.map(this.check, this)
    const decl = byReceiver.findMatch(argTypes)

    if (!decl) {
      throw new TypeError(
        `found no matching overload for '${receiverType.type}.${methodName}(${argTypes.join(
          ', '
        )})'`,
        ast
      )
    }

    return decl.returnType
  }

  checkList(ast) {
    const elements = ast[1]
    if (elements.length === 0) return this.getType(`list`)

    const firstType = this.check(elements[0])
    const allSameType = elements.every((e) => firstType === this.check(e))

    if (allSameType) return this.getType(`list<${firstType}>`)
    return this.getType(`list`)
  }

  checkMap(ast) {
    const entries = ast[1]
    if (entries.length === 0) return this.getType('map')

    // Infer key and value types if all keys and values have consistent types
    const firstKeyType = this.check(entries[0][0])
    const firstValueType = this.check(entries[0][1])
    let allSameKeyType = true
    let allSameValueType = true

    for (let i = 1; i < entries.length; i++) {
      const [key, value] = entries[i]
      if (firstKeyType !== this.check(key)) allSameKeyType = false
      if (firstValueType !== this.check(value)) allSameValueType = false
    }

    const inferredKeyType = allSameKeyType ? firstKeyType : 'dyn'
    const inferredValueType = allSameValueType ? firstValueType : 'dyn'
    return this.getType(`map<${inferredKeyType}, ${inferredValueType}>`)
  }

  checkTernary(ast) {
    const condType = this.check(ast[1])
    if (!condType.isDynOrBool()) {
      throw new TypeError(`Ternary condition must be bool, got '${condType}'`, ast)
    }

    const trueType = this.check(ast[2])
    const falseType = this.check(ast[3])
    if (trueType === falseType) return trueType
    if (trueType.name === 'dyn') return trueType
    if (falseType.name === 'dyn') return falseType
    throw new TypeError(
      `Ternary branches must have the same type, got '${trueType}' and '${falseType}'`,
      ast
    )
  }

  checkLogicalOp(ast) {
    const leftType = this.check(ast[1])
    const rightType = this.check(ast[2])

    if (!leftType.isDynOrBool()) {
      throw new TypeError(`Logical operator requires bool operands, got '${leftType}'`, ast)
    }
    if (!rightType.isDynOrBool()) {
      throw new TypeError(`Logical operator requires bool operands, got '${rightType}'`, ast)
    }

    return this.getType('bool')
  }

  checkUnaryOperator(ast) {
    const op = ast[0]
    const operandType = this.check(ast[1])
    if (operandType.kind === 'dyn') return op === '!_' ? this.getType('bool') : operandType

    const overload = this.registry.findUnaryOverload(op, operandType)
    if (overload) return overload.returnType
    throw new TypeError(`no such overload: ${op[0]}${operandType.type}`, ast)
  }

  checkBinaryOperator(ast) {
    const leftType = this.check(ast[1])
    const rightType = this.check(ast[2])
    const op = ast[0]
    const type = this.registry.checkBinaryOverload(op, leftType, rightType)
    if (type) return type
    throw new TypeError(`no such overload: ${leftType} ${op} ${rightType}`, ast)
  }
}
