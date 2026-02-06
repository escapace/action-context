import { describe, expect, it } from 'vitest'
import { parseBranchFromReference } from './parse-branch-from-reference'

describe('parseBranchFromReference', () => {
  it('parses branch names with slashes', () => {
    expect(parseBranchFromReference('refs/heads/releases/v4')).toBe('releases/v4')
  })

  it('throws for non-branch references', () => {
    expect(() => parseBranchFromReference('refs/tags/v1.0.0')).toThrow()
  })

  it('parses simple branch names', () => {
    expect(parseBranchFromReference('refs/heads/main')).toBe('main')
  })

  it('parses feature branch names', () => {
    expect(parseBranchFromReference('refs/heads/feature/add-auth')).toBe('feature/add-auth')
  })
})
