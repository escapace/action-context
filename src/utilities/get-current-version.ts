/* eslint-disable typescript/no-non-null-assertion */
import * as core from '@actions/core'
import * as github from '@actions/github'
import { getGitDiff } from 'changelogen'
import { isString } from 'es-toolkit'
import assert from 'node:assert'
import semver from 'semver'
import { EVENT_NAME, REF_NAME, REF_TYPE, SEMVER_OPTIONS, SHORT_COMMIT } from '../constants'
import { CONVENTIONAL_COMMIT_REGEX, DEFAULT_INCREMENT } from '../constants'
import { exec } from './exec'
import { getBranch } from './get-branch'
import { getSemver } from './get-semver'
import { getTag } from './get-tag'

const assertRepoNotShallow = async () =>
  assert.notEqual(await exec('git', ['rev-parse', '--is-shallow-repository']), 'true')

const assertBranchLatestCommit = async (branch: string) => {
  if (REF_TYPE === 'branch' && EVENT_NAME !== 'pull_request') {
    assert.equal(await exec('git', ['rev-parse', '--verify', branch]), github.context.sha)
  }
}

const preReleaseCase = (value: string) => value.replace(/[^\dA-Z-]/gi, '-')

const bump = async (lastGitTag: string, value: { major: number; minor: number; patch: number }) => {
  const commits = (await getGitDiff(lastGitTag, 'HEAD'))
    .map((value) => {
      const match = CONVENTIONAL_COMMIT_REGEX.exec(value.message)

      if (match === null) {
        return
      }

      const groups = match.groups ?? {}
      const type = groups.type
      const isBreaking = Boolean(groups.breaking) || value.message.includes('BREAKING CHANGE:')

      return isBreaking ? 'major' : type === 'feat' ? 'minor' : type === 'fix' ? 'patch' : undefined
    })
    .filter((value): value is 'major' | 'minor' | 'patch' => isString(value))
    .reduce(
      (previous, next): Record<'major' | 'minor' | 'patch', boolean> => {
        previous[next] = true

        return previous
      },
      { major: false, minor: false, patch: false },
    )

  const increment = commits.major
    ? 'major'
    : commits.minor
      ? 'minor'
      : commits.patch
        ? 'patch'
        : DEFAULT_INCREMENT

  switch (increment) {
    case 'major':
      return { major: value.major + 1, minor: 0, patch: 0 }
    case 'minor':
      return { major: value.major, minor: value.minor + 1, patch: 0 }
    case 'patch':
      return { major: value.major, minor: value.minor, patch: value.patch + 1 }
  }
}

export const getVersion = async () => {
  if (REF_TYPE === 'tag') {
    const version = semver.parse(semver.clean(REF_NAME, SEMVER_OPTIONS), SEMVER_OPTIONS)

    if (version === null) {
      throw new Error(`Not semver string: ${REF_NAME}`)
    }

    return version
  } else {
    await assertRepoNotShallow()
    const branch = getBranch()
    await assertBranchLatestCommit(branch)

    const lastGitTag = await getTag(branch)

    if (lastGitTag === undefined) {
      return semver.parse(`0.1.0-${preReleaseCase(branch)}+${SHORT_COMMIT}`, SEMVER_OPTIONS)
    } else {
      core.info(`Last tag: ${lastGitTag}`)

      const { major, minor, patch } = semver.parse(
        semver.clean(lastGitTag, SEMVER_OPTIONS),
        SEMVER_OPTIONS,
      )!

      return getSemver({
        ...(await bump(lastGitTag, {
          major,
          minor,
          patch,
        })),
        prerelease: [preReleaseCase(branch), SHORT_COMMIT],
      })
    }
  }
}
