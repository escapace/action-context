import { isString } from 'es-toolkit'
import assert from 'node:assert'

/**
 * Parses a branch name from a full Git reference.
 */
export const parseBranchFromReference = (reference: string): string => {
  const match = /refs\/heads\/(?<value>.+)/.exec(reference)
  const groups = match?.groups ?? {}
  const value = groups.value

  assert.ok(isString(value), `Expected '${reference}' to match refs/heads/<branch>`)

  return value
}
