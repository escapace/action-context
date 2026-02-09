import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'

vi.mock('./assert-repo-not-shallow', () => ({
  assertRepoNotShallow: vi.fn(),
}))

vi.mock('./read-tag', () => ({
  readTag: vi.fn(),
}))

import { assertRepoNotShallow } from './assert-repo-not-shallow'
import { readTag } from './read-tag'
import { isLatestVersion } from './is-latest-version'

describe('isLatestVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertRepoNotShallow).mockResolvedValue(undefined)
  })

  it('returns true when no tags exist', async () => {
    vi.mocked(readTag).mockResolvedValue(undefined)

    const version = semver.parse('0.1.0')!
    expect(await isLatestVersion(version)).toBe(true)
  })

  it('returns true when current version is greater than latest tag', async () => {
    vi.mocked(readTag).mockResolvedValue('v1.0.0')

    const version = semver.parse('2.0.0')!
    expect(await isLatestVersion(version)).toBe(true)
  })

  it('returns true when current version equals latest tag', async () => {
    vi.mocked(readTag).mockResolvedValue('v1.0.0')

    const version = semver.parse('1.0.0')!
    expect(await isLatestVersion(version)).toBe(true)
  })

  it('returns false when current version is less than latest tag', async () => {
    vi.mocked(readTag).mockResolvedValue('v2.0.0')

    const version = semver.parse('1.0.0')!
    expect(await isLatestVersion(version)).toBe(false)
  })

  it('calls shallow-history guard before reading tags', async () => {
    vi.mocked(readTag).mockResolvedValue(undefined)

    const version = semver.parse('1.0.0')!
    await isLatestVersion(version)

    expect(assertRepoNotShallow).toHaveBeenCalledTimes(1)
    expect(readTag).toHaveBeenCalledWith(undefined, { includePrerelease: false })
  })

  it('compares against latest stable tag', async () => {
    vi.mocked(readTag).mockResolvedValue('v1.0.0')

    const version = semver.parse('1.0.0-rc.1')!
    expect(await isLatestVersion(version)).toBe(false)
  })

  it.each([
    { current: '0.12.0-feature-a.abc1234', expected: true, stableTag: 'v0.11.1' },
    { current: '1.2.1-feature-a.abc1234', expected: true, stableTag: 'v1.2.0' },
    { current: '1.3.0-feature-a.abc1234', expected: false, stableTag: 'v1.3.0' },
    { current: '1.3.1-feature-a.abc1234', expected: true, stableTag: 'v1.3.0' },
  ])(
    'matches README latest examples for current=$current against stableTag=$stableTag',
    async ({ current, expected, stableTag }) => {
      vi.mocked(readTag).mockResolvedValue(stableTag)

      const version = semver.parse(current)!
      await expect(isLatestVersion(version)).resolves.toBe(expected)
    },
  )

  it('fails when repository history is shallow', async () => {
    vi.mocked(assertRepoNotShallow).mockRejectedValue(new Error('Repository history is shallow.'))

    const version = semver.parse('1.0.0')!
    await expect(isLatestVersion(version)).rejects.toThrow('Repository history is shallow.')
    expect(readTag).not.toHaveBeenCalled()
  })
})
