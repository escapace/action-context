import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: { sha: 'abc1234567890abcdef1234567890abcdef123456' },
}))

vi.mock('../utilities/exec', () => ({
  exec: vi.fn(),
}))

vi.mock('./create-semantic-version', () => ({
  createSemanticVersion: vi.fn(),
}))

vi.mock('./read-tag', () => ({
  readTag: vi.fn(),
}))

vi.mock('changelogen', () => ({
  getGitDiff: vi.fn(),
}))

import { getGitDiff } from 'changelogen'
import { createOutputs } from '../context/outputs'
import { exec } from '../utilities/exec'
import { createVersion } from './create-version'
import type { Context } from '../context/create-context'
import type { Octokit } from '../utilities/pull-request/types'
import { createSemanticVersion } from './create-semantic-version'
import { readTag } from './read-tag'

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const contextBase = {
  contextSource: 'event' as const,
  eventName: '',
  inputs: {
    contextSource: 'event' as const,
    token: 'ghp_test_token',
    trustedBots: new Set<string>(),
  },
  octokit: createMockOctokit(),
  outputs: createOutputs(),
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionCommitSha: 'abc1234567890abcdef1234567890abcdef123456',
  versionCommitShaShort: 'abc1234',
  workflowRunId: '123456',
}

const createContext = (): Context => {
  const referenceName = process.env.GITHUB_REF_NAME ?? ''
  const eventName = process.env.GITHUB_EVENT_NAME ?? ''

  if (process.env.GITHUB_REF_TYPE === 'tag') {
    return {
      ...contextBase,
      eventName,
      hasPullRequestContext: false,
      pullRequestNumber: 0,
      referenceName,
      referenceType: 'tag',
      versionBranch: '',
    }
  }

  return {
    ...contextBase,
    eventName,
    hasPullRequestContext: false,
    pullRequestNumber: 0,
    referenceName,
    referenceType: 'branch',
    versionBranch: referenceName,
  }
}

describe('createVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GITHUB_REF_TYPE = 'branch'
    process.env.GITHUB_REF_NAME = 'trunk'
    process.env.GITHUB_EVENT_NAME = 'push'
  })

  describe('tag path', () => {
    beforeEach(() => {
      process.env.GITHUB_REF_TYPE = 'tag'
    })

    it('parses a valid semver tag', async () => {
      process.env.GITHUB_REF_NAME = 'v1.2.3'

      const result = await createVersion(createContext())

      expect(result).not.toBeNull()
      expect(result?.major).toBe(1)
      expect(result?.minor).toBe(2)
      expect(result?.patch).toBe(3)
    })

    it('parses a prerelease tag', async () => {
      process.env.GITHUB_REF_NAME = 'v1.0.0-rc.1'

      const result = await createVersion(createContext())

      expect(result).not.toBeNull()
      expect(result?.prerelease).toEqual(['rc', 1])
    })

    it('throws for an invalid semver tag', async () => {
      process.env.GITHUB_REF_NAME = 'not-a-version'

      await expect(createVersion(createContext())).rejects.toThrow('Not semver string')
    })
  })

  describe('branch path', () => {
    beforeEach(() => {
      process.env.GITHUB_REF_TYPE = 'branch'
      vi.mocked(exec).mockImplementation(async (_cmd, arguments_) => {
        if (arguments_.includes('--is-shallow-repository')) return await Promise.resolve('false')
        if (arguments_.includes('--verify'))
          return await Promise.resolve('abc1234567890abcdef1234567890abcdef123456')
        return await Promise.resolve('')
      })
    })

    it('asserts the repo is not shallow', async () => {
      vi.mocked(readTag).mockResolvedValue(undefined)

      await createVersion(createContext())

      expect(exec).toHaveBeenCalledWith('git', ['rev-parse', '--is-shallow-repository'])
    })

    it('throws when the repo is shallow', async () => {
      vi.mocked(exec).mockImplementation(async (_cmd, arguments_) => {
        if (arguments_.includes('--is-shallow-repository')) return await Promise.resolve('true')
        return await Promise.resolve('')
      })

      await expect(createVersion(createContext())).rejects.toThrow()
    })

    it('returns 0.1.0 prerelease when no tags exist', async () => {
      vi.mocked(readTag).mockResolvedValue(undefined)

      const result = await createVersion(createContext())

      expect(result).not.toBeNull()
      expect(result?.major).toBe(0)
      expect(result?.minor).toBe(1)
      expect(result?.patch).toBe(0)
      expect(result?.prerelease[0]).toBe('trunk')
    })

    it('bumps patch on fix commits', async () => {
      vi.mocked(readTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'fix: correct a bug',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(createSemanticVersion).mockReturnValue(semver.parse('0.11.2-trunk.f2e1fe5')!)

      await createVersion(createContext())

      expect(createSemanticVersion).toHaveBeenCalledWith({
        major: 0,
        minor: 11,
        patch: 2,
        prerelease: ['trunk', 'abc1234'],
      })
    })

    it('bumps minor on feat commits', async () => {
      vi.mocked(readTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'feat: add new feature',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(createSemanticVersion).mockReturnValue(semver.parse('0.12.0-trunk.f2e1fe5')!)

      await createVersion(createContext())

      expect(createSemanticVersion).toHaveBeenCalledWith({
        major: 0,
        minor: 12,
        patch: 0,
        prerelease: ['trunk', 'abc1234'],
      })
    })

    it('bumps major on breaking change with ! suffix', async () => {
      vi.mocked(readTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'feat!: breaking change',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(createSemanticVersion).mockReturnValue(semver.parse('1.0.0-trunk.f2e1fe5')!)

      await createVersion(createContext())

      expect(createSemanticVersion).toHaveBeenCalledWith({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ['trunk', 'abc1234'],
      })
    })

    it('bumps major on BREAKING CHANGE in message body', async () => {
      vi.mocked(readTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'feat: some feature BREAKING CHANGE: removes old API',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(createSemanticVersion).mockReturnValue(semver.parse('1.0.0-trunk.f2e1fe5')!)

      await createVersion(createContext())

      expect(createSemanticVersion).toHaveBeenCalledWith({
        major: 1,
        minor: 0,
        patch: 0,
        prerelease: ['trunk', 'abc1234'],
      })
    })

    it('defaults to patch when no conventional commits match', async () => {
      vi.mocked(readTag).mockResolvedValue('v0.11.1')
      vi.mocked(getGitDiff).mockResolvedValue([
        {
          author: { email: '', name: '' },
          body: '',
          message: 'random commit message',
          shortHash: 'abc',
        },
      ] as never)
      vi.mocked(createSemanticVersion).mockReturnValue(semver.parse('0.11.2-trunk.f2e1fe5')!)

      await createVersion(createContext())

      expect(createSemanticVersion).toHaveBeenCalledWith({
        major: 0,
        minor: 11,
        patch: 2,
        prerelease: ['trunk', 'abc1234'],
      })
    })

    it('sanitizes branch name in prerelease (non-alphanumeric to hyphens)', async () => {
      process.env.GITHUB_REF_NAME = 'renovate/lock-file-maintenance'
      vi.mocked(readTag).mockResolvedValue(undefined)

      const result = await createVersion(createContext())

      expect(result).not.toBeNull()
      expect(result?.prerelease[0]).toBe('renovate-lock-file-maintenance')
    })

    it('asserts branch latest commit for push events', async () => {
      process.env.GITHUB_EVENT_NAME = 'push'
      vi.mocked(exec).mockImplementation(async (_cmd, arguments_) => {
        if (arguments_.includes('--is-shallow-repository')) return await Promise.resolve('false')
        if (arguments_.includes('--verify'))
          return await Promise.resolve('abc1234567890abcdef1234567890abcdef123456')
        return await Promise.resolve('')
      })
      vi.mocked(readTag).mockResolvedValue(undefined)

      await createVersion(createContext())

      expect(exec).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'trunk'])
    })

    it('skips branch latest commit assertion when pull request context is available', async () => {
      process.env.GITHUB_EVENT_NAME = 'pull_request'
      vi.mocked(readTag).mockResolvedValue(undefined)

      const context = createContext()
      context.hasPullRequestContext = true
      context.pullRequestNumber = 95

      await createVersion(context)

      const verifyCallArguments = vi
        .mocked(exec)
        .mock.calls.filter(([, arguments_]) => arguments_.includes('--verify'))
      expect(verifyCallArguments).toHaveLength(0)
    })
  })
})
