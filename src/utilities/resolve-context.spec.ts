import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockConstants } = vi.hoisted(() => ({
  mockConstants: {
    EVENT_NAME: 'push',
    REF_TYPE: 'branch' as 'branch' | 'tag',
  },
}))

const { mockPayload } = vi.hoisted(() => ({
  mockPayload: {
    pull_request: undefined as
      | {
          number: number
          head?: { ref?: string; sha?: string }
        }
      | undefined,
  },
}))

vi.mock('../constants', () => mockConstants)

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'escapace', repo: 'action-context' },
    sha: 'eventsha1234567890',
    get payload() {
      return mockPayload
    },
  },
}))

vi.mock('./get-input', () => ({
  getInput: vi.fn(),
}))

vi.mock('./get-branch', () => ({
  getBranch: vi.fn(),
}))

vi.mock('./pull-request/get-pull-request', () => ({
  getPullRequest: vi.fn(),
}))

import * as core from '@actions/core'
import { getInput } from './get-input'
import { getBranch } from './get-branch'
import { getPullRequest } from './pull-request/get-pull-request'
import { resolveContext } from './resolve-context'
import type { Octokit } from './pull-request/types'

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const mockOctokit = createMockOctokit()

describe('resolveContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConstants.EVENT_NAME = 'push'
    mockConstants.REF_TYPE = 'branch'
    mockPayload.pull_request = undefined
    vi.mocked(getBranch).mockReturnValue('trunk')
  })

  it('resolves event branch context by default', async () => {
    vi.mocked(getInput).mockImplementation((name: string) =>
      name === 'context-source' ? undefined : undefined,
    )

    await expect(resolveContext(mockOctokit)).resolves.toEqual({
      branchForVersion: 'trunk',
      hasPrContext: false,
      prNumber: 0,
      shaForVersion: 'eventsha1234567890',
      source: 'event',
    })
  })

  it('resolves pull_request event from payload in event mode', async () => {
    mockConstants.EVENT_NAME = 'pull_request'
    mockPayload.pull_request = {
      head: { ref: 'feature/ref', sha: 'headsha999' },
      number: 42,
    }

    vi.mocked(getInput).mockReturnValue(undefined)

    await expect(resolveContext(mockOctokit)).resolves.toEqual({
      branchForVersion: 'feature/ref',
      hasPrContext: true,
      prNumber: 42,
      shaForVersion: 'headsha999',
      source: 'event',
    })
  })

  it('resolves explicit PR mode from API', async () => {
    vi.mocked(getInput).mockImplementation((name: string) => {
      if (name === 'context-source') return 'pr'
      if (name === 'pr-number') return '95'
      return undefined
    })

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'deadbeef1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    await expect(resolveContext(mockOctokit)).resolves.toEqual({
      branchForVersion: 'renovate/eslint-9.x',
      hasPrContext: true,
      prNumber: 95,
      shaForVersion: 'deadbeef1234',
      source: 'pr',
    })
  })

  it('warns and falls back to event context on invalid context-source', async () => {
    vi.mocked(getInput).mockImplementation((name: string) =>
      name === 'context-source' ? 'oops' : undefined,
    )

    await expect(resolveContext(mockOctokit)).resolves.toMatchObject({
      branchForVersion: 'trunk',
      hasPrContext: false,
      source: 'event',
    })

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('PR_INPUT_INVALID'))
  })

  it('fails on invalid pr-number in explicit pr mode', async () => {
    vi.mocked(getInput).mockImplementation((name: string) => {
      if (name === 'context-source') return 'pr'
      if (name === 'pr-number') return 'abc'
      return undefined
    })

    await expect(resolveContext(mockOctokit)).rejects.toThrow('PR_INPUT_INVALID')
    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('fails when provided pr-head-ref mismatches fetched PR head', async () => {
    vi.mocked(getInput).mockImplementation((name: string) => {
      if (name === 'context-source') return 'pr'
      if (name === 'pr-number') return '95'
      if (name === 'pr-head-ref') return 'mismatch/ref'
      return undefined
    })

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'deadbeef1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    await expect(resolveContext(mockOctokit)).rejects.toThrow('PR_INPUT_INVALID')
  })

  it('fails when provided pr-head-sha mismatches fetched PR head', async () => {
    vi.mocked(getInput).mockImplementation((name: string) => {
      if (name === 'context-source') return 'pr'
      if (name === 'pr-number') return '95'
      if (name === 'pr-head-sha') return 'mismatch'
      return undefined
    })

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'deadbeef1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    await expect(resolveContext(mockOctokit)).rejects.toThrow('PR_INPUT_INVALID')
  })
})
