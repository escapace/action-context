/**
 * Throws a structured input validation error.
 */
export const throwInputError = (detail: string): never => {
  throw new Error(`[INPUT_INVALID] ${detail}`)
}
