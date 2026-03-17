/**
 * Represents a CEL type value.
 */
export class Type {
  /**
   * Create a new Type.
   * @param name - The name of the type
   */
  constructor(name: string)

  /** Get the type name. */
  get name(): string

  /** Convert to string representation. */
  toString(): string
}

/**
 * Represents a type declaration with metadata about its structure.
 */
export class TypeDeclaration {
  /**
   * Create a new type declaration.
   * @param options - Type declaration options
   */
  constructor(options: {
    kind: 'primitive' | 'list' | 'map' | 'message' | 'enum'
    type: string
    name: string
    keyType?: TypeDeclaration
    valueType?: TypeDeclaration
    values?: Record<string, bigint>
  })

  /** The kind of type (primitive, list, map, message, enum). */
  kind: 'primitive' | 'list' | 'map' | 'message' | 'enum'

  /** The type name. */
  type: string

  /** The message or enum type name. */
  name: string

  /** For map types, the key type. */
  keyType?: TypeDeclaration

  /** For list and map types, the value type. */
  valueType?: TypeDeclaration

  /** For enum types, the enum values. */
  values?: Record<string, bigint>

  /** Check if this type is 'dyn' or 'bool'. */
  isDynOrBool(): boolean

  /** Convert to string representation. */
  toString(): string
}

/**
 * Built-in CEL type constants.
 */
export const TYPES: {
  string: Type
  bool: Type
  int: Type
  uint: Type
  double: Type
  map: Type
  list: Type
  bytes: Type
  null_type: Type
  type: Type
}

/**
 * Common CEL type declarations used throughout the registry.
 */
export const celTypes: {
  string: TypeDeclaration
  bool: TypeDeclaration
  int: TypeDeclaration
  uint: TypeDeclaration
  double: TypeDeclaration
  bytes: TypeDeclaration
  dyn: TypeDeclaration
  null: TypeDeclaration
  type: TypeDeclaration
  list: TypeDeclaration
  'list<dyn>': TypeDeclaration
  map: TypeDeclaration
  'map<dyn, dyn>': TypeDeclaration
}

/**
 * Schema definition for inline typed object registration.
 * Maps field names to type strings or nested schemas.
 * When used with `registerVariable`, internally calls `registerType` to create
 * a named type with runtime conversion support.
 */
export interface ObjectSchema {
  [field: string]: string | ObjectSchema
}

export type RegisteredFunctionHandler = (...args: any[]) => any

export interface RegisteredFunctionParam {
  name?: string
  type?: string
  description?: string
}

export interface RegisteredFunctionTypedParam extends RegisteredFunctionParam {
  type: string
}

export interface RegisterFunctionMetadata {
  description?: string
  params?: RegisteredFunctionParam[]
  async?: boolean
}

export interface RegisterFunctionOptions extends RegisterFunctionMetadata {
  handler: RegisteredFunctionHandler
}

export interface RegisterFunctionWithSignature extends RegisterFunctionOptions {
  signature: string
}

export interface RegisterFunctionWithName extends Omit<RegisterFunctionOptions, 'params'> {
  name: string
  receiverType?: string
  returnType: string
  params: RegisteredFunctionTypedParam[]
}

export type RegisterFunctionDeclaration = RegisterFunctionWithSignature | RegisterFunctionWithName

/**
 * Registry for managing function overloads, operator overloads, and type mappings.
 */
export class Registry {
  /**
   * Create a new registry instance.
   * @param opts - Optional initial configuration
   */
  constructor(opts?: RegistryOptions)

  /**
   * Register a function overload.
   * Supports signature-based registration as well as a single declaration object.
   */
  registerFunctionOverload(
    signature: string,
    handler: RegisteredFunctionHandler,
    opts?: RegisterFunctionMetadata
  ): void
  registerFunctionOverload(signature: string, options: RegisterFunctionOptions): void
  registerFunctionOverload(definition: RegisterFunctionDeclaration): void

  /**
   * Register an operator overload.
   * @param signature - Operator signature in format 'type1 op type2' (e.g., 'Vector + Vector')
   * @param handler - The operator implementation
   */
  registerOperatorOverload(signature: string, handler: (left: any, right: any) => any): void

  /**
   * Register a custom type with its constructor and optional field definitions.
   * When `ctor` is omitted but `fields` is provided, an internal wrapper class is auto-generated
   * and a default `convert` function is created to wrap plain objects at runtime.
   * @param typename - The name of the type
   * @param definition - Either a constructor function or an object with ctor/fields/convert
   */
  registerType(
    typename: string,
    definition:
      | Function
      | {ctor: Function; fields?: Record<string, string>; convert?: (value: any) => any}
      | {fields: Record<string, string>; convert?: (value: any) => any}
  ): void

  /**
   * Get type declaration for a given type string.
   * @param typename - The type name (e.g., 'string', 'list<int>', 'map<string, bool>')
   * @returns The type declaration instance
   */
  getType(typename: string): TypeDeclaration

  /**
   * Register a variable with its type, throwing if it already exists.
   * When an ObjectSchema is provided via `{schema: ...}`, a type is auto-registered
   * via `registerType` with runtime conversion support.
   * @param name - The variable name
   * @param type - The variable type name, declaration, or options with schema
   */
  registerVariable(
    name: string,
    type:
      | string
      | TypeDeclaration
      | {type: string; description?: string}
      | {schema: ObjectSchema; description?: string}
  ): this

  /**
   * Register a unary operator overload.
   * @param op - The operator symbol ('-' or '!')
   * @param type - The operand type
   * @param handler - The operator implementation
   * @param returnType - Optional return type (defaults to operand type)
   */
  unaryOverload(op: string, type: string, handler: (operand: any) => any, returnType?: string): void

  /**
   * Register a binary operator overload.
   * @param leftType - The left operand type
   * @param op - The operator symbol
   * @param rightType - The right operand type
   * @param handler - The operator implementation
   * @param returnType - Optional return type
   */
  binaryOverload(
    leftType: string,
    op: string,
    rightType: string,
    handler: (left: any, right: any) => any,
    returnType?: string
  ): void

  /**
   * Clone this registry to create a new isolated instance.
   * @returns A new registry with a deep copy of all registrations
   */
  clone(opts?: {unlistedVariablesAreDyn?: boolean; enableOptionalTypes?: boolean}): Registry

  /** Registered object types keyed by CEL typename. */
  readonly objectTypes: Map<string, any>

  /** Map of constructors to their registered type metadata. */
  readonly objectTypesByConstructor: Map<Function | undefined, any>

  /** Registered variables and their type declarations. */
  readonly variables: Map<string, TypeDeclaration>

  /** Whether optional types/functions are enabled for this registry. */
  readonly enableOptionalTypes: boolean
}

/**
 * Options for creating a new registry.
 */
export interface RegistryOptions {
  objectTypes?: Map<string, any>
  objectTypesByConstructor?: Map<Function | undefined, any>
  functionDeclarations?: Map<string, any>
  operatorDeclarations?: Map<string, any>
  typeDeclarations?: Map<string, TypeDeclaration>
  variables?: Map<string, TypeDeclaration>
  unlistedVariablesAreDyn?: boolean
  enableOptionalTypes?: boolean
}

/**
 * Create a new registry instance.
 * @param opts - Optional initial configuration
 * @returns A new registry instance
 */
export function createRegistry(opts?: RegistryOptions): Registry

/**
 * Root context wiring together registered variable types and fallback values.
 */
export class RootContext {
  constructor(registry: Registry, context?: Map<string, any> | Record<string, any>)

  /** Look up the fallback value (built-ins) for a name. */
  getValue(name: string): any

  /** Fork with a placeholder variable binding (used for comprehensions). */
  forkWithVariable(iterVar: string, iterType: TypeDeclaration): OverlayContext
}

/**
 * Overlay context layered on top of the root context for evaluation/type-checking.
 */
export class OverlayContext {
  constructor(parent: RootContext | OverlayContext, name: string, type: TypeDeclaration, value: any)

  /** Fork with a placeholder variable binding (used for comprehensions). */
  forkWithVariable(iterVar: string, iterType: TypeDeclaration): OverlayContext

  /** Set a accumulator variable type */
  setAccuType(type: TypeDeclaration): this

  /** Set a accumulator variable value */
  setAccuValue(accuValue: any): this

  /** Set the iteration variable value */
  setIterValue(iterValue: any, evaluator: any): this

  /** Resolve a value by name, falling back to parent scopes. */
  getValue(name: string): any
}
