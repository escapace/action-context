import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutputs } from '../context/outputs'
import type { Context } from '../types'
import type { CheckRun, Octokit, StatusContext } from './types'
import {
  isCheckRunPassing,
  isCurrentWorkflowInProgressCheckRun,
  isStatusContextPassing,
} from './resolve-checks-clear'

const repositoryContext = { repositoryName: 'action-context', repositoryOwner: 'escapace' }

const createContext = (octokit: Octokit, workflowRunId: string | undefined): Context => ({
  contextSource: 'event',
  eventName: 'pull_request',
  hasPullRequestContext: true,
  inputs: { contextSource: 'event', token: 'ghp_test_token', trustedBots: new Set() },
  octokit,
  outputs: createOutputs(),
  pullRequestNumber: 95,
  referenceName: 'main',
  referenceType: 'branch',
  repositoryName: repositoryContext.repositoryName,
  repositoryOwner: repositoryContext.repositoryOwner,
  versionBranch: 'main',
  versionCommitSha: 'deadbeef1234',
  versionCommitShaShort: 'deadbee',
  workflowRunId,
})

describe('isCheckRunPassing', () => {
  it.each<{ check: CheckRun; expected: boolean; label: string }>([
    { check: { conclusion: 'success', status: 'completed' }, expected: true, label: 'SUCCESS' },
    { check: { conclusion: 'neutral', status: 'completed' }, expected: true, label: 'NEUTRAL' },
    { check: { conclusion: 'skipped', status: 'completed' }, expected: true, label: 'SKIPPED' },
    { check: { conclusion: 'failure', status: 'completed' }, expected: false, label: 'FAILURE' },
    {
      check: { conclusion: 'cancelled', status: 'completed' },
      expected: false,
      label: 'CANCELLED',
    },
    {
      check: { conclusion: 'timed_out', status: 'completed' },
      expected: false,
      label: 'TIMED_OUT',
    },
    {
      check: { conclusion: 'action_required', status: 'completed' },
      expected: false,
      label: 'ACTION_REQUIRED',
    },
    {
      check: { conclusion: 'startup_failure', status: 'completed' },
      expected: false,
      label: 'STARTUP_FAILURE',
    },
    { check: { conclusion: 'stale', status: 'completed' }, expected: false, label: 'STALE' },
    { check: { conclusion: null, status: 'in_progress' }, expected: false, label: 'IN_PROGRESS' },
    { check: { conclusion: null, status: 'queued' }, expected: false, label: 'QUEUED' },
    { check: { conclusion: null, status: 'requested' }, expected: false, label: 'REQUESTED' },
    { check: { conclusion: null, status: 'waiting' }, expected: false, label: 'WAITING' },
    { check: { conclusion: null, status: 'pending' }, expected: false, label: 'PENDING' },
  ])('$label → $expected', ({ check, expected }) => {
    expect(isCheckRunPassing(check)).toBe(expected)
  })
})

describe('isStatusContextPassing', () => {
  it.each<{ expected: boolean; label: string; status: StatusContext }>([
    { expected: true, label: 'SUCCESS', status: { state: 'success' } },
    { expected: false, label: 'PENDING', status: { state: 'pending' } },
    { expected: false, label: 'FAILURE', status: { state: 'failure' } },
    { expected: false, label: 'ERROR', status: { state: 'error' } },
    { expected: false, label: 'EXPECTED', status: { state: 'expected' } },
  ])('$label → $expected', ({ expected, status }) => {
    expect(isStatusContextPassing(status)).toBe(expected)
  })
})

describe('isCurrentWorkflowInProgressCheckRun', () => {
  it('returns true only for in-progress github-actions checks on the provided run id', () => {
    expect(
      isCurrentWorkflowInProgressCheckRun(
        {
          appSlug: 'github-actions',
          conclusion: null,
          detailsUrl: 'https://github.com/escapace/action-context/actions/runs/21770828514/job/1',
          status: 'in_progress',
        },
        '21770828514',
      ),
    ).toBe(true)

    expect(
      isCurrentWorkflowInProgressCheckRun(
        {
          appSlug: 'github-actions',
          conclusion: null,
          detailsUrl: 'https://github.com/escapace/action-context/actions/runs/111/job/1',
          status: 'in_progress',
        },
        '21770828514',
      ),
    ).toBe(false)
  })
})

const createMockOctokit = (
  checkRuns: ReturnType<typeof vi.fn>,
  combinedStatus: ReturnType<typeof vi.fn>,
): Octokit => {
  const octokit = {
    rest: {
      checks: { listForRef: checkRuns },
      repos: { getCombinedStatusForRef: combinedStatus },
    },
  }

  return octokit as never
}

describe('resolveChecksClear', () => {
  const originalRepositoryEnvironment = process.env.GITHUB_REPOSITORY
  const originalRunIdEnvironment = process.env.GITHUB_RUN_ID

  beforeEach(() => {
    vi.resetModules()
    process.env.GITHUB_REPOSITORY = 'escapace/action-context'
  })

  afterEach(() => {
    if (originalRepositoryEnvironment === undefined) {
      delete process.env.GITHUB_REPOSITORY
    } else {
      process.env.GITHUB_REPOSITORY = originalRepositoryEnvironment
    }

    if (originalRunIdEnvironment === undefined) {
      delete process.env.GITHUB_RUN_ID
    } else {
      process.env.GITHUB_RUN_ID = originalRunIdEnvironment
    }
  })

  it('returns true when no checks exist', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({ data: { check_runs: [], total_count: 0 } }),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(true)
  })

  it('returns true when all checks pass', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            { conclusion: 'success', status: 'completed' },
            { conclusion: 'neutral', status: 'completed' },
            { conclusion: 'skipped', status: 'completed' },
          ],
          total_count: 3,
        },
      }),
      vi.fn().mockResolvedValue({ data: { statuses: [{ state: 'success' }] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(true)
  })

  it('returns false when a check run fails', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            { conclusion: 'success', status: 'completed' },
            { conclusion: 'failure', status: 'completed' },
          ],
          total_count: 2,
        },
      }),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(false)
  })

  it('returns false when a status context is pending', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [{ conclusion: 'success', status: 'completed' }],
          total_count: 1,
        },
      }),
      vi.fn().mockResolvedValue({
        data: { statuses: [{ state: 'success' }, { state: 'pending' }] },
      }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(false)
  })

  it('returns false when a check is still in progress', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            { conclusion: 'success', status: 'completed' },
            { conclusion: null, status: 'in_progress' },
          ],
          total_count: 2,
        },
      }),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(false)
  })

  it('ignores in-progress check runs from the current workflow run', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    process.env.GITHUB_RUN_ID = '21770828514'

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            {
              app: { slug: 'github-actions' },
              conclusion: null,
              details_url:
                'https://github.com/escapace/action-context/actions/runs/21770828514/job/62817814487',
              status: 'in_progress',
            },
            {
              app: { slug: 'github-actions' },
              conclusion: 'success',
              details_url:
                'https://github.com/escapace/action-context/actions/runs/21770205966/job/62815825595',
              status: 'completed',
            },
          ],
          total_count: 2,
        },
      }),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(true)
  })

  it('does not ignore in-progress check runs from other workflow runs', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    process.env.GITHUB_RUN_ID = '21770828514'

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            {
              app: { slug: 'github-actions' },
              conclusion: null,
              details_url:
                'https://github.com/escapace/action-context/actions/runs/21770205966/job/62815825595',
              status: 'in_progress',
            },
          ],
          total_count: 1,
        },
      }),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(false)
  })

  it('does not ignore completed checks from the current workflow run', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    process.env.GITHUB_RUN_ID = '21770828514'

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({
        data: {
          check_runs: [
            {
              app: { slug: 'github-actions' },
              conclusion: 'failure',
              details_url:
                'https://github.com/escapace/action-context/actions/runs/21770828514/job/62817814487',
              status: 'completed',
            },
          ],
          total_count: 1,
        },
      }),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(false)
  })

  it('throws descriptive error on 403 from checks.listForRef', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const octokit = createMockOctokit(
      vi.fn().mockRejectedValue(error),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    await expect(
      resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).rejects.toThrow('Missing `checks: read` permission')
  })

  it('throws descriptive error on 403 from getCombinedStatusForRef', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const error = new Error('Resource not accessible by integration')
    Reflect.set(error, 'status', 403)

    const octokit = createMockOctokit(
      vi.fn().mockResolvedValue({ data: { check_runs: [], total_count: 0 } }),
      vi.fn().mockRejectedValue(error),
    )

    await expect(
      resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).rejects.toThrow('Missing `statuses: read` permission')
  })

  it('rethrows non-403 errors from checks.listForRef', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const error = new Error('Internal Server Error')
    Reflect.set(error, 'status', 500)

    const octokit = createMockOctokit(
      vi.fn().mockRejectedValue(error),
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    await expect(
      resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).rejects.toThrow('Internal Server Error')
  })

  it('paginates check runs', async () => {
    const { resolveChecksClear } = await import('./resolve-checks-clear')

    const page1Runs = Array.from({ length: 100 }, () => ({
      conclusion: 'success',
      status: 'completed',
    }))

    const listForReference = vi
      .fn()
      .mockResolvedValueOnce({
        data: { check_runs: page1Runs, total_count: 101 },
      })
      .mockResolvedValueOnce({
        data: {
          check_runs: [{ conclusion: 'success', status: 'completed' }],
          total_count: 101,
        },
      })

    const octokit = createMockOctokit(
      listForReference,
      vi.fn().mockResolvedValue({ data: { statuses: [] } }),
    )

    expect(
      await resolveChecksClear(createContext(octokit, process.env.GITHUB_RUN_ID), 'abc1234'),
    ).toBe(true)
    expect(listForReference).toHaveBeenCalledTimes(2)
    expect(listForReference.mock.calls[1][0]).toMatchObject({ page: 2 })
  })
})
