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
  constructor(opts, isEvaluating) {
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

  /**
   * Check an expression and return its inferred type
   * @param {Array|any} ast - The AST node to check
   * @returns {Object} The inferred type declaration
   * @throws {TypeError} If type checking fails
   */
  check(ast, ctx) {
    if (ast.checkedType) return ast.checkedType

    switch (ast[0]) {
      case 'value':
        return (ast.checkedType ??= this.inferLiteralType(ast[1], ctx))
      case 'id':
        return (ast.checkedType ??= this.checkVariable(ast, ctx))
      case '.':
      case '[]':
        return (ast.checkedType ??= this.checkAccess(ast, ctx))
      case 'call':
        if (ast.macro) return (ast.checkedType ??= ast.macro.typeCheck(this, ast.macro, ctx))
        return (ast.checkedType ??= this.checkCall(ast, ctx))
      case 'rcall':
        if (ast.macro) return (ast.checkedType ??= ast.macro.typeCheck(this, ast.macro, ctx))
        return (ast.checkedType ??= this.checkReceiverCall(ast, ctx))
      case 'list':
        return (ast.checkedType ??= this.checkList(ast, ctx))
      case 'map':
        return (ast.checkedType ??= this.checkMap(ast, ctx))
      case '?:':
        return (ast.checkedType ??= this.checkTernary(ast, ctx))
      case '||':
      case '&&':
        return (ast.checkedType ??= this.checkLogicalOp(ast, ctx))
      case '!_':
      case '-_':
        return (ast.checkedType ??= this.checkUnaryOperator(ast, ctx))
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
        return (ast.checkedType ??= this.checkBinaryOperator(ast, ctx))
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

  checkVariable(ast, ctx) {
    const varType = ctx.getType(ast[1])
    if (varType !== undefined) return varType
    throw new this.Error(`Unknown variable: ${ast[1]}`, ast)
  }

  checkAccess(ast, ctx) {
    const leftType = this.check(ast[1], ctx)
    if (leftType.kind === 'dyn') return leftType

    const indexType = ast[0] === '[]' ? this.check(ast[2], ctx) : this.getType('string')
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

  checkCall(ast, ctx) {
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

    const argTypes = args.map((a) => this.check(a, ctx))
    const decl = byReceiver.findMatch(argTypes)

    if (!decl) {
      throw new this.Error(
        `found no matching overload for '${functionName}(${argTypes.join(', ')})'`,
        ast
      )
    }

    return decl.returnType
  }

  checkReceiverCall(ast, ctx) {
    const methodName = ast[1]
    const args = ast[3]
    const receiverType = this.check(ast[2], ctx)
    const functionCandidates = (ast.functionCandidates ??= this.registry.getFunctionCandidates(
      receiverType,
      methodName,
      args.length
    ))

    if (!functionCandidates.exists) {
      throw new this.Error(
        `Function not found: '${methodName}' for receiver of type '${receiverType}'`,
        ast
      )
    }

    if (receiverType.kind === 'dyn') return functionCandidates.returnType || receiverType
    const byReceiver = functionCandidates.filterByReceiverType(receiverType)
    const argTypes = args.map((a) => this.check(a, ctx))
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

  #checkElementHomogenous(ctx, expected, el, m) {
    const type = this.check(el, ctx)
    if (type === expected) return type
    let prefix
    if (m === 0) prefix = 'List elements must have the same type,'
    else if (m === 1) prefix = 'Map key uses wrong type,'
    else if (m === 2) prefix = 'Map value uses wrong type,'
    throw new this.Error(`${prefix} expected type '${expected}' but found '${type}'`, el)
  }

  #checkElement(ctx, expected, el) {
    const candidate = this.check(el, ctx)
    if (expected === candidate) return expected
    if (expected.kind === 'dyn') return expected
    if (candidate.kind === 'dyn') return candidate
    if (expected.matches(candidate)) return expected
    if (candidate.matches(expected)) return candidate
    return this.getType('dyn')
  }

  checkList(ast, ctx) {
    const arr = ast[1]
    const arrLen = arr.length
    if (arrLen === 0) return this.getType(`list`)

    let valueType = this.check(arr[0], ctx)
    const check = this.opts.homogeneousAggregateLiterals
      ? this.#checkElementHomogenous
      : this.#checkElement

    for (let i = 1; i < arrLen; i++) valueType = check.call(this, ctx, valueType, arr[i], 0)
    return this.getType(`list<${valueType}>`)
  }

  checkMap(ast, ctx) {
    const arr = ast[1]
    const arrLen = arr.length
    if (arrLen === 0) return this.getType('map')

    const checkElement = this.opts.homogeneousAggregateLiterals
      ? this.#checkElementHomogenous
      : this.#checkElement

    let keyType = this.check(arr[0][0], ctx)
    let valueType = this.check(arr[0][1], ctx)
    for (let i = 1; i < arrLen; i++) {
      const [keyAst, valueAst] = arr[i]
      keyType = checkElement.call(this, ctx, keyType, keyAst, 1)
      valueType = checkElement.call(this, ctx, valueType, valueAst, 2)
    }
    return this.getType(`map<${keyType}, ${valueType}>`)
  }

  checkTernary(ast, ctx) {
    const condType = this.check(ast[1], ctx)
    if (!condType.isDynOrBool()) {
      throw new this.Error(`Ternary condition must be bool, got '${condType}'`, ast)
    }

    const trueType = this.check(ast[2], ctx)
    const falseType = this.check(ast[3], ctx)
    if (trueType === falseType) return trueType
    if (trueType.name === 'dyn') return trueType
    if (falseType.name === 'dyn') return falseType
    throw new this.Error(
      `Ternary branches must have the same type, got '${trueType}' and '${falseType}'`,
      ast
    )
  }

  checkLogicalOp(ast, ctx) {
    const leftType = this.check(ast[1], ctx)
    const rightType = this.check(ast[2], ctx)

    if (!leftType.isDynOrBool()) {
      throw new this.Error(`Logical operator requires bool operands, got '${leftType}'`, ast)
    }
    if (!rightType.isDynOrBool()) {
      throw new this.Error(`Logical operator requires bool operands, got '${rightType}'`, ast)
    }

    return this.getType('bool')
  }

  checkUnaryOperator(ast, ctx) {
    const op = ast[0]
    const operandType = this.check(ast[1], ctx)
    if (operandType.kind === 'dyn') return op === '!_' ? this.getType('bool') : operandType

    const overload = this.registry.findUnaryOverload(op, operandType)
    if (overload) return overload.returnType
    throw new this.Error(`no such overload: ${op[0]}${operandType.type}`, ast)
  }

  checkBinaryOperator(ast, ctx) {
    const op = ast[0]
    const leftType = this.check(ast[1], ctx)
    const rightType = this.check(ast[2], ctx)
    const type = this.registry.checkBinaryOverload(op, leftType, rightType)
    if (type) return type
    throw new this.Error(`no such overload: ${leftType} ${op} ${rightType}`, ast)
  }
}
