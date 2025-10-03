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
  [key: string]: any
}

/**
 * Map of custom function names to their implementations.
 */
interface Functions {
  [functionName: string]: ((...args: any[]) => any) | TypeMethods
}

/**
 * Result of type checking an expression.
 */
export interface TypeCheckResult {
  /** Whether the expression passed type checking */
  valid: boolean
  /** The inferred type of the expression (only present if valid is true) */
  type?: string
  /** The type error that occurred (only present if valid is false) */
  error?: TypeError
}

export type ParseResult = {
  (context?: Context, functions?: Functions): any
  /** The parsed AST */
  ast: ASTNode
  /** Type check the expression without evaluating it */
  check(): TypeCheckResult
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
 * Error thrown during type checking when a type error is detected in the expression.
 * The error message includes source position highlighting.
 */
export class TypeError extends Error {
  constructor(message: string)
  readonly name: 'TypeError'
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
export function parse(expression: string): ParseResult

/**
 * Evaluate a CEL expression string directly.
 *
 * @param expression - The CEL expression string to evaluate
 * @param context - Optional context object for variable resolution
 * @param functions - (Deprecated) Optional custom functions. Use Environment class instead for custom functions.
 * @returns The result of evaluating the expression
 *
 * @example
 * ```typescript
 * const result = evaluate('1 + 2 * 3'); // 7
 * const result2 = evaluate('user.name', { user: { name: 'Alice' } }); // 'Alice'
 *
 * // For custom functions, use Environment instead:
 * const env = new Environment().registerFunction('double(int): int', (x) => x * 2n)
 * const result3 = env.evaluate('double(5)'); // 10n
 * ```
 */
export function evaluate(expression: string, context?: Context, /**@deprecated Use Environment class instead */ functions?: Functions): any

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
 * Options for creating a new Environment.
 */
export interface EnvironmentOptions {
  /**
   * Enable support for legacy function format.
   */
  supportLegacyFunctions?: boolean
  /**
   * When true, unlisted variables are treated as dynamic (dyn) type.
   * When false, all variables must be explicitly registered.
   */
  unlistedVariablesAreDyn?: boolean
}

/**
 * Environment for CEL expression evaluation with type checking and custom functions.
 *
 * @example
 * ```typescript
 * const env = new Environment()
 *   .registerVariable('name', 'string')
 *   .registerVariable('age', 'int')
 *   .registerFunction('double(int): int', (x) => x * 2n)
 *
 * const result = env.evaluate('double(age)', { age: 21n }) // 42n
 * ```
 */
export class Environment {
  /**
   * Create a new Environment with optional configuration.
   *
   * @param opts - Optional configuration options
   */
  constructor(opts?: EnvironmentOptions)

  /**
   * Register a custom type for use in expressions.
   *
   * @param typename - The name of the type (e.g., 'Vector', 'Point')
   * @param constructor - The constructor function or class for the type
   * @returns This environment for chaining
   *
   * @example
   * ```typescript
   * class Vector { constructor(public x: number, public y: number) {} }
   * env.registerType('Vector', Vector)
   * ```
   */
  registerType(typename: string, constructor: any): this

  /**
   * Register a variable with its expected type.
   *
   * @param name - The variable name
   * @param type - The CEL type name ('string', 'int', 'double', 'bool', 'list', 'map', etc.)
   * @returns This environment for chaining
   * @throws Error if variable is already registered
   *
   * @example
   * ```typescript
   * env.registerVariable('username', 'string')
   *    .registerVariable('count', 'int')
   * ```
   */
  registerVariable(name: string, type: string): this

  /**
   * Register a custom function or method.
   *
   * @param signature - Function signature in format 'name(type1, type2): returnType' or 'Type.method(args): returnType'
   * @param handler - The function implementation
   * @returns This environment for chaining
   *
   * @example
   * ```typescript
   * // Standalone function
   * env.registerFunction('double(int): int', (x) => x * 2n)
   *
   * // Instance method
   * env.registerFunction('string.reverse(): string', (str) => str.split('').reverse().join(''))
   * ```
   */
  registerFunction(signature: string, handler: (...args: any[]) => any): this

  /**
   * Register a custom operator overload.
   *
   * @param signature - Operator signature in format 'type1 op type2' (e.g., 'Vector + Vector')
   * @param handler - The operator implementation
   * @returns This environment for chaining
   *
   * @example
   * ```typescript
   * env.registerOperator('Vector + Vector', (a, b) => new Vector(a.x + b.x, a.y + b.y))
   * ```
   */
  registerOperator(signature: string, handler: (left: any, right: any) => any): this

  /**
   * Check if a variable is registered in this environment.
   *
   * @param name - The variable name to check
   * @returns True if the variable is registered
   */
  hasVariable(name: string): boolean

  /**
   * Parse a CEL expression and return a reusable evaluation function.
   *
   * @param expression - The CEL expression string to parse
   * @returns A function that can be called with context to evaluate the expression
   *
   * @example
   * ```typescript
   * const parsed = env.parse('x + y')
   * const result1 = parsed({ x: 1n, y: 2n }) // 3n
   * const result2 = parsed({ x: 5n, y: 10n }) // 15n
   * ```
   */
  parse(expression: string): ParseResult

  /**
   * Type check a CEL expression without evaluating it.
   *
   * @param expression - The CEL expression string to check
   * @returns An object containing validation result and type information
   *
   * @example
   * ```typescript
   * const env = new Environment()
   *   .registerVariable('x', 'int')
   *   .registerVariable('y', 'string')
   *
   * const result = env.check('x + y')
   * if (!result.valid) {
   *   console.error('Type error:', result.error.message)
   * }
   * ```
   */
  check(expression: string): TypeCheckResult

  /**
   * Evaluate a CEL expression with the given context.
   *
   * @param expression - The CEL expression string to evaluate
   * @param context - Optional context object for variable resolution
   * @returns The result of evaluating the expression
   * @throws ParseError if the expression syntax is invalid
   * @throws EvaluationError if evaluation fails
   *
   * @example
   * ```typescript
   * const result = env.evaluate('name + " is " + string(age)', {
   *   name: 'John',
   *   age: 30n
   * })
   * ```
   */
  evaluate(expression: string, context?: Context): any
}

/**
 * Default export containing all main functions and classes.
 */
declare const cel: {
  parse: typeof parse
  evaluate: typeof evaluate
  serialize: typeof serialize
  Environment: typeof Environment
  ParseError: typeof ParseError
  EvaluationError: typeof EvaluationError
  TypeError: typeof TypeError
}

export default cel
