import { ensureCase } from './ensure-case'
import { parseConventionalCommit } from './parse-conventional-commit'

const CONVENTIONAL_TYPES = new Set([
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
])

const startsWithLetterRegex = /^[\p{Ll}\p{Lu}]/iu

/**
 * Minimal vendored conventional-commit validator for merge-strategy safety.
 *
 * This validates the commit header shape and key constraints used for deciding
 * whether PR title/commits are safe for squash/rebase merge strategies.
 */
export const validateConventionalCommit = (message: string): boolean => {
  if (message.trim().length === 0) {
    return false
  }

  const parsed = parseConventionalCommit(message)

  if (parsed.header === null || parsed.header.length === 0) {
    return false
  }

  if (parsed.header.length > parsed.header.trimStart().length) {
    return false
  }

  if (parsed.header.length > parsed.header.trimEnd().length) {
    return false
  }

  if (parsed.type === null || parsed.type.length === 0) {
    return false
  }

  if (!CONVENTIONAL_TYPES.has(parsed.type)) {
    return false
  }

  if (!ensureCase(parsed.type, 'lower-case')) {
    return false
  }

  if (parsed.subject === null || parsed.subject.length === 0) {
    return false
  }

  const hasTrailingFullStop = parsed.header.endsWith('.') && !parsed.header.endsWith('...')

  if (hasTrailingFullStop) {
    return false
  }

  if (!startsWithLetterRegex.test(parsed.subject)) {
    return true
  }

  const disallowedSubjectCases = [
    'sentence-case',
    'start-case',
    'pascal-case',
    'upper-case',
  ] as const

  const subjectMatchesDisallowedCase = disallowedSubjectCases.some((caseType) =>
    ensureCase(parsed.subject ?? '', caseType),
  )

  return !subjectMatchesDisallowedCase
}
