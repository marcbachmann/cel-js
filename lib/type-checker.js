import {TypeError, EvaluationError} from './errors.js'
import {Base} from './operators.js'
const toDynTypeBinding = new Map().set('A', 'dyn').set('T', 'dyn').set('K', 'dyn').set('V', 'dyn')

/**
 * TypeChecker performs static type analysis on CEL expressions
 * without executing them. It validates:
 * - Variable existence and types
 * - Function signatures and overloads
 * - Operator compatibility using the actual overload registry
 * - Property and index access validity
 */
export class TypeChecker extends Base {
  constructor(opts, isEvaluating) {
    super(opts)
    this.isEvaluating = isEvaluating
    this.Error = isEvaluating ? EvaluationError : TypeError
  }

  /**
   * Check an expression and return its inferred type
   * @param {Array|any} ast - The AST node to check
   * @returns {Object} The inferred type declaration
   * @throws {TypeError} If type checking fails
   */
  check(ast, ctx) {
    return (ast.checkedType ??= ast.check(this, ast, ctx))
  }

  checkAccessOnType(ast, ctx, leftType, allowMissingField = false) {
    if (leftType.kind === 'dyn') return leftType

    const indexTypeName = (
      ast.op === '[]' || ast.op === '[?]' ? this.check(ast.args[1], ctx) : this.stringType
    ).type

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
        const keyName = ast.op === '.' || ast.op === '.?' ? ast.args[1] : undefined
        if (keyName) {
          const fieldType = customType.fields[keyName]
          if (fieldType) return fieldType
          // For optional access, missing field returns dyn; for regular access, throw
          if (allowMissingField) return this.dynType
          throw new this.Error(`No such key: ${keyName}`, ast)
        }
      }
      return this.dynType
    }

    // No other types support indexing/property access
    throw new this.Error(`Cannot index type '${this.formatType(leftType)}'`, ast)
  }

  formatType(type) {
    if (!type.hasPlaceholder()) return type.name
    return type.templated(this.registry, toDynTypeBinding).name
  }

  formatTypeList(types) {
    return types.map((t) => this.formatType(t)).join(', ')
  }
}
