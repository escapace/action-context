import * as github from '@actions/github'
import { paginateRest } from './paginate-rest'
import type { CheckRun, Octokit, StatusContext } from './types'

const PASSING_CONCLUSIONS: ReadonlySet<string> = new Set(['neutral', 'skipped', 'success'])

/**
 * Determine whether a single CheckRun is passing.
 *
 * A CheckRun passes when status is "completed" and conclusion is
 * one of: success, neutral, skipped.
 */
export const isCheckRunPassing = (check: CheckRun): boolean => {
  if (check.status !== 'completed') return false

  return check.conclusion !== null && PASSING_CONCLUSIONS.has(check.conclusion)
}

/**
 * Determine whether a single StatusContext is passing.
 *
 * Only "success" is considered passing. "expected" and "pending"
 * are blocking — they indicate checks that haven't reported yet.
 */
export const isStatusContextPassing = (status: StatusContext): boolean => status.state === 'success'

/**
 * Fetch all check runs for a ref, handling pagination.
 *
 * Detects missing `checks: read` permission by catching 403 errors.
 * A 403 would otherwise silently return an empty list, making
 * `pr-checks-clear` incorrectly `true`.
 */
const fetchCheckRuns = async (octokit: Octokit, reference: string): Promise<CheckRun[]> => {
  const { owner, repo } = github.context.repo

  try {
    return await paginateRest(async (page, perPage) => {
      const response = await octokit.rest.checks.listForRef({
        owner,
        page,
        per_page: perPage,
        ref: reference,
        repo,
      })

      return response.data.check_runs.map((run) => ({
        appSlug: run.app?.slug,
        conclusion: run.conclusion ?? null,
        detailsUrl: run.details_url ?? undefined,
        status: run.status,
      }))
    })
  } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `checks: read` permission. Add it to the workflow permissions block.',
      )
    }

    throw error
  }
}

/**
 * Fetch combined commit status (StatusContext entries) for a ref.
 *
 * Detects missing `statuses: read` permission by catching 403 errors.
 */
const fetchStatusContexts = async (
  octokit: Octokit,
  reference: string,
): Promise<StatusContext[]> => {
  const { owner, repo } = github.context.repo

  try {
    const response = await octokit.rest.repos.getCombinedStatusForRef({
      owner,
      ref: reference,
      repo,
    })

    return response.data.statuses.map((status) => ({
      state: status.state,
    }))
  } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `statuses: read` permission. Add it to the workflow permissions block.',
      )
    }

    throw error
  }
}

const isCurrentWorkflowInProgressCheckRun = (checkRun: CheckRun): boolean => {
  const runId = process.env.GITHUB_RUN_ID

  if (typeof runId !== 'string' || runId.length === 0) {
    return false
  }

  if (checkRun.status === 'completed') {
    return false
  }

  if (checkRun.appSlug !== 'github-actions') {
    return false
  }

  return (
    typeof checkRun.detailsUrl === 'string' &&
    checkRun.detailsUrl.includes(`/actions/runs/${runId}/`)
  )
}

/**
 * Derive whether all status checks are passing for a PR's head SHA.
 *
 * Combines CheckRun data (GitHub Actions, CI apps) and StatusContext
 * data (commit status API). Both must be fully passing.
 *
 * Empty results (no checks configured) count as passing.
 */
export const getChecksClear = async (octokit: Octokit, headSha: string): Promise<boolean> => {
  const [checkRuns, statusContexts] = await Promise.all([
    fetchCheckRuns(octokit, headSha),
    fetchStatusContexts(octokit, headSha),
  ])

  const effectiveCheckRuns = checkRuns.filter(
    (checkRun) => !isCurrentWorkflowInProgressCheckRun(checkRun),
  )

  const checkRunsClear = effectiveCheckRuns.every(isCheckRunPassing)
  const statusContextsClear = statusContexts.every(isStatusContextPassing)

  return checkRunsClear && statusContextsClear
}
