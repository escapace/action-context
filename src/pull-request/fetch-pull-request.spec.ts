import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'escapace', repo: 'action-context' },
  },
}))

import { fetchPullRequest } from './fetch-pull-request'

import type { BaseContext, Octokit } from './types'

const createMockOctokit = (responses: Array<{ data: Record<string, unknown> }>) => {
  const get = vi.fn()

  for (const response of responses) {
    get.mockResolvedValueOnce(response)
  }

  return { rest: { pulls: { get } } } as unknown as Octokit
}

const createContext = (octokit: Octokit): BaseContext => ({
  octokit,
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
})

const basePrData = {
  base: { ref: 'main' },
  draft: false,
  head: { ref: 'renovate/eslint-9.x', sha: 'abc1234' },
  mergeable: true,
  number: 95,
  user: { login: 'renovate[bot]', type: 'Bot' },
}

describe('fetchPullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns PR data for a non-draft bot PR', async () => {
    const octokit = createMockOctokit([{ data: basePrData }])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result).toEqual({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })
  })

  it('returns notDraft: false for draft PRs', async () => {
    const octokit = createMockOctokit([{ data: { ...basePrData, draft: true } }])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result.notDraft).toBe(false)
  })

  it('returns authorBot: false for human PRs', async () => {
    const octokit = createMockOctokit([
      { data: { ...basePrData, user: { login: 'yyxi', type: 'User' } } },
    ])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result.authorBot).toBe(false)
  })

  it('returns authorBot: false when user is null', async () => {
    const octokit = createMockOctokit([{ data: { ...basePrData, user: null } }])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result.authorBot).toBe(false)
  })

  it('retries when mergeable is null and returns true on resolution', async () => {
    const octokit = createMockOctokit([
      { data: { ...basePrData, mergeable: null } },
      { data: { ...basePrData, mergeable: true } },
    ])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result.mergeable).toBe(true)
    expect(vi.mocked(octokit.rest.pulls.get).mock.calls).toHaveLength(2)
  })

  it('defaults mergeable to false when all retries return null', async () => {
    const octokit = createMockOctokit([
      { data: { ...basePrData, mergeable: null } },
      { data: { ...basePrData, mergeable: null } },
      { data: { ...basePrData, mergeable: null } },
    ])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result.mergeable).toBe(false)
    expect(vi.mocked(octokit.rest.pulls.get).mock.calls).toHaveLength(3)
  })

  it('throws descriptive error on 403', async () => {
    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const octokit = {
      rest: { pulls: { get: vi.fn().mockRejectedValue(error) } },
    } as unknown as Octokit

    await expect(fetchPullRequest(createContext(octokit), 95)).rejects.toThrow(
      'Missing `pull-requests: read` permission',
    )
  })

  it('rethrows non-403 errors', async () => {
    const error = new Error('Internal Server Error')
    Reflect.set(error, 'status', 500)

    const octokit = {
      rest: { pulls: { get: vi.fn().mockRejectedValue(error) } },
    } as unknown as Octokit

    await expect(fetchPullRequest(createContext(octokit), 95)).rejects.toThrow(
      'Internal Server Error',
    )
  })

  it('returns mergeable: false when API returns false', async () => {
    const octokit = createMockOctokit([{ data: { ...basePrData, mergeable: false } }])

    const result = await fetchPullRequest(createContext(octokit), 95)

    expect(result.mergeable).toBe(false)
  })
})
