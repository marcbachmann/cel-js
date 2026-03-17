import type {Registry} from './registry.js'

/**
 * Represents an unsigned integer value in CEL.
 * Used for uint type values.
 */
export class UnsignedInt {
  /**
   * Create a new UnsignedInt.
   * @param value - The unsigned integer value (as bigint or number)
   * @throws Error if value is negative or exceeds uint64 max
   */
  constructor(value: bigint | number)

  /** Get the bigint value. */
  get value(): bigint

  /** Convert to primitive bigint for operations. */
  valueOf(): bigint

  /** Convert to string representation. */
  toString(): string

  /** Validate and store an unsigned integer value. */
  verify(v: bigint): void
}

/**
 * Represents a duration value in CEL.
 * Used for google.protobuf.Duration type.
 */
export class Duration {
  /**
   * Create a new Duration.
   * @param seconds - The number of seconds
   * @param nanos - The number of nanoseconds (0-999999999)
   */
  constructor(seconds: bigint | number, nanos?: number)

  /** Get the seconds component. */
  get seconds(): bigint

  /** Get the nanoseconds component. */
  get nanos(): number

  /** Construct a duration from a millisecond value. */
  static fromMilliseconds(ms: number): Duration

  /** Convert to primitive milliseconds for operations. */
  valueOf(): number

  /** Add another duration. */
  addDuration(other: Duration): Duration

  /** Subtract another duration. */
  subtractDuration(other: Duration): Duration

  /** Add this duration to a timestamp. */
  extendTimestamp(timestamp: Date): Date

  /** Subtract this duration from a timestamp. */
  subtractTimestamp(timestamp: Date): Date

  /** Convert to string representation in format like "5s", "1h30m", etc. */
  toString(): string

  /** Whole hours represented by this duration. */
  getHours(): bigint

  /** Whole minutes represented by this duration. */
  getMinutes(): bigint

  /** Whole seconds represented by this duration. */
  getSeconds(): bigint

  /** Total milliseconds represented by this duration. */
  getMilliseconds(): bigint
}

/**
 * Register all built-in CEL functions on the provided registry instance.
 */
export function registerFunctions(registry: Registry): void
