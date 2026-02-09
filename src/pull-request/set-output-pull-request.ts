import * as core from '@actions/core'
import type { ActionOutputs, Context } from '../types'
import { fetchMergeReviewData, isMergeStateClear, isReviewClear } from './fetch-merge-review-data'
import { getChecksClear } from './get-checks-clear'
import { getCommitsTrusted } from './get-commits-trusted'
import { getPullRequestErrorCode, type PullRequestErrorCode } from './error'
import { getLastCommitAgeMinute } from './get-last-commit-age-minute'
import { getPullRequest } from './get-pull-request'
import type { PullRequestOutputs } from './types'

const DEFAULT_OUTPUTS: PullRequestOutputs = {
  'pr-author-bot': false,
  'pr-base-ref': '',
  'pr-checks-clear': false,
  'pr-commits-trusted': false,
  'pr-head-ref': '',
  'pr-last-commit-age-minute': 0,
  'pr-merge-state-clear': false,
  'pr-mergeable': false,
  'pr-not-draft': false,
  'pr-number': 0,
  'pr-review-clear': false,
}

type PullRequestDegradationCode = 'PR_DATA_FETCH_FAILED' | PullRequestErrorCode

interface PullRequestDegradation {
  code: PullRequestDegradationCode
  remediation: string
  summary: string
}

const PULL_REQUEST_DEGRADATIONS: Record<PullRequestDegradationCode, PullRequestDegradation> = {
  PR_COLLABORATOR_PERMISSION_UNREADABLE: {
    code: 'PR_COLLABORATOR_PERMISSION_UNREADABLE',
    remediation:
      'ensure the token can read repository metadata for collaborator permission checks.',
    summary: 'Unable to evaluate collaborator permissions for commit trust.',
  },
  PR_DATA_FETCH_FAILED: {
    code: 'PR_DATA_FETCH_FAILED',
    remediation: 'verify token permissions and GitHub API availability, then re-run the workflow.',
    summary: 'Unable to fetch pull request data.',
  },
  PR_PERMISSION_CHECKS_READ: {
    code: 'PR_PERMISSION_CHECKS_READ',
    remediation: 'set workflow permissions: checks: read.',
    summary: 'Missing permission to read check runs.',
  },
  PR_PERMISSION_PULL_REQUESTS_READ: {
    code: 'PR_PERMISSION_PULL_REQUESTS_READ',
    remediation:
      'set workflow permissions: pull-requests: read (and checks/statuses read for full PR outputs).',
    summary: 'Missing permission to read pull request data.',
  },
  PR_PERMISSION_STATUSES_READ: {
    code: 'PR_PERMISSION_STATUSES_READ',
    remediation: 'set workflow permissions: statuses: read.',
    summary: 'Missing permission to read commit statuses.',
  },
}

const mapPullRequestError = (error: unknown): PullRequestDegradation => {
  const code = getPullRequestErrorCode(error) ?? 'PR_DATA_FETCH_FAILED'

  return PULL_REQUEST_DEGRADATIONS[code]
}

/**
 * Assigns default `pr-*` outputs for non-PR or degraded PR contexts.
 */
const assignDefaultPullRequestOutputs = (outputs: ActionOutputs): void => {
  for (const [key, value] of Object.entries(DEFAULT_OUTPUTS) as Array<
    [string, ActionOutputs[string]]
  >) {
    outputs[key] = value
  }
}

const warnAndDegrade = (outputs: ActionOutputs, error: unknown): void => {
  const issue = mapPullRequestError(error)

  core.warning(
    `[${issue.code}] ${issue.summary} PR outputs were reset to defaults. Remediation: ${issue.remediation}`,
  )

  assignDefaultPullRequestOutputs(outputs)
}

interface BuildPullRequestOutputsInput {
  checksClear: boolean
  commitsTrusted: boolean
  lastCommitAgeMinute: number
  mergeStateClear: boolean
  prData: {
    authorBot: boolean
    baseRef: string
    headRef: string
    mergeable: boolean
    notDraft: boolean
    number: number
  }
  reviewClear: boolean
}

/**
 * Builds action outputs from resolved pull request facts.
 */
const buildPullRequestOutputs = (input: BuildPullRequestOutputsInput): PullRequestOutputs => ({
  'pr-author-bot': input.prData.authorBot,
  'pr-base-ref': input.prData.baseRef,
  'pr-checks-clear': input.checksClear,
  'pr-commits-trusted': input.commitsTrusted,
  'pr-head-ref': input.prData.headRef,
  'pr-last-commit-age-minute': input.lastCommitAgeMinute,
  'pr-merge-state-clear': input.mergeStateClear,
  'pr-mergeable': input.prData.mergeable,
  'pr-not-draft': input.prData.notDraft,
  'pr-number': input.prData.number,
  'pr-review-clear': input.reviewClear,
})

/**
 * Fetch PR data and set all pr-* outputs.
 *
 * On non-PR events, assigns zero/default values. `pr-number === 0`
 * serves as the implicit gate for consumers.
 */
export const setOutputPullRequest = async (context: Context): Promise<void> => {
  const { outputs } = context

  if (!context.hasPullRequestContext) {
    assignDefaultPullRequestOutputs(outputs)

    return
  }

  try {
    // Fetch basic PR data (with mergeable retry logic)
    const prData = await getPullRequest(context, context.pullRequestNumber)

    // Fetch review data, check status, merge state, and commit trust in parallel
    const [mergeReviewData, checksClear, commitsTrusted, lastCommitAgeMinute] = await Promise.all([
      fetchMergeReviewData(context),
      getChecksClear(context, prData.headSha),
      getCommitsTrusted(context),
      getLastCommitAgeMinute(context, prData.headSha),
    ])

    const mergeStateClear = isMergeStateClear(mergeReviewData.mergeStateStatus)
    const reviewClear = isReviewClear(mergeReviewData.reviewData)

    const prOutputs = buildPullRequestOutputs({
      checksClear,
      commitsTrusted,
      lastCommitAgeMinute,
      mergeStateClear,
      prData,
      reviewClear,
    })

    for (const [key, value] of Object.entries(prOutputs) as Array<
      [string, ActionOutputs[string]]
    >) {
      outputs[key] = value
    }
  } catch (error: unknown) {
    warnAndDegrade(outputs, error)
  }
}
