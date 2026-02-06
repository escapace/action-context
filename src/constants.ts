/**
 * Default semantic increment used when no conventional commit type is detected.
 */
export const defaultIncrement = 'patch'

/**
 * Conventional Commit parsing pattern used for increment derivation.
 */
export const conventionalCommitRegex =
  /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i
