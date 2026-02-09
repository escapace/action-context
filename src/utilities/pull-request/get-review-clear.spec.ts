import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutputs } from '../../context/outputs'
import type { PullRequestContext } from '../../context/create-context'
import type { ReviewData } from './types'
import { isReviewClear } from './get-review-clear'

const createContext = (overrides: Partial<PullRequestContext> = {}): PullRequestContext => ({
  contextSource: 'event',
  eventName: 'pull_request',
  hasPullRequestContext: true,
  inputs: { contextSource: 'event', token: 'ghp_test_token', trustedBots: new Set() },
  octokit: createMockOctokit(vi.fn()),
  outputs: createOutputs(),
  pullRequestNumber: 95,
  referenceName: 'main',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: 'main',
  versionCommitSha: 'deadbeef1234',
  versionCommitShaShort: 'deadbee',
  workflowRunId: '123',
  ...overrides,
})

const createMockOctokit = (graphql: ReturnType<typeof vi.fn>) => {
  const octokit = { graphql }

  return octokit as never
}

describe('isReviewClear', () => {
  // Scenario matrix from design doc Q3

  it('S1: no protection, no activity → true', () => {
    const data: ReviewData = {
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(true)
  })

  it('S2: no protection, review requested → false', () => {
    const data: ReviewData = {
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [{ requestedReviewer: { login: 'yyxi' } }],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S3: no protection, approved voluntarily → true', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(true)
  })

  it('S4: no protection, changes requested → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'CHANGES_REQUESTED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S5: no protection, changes requested then approved (same user) → true', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(true)
  })

  it('S6: no protection, user A approved, user B requested changes → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }, { state: 'CHANGES_REQUESTED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S7: no protection, only COMMENTED reviews → true', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'COMMENTED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(true)
  })

  it('S8: no protection, DISMISSED review → true', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'DISMISSED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(true)
  })

  it('S9: protected, approved, no pending requests → true', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }],
      reviewDecision: 'APPROVED',
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(true)
  })

  it('S10: protected, approved, new review requested → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }],
      reviewDecision: 'APPROVED',
      reviewRequests: [{ requestedReviewer: { login: 'someone' } }],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S11: protected, review required, none submitted → false', () => {
    const data: ReviewData = {
      latestReviews: [],
      reviewDecision: 'REVIEW_REQUIRED',
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S12: protected, changes requested → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'CHANGES_REQUESTED' }],
      reviewDecision: 'CHANGES_REQUESTED',
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S13: protected, stale approval dismissed after push → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'DISMISSED' }],
      reviewDecision: 'REVIEW_REQUIRED',
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S14: protected, re-requested review (approval not dismissed) → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }],
      reviewDecision: 'APPROVED',
      reviewRequests: [{ requestedReviewer: { login: 'same-user' } }],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S15: protected, re-requested review (approval dismissed) → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'DISMISSED' }],
      reviewDecision: 'REVIEW_REQUIRED',
      reviewRequests: [{ requestedReviewer: { login: 'same-user' } }],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S16: protected, requires 2 approvals, only 1 received → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'APPROVED' }],
      reviewDecision: 'REVIEW_REQUIRED',
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S17: CODEOWNERS review required, not done → false', () => {
    const data: ReviewData = {
      latestReviews: [],
      reviewDecision: 'REVIEW_REQUIRED',
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })

  it('S18: bot submits CHANGES_REQUESTED, no protection → false', () => {
    const data: ReviewData = {
      latestReviews: [{ state: 'CHANGES_REQUESTED' }],
      reviewDecision: null,
      reviewRequests: [],
    }

    expect(isReviewClear(data)).toBe(false)
  })
})

describe('fetchReviewData', () => {
  const originalEnvironment = process.env.GITHUB_REPOSITORY

  beforeEach(() => {
    vi.resetModules()
    process.env.GITHUB_REPOSITORY = 'escapace/action-context'
  })

  afterEach(() => {
    if (originalEnvironment === undefined) {
      delete process.env.GITHUB_REPOSITORY
    } else {
      process.env.GITHUB_REPOSITORY = originalEnvironment
    }
  })

  it('throws descriptive error on 403', async () => {
    const { fetchReviewData } = await import('./get-review-clear')

    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const graphql = vi.fn().mockRejectedValue(error)

    await expect(
      fetchReviewData(createContext({ octokit: createMockOctokit(graphql) })),
    ).rejects.toThrow('Missing `pull-requests: read` permission')
  })

  it('throws descriptive error on GraphqlResponseError FORBIDDEN', async () => {
    const { fetchReviewData } = await import('./get-review-clear')

    const error = {
      errors: [{ message: 'Resource not accessible by integration', type: 'FORBIDDEN' }],
      name: 'GraphqlResponseError',
    }

    const graphql = vi.fn().mockRejectedValue(error)

    await expect(
      fetchReviewData(createContext({ octokit: createMockOctokit(graphql) })),
    ).rejects.toThrow('Missing `pull-requests: read` permission')
  })

  it('rethrows non-403/non-forbidden errors', async () => {
    const { fetchReviewData } = await import('./get-review-clear')

    const error = new Error('Something went wrong')
    Reflect.set(error, 'status', 500)

    const graphql = vi.fn().mockRejectedValue(error)

    await expect(
      fetchReviewData(createContext({ octokit: createMockOctokit(graphql) })),
    ).rejects.toThrow('Something went wrong')
  })

  it('calls GraphQL with correct variables', async () => {
    const { fetchReviewData } = await import('./get-review-clear')

    const graphql = vi.fn().mockResolvedValue({
      repository: {
        pullRequest: {
          latestReviews: { nodes: [] },
          reviewDecision: null,
          reviewRequests: { nodes: [] },
        },
      },
    })

    const result = await fetchReviewData(createContext({ octokit: createMockOctokit(graphql) }))

    expect(graphql).toHaveBeenCalledWith(expect.any(String), {
      number: 95,
      owner: 'escapace',
      repo: 'action-context',
    })

    expect(result).toEqual({
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [],
    })
  })
})
