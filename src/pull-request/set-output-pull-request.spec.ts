import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPayload } = vi.hoisted(() => {
  const payload: { pull_request: { number: number } | undefined } = {
    pull_request: { number: 95 },
  }

  return { mockPayload: payload }
})

vi.mock('@actions/core', () => ({
  error: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  context: {
    repo: { owner: 'escapace', repo: 'action-context' },
    get payload() {
      return mockPayload
    },
  },
}))

vi.mock('./fetch-pull-request', () => ({
  fetchPullRequest: vi.fn(),
}))

vi.mock('./fetch-merge-review-data', () => ({
  fetchMergeReviewData: vi.fn(),
  isMergeStateClear: vi.fn(),
  isReviewClear: vi.fn(),
}))

vi.mock('./resolve-checks-clear', () => ({
  resolveChecksClear: vi.fn(),
}))

vi.mock('./resolve-commit-age-minute', () => ({
  resolveCommitAgeMinute: vi.fn(),
}))

vi.mock('./resolve-commit-verification', () => ({
  resolveCommitVerification: vi.fn(),
}))

vi.mock('./resolve-conventional-commits', () => ({
  resolveConventionalCommits: vi.fn(),
}))

vi.mock('./fetch-pull-request-commits', () => ({
  fetchPullRequestCommits: vi.fn(),
}))

import * as core from '@actions/core'
import { createOutputs } from '../context/outputs'
import { fetchMergeReviewData, isMergeStateClear, isReviewClear } from './fetch-merge-review-data'
import { fetchPullRequestCommits } from './fetch-pull-request-commits'
import { resolveChecksClear } from './resolve-checks-clear'
import { resolveCommitVerification } from './resolve-commit-verification'
import { resolveConventionalCommits } from './resolve-conventional-commits'
import { resolveCommitAgeMinute } from './resolve-commit-age-minute'
import { fetchPullRequest } from './fetch-pull-request'
import { PullRequestActionError } from './error'
import { setOutputPullRequest } from './set-output-pull-request'
import type { Octokit } from './types'
import type { BranchContext, PullRequestContext } from '../types'

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const mockOctokit = createMockOctokit()

const defaultInputs = {
  contextSource: 'event' as const,
  token: 'ghp_test_token',
  trustedBots: new Set<string>(),
}

const createPrContext = (overrides: Partial<PullRequestContext> = {}): PullRequestContext => ({
  contextSource: 'event',
  eventName: 'pull_request',
  hasPullRequestContext: true,
  inputs: { ...defaultInputs },
  octokit: mockOctokit,
  outputs: createOutputs(),
  pullRequestNumber: 95,
  referenceName: 'renovate/eslint-9.x',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: 'renovate/eslint-9.x',
  versionCommitSha: 'deadbeef1234',
  versionCommitShaShort: 'deadbee',
  workflowRunId: '123456',
  ...overrides,
})

const createNonPrContext = (overrides: Partial<BranchContext> = {}): BranchContext => ({
  contextSource: 'event',
  eventName: 'push',
  hasPullRequestContext: false,
  inputs: { ...defaultInputs },
  octokit: mockOctokit,
  outputs: createOutputs(),
  pullRequestNumber: 0,
  referenceName: 'trunk',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: 'trunk',
  versionCommitSha: 'deadbeef1234',
  versionCommitShaShort: 'deadbee',
  workflowRunId: '123456',
  ...overrides,
})

let context: PullRequestContext

describe('setOutputPullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GITHUB_EVENT_NAME = 'pull_request'
    mockPayload.pull_request = { number: 95 }
    context = createPrContext()
    vi.mocked(resolveCommitAgeMinute).mockResolvedValue(0)
    vi.mocked(fetchPullRequestCommits).mockResolvedValue([])
    vi.mocked(resolveConventionalCommits).mockResolvedValue('none')
  })

  it('emits default values on push events', async () => {
    const nonPrContext = createNonPrContext({ eventName: 'push' })

    await setOutputPullRequest(nonPrContext)

    expect(nonPrContext.outputs['pr-number']).toBe(0)
    expect(nonPrContext.outputs['pr-not-draft']).toBe(false)
    expect(nonPrContext.outputs['pr-base-ref']).toBe('')
    expect(nonPrContext.outputs['pr-head-ref']).toBe('')
    expect(nonPrContext.outputs['pr-author-bot']).toBe(false)
    expect(nonPrContext.outputs['pr-mergeable']).toBe(false)
    expect(nonPrContext.outputs['pr-review-clear']).toBe(false)
    expect(nonPrContext.outputs['pr-checks-clear']).toBe(false)
    expect(nonPrContext.outputs['pr-merge-state-clear']).toBe(false)
    expect(nonPrContext.outputs['pr-commits-trusted']).toBe(false)
    expect(nonPrContext.outputs['pr-conventional-commits']).toBe('none')
    expect(nonPrContext.outputs['pr-last-commit-age-minute']).toBe(0)

    expect(fetchPullRequest).not.toHaveBeenCalled()
  })

  it('emits default values on tag events', async () => {
    const nonPrContext = createNonPrContext({ eventName: 'create' })

    await setOutputPullRequest(nonPrContext)

    expect(nonPrContext.outputs['pr-number']).toBe(0)
    expect(fetchPullRequest).not.toHaveBeenCalled()
  })

  it('fetches PR data and sets all outputs on pull_request events', async () => {
    context = createPrContext({
      inputs: { ...defaultInputs, trustedBots: new Set(['dependabot[bot]', 'renovate[bot]']) },
    })

    vi.mocked(fetchPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
      title: 'feat: test change',
    })

    vi.mocked(fetchMergeReviewData).mockResolvedValue({
      mergeStateStatus: 'CLEAN',
      reviewData: {
        latestReviews: [],
        reviewDecision: null,
        reviewRequests: [],
      },
    })

    vi.mocked(isMergeStateClear).mockReturnValue(true)
    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(resolveChecksClear).mockResolvedValue(true)
    vi.mocked(resolveCommitVerification).mockResolvedValue(true)
    vi.mocked(resolveCommitAgeMinute).mockResolvedValue(17)

    await setOutputPullRequest(context)

    expect(context.outputs['pr-number']).toBe(95)
    expect(context.outputs['pr-not-draft']).toBe(true)
    expect(context.outputs['pr-base-ref']).toBe('main')
    expect(context.outputs['pr-head-ref']).toBe('renovate/eslint-9.x')
    expect(context.outputs['pr-author-bot']).toBe(true)
    expect(context.outputs['pr-mergeable']).toBe(true)
    expect(context.outputs['pr-review-clear']).toBe(true)
    expect(context.outputs['pr-checks-clear']).toBe(true)
    expect(context.outputs['pr-last-commit-age-minute']).toBe(17)
    expect(context.outputs['pr-merge-state-clear']).toBe(true)
    expect(context.outputs['pr-commits-trusted']).toBe(true)
  })

  it('passes trusted-bots input to getCommitsTrusted', async () => {
    context = createPrContext({
      inputs: { ...defaultInputs, trustedBots: new Set(['dependabot[bot]', 'renovate[bot]']) },
    })

    vi.mocked(fetchPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
      title: 'feat: test change',
    })

    vi.mocked(fetchMergeReviewData).mockResolvedValue({
      mergeStateStatus: 'CLEAN',
      reviewData: {
        latestReviews: [],
        reviewDecision: null,
        reviewRequests: [],
      },
    })

    vi.mocked(isMergeStateClear).mockReturnValue(true)
    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(resolveChecksClear).mockResolvedValue(true)
    vi.mocked(resolveCommitVerification).mockResolvedValue(true)

    await setOutputPullRequest(context)

    expect(resolveCommitVerification).toHaveBeenCalledWith(context, [])
  })

  it('fetches checks using head sha and merge/review data from combined query', async () => {
    vi.mocked(fetchPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'deadbeef1234',
      mergeable: true,
      notDraft: true,
      number: 95,
      title: 'feat: test change',
    })

    vi.mocked(fetchMergeReviewData).mockResolvedValue({
      mergeStateStatus: 'CLEAN',
      reviewData: {
        latestReviews: [],
        reviewDecision: null,
        reviewRequests: [],
      },
    })

    vi.mocked(isMergeStateClear).mockReturnValue(true)
    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(resolveChecksClear).mockResolvedValue(true)
    vi.mocked(resolveCommitVerification).mockResolvedValue(true)

    await setOutputPullRequest(context)

    expect(resolveChecksClear).toHaveBeenCalledWith(context, 'deadbeef1234')
    expect(fetchMergeReviewData).toHaveBeenCalledWith(context)
    expect(resolveCommitAgeMinute).toHaveBeenCalledWith(context, 'deadbeef1234')
  })

  it('emits default values on non-pull_request events', async () => {
    const nonPrContext = createNonPrContext({ eventName: 'pull_request_review' })

    await setOutputPullRequest(nonPrContext)

    expect(nonPrContext.outputs['pr-number']).toBe(0)
    expect(fetchPullRequest).not.toHaveBeenCalled()
  })

  it('degrades to defaults with warning on pull-requests permission failure', async () => {
    vi.mocked(fetchPullRequest).mockRejectedValue(
      new PullRequestActionError(
        'PR_PERMISSION_PULL_REQUESTS_READ',
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      ),
    )

    await expect(setOutputPullRequest(context)).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('PR_PERMISSION_PULL_REQUESTS_READ'),
    )
    expect(context.outputs['pr-number']).toBe(0)
    expect(context.outputs['pr-checks-clear']).toBe(false)
    expect(context.outputs['pr-merge-state-clear']).toBe(false)
    expect(context.outputs['pr-commits-trusted']).toBe(false)
    expect(context.outputs['pr-last-commit-age-minute']).toBe(0)
  })

  it('degrades to defaults with warning on unknown PR fetch failure', async () => {
    vi.mocked(fetchPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
      title: 'feat: test change',
    })

    vi.mocked(fetchMergeReviewData).mockResolvedValue({
      mergeStateStatus: 'CLEAN',
      reviewData: {
        latestReviews: [],
        reviewDecision: null,
        reviewRequests: [],
      },
    })

    vi.mocked(isMergeStateClear).mockReturnValue(true)
    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(resolveChecksClear).mockRejectedValue(new Error('Boom'))
    vi.mocked(resolveCommitVerification).mockResolvedValue(true)

    await expect(setOutputPullRequest(context)).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('PR_DATA_FETCH_FAILED'))
    expect(context.outputs['pr-number']).toBe(0)
    expect(context.outputs['pr-review-clear']).toBe(false)
    expect(context.outputs['pr-last-commit-age-minute']).toBe(0)
  })
})
