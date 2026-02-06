import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  error: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
}))

vi.mock('./is-files', () => ({
  isFile: vi.fn(),
}))

vi.mock('./workspace-engines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace-engines')>()

  return {
    ...actual,
    workspaceEngines: vi.fn(),
  }
})

vi.mock('./workspace-engines-maximum-versions', () => ({
  workspaceEnginesMaximumVersions: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import * as core from '@actions/core'
import { readFile } from 'node:fs/promises'
import { isFile } from './is-files'
import {
  parseNodeVersionConstraint,
  parseVersionsJsonRecords,
  setOutputVersions,
} from './set-output-versions'
import { workspaceEngines } from './workspace-engines'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'
import type { Context } from '../context/create-context'
import type { Octokit } from './pull-request/types'

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const createContext = (nodeVersion: string | undefined): Context => ({
  contextSource: 'event',
  eventName: 'push',
  hasPullRequestContext: false,
  inputs: { contextSource: 'event', nodeVersion, token: 'ghp_test_token', trustedBots: new Set() },
  octokit: createMockOctokit(),
  pullRequestNumber: 0,
  referenceName: 'trunk',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: '',
  versionCommitSha: 'abc1234567890abcdef1234567890abcdef123456',
  versionCommitShaShort: 'abc1234',
  workflowRunId: '123456',
})

describe('setOutputVersions', () => {
  let nodeVersionInput: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    nodeVersionInput = undefined
  })

  it('outputs versions from package.json engines and workspace engines', async () => {
    nodeVersionInput = undefined
    vi.mocked(isFile).mockImplementation(
      async (path) => await Promise.resolve(path === 'package.json'),
    )
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ engines: { node: '>=24.12.0', pnpm: '>=10.28.2' } }),
    )
    vi.mocked(workspaceEngines).mockResolvedValue([])

    const versionMap = new Map([
      ['node-version', '24.12.0'],
      ['pnpm-version', '10.28.2'],
    ])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions(createContext(nodeVersionInput))

    expect(core.setOutput).toHaveBeenCalledWith('node-version', '24.12.0')
    expect(core.setOutput).toHaveBeenCalledWith('pnpm-version', '10.28.2')
  })

  it('includes node-version from input when provided', async () => {
    nodeVersionInput = '22.15.0'
    vi.mocked(isFile).mockResolvedValue(false)

    const versionMap = new Map([['node-version', '22.15.0']])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions(createContext(nodeVersionInput))

    expect(workspaceEnginesMaximumVersions).toHaveBeenCalledWith(
      expect.arrayContaining([{ node: '22.15.0' }]),
    )
  })

  it('accepts node-version constraints and resolves minimum satisfiable version', async () => {
    nodeVersionInput = '>=22.15.0'
    vi.mocked(isFile).mockResolvedValue(false)

    const versionMap = new Map([['node-version', '22.15.0']])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions(createContext(nodeVersionInput))

    expect(workspaceEnginesMaximumVersions).toHaveBeenCalledWith(
      expect.arrayContaining([{ node: '22.15.0' }]),
    )
  })

  it('reads versions.json when it exists', async () => {
    nodeVersionInput = undefined
    vi.mocked(isFile).mockImplementation(
      async (path) => await Promise.resolve(path === 'package.json' || path === 'versions.json'),
    )
    vi.mocked(readFile).mockImplementation(async (path) => {
      if (path === 'package.json')
        return await Promise.resolve(JSON.stringify({ engines: { node: '>=24.0.0' } }))
      if (path === 'versions.json')
        return await Promise.resolve(
          JSON.stringify({ kubectl: { version: '1.28.0' }, terraform: '1.5.0' }),
        )
      return await Promise.resolve('')
    })
    vi.mocked(workspaceEngines).mockResolvedValue([])

    const versionMap = new Map([
      ['kubectl-version', '1.28.0'],
      ['node-version', '24.0.0'],
      ['terraform-version', '1.5.0'],
    ])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions(createContext(nodeVersionInput))

    expect(core.setOutput).toHaveBeenCalledWith('terraform-version', '1.5.0')
    expect(core.setOutput).toHaveBeenCalledWith('kubectl-version', '1.28.0')
  })

  it('includes devEngines from root package.json', async () => {
    nodeVersionInput = undefined
    vi.mocked(isFile).mockImplementation(
      async (path) => await Promise.resolve(path === 'package.json'),
    )
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        devEngines: {
          packageManager: { name: 'pnpm', version: '>=10.0.0' },
          runtime: { name: 'node', version: '>=22.0.0' },
        },
      }),
    )
    vi.mocked(workspaceEngines).mockResolvedValue([])

    const versionMap = new Map([
      ['node-version', '22.0.0'],
      ['pnpm-version', '10.0.0'],
    ])
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions(createContext(nodeVersionInput))

    expect(workspaceEnginesMaximumVersions).toHaveBeenCalledWith(
      expect.arrayContaining([{ node: '>=22.0.0' }, { pnpm: '>=10.0.0' }]),
    )
  })

  it('handles missing package.json gracefully', async () => {
    nodeVersionInput = undefined
    vi.mocked(isFile).mockResolvedValue(false)

    const versionMap = new Map<string, string>()
    vi.mocked(workspaceEnginesMaximumVersions).mockReturnValue(versionMap)

    await setOutputVersions(createContext(nodeVersionInput))

    expect(readFile).not.toHaveBeenCalled()
  })

  it('silently ignores source discovery failures', async () => {
    nodeVersionInput = undefined
    vi.mocked(isFile).mockRejectedValue(new Error('fs failure'))

    await expect(setOutputVersions(createContext(nodeVersionInput))).resolves.toBeUndefined()

    expect(core.error).not.toHaveBeenCalled()
  })

  it('falls back to per-source aggregation when global aggregation fails', async () => {
    nodeVersionInput = '24.12.0'
    vi.mocked(isFile).mockResolvedValue(false)

    vi.mocked(workspaceEnginesMaximumVersions).mockImplementation((values) => {
      if (values.length > 1) {
        throw new Error('inconsistent')
      }

      const [single] = values
      const map = new Map<string, string>()

      if (single?.node === '24.12.0') {
        map.set('node-version', '24.12.0')
      }

      return map
    })

    await setOutputVersions(createContext(nodeVersionInput))

    expect(core.setOutput).toHaveBeenCalledWith('node-version', '24.12.0')
    expect(core.error).not.toHaveBeenCalled()
  })
})

describe('parseNodeVersionConstraint', () => {
  it('returns cleaned concrete versions', () => {
    expect(parseNodeVersionConstraint('  =v22.15.0')).toBe('22.15.0')
  })

  it('returns minimum version for valid ranges', () => {
    expect(parseNodeVersionConstraint('>=22.15.0')).toBe('22.15.0')
  })

  it('returns undefined for invalid values', () => {
    expect(parseNodeVersionConstraint('latest')).toBeUndefined()
  })
})

describe('parseVersionsJsonRecords', () => {
  it('returns records for string and nested version values', () => {
    expect(
      parseVersionsJsonRecords({
        kubectl: { version: '1.28.0' },
        terraform: '1.5.0',
      }),
    ).toEqual([{ kubectl: '1.28.0' }, { terraform: '1.5.0' }])
  })

  it('returns empty list for non-object payloads', () => {
    expect(parseVersionsJsonRecords('bad')).toEqual([])
  })
})
