import { describe, expect, it } from 'vitest'
import { validateConventionalCommit } from './validate-conventional-commit'

describe('validateConventionalCommit', () => {
  it('accepts valid conventional headers', () => {
    expect(validateConventionalCommit('feat: add feature')).toBe(true)
    expect(validateConventionalCommit('fix(scope): patch issue')).toBe(true)
    expect(validateConventionalCommit('feat!: breaking change')).toBe(true)
  })

  it('rejects empty or whitespace-only messages', () => {
    expect(validateConventionalCommit('')).toBe(false)
    expect(validateConventionalCommit('   ')).toBe(false)
  })

  it('rejects malformed headers', () => {
    expect(validateConventionalCommit('feat add missing colon')).toBe(false)
    expect(validateConventionalCommit('feat(scope) missing colon')).toBe(false)
    expect(validateConventionalCommit(': missing type')).toBe(false)
  })

  it('rejects types outside the conventional enum', () => {
    expect(validateConventionalCommit('feature: add')).toBe(false)
    expect(validateConventionalCommit('bugfix: patch')).toBe(false)
  })

  it('rejects type case violations', () => {
    expect(validateConventionalCommit('Feat: add')).toBe(false)
  })

  it('rejects trailing full-stop subject', () => {
    expect(validateConventionalCommit('fix: trailing dot.')).toBe(false)
    expect(validateConventionalCommit('fix: ellipsis...')).toBe(true)
  })

  it('rejects header surrounding whitespace and empty subject', () => {
    expect(validateConventionalCommit(' fix: subject')).toBe(false)
    expect(validateConventionalCommit('fix: subject ')).toBe(false)
    expect(validateConventionalCommit('fix(scope):')).toBe(false)
    expect(validateConventionalCommit('fix(scope): ')).toBe(false)
  })

  it('does not enforce subject-case when subject starts with a non-letter', () => {
    expect(validateConventionalCommit('fix: 123 issue')).toBe(true)
  })
})
