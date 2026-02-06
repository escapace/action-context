import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@actions/core', () => ({
  error: vi.fn(),
  info: vi.fn(),
  setOutput: vi.fn(),
}))

vi.mock('./workspace-projects', () => ({
  workspaceProjects: vi.fn(),
}))

import * as core from '@actions/core'
import { workspaceProjects } from './workspace-projects'
import { setOutputGithubPages } from './set-output-github-pages'
import type { Context } from '../context/create-context'
import type { Octokit } from './pull-request/types'

const createMockOctokit = (getPagesResult: unknown): Octokit => {
  const octokit = {
    rest: {
      repos: {
        getPages: vi.fn().mockResolvedValue(getPagesResult),
      },
    },
  }

  return octokit as never
}

const createRejectingOctokit = (error: Error): Octokit => {
  const octokit = {
    rest: {
      repos: {
        getPages: vi.fn().mockRejectedValue(error),
      },
    },
  }

  return octokit as never
}

const createContext = (octokit: Octokit): Context => ({
  contextSource: 'event',
  eventName: 'push',
  hasPullRequestContext: false,
  inputs: { contextSource: 'event', token: 'ghp_test_token', trustedBots: new Set() },
  octokit,
  pullRequestNumber: 0,
  referenceName: 'trunk',
  referenceType: 'branch',
  repositoryName: 'action-context',
  repositoryOwner: 'escapace',
  versionBranch: '',
  versionCommitSha: 'abc1234567890abcdef1234567890abcdef123456',
  versionCommitShaShort: 'abc1234',
  workflowRunId: '123456',
})

describe('setOutputGithubPages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('outputs github-pages path when pages enabled and one project has build:github-pages', async () => {
    const octokit = createMockOctokit({ data: { build_type: 'workflow' } })

    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: { name: 'docs', scripts: { 'build:github-pages': 'vite build' } },
        rootDir: 'packages/docs',
      },
    ] as never)

    await setOutputGithubPages(createContext(octokit))

    expect(core.setOutput).toHaveBeenCalledWith('github-pages', true)
    expect(core.setOutput).toHaveBeenCalledWith(
      'github-pages-path',
      expect.stringContaining('lib/github-pages'),
    )
  })

  it('outputs only github-pages flag when no projects have build:github-pages script', async () => {
    const octokit = createMockOctokit({ data: { build_type: 'workflow' } })

    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: { name: 'app', scripts: { build: 'tsc' } },
        rootDir: 'packages/app',
      },
    ] as never)

    await setOutputGithubPages(createContext(octokit))

    expect(core.setOutput).toHaveBeenCalledWith('github-pages', true)
    expect(core.setOutput).not.toHaveBeenCalledWith('github-pages-path', expect.anything())
  })

  it('outputs only github-pages flag when multiple projects have the script', async () => {
    const octokit = createMockOctokit({ data: { build_type: 'workflow' } })

    vi.mocked(workspaceProjects).mockResolvedValue([
      {
        manifest: { name: 'docs', scripts: { 'build:github-pages': 'vite build' } },
        rootDir: 'packages/docs',
      },
      {
        manifest: { name: 'site', scripts: { 'build:github-pages': 'next build' } },
        rootDir: 'packages/site',
      },
    ] as never)

    await setOutputGithubPages(createContext(octokit))

    expect(core.setOutput).toHaveBeenCalledWith('github-pages', true)
    expect(core.setOutput).not.toHaveBeenCalledWith('github-pages-path', expect.anything())
  })

  it('outputs false when pages API returns 404', async () => {
    const error = new Error('Not Found')
    Reflect.set(error, 'status', 404)
    const octokit = createRejectingOctokit(error)

    await setOutputGithubPages(createContext(octokit))

    expect(core.setOutput).toHaveBeenCalledWith('github-pages', false)
  })

  it('outputs false when pages build_type is not workflow', async () => {
    const octokit = createMockOctokit({ data: { build_type: 'legacy' } })

    await setOutputGithubPages(createContext(octokit))

    expect(core.setOutput).toHaveBeenCalledWith('github-pages', false)
  })

  it('catches non-404 errors and outputs github-pages false', async () => {
    const error = new Error('Internal Server Error')
    Reflect.set(error, 'status', 500)
    const octokit = createRejectingOctokit(error)

    await setOutputGithubPages(createContext(octokit))

    expect(core.setOutput).toHaveBeenCalledWith('github-pages', false)
    expect(core.error).toHaveBeenCalled()
  })
})
