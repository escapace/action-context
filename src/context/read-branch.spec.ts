import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  info: vi.fn(),
}))

const mockContext = vi.hoisted(() => ({ eventName: '', ref: '' }))

vi.mock('@actions/github', () => ({
  context: mockContext,
}))

import { readBranch } from './read-branch'

describe('readBranch', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    vi.resetAllMocks()
    process.env = { ...originalEnvironment }
    mockContext.eventName = ''
    mockContext.ref = ''
  })

  afterEach(() => {
    process.env = originalEnvironment
  })

  it('returns GITHUB_HEAD_REF for pull_request events', () => {
    process.env.GITHUB_HEAD_REF = 'feature-branch'

    expect(readBranch('pull_request')).toBe('feature-branch')
  })

  it('parses branch from GITHUB_REF for push events', () => {
    mockContext.ref = 'refs/heads/main'

    expect(readBranch('push')).toBe('main')
  })

  it('handles nested branch names', () => {
    mockContext.ref = 'refs/heads/trunk'

    expect(readBranch('push')).toBe('trunk')
  })

  it('handles branch names with slashes', () => {
    mockContext.ref = 'refs/heads/releases/v4'

    expect(readBranch('push')).toBe('releases/v4')
  })

  it('throws when GITHUB_REF does not match expected pattern', () => {
    mockContext.ref = 'refs/tags/v1.0.0'

    expect(() => readBranch('push')).toThrow()
  })

  it('throws when GITHUB_HEAD_REF is not set for pull_request event', () => {
    delete process.env.GITHUB_HEAD_REF

    expect(() => readBranch('pull_request')).toThrow('GITHUB_HEAD_REF is not set')
  })

  it('throws when GITHUB_HEAD_REF is empty for pull_request event', () => {
    process.env.GITHUB_HEAD_REF = ''

    expect(() => readBranch('pull_request')).toThrow('GITHUB_HEAD_REF is not set')
  })

  it('throws when GITHUB_REF is not set for non-PR event', () => {
    mockContext.ref = ''

    expect(() => readBranch('push')).toThrow('GITHUB_REF is not set')
  })
})
