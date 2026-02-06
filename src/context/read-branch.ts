import * as core from '@actions/core'
import * as github from '@actions/github'
import { parseBranchFromReference } from './parse-branch-from-reference'

export const readBranch = (eventName: string) => {
  if (eventName === 'pull_request') {
    const headReference = process.env.GITHUB_HEAD_REF

    if (typeof headReference !== 'string' || headReference.length === 0) {
      throw new Error('GITHUB_HEAD_REF is not set for pull_request event.')
    }

    return headReference
  }

  const reference = github.context.ref

  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error('GITHUB_REF is not set.')
  }

  const branch = parseBranchFromReference(reference)

  core.info(`Current branch: ${branch}`)

  return branch
}
