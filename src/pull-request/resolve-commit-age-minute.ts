import { fetchPullRequestCommits } from './fetch-pull-request-commits'
import type { Context } from '../types'

export const resolveCommitAgeMinute = async (
  context: Context,
  headSha: string,
  nowEpochMs: number = Date.now(),
): Promise<number> => {
  const { pullRequestNumber } = context

  if (pullRequestNumber <= 0) {
    throw new Error('PR context was expected but no valid PR number is available.')
  }

  const commits = await fetchPullRequestCommits(context, pullRequestNumber)

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
