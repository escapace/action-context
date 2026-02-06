import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'

vi.mock('../constants', () => ({
  SEMVER_OPTIONS: { includePrerelease: true, loose: false },
}))

vi.mock('./get-tag', () => ({
  getTag: vi.fn(),
}))

import { getTag } from './get-tag'
import { isLatestVersion } from './is-latest-version'

describe('isLatestVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when no tags exist', async () => {
    vi.mocked(getTag).mockResolvedValue(undefined)

    const version = semver.parse('0.1.0')!
    expect(await isLatestVersion(version)).toBe(true)
  })

  it('returns true when current version is greater than latest tag', async () => {
    vi.mocked(getTag).mockResolvedValue('v1.0.0')

    const version = semver.parse('2.0.0')!
    expect(await isLatestVersion(version)).toBe(true)
  })

  it('returns true when current version equals latest tag', async () => {
    vi.mocked(getTag).mockResolvedValue('v1.0.0')

    const version = semver.parse('1.0.0')!
    expect(await isLatestVersion(version)).toBe(true)
  })

  it('returns false when current version is less than latest tag', async () => {
    vi.mocked(getTag).mockResolvedValue('v2.0.0')

    const version = semver.parse('1.0.0')!
    expect(await isLatestVersion(version)).toBe(false)
  })

  it('calls getTag without a branch parameter', async () => {
    vi.mocked(getTag).mockResolvedValue(undefined)

    const version = semver.parse('1.0.0')!
    await isLatestVersion(version)

    expect(getTag).toHaveBeenCalledWith()
  })
})
