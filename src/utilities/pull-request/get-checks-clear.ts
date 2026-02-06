import { rethrowMissingPermissionOnHttpStatus } from './error'
import { paginateRest } from './paginate-rest'
import type { Context } from '../../context/create-context'
import type { BaseContext, CheckRun, StatusContext } from './types'

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
const fetchCheckRuns = async (context: BaseContext, reference: string): Promise<CheckRun[]> => {
  const { octokit, repositoryName, repositoryOwner } = context

  try {
    return await paginateRest(async (page, perPage) => {
      const response = await octokit.rest.checks.listForRef({
        owner: repositoryOwner,
        page,
        per_page: perPage,
        ref: reference,
        repo: repositoryName,
      })

      return response.data.check_runs.map((run) => ({
        appSlug: run.app?.slug,
        conclusion: run.conclusion ?? null,
        detailsUrl: run.details_url ?? undefined,
        status: run.status,
      }))
    })
  } catch (error: unknown) {
    rethrowMissingPermissionOnHttpStatus(error, 'checks')

    throw error
  }
}

/**
 * Fetch combined commit status (StatusContext entries) for a ref.
 *
 * Detects missing `statuses: read` permission by catching 403 errors.
 */
const fetchStatusContexts = async (
  context: BaseContext,
  reference: string,
): Promise<StatusContext[]> => {
  const { octokit, repositoryName, repositoryOwner } = context

  try {
    const response = await octokit.rest.repos.getCombinedStatusForRef({
      owner: repositoryOwner,
      ref: reference,
      repo: repositoryName,
    })

    return response.data.statuses.map((status) => ({
      state: status.state,
    }))
  } catch (error: unknown) {
    rethrowMissingPermissionOnHttpStatus(error, 'statuses')

    throw error
  }
}

/**
 * Returns true when a check run belongs to the current workflow run and is still in progress.
 */
export const isCurrentWorkflowInProgressCheckRun = (
  checkRun: CheckRun,
  runId: string | undefined,
): boolean => {
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
export const getChecksClear = async (context: Context, headSha: string): Promise<boolean> => {
  const { workflowRunId } = context

  const [checkRuns, statusContexts] = await Promise.all([
    fetchCheckRuns(context, headSha),
    fetchStatusContexts(context, headSha),
  ])
  const effectiveCheckRuns = checkRuns.filter(
    (checkRun) => !isCurrentWorkflowInProgressCheckRun(checkRun, workflowRunId),
  )

  const checkRunsClear = effectiveCheckRuns.every(isCheckRunPassing)
  const statusContextsClear = statusContexts.every(isStatusContextPassing)

  return checkRunsClear && statusContextsClear
}
