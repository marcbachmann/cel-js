import {TypeError, EvaluationError} from './errors.js'

/**
 * TypeChecker performs static type analysis on CEL expressions
 * without executing them. It validates:
 * - Variable existence and types
 * - Function signatures and overloads
 * - Operator compatibility using the actual overload registry
 * - Property and index access validity
 */
export class TypeChecker {
  constructor(ctx, opts, isEvaluating) {
    this.ctx = ctx

    this.objectTypes = opts.objectTypes
    this.objectTypesByConstructor = opts.objectTypesByConstructor
    this.registry = opts.registry
    this.opts = opts.opts

    this.isEvaluating = isEvaluating
    this.Error = isEvaluating ? EvaluationError : TypeError
  }

  /**
   * Get a TypeDeclaration instance for a type name
   * @param {string} typeName - The type name (e.g., 'string', 'int', 'dyn')
   * @returns {TypeDeclaration} The type declaration instance
   */
  getType(typeName) {
    return this.registry.getType(typeName)
  }

  createOverlay(varName, varType) {
    return new this.constructor(this.ctx.createOverlay(varName, varType), this, this.isEvaluating)
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
        throw new this.Error(`Unknown operation: ${ast[0]}`, ast)
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
        throw new this.Error(`Unsupported type: ${value.constructor?.name || typeof value}`)
      default:
        throw new this.Error(`Unsupported type: ${typeof value}`)
    }
  }

  checkVariable(ast) {
    const varName = ast[1]
    const varType = this.ctx.getType(varName)
    if (varType !== undefined) return varType
    throw new this.Error(`Unknown variable: ${varName}`, ast)
  }

  checkAccess(ast) {
    const leftType = this.check(ast[1])
    if (leftType.kind === 'dyn') return leftType

    const indexType = ast[0] === '[]' ? this.check(ast[2]) : this.getType('string')
    const indexTypeName = indexType.type

    if (leftType.kind === 'list') {
      if (indexTypeName !== 'int' && indexTypeName !== 'dyn') {
        throw new this.Error(`List index must be int, got '${indexTypeName}'`, ast)
      }
      return leftType.valueType
    }

    if (leftType.kind === 'map') return leftType.valueType

    const customType = this.objectTypes.get(leftType.name)
    if (customType) {
      if (!(indexTypeName === 'string' || indexTypeName === 'dyn')) {
        throw new this.Error(
          `Cannot index type '${leftType.name}' with type '${indexTypeName}'`,
          ast
        )
      }

      if (customType.fields) {
        const keyName = ast[0] === '.' ? ast[2] : undefined
        if (keyName) {
          const fieldType = customType.fields[keyName]
          if (fieldType) return fieldType
          throw new this.Error(`No such key: ${keyName}`, ast)
        }
      }
      return this.getType('dyn')
    }

    // No other types support indexing/property access
    throw new this.Error(`Cannot index type '${leftType}'`, ast)
  }

  checkCall(ast) {
    const functionName = ast[1]
    const args = ast[2]
    const functionCandidates = (ast.functionCandidates ??= this.registry.getFunctionCandidates(
      null,
      functionName,
      args.length
    ))

    if (!functionCandidates.exists) {
      throw new this.Error(`Function not found: '${functionName}'`, ast)
    }

    const byReceiver = functionCandidates.filterByReceiverType(null)
    if (byReceiver.hasMacro) return this.#returnMacroType(null, byReceiver, args, ast)

    const argTypes = args.map(this.check, this)
    const decl = byReceiver.findMatch(argTypes)

    if (!decl) {
      throw new this.Error(
        `found no matching overload for '${functionName}(${argTypes.join(', ')})'`,
        ast
      )
    }

    return decl.returnType
  }

  #returnMacroType(receiverType, byReceiver, args, ast) {
    const candidate = byReceiver.functions[0]
    if (candidate.typeCheck) return candidate.typeCheck(this, receiverType, args, ast)
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
      throw new this.Error(
        `Function not found: '${methodName}' for value of type '${receiverType}'`,
        ast
      )
    }

    if (receiverType.kind === 'dyn') return functionCandidates.returnType || receiverType

    const byReceiver = functionCandidates.filterByReceiverType(receiverType)
    if (byReceiver.hasMacro) return this.#returnMacroType(receiverType, byReceiver, args, ast)

    const argTypes = args.map(this.check, this)
    const decl = byReceiver.findMatch(argTypes)

    if (!decl) {
      throw new this.Error(
        `found no matching overload for '${receiverType.type}.${methodName}(${argTypes.join(
          ', '
        )})'`,
        ast
      )
    }

    return decl.returnType
  }

  #checkElementHomogenous(expected, el, m) {
    const type = this.check(el)
    if (type === expected) return type
    let prefix
    if (m === 0) prefix = 'List elements must have the same type,'
    else if (m === 1) prefix = 'Map key uses wrong type,'
    else if (m === 2) prefix = 'Map value uses wrong type,'
    throw new this.Error(`${prefix} expected type '${expected}' but found '${type}'`, el)
  }

  #checkElement(expected, el) {
    const candidate = this.check(el)
    if (expected === candidate) return expected
    if (expected.kind === 'dyn') return expected
    if (candidate.kind === 'dyn') return candidate
    if (expected.matches(candidate)) return expected
    if (candidate.matches(expected)) return candidate
    return this.getType('dyn')
  }

  checkList(ast) {
    const arr = ast[1]
    const arrLen = arr.length
    if (arrLen === 0) return this.getType(`list`)

    let valueType = this.check(arr[0])
    const check = this.opts.homogeneousAggregateLiterals
      ? this.#checkElementHomogenous
      : this.#checkElement

    for (let i = 1; i < arrLen; i++) valueType = check.call(this, valueType, arr[i], 0)
    return this.getType(`list<${valueType}>`)
  }

  checkMap(ast) {
    const arr = ast[1]
    const arrLen = arr.length
    if (arrLen === 0) return this.getType('map')

    const checkElement = this.opts.homogeneousAggregateLiterals
      ? this.#checkElementHomogenous
      : this.#checkElement

    let keyType = this.check(arr[0][0])
    let valueType = this.check(arr[0][1])
    for (let i = 1; i < arrLen; i++) {
      const [keyAst, valueAst] = arr[i]
      keyType = checkElement.call(this, keyType, keyAst, 1)
      valueType = checkElement.call(this, valueType, valueAst, 2)
    }
    return this.getType(`map<${keyType}, ${valueType}>`)
  }

  checkTernary(ast) {
    const condType = this.check(ast[1])
    if (!condType.isDynOrBool()) {
      throw new this.Error(`Ternary condition must be bool, got '${condType}'`, ast)
    }

    const trueType = this.check(ast[2])
    const falseType = this.check(ast[3])
    if (trueType === falseType) return trueType
    if (trueType.name === 'dyn') return trueType
    if (falseType.name === 'dyn') return falseType
    throw new this.Error(
      `Ternary branches must have the same type, got '${trueType}' and '${falseType}'`,
      ast
    )
  }

  checkLogicalOp(ast) {
    const leftType = this.check(ast[1])
    const rightType = this.check(ast[2])

    if (!leftType.isDynOrBool()) {
      throw new this.Error(`Logical operator requires bool operands, got '${leftType}'`, ast)
    }
    if (!rightType.isDynOrBool()) {
      throw new this.Error(`Logical operator requires bool operands, got '${rightType}'`, ast)
    }

    return this.getType('bool')
  }

  checkUnaryOperator(ast) {
    const op = ast[0]
    const operandType = this.check(ast[1])
    if (operandType.kind === 'dyn') return op === '!_' ? this.getType('bool') : operandType

    const overload = this.registry.findUnaryOverload(op, operandType)
    if (overload) return overload.returnType
    throw new this.Error(`no such overload: ${op[0]}${operandType.type}`, ast)
  }

  checkBinaryOperator(ast) {
    const op = ast[0]
    const leftType = this.check(ast[1])
    const rightType = this.check(ast[2])
    const type = this.registry.checkBinaryOverload(op, leftType, rightType)
    if (type) return type
    throw new this.Error(`no such overload: ${leftType} ${op} ${rightType}`, ast)
  }
}
