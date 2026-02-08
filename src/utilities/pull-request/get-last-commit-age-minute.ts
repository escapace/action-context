import * as github from '@actions/github'
import { paginateRest } from './paginate-rest'
import type { Octokit } from './types'

interface CommitTimestampRecord {
  authorDate: string | null
  committerDate: string | null
  sha: string
}

export const getLastCommitAgeMinute = async (
  octokit: Octokit,
  prNumber: number,
  headSha: string,
  nowEpochMs: number = Date.now(),
): Promise<number> => {
  const { owner, repo } = github.context.repo

  let commits: CommitTimestampRecord[]

  try {
    commits = await paginateRest(async (page, perPage) => {
      const response = await octokit.rest.pulls.listCommits({
        owner,
        page,
        per_page: perPage,
        pull_number: prNumber,
        repo,
      })

      return response.data.map((item) => ({
        authorDate: item.commit.author?.date ?? null,
        committerDate: item.commit.committer?.date ?? null,
        sha: item.sha,
      }))
    })
  } catch (error: unknown) {
    if (error !== null && typeof error === 'object' && 'status' in error && error.status === 403) {
      throw new Error(
        'Missing `pull-requests: read` permission. Add it to the workflow permissions block.',
      )
    }

    throw error
  }

  const headCommit = commits.find((commit) => commit.sha === headSha)

  if (headCommit === undefined) {
    throw new Error(`Unable to locate PR head commit '${headSha}' in pull request commits list.`)
  }

  const timestamp = headCommit.committerDate ?? headCommit.authorDate

  if (timestamp === null) {
    throw new Error(`Unable to resolve timestamp for PR head commit '${headSha}'.`)
  }

  const commitEpochMs = Date.parse(timestamp)

  if (!Number.isFinite(commitEpochMs)) {
    throw new TypeError(`Invalid timestamp '${timestamp}' for PR head commit '${headSha}'.`)
  }

  const ageMs = nowEpochMs - commitEpochMs

  if (ageMs <= 0) {
    return 0
  }

  return Math.floor(ageMs / 60_000)
}
