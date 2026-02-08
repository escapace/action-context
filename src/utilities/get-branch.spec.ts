import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockConstants } = vi.hoisted(() => ({
  mockConstants: {
    EVENT_NAME: 'push' as string,
  },
}))

vi.mock('@actions/core', () => ({
  info: vi.fn(),
}))

vi.mock('../constants', () => mockConstants)

import { getBranch, parseBranchFromReference } from './get-branch'

describe('getBranch', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnvironment }
  })

  afterEach(() => {
    process.env = originalEnvironment
  })

  it('returns GITHUB_HEAD_REF for pull_request events', () => {
    mockConstants.EVENT_NAME = 'pull_request'
    process.env.GITHUB_HEAD_REF = 'feature-branch'

    expect(getBranch()).toBe('feature-branch')
  })

  it('parses branch name from GITHUB_REF for push events', () => {
    mockConstants.EVENT_NAME = 'push'
    process.env.GITHUB_REF = 'refs/heads/main'

    expect(getBranch()).toBe('main')
  })

  it('parses branch name from GITHUB_REF for push to trunk', () => {
    mockConstants.EVENT_NAME = 'push'
    process.env.GITHUB_REF = 'refs/heads/trunk'

    expect(getBranch()).toBe('trunk')
  })

  it('preserves slash-separated branch names on push events', () => {
    mockConstants.EVENT_NAME = 'push'
    process.env.GITHUB_REF = 'refs/heads/releases/v4'

    expect(getBranch()).toBe('releases/v4')
  })

  it('throws when GITHUB_REF does not match expected pattern', () => {
    mockConstants.EVENT_NAME = 'push'
    process.env.GITHUB_REF = 'refs/tags/v1.0.0'

    expect(() => getBranch()).toThrow()
  })
})

describe('parseBranchFromReference', () => {
  it('parses slash-separated branch names', () => {
    expect(parseBranchFromReference('refs/heads/releases/v4')).toBe('releases/v4')
  })

  it('throws on non-branch references', () => {
    expect(() => parseBranchFromReference('refs/tags/v1.0.0')).toThrow()
  })
})
