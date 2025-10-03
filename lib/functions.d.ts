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

  /**
   * Get the bigint value.
   */
  get value(): bigint

  /**
   * Convert to primitive bigint for operations.
   */
  valueOf(): bigint

  /**
   * Convert to string representation.
   */
  toString(): string
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

  /**
   * Get the seconds component.
   */
  get seconds(): bigint

  /**
   * Get the nanoseconds component.
   */
  get nanos(): number

  /**
   * Convert to primitive bigint (seconds only) for operations.
   */
  valueOf(): bigint

  /**
   * Convert to string representation in format like "5s", "1h30m", etc.
   */
  toString(): string
}
