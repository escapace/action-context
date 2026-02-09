import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutputs } from './context/outputs'
import type { ActionOutputs } from './types'
import type { Octokit } from './types'

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

  vi.doMock('./version/set-output-version', () => ({
    setOutputVersion: vi.fn(),
  }))

  vi.doMock('./utilities/set-output-versions', () => ({
    setOutputVersions: vi.fn(),
  }))

  vi.doMock('./utilities/set-output-github-pages', () => ({
    setOutputGithubPages: vi.fn(),
  }))

  vi.doMock('./pull-request/set-output-pull-request', () => ({
    setOutputPullRequest: vi.fn(),
  }))

  const coreModule = await import('@actions/core')
  const contextModule = await import('./context/create-context')
  const setOutputVersionModule = await import('./version/set-output-version')
  const setOutputVersionsModule = await import('./utilities/set-output-versions')
  const setOutputGithubPagesModule = await import('./utilities/set-output-github-pages')
  const setOutputPullRequestModule = await import('./pull-request/set-output-pull-request')

  return {
    core: coreModule,
    createContext: contextModule.createContext,
    setOutputGithubPages: setOutputGithubPagesModule.setOutputGithubPages,
    setOutputPullRequest: setOutputPullRequestModule.setOutputPullRequest,
    setOutputVersion: setOutputVersionModule.setOutputVersion,
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

/**
 * Simulates setOutputVersion populating outputs on the mock context.
 */
const simulateSetOutputVersion = (
  setOutputVersion: typeof import('./version/set-output-version').setOutputVersion,
  outputValues: Partial<ActionOutputs>,
): void => {
  vi.mocked(setOutputVersion).mockImplementation(async (context) => {
    for (const [key, value] of Object.entries(outputValues) as Array<
      [string, ActionOutputs[string]]
    >) {
      context.outputs[key] = value
    }

    return await Promise.resolve()
  })
}

describe('run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls all output stages and flushes outputs', async () => {
    const mods = await runModule()

    const outputs = createOutputs()

    vi.mocked(mods.createContext).mockResolvedValue({
      ...baseContext,
      inputs: {
        contextSource: 'event',
        nodeVersion: undefined,
        token: 'ghp_test_token',
        trustedBots: new Set(),
      },
      octokit: createMockOctokit(),
      outputs,
    })

    simulateSetOutputVersion(mods.setOutputVersion, {
      'changelog': '',
      'environment': 'testing',
      'latest': true,
      'prerelease': true,
      'prerelease-identifier': 'trunk',
      'short-commit': 'f2e1fe5',
      'version': '0.11.2-trunk.f2e1fe5',
    })

    await import('./index')

    expect(mods.setOutputVersion).toHaveBeenCalled()
    expect(mods.setOutputVersions).toHaveBeenCalled()
    expect(mods.setOutputGithubPages).toHaveBeenCalled()
    expect(mods.setOutputPullRequest).toHaveBeenCalled()

    expect(mods.core.setOutput).toHaveBeenCalledWith('environment', 'testing')
    expect(mods.core.setOutput).toHaveBeenCalledWith('short-commit', 'f2e1fe5')
    expect(mods.core.setOutput).toHaveBeenCalledWith('version', '0.11.2-trunk.f2e1fe5')
  })

  it('calls core.setFailed when runtime token is missing', async () => {
    const mods = await runModule()

    vi.mocked(mods.createContext).mockRejectedValue(new Error('Empty github token.'))

    await import('./index')

    expect(mods.core.setFailed).toHaveBeenCalled()
  })
})
