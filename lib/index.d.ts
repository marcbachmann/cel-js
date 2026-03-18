import type {UnsignedInt} from './functions.js'
import type {
  DefinitionsResult,
  RegisterConstantDeclaration,
  RegisterFunctionDeclaration,
  RegisterFunctionMetadata,
  RegisterFunctionOptions,
  RegisterTypeDeclaration,
  RegisterTypeDefinition,
  RegisterVariableDeclaration,
  RegisterVariableMetadata,
  RegisterVariableOptions,
  RegisteredFunctionHandler,
  RegisteredVariableType
} from './registry.js'

/**
 * Represents a CEL expression AST node produced by the parser.
 * Each node stores its operator, operands, type metadata, and helpers for
 * evaluation/type-checking.
 */

export type BinaryOperator =
  | '!='
  | '=='
  | 'in'
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '<'
  | '<='
  | '>'
  | '>='
export type UnaryOperator = '!_' | '-_'
export type AccessOperator = '.' | '.?' | '[]' | '[?]'
export type StructuralOperator =
  | 'value'
  | 'id'
  | 'call'
  | 'rcall'
  | 'list'
  | 'map'
  | '?:'
  | '||'
  | '&&'

type LiteralValue = string | number | bigint | boolean | null | Uint8Array | UnsignedInt
type BinaryArgs = [ASTNode, ASTNode]
type MapEntry = [ASTNode, ASTNode]

interface ASTNodeArgsMap {
  value: LiteralValue
  id: string
  '.': [ASTNode, string]
  '.?': [ASTNode, string]
  '[]': BinaryArgs
  '[?]': BinaryArgs
  call: [string, ASTNode[]]
  rcall: [string, ASTNode, ASTNode[]]
  list: ASTNode[]
  map: MapEntry[]
  '?:': [ASTNode, ASTNode, ASTNode]
  '||': BinaryArgs
  '&&': BinaryArgs
  '!_': ASTNode
  '-_': ASTNode
}

type ASTNodeArgsMapWithBinary = ASTNodeArgsMap & {[K in BinaryOperator]: BinaryArgs}
export type ASTOperator = keyof ASTNodeArgsMapWithBinary

type ASTNodeArgs<T extends ASTOperator> = ASTNodeArgsMapWithBinary[T]
type LegacyAstTuple = [string, ...any[]]

export interface SourceRange {
  readonly start: number
  readonly end: number
}

export interface DiagnosticRelated {
  readonly message: string
  readonly range?: SourceRange
}

export interface Diagnostic {
  readonly code: string
  readonly message: string
  readonly severity: 'error'
  readonly range?: SourceRange
  readonly related?: readonly DiagnosticRelated[]
}

export interface ErrorOptions {
  readonly code?: string
  readonly range?: SourceRange
  readonly related?: readonly DiagnosticRelated[]
}

export interface SourceLocation {
  /** Compatibility position used by existing consumers and error reporting. */
  readonly pos: number
  /** The full source range start for this node or error anchor. */
  readonly start: number
  /** The full source range end for this node or error anchor. */
  readonly end: number
  /** The original CEL input string */
  readonly input?: string
  /** The full source range for this node or error anchor. */
  readonly range?: SourceRange
}

export interface ErrorLocation extends SourceLocation {
  /** Present when the error is attached to a parsed AST node. */
  readonly op?: ASTOperator
  /** Present when the error is attached to a parsed AST node. */
  readonly args?: unknown
  /** Present when the error is attached to a parsed AST node. */
  toOldStructure?(): LegacyAstTuple
}

interface ASTNodeBase<T extends ASTOperator> extends SourceLocation {
  /** The original CEL input string for this parsed AST node. */
  readonly input: string
  /** The full source range for this AST node. */
  readonly range: SourceRange
  /** Operator for this node */
  readonly op: T
  /** Operator-specific operand payload */
  readonly args: ASTNodeArgs<T>
  /** Convert back to the historical tuple representation. */
  toOldStructure(): LegacyAstTuple
}

export type ASTNode = {
  [K in ASTOperator]: ASTNodeBase<K>
}[ASTOperator]

/**
 * Context object for variable resolution during evaluation.
 * Can contain any nested structure of primitive values, arrays, and objects.
 */
export type Context = Record<string, any>

export type {
  DefinitionFunction,
  DefinitionFunctionParam,
  DefinitionsResult,
  DefinitionVariable,
  ObjectSchema,
  OverlayContext,
  RegisterConstantDeclaration,
  RegisterFunctionDeclaration,
  RegisterFunctionMetadata,
  RegisterFunctionOptions,
  RegisterFunctionWithName,
  RegisterFunctionWithSignature,
  RegisterTypeDeclaration,
  RegisterTypeDefinition,
  RegisteredFunctionHandler,
  RegisteredFunctionParam,
  RegisteredFunctionTypedParam,
  RegisteredType,
  RegisteredTypeFieldDeclaration,
  RegisteredVariableType,
  RegisterVariableDeclaration,
  RegisterVariableMetadata,
  RegisterVariableOptions,
  RegisterVariableSchemaOptions,
  RegisterVariableTypeOptions,
  RootContext,
  TypeDeclaration
} from './registry.js'

/**
 * Result of type checking an expression.
 */
export interface TypeCheckResult {
  /** Whether the expression passed type checking */
  valid: boolean
  /** The inferred type of the expression (only present if valid is true) */
  type?: string
  /** The parse or type error that occurred (only present if valid is false) */
  error?: ParseError | TypeError
  /** Machine-readable diagnostics for editor integrations. */
  diagnostics: Diagnostic[]
}

export type ParseResult = {
  (context?: Context): any
  /** The parsed AST */
  ast: ASTNode
  /** Type check the expression without evaluating it */
  check(): TypeCheckResult
}

/**
 * Error thrown during parsing when the CEL expression syntax is invalid.
 */
export class ParseError extends Error {
  constructor(message: string, node?: ErrorLocation, cause?: unknown, options?: ErrorOptions)
  readonly name: 'ParseError'
  readonly node?: ErrorLocation
  readonly code: string
  readonly range?: SourceRange
  readonly summary: string
  readonly diagnostic: Diagnostic
  withAst(node: ASTNode | ErrorLocation): this
}

/**
 * Error thrown during evaluation when an error occurs while executing the CEL expression.
 */
export class EvaluationError extends Error {
  constructor(message: string, node?: ASTNode, cause?: unknown, options?: ErrorOptions)
  readonly name: 'EvaluationError'
  readonly node?: ASTNode
  readonly code: string
  readonly range?: SourceRange
  readonly summary: string
  readonly diagnostic: Diagnostic
  withAst(node: ASTNode | SourceLocation): this
}

/**
 * Error thrown during type checking when a type error is detected in the expression.
 * The error message includes source position highlighting.
 */
export class TypeError extends Error {
  constructor(message: string, node?: ASTNode, cause?: unknown, options?: ErrorOptions)
  readonly name: 'TypeError'
  readonly node?: ASTNode
  readonly code: string
  readonly range?: SourceRange
  readonly summary: string
  readonly diagnostic: Diagnostic
  withAst(node: ASTNode | SourceLocation): this
}

/**
 * Represents an optional value that may or may not be present.
 * Used with optional chaining (.?/.[]?) and optional.* helpers.
 */
export class Optional<T = unknown> {
  /**
   * Create a new Optional with a value.
   * @param value - The value to wrap
   * @returns A new Optional instance
   */
  static of<T>(value: T): Optional<T>

  /**
   * Create an empty Optional.
   * @returns The singleton empty Optional instance
   */
  static none(): Optional<never>

  /** Check if a value is present. */
  hasValue(): boolean

  /**
   * Get the wrapped value.
   * @returns The wrapped value
   * @throws EvaluationError if no value is present
   */
  value(): T

  /**
   * Return this Optional if it has a value, otherwise return the provided Optional.
   * @param optional - The fallback Optional
   * @returns An Optional instance
   */
  or<U>(optional: Optional<U>): Optional<T | U>

  /**
   * Return the wrapped value if present, otherwise return the default value.
   * @param defaultValue - The fallback value
   * @returns The resulting value
   */
  orValue<U>(defaultValue: U): T | U
}

/**
 * Parse a CEL expression string into an evaluable function.
 *
 * @param expression - The CEL expression string to parse
 * @returns A function that can be called with context to evaluate the expression
 * @throws ParseError if the expression is syntactically invalid
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
 * @returns The result of evaluating the expression
 * @throws ParseError if the expression syntax is invalid
 * @throws EvaluationError if evaluation fails
 *
 * @example
 * ```typescript
 * const result = evaluate('1 + 2 * 3'); // 7
 * const result2 = evaluate('user.name', { user: { name: 'Alice' } }); // 'Alice'
 *
 * // For custom functions, use Environment instead:
 * const env = new Environment().registerFunction('multByTwo(int): int', (x) => x * 2n)
 * const result3 = env.evaluate('multByTwo(5)'); // 10n
 * ```
 */
export function evaluate(expression: string, context?: Context): any

/**
 * Type check a CEL expression string directly.
 *
 * @param expression - The CEL expression string to check
 * @returns Validation result with inferred type or error details
 */
export function check(expression: string): TypeCheckResult

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
 * Structural limits for parsing and evaluating CEL expressions.
 * All limits default to the minimums required by the CEL specification.
 */
export interface Limits {
  /** Maximum number of AST nodes that can be produced while parsing */
  maxAstNodes: number
  /** Maximum nesting depth for recursive grammar elements (calls, selects, indexes, aggregates) */
  maxDepth: number
  /** Maximum number of list literal elements */
  maxListElements: number
  /** Maximum number of map literal entries */
  maxMapEntries: number
  /** Maximum number of function or method call arguments */
  maxCallArguments: number
}

/**
 * Options for creating a new Environment.
 */
export interface EnvironmentOptions {
  /**
   * When true, unlisted variables are treated as dynamic (dyn) type.
   * When false, all variables must be explicitly registered.
   */
  unlistedVariablesAreDyn?: boolean
  /**
   * When true (default), list and map literals must have homogeneous element/key/value types.
   * When false, mixed literals are inferred as list<dyn> or map with dyn components.
   */
  homogeneousAggregateLiterals?: boolean
  /**
   * Enable experimental optional types (.?/.[]? chaining and optional.* helpers). Disabled by default.
   */
  enableOptionalTypes?: boolean
  /** Optional overrides for parser/evaluator structural limits */
  limits?: Partial<Limits>
}

export type ResolvedEnvironmentOptions = Omit<Required<EnvironmentOptions>, 'limits'> & {
  limits: Limits
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
  /** The fully resolved options for this environment instance. */
  readonly opts: ResolvedEnvironmentOptions

  /**
   * Create a new Environment with optional configuration.
   *
   * @param opts - Optional configuration options
   */
  constructor(opts?: EnvironmentOptions)

  /**
   * Create a fast, isolated copy that stops the parent from registering more entries.
   *
   * @param opts - Optional configuration options
   * @returns A new environment
   */
  clone(opts?: EnvironmentOptions): Environment

  /**
   * Register a custom type for use in expressions.
   *
   * @param typename - The name of the type (e.g., 'Vector', 'Point')
   * @param definition - The type constructor or registration object
   * @returns This environment for chaining
   *
   * @example
   * ```typescript
   * class Vector { constructor(public x: number, public y: number) {} }
   * env.registerType('Vector', Vector)
   * env.registerType('Vector', {ctor: Vector, fields: {x: 'double', y: 'double'}})
   * env.registerType({name: 'Vector', schema: {x: 'double', y: 'double'}})
   * ```
   */
  registerType(typename: string, definition: RegisterTypeDefinition): this
  registerType(definition: RegisterTypeDeclaration): this

  /**
   * Register a variable with its expected type.
   *
   * Supports `name + type`, `name + {type|schema}`, and a single declaration object.
   * @returns This environment for chaining
   * @throws Error if variable is already registered
   *
   * @example
   * ```typescript
   * env.registerVariable('username', 'string')
   * env.registerVariable('user', {type: 'map', description: 'The current user'})
   * env.registerVariable({name: 'profile', schema: {email: 'string'}})
   * ```
   */
  registerVariable(
    name: string,
    type: RegisteredVariableType,
    opts?: RegisterVariableMetadata
  ): this
  registerVariable(name: string, options: RegisterVariableOptions): this
  registerVariable(definition: RegisterVariableDeclaration): this

  /**
   * Register a constant value that is always available in expressions without providing it via context.
   *
   * Supports `name + type + value` and a single declaration object.
   * @returns This environment for chaining further registrations
   *
   * @example
   * ```typescript
   * const env = new Environment().registerConstant('timezone', 'string', 'UTC')
   * env.registerConstant({name: 'minAge', type: 'int', value: 18n, description: 'Minimum age'})
   * env.evaluate('timezone == "UTC"') // true
   * ```
   */
  registerConstant(name: string, type: RegisteredVariableType, value: any): this
  registerConstant(definition: RegisterConstantDeclaration): this

  /**
   * Register a custom function or method.
   *
   * Supports signature-based registration as well as a single declaration object.
   * @param signature - Function signature in format 'name(type1, type2): returnType' or 'Type.method(args): returnType'
   * @param handler - The function implementation
   * @param opts - Optional metadata such as descriptions, param docs, and async hints
   * @returns This environment for chaining
   *
   * @example
   * ```typescript
   * // Standalone function
   * env.registerFunction('double(int): int', (x) => x * 2n)
   *
   * // Signature string with descriptions
   * env.registerFunction('greet(string): string', handler, {description: 'Greets someone'})
   *
   * // Instance method
   * env.registerFunction('string.reverse(): string', (str) => str.split('').reverse().join(''))
   *
   * // Single object with signature and named params
   * env.registerFunction({
   *   signature: 'formatDate(int, string): string',
   *   handler,
   *   description: 'Formats a timestamp',
   *   params: [
   *     {name: 'timestamp', description: 'Unix timestamp in seconds'},
   *     {name: 'format', description: 'Date format string'}
   *   ]
   * })
   *
   * // Macro function
   * env.registerFunction('macro(ast): dyn', ({args}) => ({
   *   firstArgument: args[0],
   *   typeCheck(checker, macro, ctx) {
   *     return checker.check(macro.firstArgument, ctx)
   *   },
   *   evaluate(evaluator, macro, ctx) {
   *     return evaluator.eval(macro.firstArgument, ctx)
   *   }
   * }))
   * ```
   */
  registerFunction(
    signature: string,
    handler: RegisteredFunctionHandler,
    opts?: RegisterFunctionMetadata
  ): this
  registerFunction(signature: string, options: RegisterFunctionOptions): this
  registerFunction(definition: RegisterFunctionDeclaration): this

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
   * Return user-facing definitions for all registered variables and functions,
   * including the built-ins inherited from the global environment.
   */
  getDefinitions(): DefinitionsResult

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
   * @throws ParseError if the expression is syntactically invalid
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
  check: typeof check
  serialize: typeof serialize
  Environment: typeof Environment
  ParseError: typeof ParseError
  EvaluationError: typeof EvaluationError
  TypeError: typeof TypeError
  Optional: typeof Optional
}

export default cel
