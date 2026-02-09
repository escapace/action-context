import { beforeEach, describe, expect, it, vi } from 'vitest'
import semver from 'semver'

vi.mock('./get-version', () => ({
  getVersion: vi.fn(),
}))

vi.mock('./is-latest-version', () => ({
  isLatestVersion: vi.fn(),
}))

vi.mock('./get-changelog', () => ({
  getChangelog: vi.fn(),
}))

import { createOutputs } from '../context/outputs'
import { getChangelog } from './get-changelog'
import { getVersion } from './get-version'
import { isLatestVersion } from './is-latest-version'
import { setOutputVersion } from './set-output-version'
import type { Context } from '../context/create-context'
import type { Octokit } from '../utilities/pull-request/types'

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const createBranchContext = (): Context => ({
  contextSource: 'event',
  eventName: 'push',
  hasPullRequestContext: false,
  inputs: {
    contextSource: 'event',
    nodeVersion: undefined,
    token: 'ghp_test_token',
    trustedBots: new Set(),
  },
  octokit: createMockOctokit(),
  outputs: createOutputs(),
  pullRequestNumber: 0,
  referenceName: 'trunk',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: 'trunk',
  versionCommitSha: 'abc1234567890abcdef1234567890abcdef123456',
  versionCommitShaShort: 'f2e1fe5',
  workflowRunId: '123456',
})

const createTagContext = (referenceName: string): Context => ({
  contextSource: 'event',
  eventName: 'push',
  hasPullRequestContext: false,
  inputs: {
    contextSource: 'event',
    nodeVersion: undefined,
    token: 'ghp_test_token',
    trustedBots: new Set(),
  },
  octokit: createMockOctokit(),
  outputs: createOutputs(),
  pullRequestNumber: 0,
  referenceName,
  referenceType: 'tag',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: '',
  versionCommitSha: 'abc1234567890abcdef1234567890abcdef123456',
  versionCommitShaShort: 'f2e1fe5',
  workflowRunId: '123456',
})

describe('setOutputVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets testing environment outputs for branch context', async () => {
    const context = createBranchContext()
    const version = new semver.SemVer('0.11.2-trunk.f2e1fe5')

    vi.mocked(getVersion).mockResolvedValue(version)
    vi.mocked(isLatestVersion).mockResolvedValue(true)

    await setOutputVersion(context)

    expect(context.outputs.version).toBe('0.11.2-trunk.f2e1fe5')
    expect(context.outputs.environment).toBe('testing')
    expect(context.outputs.prerelease).toBe(true)
    expect(context.outputs['prerelease-identifier']).toBe('trunk')
    expect(context.outputs['short-commit']).toBe('f2e1fe5')
    expect(context.outputs.latest).toBe(true)
    expect(context.outputs.changelog).toBe('')

    expect(getChangelog).not.toHaveBeenCalled()
  })

  it('sets production environment for release tag', async () => {
    const context = createTagContext('v1.0.0')
    const version = new semver.SemVer('1.0.0')

    vi.mocked(getVersion).mockResolvedValue(version)
    vi.mocked(isLatestVersion).mockResolvedValue(true)
    vi.mocked(getChangelog).mockResolvedValue('## Changes')

    await setOutputVersion(context)

    expect(context.outputs.version).toBe('1.0.0')
    expect(context.outputs.environment).toBe('production')
    expect(context.outputs.prerelease).toBe(false)
    expect(context.outputs['prerelease-identifier']).toBe('')
    expect(context.outputs.latest).toBe(true)
    expect(context.outputs.changelog).toBe('## Changes')

    expect(getChangelog).toHaveBeenCalledWith({ prerelease: false, token: 'ghp_test_token' })
  })

  it('sets staging environment for prerelease tag', async () => {
    const context = createTagContext('v1.0.0-rc.1')
    const version = new semver.SemVer('1.0.0-rc.1')

    vi.mocked(getVersion).mockResolvedValue(version)
    vi.mocked(isLatestVersion).mockResolvedValue(false)
    vi.mocked(getChangelog).mockResolvedValue('## RC Changes')

    await setOutputVersion(context)

    expect(context.outputs.version).toBe('1.0.0-rc.1')
    expect(context.outputs.environment).toBe('staging')
    expect(context.outputs.prerelease).toBe(true)
    expect(context.outputs['prerelease-identifier']).toBe('rc')
    expect(context.outputs.latest).toBe(false)
    expect(context.outputs.changelog).toBe('## RC Changes')

    expect(getChangelog).toHaveBeenCalledWith({ prerelease: true, token: 'ghp_test_token' })
  })

  it('defaults changelog to empty string when getChangelog returns undefined', async () => {
    const context = createTagContext('v1.0.0')
    const version = new semver.SemVer('1.0.0')

    vi.mocked(getVersion).mockResolvedValue(version)
    vi.mocked(isLatestVersion).mockResolvedValue(true)
    vi.mocked(getChangelog).mockResolvedValue(undefined)

    await setOutputVersion(context)

    expect(context.outputs.changelog).toBe('')
  })

  it('throws when getVersion returns null', async () => {
    const context = createBranchContext()

    vi.mocked(getVersion).mockResolvedValue(null)

    await expect(setOutputVersion(context)).rejects.toThrow('Failed to derive a semantic version.')
  })
})
