import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'escapace', repo: 'action-context' },
  },
}))

import { getMergeStateClear } from './get-merge-state-clear'
import type { Octokit } from './types'

const createMockOctokit = (graphql: ReturnType<typeof vi.fn>): Octokit => {
  const octokit = { graphql }

  return octokit as never
}

describe('getMergeStateClear', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    { expected: true, status: 'CLEAN' },
    { expected: true, status: 'HAS_HOOKS' },
    { expected: false, status: 'BLOCKED' },
    { expected: false, status: 'UNSTABLE' },
    { expected: false, status: 'DIRTY' },
    { expected: false, status: 'BEHIND' },
    { expected: false, status: 'UNKNOWN' },
    { expected: false, status: 'DRAFT' },
  ])('returns $expected for mergeStateStatus=$status', async ({ expected, status }) => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        repository: { pullRequest: { mergeStateStatus: status } },
      }),
    )

    await expect(getMergeStateClear(octokit, 102)).resolves.toBe(expected)
  })

  it('returns false when pull request node is missing', async () => {
    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        repository: { pullRequest: null },
      }),
    )

    await expect(getMergeStateClear(octokit, 102)).resolves.toBe(false)
  })

  it('queries by pull request number', async () => {
    const graphql = vi.fn().mockResolvedValue({
      repository: { pullRequest: { mergeStateStatus: 'CLEAN' } },
    })

    const octokit = createMockOctokit(graphql)

    await getMergeStateClear(octokit, 95)

    expect(graphql).toHaveBeenCalledWith(
      expect.stringContaining('mergeStateStatus'),
      expect.objectContaining({ number: 95, owner: 'escapace', repo: 'action-context' }),
    )
  })

  it('throws descriptive error on 403', async () => {
    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const octokit = createMockOctokit(vi.fn().mockRejectedValue(error))

    await expect(getMergeStateClear(octokit, 95)).rejects.toThrow(
      'Missing `pull-requests: read` permission',
    )
  })

  it('throws descriptive error on GraphQL FORBIDDEN', async () => {
    const error = {
      errors: [{ message: 'Resource not accessible by integration', type: 'FORBIDDEN' }],
    }

    const octokit = createMockOctokit(vi.fn().mockRejectedValue(error))

    await expect(getMergeStateClear(octokit, 95)).rejects.toThrow(
      'Missing `pull-requests: read` permission',
    )
  })

  it('rethrows unknown errors', async () => {
    const error = new Error('Boom')
    const octokit = createMockOctokit(vi.fn().mockRejectedValue(error))

    await expect(getMergeStateClear(octokit, 95)).rejects.toThrow('Boom')
  })
})
