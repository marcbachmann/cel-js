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
  google: {
    protobuf: {
      Timestamp: Type
      Duration: Type
    }
  }
  'google.protobuf.Timestamp': Type
  'google.protobuf.Duration': Type
}

/**
 * Registry for managing function overloads, operator overloads, and type mappings.
 */
export interface Registry {
  /**
   * Register a function overload.
   * @param signature - Function signature in format 'name(type1, type2): returnType' or 'Type.method(args): returnType'
   * @param handlerOrOptions - Either the function implementation or an options object with handler and optional typeCheck
   */
  registerFunctionOverload(
    signature: string,
    handlerOrOptions: ((...args: any[]) => any) | {
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
  clone(): Registry

  /** The operator overload map. */
  overloads: Record<string, any>

  /** The function overload map. */
  functions: Record<string, any>

  /** Map of type names to their constructor functions. */
  objectTypes: Map<string, any>

  /** Map of constructor functions to their type names. */
  objectTypesByConstructor: Map<any, string>
}

/**
 * Options for creating a new registry.
 */
export interface RegistryOptions {
  functions?: Record<string, any>
  overloads?: Record<string, any>
  objectTypes?: Map<string, any>
  objectTypesByConstructor?: Map<any, string>
}

/**
 * Create a new registry instance.
 * @param opts - Optional initial configuration
 * @returns A new registry instance
 */
export function createRegistry(opts?: RegistryOptions): Registry

/**
 * Global registry instance used by default.
 */
export const globalRegistry: Registry
