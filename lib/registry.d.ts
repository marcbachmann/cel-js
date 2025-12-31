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
   * @param signature - Function signature in format 'name(type1, type2): returnType' or 'Type.method(args): returnType'
   * @param handlerOrOptions - Either the function implementation or an options object with handler and optional typeCheck
   */
  registerFunctionOverload(
    signature: string,
    handlerOrOptions:
      | ((...args: any[]) => any)
      | {
          handler: (...args: any[]) => any
          typeCheck?: (checker: any, receiverType: string, args: any[]) => string
        }
  ): void

  /**
   * Register an operator overload.
   * @param signature - Operator signature in format 'type1 op type2' (e.g., 'Vector + Vector')
   * @param handler - The operator implementation
   */
  registerOperatorOverload(signature: string, handler: (left: any, right: any) => any): void

  /**
   * Register a custom type with its constructor and optional field definitions.
   * @param typename - The name of the type
   * @param definition - Either a constructor function or an object with ctor and fields
   * @param withoutDynRegistration - If true, skip automatic dyn() and type() function registration
   */
  registerType(
    typename: string,
    definition: Function | {ctor: Function; fields?: Record<string, any>},
    withoutDynRegistration?: boolean
  ): void

  /**
   * Get type declaration for a given type string.
   * @param typename - The type name (e.g., 'string', 'list<int>', 'map<string, bool>')
   * @returns The type declaration instance
   */
  getType(typename: string): TypeDeclaration

  /**
   * Register a variable with its type, throwing if it already exists.
   * @param name - The variable name
   * @param type - The variable type name or declaration
   */
  registerVariable(name: string, type: string | TypeDeclaration): this

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

  /** Map of type names to their exported Type handles. */
  readonly objectTypeInstances: Map<string, Type>

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
  objectTypeInstances?: Map<string, Type>
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
  constructor(registry: Registry, context?: Object | Map)

  /** Look up the declared type for a variable name. */
  getType(name: string): TypeDeclaration | undefined

  /** Look up the fallback value (built-ins) for a name. */
  getValue(name: string): any

  /** Fork with a placeholder variable binding (used for comprehensions). */
  forkWithVariable(variableType: TypeDeclaration, variableName: string): OverlayContext
}

/**
 * Overlay context layered on top of the root context for evaluation/type-checking.
 */
class OverlayContext {
  constructor(
    parent: RootContext | OverlayContext,
    variableType: TypeDeclaration,
    variableName: string
  )

  /** Fork with a placeholder variable binding (used for comprehensions). */
  forkWithVariable(variableType: TypeDeclaration, variableName: string): OverlayContext

  /** Set the current variable placeholder value. */
  setVariableValue(value: any): this

  /** Resolve a value by name, falling back to parent scopes. */
  getValue(name: string): any

  /** Resolve a declared type by name, respecting overlays. */
  getType(name: string): TypeDeclaration | undefined
}
