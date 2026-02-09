import * as core from '@actions/core'
import { getGitDiff } from 'changelogen'
import { isString } from 'es-toolkit'
import assert from 'node:assert'
import semver from 'semver'
import { conventionalCommitRegex, defaultIncrement } from '../constants'
import { assertRepoNotShallow } from './assert-repo-not-shallow'
import { createShortCommit } from '../utilities/create-short-commit'
import { exec } from '../utilities/exec'
import { createSemanticVersion } from './create-semantic-version'
import { readTag } from './read-tag'
import type { BranchContext, Context, PullRequestContext } from '../types'

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
  referenceType: 'branch' | 'tag',
): Promise<void> => {
  if (referenceType === 'branch' && shouldAssertBranchHead) {
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
  const match = conventionalCommitRegex.exec(message)

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

  return defaultIncrement
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
  const parsed = semver.parse(semver.clean(tag))

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
const resolveBranchVersionContext = (
  context: BranchContext | PullRequestContext,
): BranchVersionContext => {
  const branch = context.versionBranch
  const expectedSha = context.versionCommitSha
  const shouldAssertBranchHead = !context.hasPullRequestContext
  const shortCommit =
    typeof context.versionCommitShaShort === 'string' && context.versionCommitShaShort.length > 0
      ? context.versionCommitShaShort
      : createShortCommit(expectedSha)

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
  semver.parse(`0.1.0-${preReleaseCase(branch)}+${shortCommit}`)

/**
 * Derives the next prerelease version from the last semantic tag and commit diff.
 */
const getNextBranchVersion = async (lastGitTag: string, branch: string, shortCommit: string) => {
  core.info(`Last tag: ${lastGitTag}`)

  const increment = await resolveIncrementFromDiff(lastGitTag)
  const nextCore = applyIncrement(parseTagVersionCore(lastGitTag), increment)

  return createSemanticVersion({
    ...nextCore,
    prerelease: [preReleaseCase(branch), shortCommit],
  })
}

/**
 * Returns semantic version for the current workflow context.
 */
export const createVersion = async (context: Context) => {
  const referenceType = context.referenceType
  const referenceName = context.referenceName

  if (referenceType === 'tag') {
    const version = semver.parse(semver.clean(referenceName))

    if (version === null) {
      throw new Error(`Not semver string: ${referenceName}`)
    }

    return version
  }

  await assertRepoNotShallow()

  const branchContext = resolveBranchVersionContext(context)

  await assertBranchLatestCommit(
    branchContext.branch,
    branchContext.expectedSha,
    branchContext.shouldAssertBranchHead,
    referenceType,
  )

  const lastGitTag = await readTag(branchContext.branch)

  if (lastGitTag === undefined) {
    return getInitialBranchVersion(branchContext.branch, branchContext.shortCommit)
  }

  return await getNextBranchVersion(lastGitTag, branchContext.branch, branchContext.shortCommit)
}
