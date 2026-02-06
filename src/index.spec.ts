import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'
import type { Octokit } from './utilities/pull-request/types'

const runModule = async () => {
  vi.resetModules()

  vi.doMock('@actions/core', () => ({
    info: vi.fn(),
    setFailed: vi.fn(),
    setOutput: vi.fn(),
  }))

  vi.doMock('./context/create-context', () => ({
    createContext: vi.fn(),
  }))

  vi.doMock('./utilities/get-current-version', () => ({
    getVersion: vi.fn(),
  }))

  vi.doMock('./utilities/is-latest-version', () => ({
    isLatestVersion: vi.fn(),
  }))

  vi.doMock('./utilities/get-changelog', () => ({
    getChangelog: vi.fn(),
  }))

  vi.doMock('./utilities/set-output-versions', () => ({
    setOutputVersions: vi.fn(),
  }))

  vi.doMock('./utilities/set-output-github-pages', () => ({
    setOutputGithubPages: vi.fn(),
  }))

  vi.doMock('./utilities/pull-request/set-output-pull-request', () => ({
    setOutputPullRequest: vi.fn(),
  }))

  const coreModule = await import('@actions/core')
  const contextModule = await import('./context/create-context')
  const getVersionModule = await import('./utilities/get-current-version')
  const isLatestVersionModule = await import('./utilities/is-latest-version')
  const getChangelogModule = await import('./utilities/get-changelog')
  const setOutputVersionsModule = await import('./utilities/set-output-versions')
  const setOutputGithubPagesModule = await import('./utilities/set-output-github-pages')
  const setOutputPullRequestModule =
    await import('./utilities/pull-request/set-output-pull-request')

  return {
    core: coreModule,
    createContext: contextModule.createContext,
    getChangelog: getChangelogModule.getChangelog,
    getVersion: getVersionModule.getVersion,
    isLatestVersion: isLatestVersionModule.isLatestVersion,
    setOutputGithubPages: setOutputGithubPagesModule.setOutputGithubPages,
    setOutputPullRequest: setOutputPullRequestModule.setOutputPullRequest,
    setOutputVersions: setOutputVersionsModule.setOutputVersions,
  }
}

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const baseContext = {
  contextSource: 'event',
  eventName: 'push',
  hasPullRequestContext: false,
  pullRequestNumber: 0,
  referenceName: 'trunk',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: 'trunk',
  versionCommitSha: 'abc1234567890abcdef1234567890abcdef123456',
  versionCommitShaShort: 'f2e1fe5',
  workflowRunId: '123456',
} as const

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets all outputs for a branch context (testing environment)', async () => {
    const mods = await runModule()

    vi.mocked(mods.createContext).mockResolvedValue({
      ...baseContext,
      inputs: {
        contextSource: 'event',
        nodeVersion: undefined,
        token: 'ghp_test_token',
        trustedBots: new Set(),
      },
      octokit: createMockOctokit(),
    })

    const version = new semver.SemVer('0.11.2-trunk.f2e1fe5')
    vi.mocked(mods.getVersion).mockResolvedValue(version)
    vi.mocked(mods.isLatestVersion).mockResolvedValue(true)
    vi.mocked(mods.getChangelog).mockResolvedValue('')

    await import('./index')

    expect(mods.core.setOutput).toHaveBeenCalledWith('environment', 'testing')
    expect(mods.core.setOutput).toHaveBeenCalledWith('short-commit', 'f2e1fe5')
    expect(mods.getChangelog).not.toHaveBeenCalled()
    expect(mods.setOutputVersions).toHaveBeenCalled()
  })

  it('sets production environment for tag without prerelease', async () => {
    const mods = await runModule()

    vi.mocked(mods.createContext).mockResolvedValue({
      ...baseContext,
      hasPullRequestContext: false,
      inputs: {
        contextSource: 'event',
        nodeVersion: undefined,
        token: 'ghp_test_token',
        trustedBots: new Set(),
      },
      octokit: createMockOctokit(),
      pullRequestNumber: 0,
      referenceName: 'v1.0.0',
      referenceType: 'tag',
      versionBranch: '',
    })

    vi.mocked(mods.getVersion).mockResolvedValue(new semver.SemVer('1.0.0'))
    vi.mocked(mods.isLatestVersion).mockResolvedValue(true)
    vi.mocked(mods.getChangelog).mockResolvedValue('## Changes')

    await import('./index')

    expect(mods.core.setOutput).toHaveBeenCalledWith('environment', 'production')
    expect(mods.getChangelog).toHaveBeenCalledWith({ prerelease: false, token: 'ghp_test_token' })
  })

  it('calls core.setFailed when runtime token is missing', async () => {
    const mods = await runModule()

    vi.mocked(mods.createContext).mockRejectedValue(new Error('Empty github token.'))

    await import('./index')

    expect(mods.core.setFailed).toHaveBeenCalled()
  })
})
