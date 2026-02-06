import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPayload } = vi.hoisted(() => {
  const payload: { pull_request: { number: number } | undefined } = {
    pull_request: { number: 95 },
  }

  return { mockPayload: payload }
})

vi.mock('@actions/core', () => ({
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

vi.mock('./get-pull-request', () => ({
  getPullRequest: vi.fn(),
}))

vi.mock('./fetch-merge-review-data', () => ({
  fetchMergeReviewData: vi.fn(),
  isMergeStateClear: vi.fn(),
  isReviewClear: vi.fn(),
}))

vi.mock('./get-checks-clear', () => ({
  getChecksClear: vi.fn(),
}))

vi.mock('./get-last-commit-age-minute', () => ({
  getLastCommitAgeMinute: vi.fn(),
}))

vi.mock('./get-commits-trusted', () => ({
  getCommitsTrusted: vi.fn(),
}))

import * as core from '@actions/core'
import { fetchMergeReviewData, isMergeStateClear, isReviewClear } from './fetch-merge-review-data'
import { getChecksClear } from './get-checks-clear'
import { getCommitsTrusted } from './get-commits-trusted'
import { getLastCommitAgeMinute } from './get-last-commit-age-minute'
import { getPullRequest } from './get-pull-request'
import { PullRequestActionError } from './error'
import { setOutputPullRequest } from './set-output-pull-request'
import type { Octokit } from './types'
import type { BranchContext, PullRequestContext } from '../../context/create-context'

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
    vi.mocked(getLastCommitAgeMinute).mockResolvedValue(0)
  })

  it('emits default values on push events', async () => {
    const nonPrContext = createNonPrContext({ eventName: 'push' })

    await setOutputPullRequest(nonPrContext)

    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(core.setOutput).toHaveBeenCalledWith('pr-not-draft', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-base-ref', '')
    expect(core.setOutput).toHaveBeenCalledWith('pr-head-ref', '')
    expect(core.setOutput).toHaveBeenCalledWith('pr-author-bot', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-mergeable', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-review-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-checks-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-merge-state-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-commits-trusted', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-last-commit-age-minute', 0)

    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('emits default values on tag events', async () => {
    const nonPrContext = createNonPrContext({ eventName: 'create' })

    await setOutputPullRequest(nonPrContext)

    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('fetches PR data and sets all outputs on pull_request events', async () => {
    context = createPrContext({
      inputs: { ...defaultInputs, trustedBots: new Set(['dependabot[bot]', 'renovate[bot]']) },
    })

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
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
    vi.mocked(getChecksClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)
    vi.mocked(getLastCommitAgeMinute).mockResolvedValue(17)

    await setOutputPullRequest(context)

    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 95)
    expect(core.setOutput).toHaveBeenCalledWith('pr-not-draft', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-base-ref', 'main')
    expect(core.setOutput).toHaveBeenCalledWith('pr-head-ref', 'renovate/eslint-9.x')
    expect(core.setOutput).toHaveBeenCalledWith('pr-author-bot', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-mergeable', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-review-clear', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-checks-clear', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-last-commit-age-minute', 17)
    expect(core.setOutput).toHaveBeenCalledWith('pr-merge-state-clear', true)
    expect(core.setOutput).toHaveBeenCalledWith('pr-commits-trusted', true)
  })

  it('passes trusted-bots input to getCommitsTrusted', async () => {
    context = createPrContext({
      inputs: { ...defaultInputs, trustedBots: new Set(['dependabot[bot]', 'renovate[bot]']) },
    })

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
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
    vi.mocked(getChecksClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)

    await setOutputPullRequest(context)

    expect(getCommitsTrusted).toHaveBeenCalledWith(context)
  })

  it('fetches checks using head sha and merge/review data from combined query', async () => {
    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'deadbeef1234',
      mergeable: true,
      notDraft: true,
      number: 95,
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
    vi.mocked(getChecksClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)

    await setOutputPullRequest(context)

    expect(getChecksClear).toHaveBeenCalledWith(context, 'deadbeef1234')
    expect(fetchMergeReviewData).toHaveBeenCalledWith(context)
    expect(getLastCommitAgeMinute).toHaveBeenCalledWith(context, 'deadbeef1234')
  })

  it('emits default values on non-pull_request events', async () => {
    const nonPrContext = createNonPrContext({ eventName: 'pull_request_review' })

    await setOutputPullRequest(nonPrContext)

    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('degrades to defaults with warning on pull-requests permission failure', async () => {
    vi.mocked(getPullRequest).mockRejectedValue(
      new PullRequestActionError(
        'PR_PERMISSION_PULL_REQUESTS_READ',
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      ),
    )

    await expect(setOutputPullRequest(context)).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('PR_PERMISSION_PULL_REQUESTS_READ'),
    )
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(core.setOutput).toHaveBeenCalledWith('pr-checks-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-merge-state-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-commits-trusted', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-last-commit-age-minute', 0)
  })

  it('degrades to defaults with warning on unknown PR fetch failure', async () => {
    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
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
    vi.mocked(getChecksClear).mockRejectedValue(new Error('Boom'))
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)

    await expect(setOutputPullRequest(context)).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('PR_DATA_FETCH_FAILED'))
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(core.setOutput).toHaveBeenCalledWith('pr-review-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-last-commit-age-minute', 0)
  })
})
