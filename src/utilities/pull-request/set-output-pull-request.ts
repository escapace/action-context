import * as core from '@actions/core'
import * as github from '@actions/github'
import { EVENT_NAME } from '../../constants'
import { getInput } from '../get-input'
import { setOutputs } from '../output'
import { getChecksClear } from './get-checks-clear'
import { getCommitsTrusted } from './get-commits-trusted'
import { getPullRequest } from './get-pull-request'
import { fetchReviewData, isReviewClear } from './get-review-clear'
import { parseTrustedBots } from './parse-trusted-bots'
import type { Octokit, PullRequestOutputs } from './types'

const DEFAULT_OUTPUTS: PullRequestOutputs = {
  'pr-author-bot': false,
  'pr-base-ref': '',
  'pr-checks-clear': false,
  'pr-commits-trusted': false,
  'pr-head-ref': '',
  'pr-mergeable': false,
  'pr-not-draft': false,
  'pr-number': 0,
  'pr-review-clear': false,
}

interface PullRequestDegradation {
  code: string
  remediation: string
  summary: string
}

const mapPullRequestError = (error: unknown): PullRequestDegradation => {
  const message = error instanceof Error ? error.message : ''

  if (message.includes('Missing `pull-requests: read` permission')) {
    return {
      code: 'PR_PERMISSION_PULL_REQUESTS_READ',
      remediation:
        'set workflow permissions: pull-requests: read (and checks/statuses read for full PR outputs).',
      summary: 'Missing permission to read pull request data.',
    }
  }

  if (message.includes('Missing `checks: read` permission')) {
    return {
      code: 'PR_PERMISSION_CHECKS_READ',
      remediation: 'set workflow permissions: checks: read.',
      summary: 'Missing permission to read check runs.',
    }
  }

  if (message.includes('Missing `statuses: read` permission')) {
    return {
      code: 'PR_PERMISSION_STATUSES_READ',
      remediation: 'set workflow permissions: statuses: read.',
      summary: 'Missing permission to read commit statuses.',
    }
  }

  if (message.includes('Unable to read collaborator permissions for commit authors')) {
    return {
      code: 'PR_COLLABORATOR_PERMISSION_UNREADABLE',
      remediation:
        'ensure the token can read repository metadata for collaborator permission checks.',
      summary: 'Unable to evaluate collaborator permissions for commit trust.',
    }
  }

  return {
    code: 'PR_DATA_FETCH_FAILED',
    remediation: 'verify token permissions and GitHub API availability, then re-run the workflow.',
    summary: 'Unable to fetch pull request data.',
  }
}

const warnAndDegrade = (error: unknown): void => {
  const issue = mapPullRequestError(error)

  core.warning(
    `[${issue.code}] ${issue.summary} PR outputs were reset to defaults. Remediation: ${issue.remediation}`,
  )

  setOutputs(DEFAULT_OUTPUTS)
}

/**
 * Fetch PR data and set all pr-* outputs.
 *
 * On non-PR events, emits zero/default values. `pr-number === 0`
 * serves as the implicit gate for consumers.
 */
export const setOutputPullRequest = async (octokit: Octokit): Promise<void> => {
  if (EVENT_NAME !== 'pull_request' && EVENT_NAME !== 'pull_request_target') {
    setOutputs(DEFAULT_OUTPUTS)

    return
  }

  const prNumber = github.context.payload.pull_request?.number

  if (prNumber === undefined) {
    core.warning('pull_request event but no PR number in payload; emitting defaults')
    setOutputs(DEFAULT_OUTPUTS)

    return
  }

  try {
    const trustedBots = parseTrustedBots(getInput('trusted-bots'))

    // Fetch basic PR data (with mergeable retry logic)
    const prData = await getPullRequest(octokit, prNumber)

    // Fetch review data, check status, and commit trust in parallel
    const [reviewData, checksClear, commitsTrusted] = await Promise.all([
      fetchReviewData(octokit, prNumber),
      getChecksClear(octokit, prData.headSha),
      getCommitsTrusted(octokit, prNumber, trustedBots),
    ])

    const reviewClear = isReviewClear(reviewData)

    setOutputs({
      'pr-author-bot': prData.authorBot,
      'pr-base-ref': prData.baseRef,
      'pr-checks-clear': checksClear,
      'pr-commits-trusted': commitsTrusted,
      'pr-head-ref': prData.headRef,
      'pr-mergeable': prData.mergeable,
      'pr-not-draft': prData.notDraft,
      'pr-number': prData.number,
      'pr-review-clear': reviewClear,
    })
  } catch (error: unknown) {
    warnAndDegrade(error)
  }
}
