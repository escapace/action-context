import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockConstants } = vi.hoisted(() => ({
  mockConstants: {
    EVENT_NAME: 'pull_request' as string,
  },
}))

const { mockPayload } = vi.hoisted(() => {
  const payload: { pull_request: { number: number } | undefined } = {
    pull_request: { number: 95 },
  }

  return { mockPayload: payload }
})

vi.mock('../../constants', () => mockConstants)

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

vi.mock('../get-input', () => ({
  getInput: vi.fn(),
}))

vi.mock('./get-pull-request', () => ({
  getPullRequest: vi.fn(),
}))

vi.mock('./get-review-clear', () => ({
  fetchReviewData: vi.fn(),
  isReviewClear: vi.fn(),
}))

vi.mock('./get-checks-clear', () => ({
  getChecksClear: vi.fn(),
}))

vi.mock('./get-merge-state-clear', () => ({
  getMergeStateClear: vi.fn(),
}))

vi.mock('./get-last-commit-age-minute', () => ({
  getLastCommitAgeMinute: vi.fn(),
}))

vi.mock('./get-commits-trusted', () => ({
  getCommitsTrusted: vi.fn(),
}))

import * as core from '@actions/core'
import { getInput } from '../get-input'
import { getChecksClear } from './get-checks-clear'
import { getCommitsTrusted } from './get-commits-trusted'
import { getMergeStateClear } from './get-merge-state-clear'
import { getLastCommitAgeMinute } from './get-last-commit-age-minute'
import { getPullRequest } from './get-pull-request'
import { PullRequestActionError } from './error'
import { fetchReviewData, isReviewClear } from './get-review-clear'
import { setOutputPullRequest } from './set-output-pull-request'
import type { Octokit } from './types'

const createMockOctokit = (): Octokit => {
  const octokit = {}

  return octokit as never
}

const mockOctokit = createMockOctokit()

describe('setOutputPullRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConstants.EVENT_NAME = 'pull_request'
    mockPayload.pull_request = { number: 95 }
    vi.mocked(getLastCommitAgeMinute).mockResolvedValue(0)
  })

  it('emits default values on push events', async () => {
    mockConstants.EVENT_NAME = 'push'

    await setOutputPullRequest(mockOctokit)

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
    mockConstants.EVENT_NAME = 'create'

    await setOutputPullRequest(mockOctokit)

    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('fetches PR data and sets all outputs on pull_request events', async () => {
    vi.mocked(getInput).mockReturnValue('renovate[bot]\ndependabot[bot]')

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    vi.mocked(fetchReviewData).mockResolvedValue({
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [],
    })

    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(getChecksClear).mockResolvedValue(true)
    vi.mocked(getMergeStateClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)
    vi.mocked(getLastCommitAgeMinute).mockResolvedValue(17)

    await setOutputPullRequest(mockOctokit)

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
    vi.mocked(getInput).mockReturnValue('renovate[bot]\ndependabot[bot]')

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    vi.mocked(fetchReviewData).mockResolvedValue({
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [],
    })

    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(getChecksClear).mockResolvedValue(true)
    vi.mocked(getMergeStateClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)

    await setOutputPullRequest(mockOctokit)

    expect(getCommitsTrusted).toHaveBeenCalledWith(
      mockOctokit,
      95,
      new Set(['dependabot[bot]', 'renovate[bot]']),
    )
  })

  it('fetches checks using head sha and merge state using PR number', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'deadbeef1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    vi.mocked(fetchReviewData).mockResolvedValue({
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [],
    })

    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(getChecksClear).mockResolvedValue(true)
    vi.mocked(getMergeStateClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)

    await setOutputPullRequest(mockOctokit)

    expect(getChecksClear).toHaveBeenCalledWith(mockOctokit, 'deadbeef1234')
    expect(getMergeStateClear).toHaveBeenCalledWith(mockOctokit, 95)
    expect(getLastCommitAgeMinute).toHaveBeenCalledWith(mockOctokit, 95, 'deadbeef1234')
  })

  it('emits defaults with warning when PR number is missing from payload', async () => {
    mockPayload.pull_request = undefined

    await setOutputPullRequest(mockOctokit)

    expect(core.warning).toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('emits default values on non-pull_request events', async () => {
    mockConstants.EVENT_NAME = 'pull_request_review'

    await setOutputPullRequest(mockOctokit)

    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(getPullRequest).not.toHaveBeenCalled()
  })

  it('degrades to defaults with warning on pull-requests permission failure', async () => {
    vi.mocked(getInput).mockReturnValue(undefined)

    vi.mocked(getPullRequest).mockRejectedValue(
      new PullRequestActionError(
        'PR_PERMISSION_PULL_REQUESTS_READ',
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      ),
    )

    await expect(setOutputPullRequest(mockOctokit)).resolves.toBeUndefined()

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
    vi.mocked(getInput).mockReturnValue(undefined)

    vi.mocked(getPullRequest).mockResolvedValue({
      authorBot: true,
      baseRef: 'main',
      headRef: 'renovate/eslint-9.x',
      headSha: 'abc1234',
      mergeable: true,
      notDraft: true,
      number: 95,
    })

    vi.mocked(fetchReviewData).mockResolvedValue({
      latestReviews: [],
      reviewDecision: null,
      reviewRequests: [],
    })

    vi.mocked(isReviewClear).mockReturnValue(true)
    vi.mocked(getChecksClear).mockRejectedValue(new Error('Boom'))
    vi.mocked(getMergeStateClear).mockResolvedValue(true)
    vi.mocked(getCommitsTrusted).mockResolvedValue(true)

    await expect(setOutputPullRequest(mockOctokit)).resolves.toBeUndefined()

    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('PR_DATA_FETCH_FAILED'))
    expect(core.setOutput).toHaveBeenCalledWith('pr-number', 0)
    expect(core.setOutput).toHaveBeenCalledWith('pr-review-clear', false)
    expect(core.setOutput).toHaveBeenCalledWith('pr-last-commit-age-minute', 0)
  })
})
