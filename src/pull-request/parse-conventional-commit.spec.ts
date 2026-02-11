import { describe, expect, it } from 'vitest'
import { parseConventionalCommit } from './parse-conventional-commit'

describe('parseConventionalCommit', () => {
  it('parses type, scope and subject from a standard header', () => {
    expect(parseConventionalCommit('feat(api): add endpoint')).toEqual({
      breaking: false,
      header: 'feat(api): add endpoint',
      raw: 'feat(api): add endpoint',
      scope: 'api',
      subject: 'add endpoint',
      type: 'feat',
    })
  })

  it('detects breaking change from ! syntax', () => {
    const parsed = parseConventionalCommit('feat!: breaking api')

    expect(parsed.breaking).toBe(true)
    expect(parsed.type).toBe('feat')
    expect(parsed.subject).toBe('breaking api')
  })

  it('detects breaking change from footer note', () => {
    const parsed = parseConventionalCommit('feat: add change\n\nBREAKING CHANGE: behaviour changed')

    expect(parsed.breaking).toBe(true)
  })

  it('returns null structural fields for non-conventional header', () => {
    expect(parseConventionalCommit('update dependencies')).toEqual({
      breaking: false,
      header: 'update dependencies',
      raw: 'update dependencies',
      scope: null,
      subject: null,
      type: null,
    })
  })

  it('normalizes windows line endings', () => {
    const parsed = parseConventionalCommit('fix: patch\r\n\r\nbody')

    expect(parsed.raw).toBe('fix: patch\n\nbody')
  })

  it('returns null header fields for empty message', () => {
    expect(parseConventionalCommit('')).toEqual({
      breaking: false,
      header: null,
      raw: '',
      scope: null,
      subject: null,
      type: null,
    })
  })
})
