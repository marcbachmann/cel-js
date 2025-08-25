/**
 * Represents a CEL expression AST node.
 * Can be a primitive value or an array representing an operation.
 */
export type ASTNode = null | boolean | number | string | Uint8Array | [string, ...ASTNode[]]

/**
 * Context object for variable resolution during evaluation.
 * Can contain any nested structure of primitive values, arrays, and objects.
 */
export interface Context {
  [key: any]: any
}

/**
 * Map of custom function names to their implementations.
 */
interface Functions {
  [functionName: string]: ((...args: any[]) => any) | TypeMethods
}

/**
 * Map of custom type-specific method namespaces.
 */
interface TypeMethods {
  [methodName: string]: (value: any, ...args: any[]) => any
}

/**
 * Error thrown during parsing when the CEL expression syntax is invalid.
 */
export class ParseError extends Error {
  constructor(message: string)
  readonly name: 'ParseError'
}

/**
 * Error thrown during evaluation when an error occurs while executing the CEL expression.
 */
export class EvaluationError extends Error {
  constructor(message: string)
  readonly name: 'EvaluationError'
}

/**
 * Parse a CEL expression string into an evaluable function.
 *
 * @param expression - The CEL expression string to parse
 * @returns A function that can be called with context and custom functions to evaluate the expression
 *
 * @example
 * ```typescript
 * const evalFn = parse('user.name + " is " + user.age + " years old"');
 * const result = evalFn({ user: { name: 'John', age: 30 } });
 * console.log(result); // "John is 30 years old"
 * ```
 */
export function parse(expression: string): {
  (context?: Context, functions?: Functions): any
  /** The parsed AST */
  ast: ASTNode
}

/**
 * Evaluate a CEL expression string directly.
 *
 * @param expression - The CEL expression string to evaluate
 * @param context - Optional context object for variable resolution
 * @param functions - Optional custom functions to make available during evaluation
 * @returns The result of evaluating the expression
 *
 * @example
 * ```typescript
 * const result = evaluate('1 + 2 * 3'); // 7
 * const result2 = evaluate('user.name', { user: { name: 'Alice' } }); // 'Alice'
 * const result3 = evaluate('double(5)', {}, { double: (x) => x * 2 }); // 10
 * ```
 */
export function evaluate(expression: string, context?: Context, functions?: Functions): any

/**
 * Serialize an AST back to a CEL expression string.
 *
 * @param ast - The AST node to serialize
 * @returns The CEL expression string representation
 *
 * @example
 * ```typescript
 * const evalFn = parse('1 + 2 * 3');
 * const serialized = serialize(evalFn.ast);
 * console.log(serialized); // "1 + 2 * 3"
 * ```
 */
export function serialize(ast: ASTNode): string

/**
 * Default export containing all main functions and classes.
 */
declare const cel: {
  parse: typeof parse
  evaluate: typeof evaluate
  serialize: typeof serialize
  ParseError: typeof ParseError
  EvaluationError: typeof EvaluationError
}

export default cel
