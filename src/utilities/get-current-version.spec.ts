import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'

const { mockConstants } = vi.hoisted(() => ({
  mockConstants: {
    CONVENTIONAL_COMMIT_REGEX:
      /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i,
    DEFAULT_INCREMENT: 'patch',
    EVENT_NAME: 'push',
    REF_NAME: 'trunk',
    REF_TYPE: 'branch' as 'branch' | 'tag',
    SEMVER_OPTIONS: { includePrerelease: true, loose: false },
    SHORT_COMMIT: 'f2e1fe5',
  },
}))

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: { sha: 'abc1234567890abcdef1234567890abcdef123456' },
}))

vi.mock('../constants', () => mockConstants)

vi.mock('./exec', () => ({
  exec: vi.fn(),
}))

vi.mock('./get-branch', () => ({
  getBranch: vi.fn(),
}))

vi.mock('./get-semver', () => ({
  getSemver: vi.fn(),
}))

vi.mock('./get-tag', () => ({
  getTag: vi.fn(),
}))

vi.mock('changelogen', () => ({
  getGitDiff: vi.fn(),
}))

import { getGitDiff } from 'changelogen'
import { exec } from './exec'
import { getBranch } from './get-branch'
import { getVersion } from './get-current-version'
import { getSemver } from './get-semver'
import { getTag } from './get-tag'

describe('getVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConstants.REF_TYPE = 'branch'
    mockConstants.REF_NAME = 'trunk'
    mockConstants.EVENT_NAME = 'push'
  })

  describe('tag path', () => {
    beforeEach(() => {
      mockConstants.REF_TYPE = 'tag'
    })

    it('parses a valid semver tag', async () => {
      mockConstants.REF_NAME = 'v1.2.3'

      const result = await getVersion()

      expect(result).not.toBeNull()
      expect(result?.major).toBe(1)
      expect(result?.minor).toBe(2)
      expect(result?.patch).toBe(3)
    })

    it('parses a prerelease tag', async () => {
      mockConstants.REF_NAME = 'v1.0.0-rc.1'

      const result = await getVersion()

      expect(result).not.toBeNull()
      expect(result?.prerelease).toEqual(['rc', 1])
    })

    it('throws for an invalid semver tag', async () => {
      mockConstants.REF_NAME = 'not-a-version'

      await expect(getVersion()).rejects.toThrow('Not semver string')
    })
  })

  describe('branch path', () => {
    beforeEach(() => {
      mockConstants.REF_TYPE = 'branch'
      vi.mocked(exec).mockImplementation(async (_cmd, arguments_) => {
        if (arguments_.includes('--is-shallow-repository')) return await Promise.resolve('false')
        if (arguments_.includes('--verify'))
          return await Promise.resolve('abc1234567890abcdef1234567890abcdef123456')
        return await Promise.resolve('')
      })
      vi.mocked(getBranch).mockReturnValue('trunk')
    })

    it('asserts the repo is not shallow', async () => {
      vi.mocked(getTag).mockResolvedValue(undefined)

      await getVersion()

      expect(exec).toHaveBeenCalledWith('git', ['rev-parse', '--is-shallow-repository'])
    })

    it('throws when the repo is shallow', async () => {
      vi.mocked(exec).mockImplementation(async (_cmd, arguments_) => {
        if (arguments_.includes('--is-shallow-repository')) return await Promise.resolve('true')
        return await Promise.resolve('')
      })

      await expect(getVersion()).rejects.toThrow()
    })

    it('returns 0.1.0 prerelease when no tags exist', async () => {
      vi.mocked(getTag).mockResolvedValue(undefined)

      const result = await getVersion()

      expect(result).not.toBeNull()
      expect(result?.major).toBe(0)
      expect(result?.minor).toBe(1)
      expect(result?.patch).toBe(0)
      expect(result?.prerelease[0]).toBe('trunk')
    })

    it('bumps patch on fix commits', async () => {
      vi.mocked(getTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'fix: correct a bug',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(getSemver).mockReturnValue(semver.parse('0.11.2-trunk.f2e1fe5'))

      await getVersion()

      expect(getSemver).toHaveBeenCalledWith({
        major: 0,
        minor: 11,
        patch: 2,
        prerelease: ['trunk', 'f2e1fe5'],
      })
    })

    it('bumps minor on feat commits', async () => {
      vi.mocked(getTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'feat: add new feature',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(getSemver).mockReturnValue(semver.parse('0.12.0-trunk.f2e1fe5'))

      await getVersion()

      expect(getSemver).toHaveBeenCalledWith({
        major: 0,
        minor: 12,
        patch: 0,
        prerelease: ['trunk', 'f2e1fe5'],
      })
    })

    it('bumps major on breaking change with ! suffix', async () => {
      vi.mocked(getTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'feat!: breaking change',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(getSemver).mockReturnValue(semver.parse('1.0.0-trunk.f2e1fe5'))

      await getVersion()

      expect(getSemver).toHaveBeenCalledWith({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ['trunk', 'f2e1fe5'],
      })
    })

    it('bumps major on BREAKING CHANGE in message body', async () => {
      vi.mocked(getTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'feat: some feature BREAKING CHANGE: removes old API',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(getSemver).mockReturnValue(semver.parse('1.0.0-trunk.f2e1fe5'))

      await getVersion()

      expect(getSemver).toHaveBeenCalledWith({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ['trunk', 'f2e1fe5'],
      })
    })

    it('defaults to patch when no conventional commits match', async () => {
      vi.mocked(getTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'random commit message',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(getSemver).mockReturnValue(semver.parse('0.11.2-trunk.f2e1fe5'))

      await getVersion()

      expect(getSemver).toHaveBeenCalledWith({
        major: 0,
        minor: 11,
        patch: 2,
        prerelease: ['trunk', 'f2e1fe5'],
      })
    })

    it('sanitizes branch name in prerelease (non-alphanumeric to hyphens)', async () => {
      vi.mocked(getBranch).mockReturnValue('renovate/lock-file-maintenance')
      vi.mocked(getTag).mockResolvedValue(undefined)

      const result = await getVersion()

      expect(result).not.toBeNull()
      expect(result?.prerelease[0]).toBe('renovate-lock-file-maintenance')
    })

    it('asserts branch latest commit for push events', async () => {
      mockConstants.EVENT_NAME = 'push'
      vi.mocked(exec).mockImplementation(async (_cmd, arguments_) => {
        if (arguments_.includes('--is-shallow-repository')) return await Promise.resolve('false')
        if (arguments_.includes('--verify'))
          return await Promise.resolve('abc1234567890abcdef1234567890abcdef123456')
        return await Promise.resolve('')
      })
      vi.mocked(getBranch).mockReturnValue('trunk')
      vi.mocked(getTag).mockResolvedValue(undefined)

      await getVersion()

      expect(exec).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'trunk'])
    })

    it('skips branch latest commit assertion for pull_request events', async () => {
      mockConstants.EVENT_NAME = 'pull_request'
      vi.mocked(getBranch).mockReturnValue('feature-branch')
      vi.mocked(getTag).mockResolvedValue(undefined)

      await getVersion()

      const verifyCallArguments = vi
        .mocked(exec)
        .mock.calls.filter(([, arguments_]) => arguments_.includes('--verify'))
      expect(verifyCallArguments).toHaveLength(0)
    })
  })
})
