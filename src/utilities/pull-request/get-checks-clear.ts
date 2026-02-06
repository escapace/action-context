import * as github from '@actions/github'
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

  const checkRuns: CheckRun[] = []

  let page = 1

  try {
    while (true) {
      const response = await octokit.rest.checks.listForRef({
        owner,
        page,
        per_page: 100,
        ref: reference,
        repo,
      })

      for (const run of response.data.check_runs) {
        checkRuns.push({
          conclusion: run.conclusion ?? null,
          status: run.status,
        })
      }

      if (checkRuns.length >= response.data.total_count) {
        break
      }

      page++
    }
  } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `checks: read` permission. Add it to the workflow permissions block.',
      )
    }

    throw error
  }

  return checkRuns
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

  const checkRunsClear = checkRuns.every(isCheckRunPassing)
  const statusContextsClear = statusContexts.every(isStatusContextPassing)

  return checkRunsClear && statusContextsClear
}
