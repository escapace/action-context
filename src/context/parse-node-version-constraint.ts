import semver from 'semver'

/**
 * Resolves the node-version input to a concrete minimum version.
 *
 * Accepts either a concrete semantic version (for example `22.15.0`) or a
 * semver range/constraint (for example `>=22.15.0`) and returns the minimum
 * satisfiable concrete version.
 */
export const parseNodeVersionConstraint = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const cleaned = semver.clean(value)

  if (cleaned !== null) {
    return cleaned
  }

  const range = semver.validRange(value)

  if (range === null) {
    return undefined
  }

  return semver.minVersion(range)?.toString()
}
