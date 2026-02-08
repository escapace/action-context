import * as core from '@actions/core'
import * as github from '@actions/github'
import { getGitDiff } from 'changelogen'
import { isString } from 'es-toolkit'
import assert from 'node:assert'
import semver from 'semver'
import {
  CONVENTIONAL_COMMIT_REGEX,
  DEFAULT_INCREMENT,
  EVENT_NAME,
  REF_NAME,
  REF_TYPE,
  SEMVER_OPTIONS,
  SHORT_COMMIT,
} from '../constants'
import { assertRepoNotShallow } from './assert-repo-not-shallow'
import { createShortCommit } from './create-short-commit'
import { exec } from './exec'
import { getBranch } from './get-branch'
import { getSemver } from './get-semver'
import { getTag } from './get-tag'
import type { ResolvedContext } from './resolve-context'

type VersionIncrement = 'major' | 'minor' | 'patch'

interface VersionCore {
  major: number
  minor: number
  patch: number
}

interface BranchVersionContext {
  branch: string
  expectedSha: string
  shortCommit: string
  shouldAssertBranchHead: boolean
}

/**
 * Validates that the checked-out branch points to the expected commit.
 */
const assertBranchLatestCommit = async (
  branch: string,
  expectedSha: string,
  shouldAssertBranchHead: boolean,
): Promise<void> => {
  if (REF_TYPE === 'branch' && shouldAssertBranchHead) {
    assert.equal(await exec('git', ['rev-parse', '--verify', branch]), expectedSha)
  }
}

/**
 * Normalizes branch labels to a semver-safe prerelease identifier.
 */
const preReleaseCase = (value: string): string => value.replace(/[^\dA-Z-]/gi, '-')

/**
 * Classifies a conventional commit message into its semantic increment.
 */
const classifyCommitMessage = (message: string): VersionIncrement | undefined => {
  const match = CONVENTIONAL_COMMIT_REGEX.exec(message)

  if (match === null) {
    return undefined
  }

  const groups = match.groups ?? {}
  const type = groups.type
  const isBreaking = Boolean(groups.breaking) || message.includes('BREAKING CHANGE:')

  if (isBreaking) {
    return 'major'
  }

  if (type === 'feat') {
    return 'minor'
  }

  if (type === 'fix') {
    return 'patch'
  }

  return undefined
}

/**
 * Resolves the highest semantic increment from commits since the last tag.
 */
const resolveIncrementFromDiff = async (lastGitTag: string): Promise<VersionIncrement> => {
  const commits = (await getGitDiff(lastGitTag, 'HEAD'))
    .map((value) => classifyCommitMessage(value.message))
    .filter((value): value is VersionIncrement => isString(value))
    .reduce(
      (previous, next): Record<VersionIncrement, boolean> => {
        previous[next] = true

        return previous
      },
      { major: false, minor: false, patch: false },
    )

  if (commits.major) {
    return 'major'
  }

  if (commits.minor) {
    return 'minor'
  }

  if (commits.patch) {
    return 'patch'
  }

  return DEFAULT_INCREMENT
}

/**
 * Applies an increment to a semantic version core.
 */
const applyIncrement = (base: VersionCore, increment: VersionIncrement): VersionCore => {
  switch (increment) {
    case 'major':
      return { major: base.major + 1, minor: 0, patch: 0 }
    case 'minor':
      return { major: base.major, minor: base.minor + 1, patch: 0 }
    case 'patch':
      return { major: base.major, minor: base.minor, patch: base.patch + 1 }
  }
}

/**
 * Parses a semantic tag into numeric version parts.
 */
const parseTagVersionCore = (tag: string): VersionCore => {
  const parsed = semver.parse(semver.clean(tag, SEMVER_OPTIONS), SEMVER_OPTIONS)

  if (parsed === null) {
    throw new Error(`Invalid semantic version tag: ${tag}`)
  }

  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
  }
}

/**
 * Resolves branch-derived version context from event or explicit PR context.
 */
const resolveBranchVersionContext = (context?: ResolvedContext): BranchVersionContext => {
  const branch = context?.branchForVersion ?? getBranch()
  const expectedSha = context?.shaForVersion ?? github.context.sha
  const shouldAssertBranchHead = context?.hasPrContext !== true && EVENT_NAME !== 'pull_request'
  const shortCommit =
    typeof context?.shaForVersion === 'string'
      ? createShortCommit(context.shaForVersion)
      : SHORT_COMMIT

  return {
    branch,
    expectedSha,
    shortCommit,
    shouldAssertBranchHead,
  }
}

/**
 * Builds an initial prerelease version for repositories without semantic tags.
 */
const getInitialBranchVersion = (branch: string, shortCommit: string) =>
  semver.parse(`0.1.0-${preReleaseCase(branch)}+${shortCommit}`, SEMVER_OPTIONS)

/**
 * Derives the next prerelease version from the last semantic tag and commit diff.
 */
const getNextBranchVersion = async (lastGitTag: string, branch: string, shortCommit: string) => {
  core.info(`Last tag: ${lastGitTag}`)

  const increment = await resolveIncrementFromDiff(lastGitTag)
  const nextCore = applyIncrement(parseTagVersionCore(lastGitTag), increment)

  return getSemver({
    ...nextCore,
    prerelease: [preReleaseCase(branch), shortCommit],
  })
}

/**
 * Returns semantic version for the current workflow context.
 */
export const getVersion = async (context?: ResolvedContext) => {
  if (REF_TYPE === 'tag') {
    const version = semver.parse(semver.clean(REF_NAME, SEMVER_OPTIONS), SEMVER_OPTIONS)

    if (version === null) {
      throw new Error(`Not semver string: ${REF_NAME}`)
    }

    return version
  }

  await assertRepoNotShallow()

  const branchContext = resolveBranchVersionContext(context)

  await assertBranchLatestCommit(
    branchContext.branch,
    branchContext.expectedSha,
    branchContext.shouldAssertBranchHead,
  )

  const lastGitTag = await getTag(branchContext.branch)

  if (lastGitTag === undefined) {
    return getInitialBranchVersion(branchContext.branch, branchContext.shortCommit)
  }

  return await getNextBranchVersion(lastGitTag, branchContext.branch, branchContext.shortCommit)
}
