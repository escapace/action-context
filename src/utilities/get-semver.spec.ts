import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
}))

vi.mock('../constants', () => ({
  SEMVER_OPTIONS: { includePrerelease: true, loose: false },
}))

import { getSemver } from './get-semver'

describe('getSemver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses a version without prerelease', () => {
    const result = getSemver({ major: 1, minor: 2, patch: 3, prerelease: [] })

    expect(result).not.toBeNull()
    expect(result?.version).toBe('1.2.3')
  })

  it('parses a version with prerelease identifiers', () => {
    const result = getSemver({
      major: 0,
      minor: 11,
      patch: 2,
      prerelease: ['trunk', 'f2e1fe5'],
    })

    expect(result).not.toBeNull()
    expect(result?.version).toBe('0.11.2-trunk.f2e1fe5')
  })

  it('parses a version with numeric prerelease', () => {
    const result = getSemver({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['rc', 1],
    })

    expect(result).not.toBeNull()
    expect(result?.version).toBe('1.0.0-rc.1')
  })

  it('returns null for invalid version components', () => {
    const result = getSemver({
      major: -1,
      minor: 0,
      patch: 0,
      prerelease: [],
    })

    expect(result).toBeNull()
  })
})
