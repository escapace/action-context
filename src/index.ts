import * as core from '@actions/core'
import * as github from '@actions/github'
import { execa } from 'execa'
import { isError, isString, last } from 'lodash-es'
import assert from 'node:assert'
import semver from 'semver'
import { getGitDiff } from 'changelogen'

const exec = async (cmd: string, args: string[]) => {
  const res = await execa(cmd, args)
  return res.stdout.trim()
}

const SEMVER_OPTIONS = { loose: false, includePrerelease: true }
const COMMITISH = github.context.sha.slice(0, 7)
const REF_TYPE = process.env.GITHUB_REF_TYPE as 'branch' | 'tag'
const REF_NAME = process.env.GITHUB_REF_NAME as string
const DEFAULT_INCREMENT = 'minor'

export const assertRepoNotShallow = async () =>
  assert.notEqual(
    await exec('git', ['rev-parse', '--is-shallow-repository']),
    'true'
  )

const assertRepoLatestCommit = async () => {
  if (REF_TYPE === 'branch') {
    assert.equal(
      await exec('git', ['rev-parse', '--verify', REF_NAME]),
      github.context.sha
    )
  }
}

const asserPreReleaseIdentifier = () => {
  if (REF_TYPE === 'branch') {
    assert.ok(
      /^[a-zA-Z0-9-]+$/.test(REF_NAME),
      'Branch name does not pass /^[a-zA-Z0-9-]+$/.'
    )
  }
}

export async function getLastGitTag(): Promise<string | undefined> {
  // const list = await exec('bash', [
  //   '-c',
  //   'git describe --abbrev=0 --always --tags $(git rev-list --tags --remove-empty --date-order) '
  // ])

  const list = (
    await exec('git', ['--no-pager', 'tag', '-l', '--sort=creatordate'])
  )
    .split('\n')
    .filter(
      (value): value is string => semver.clean(value, SEMVER_OPTIONS) !== null
    )

  const listSorted = [...list].sort((a, b) =>
    semver.compareBuild(
      semver.clean(a) as string,
      semver.clean(b) as string,
      SEMVER_OPTIONS
    )
  )

  core.debug(`getLastGitVersion():\n ${JSON.stringify([list, listSorted])}`)

  if (last(listSorted) !== last(list)) {
    throw new Error('Git commit history is inconsistent.')
  }

  return last(list)
}

const toSemver = (props: {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}) => {
  const { major, minor, patch, prerelease } = props

  const string = `${major}.${minor}.${patch}${
    prerelease.length === 0 ? '' : `-${prerelease.join('.')}`
  }`

  const version = semver.parse(string, SEMVER_OPTIONS)

  core.debug(
    `toSemver()\n ${JSON.stringify([
      { major, minor, patch, prerelease },
      { string, version }
    ])}`
  )

  if (version === null) {
    throw new Error(`Not semver string: ${string}`)
  }

  return version
}

const ConventionalCommitRegex =
  /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i

const bump = async (
  lastGitTag: string,
  value: { major: number; minor: number; patch: number }
) => {
  const commits = (await getGitDiff(lastGitTag, 'HEAD'))
    .map((value) => {
      const match = value.message.match(ConventionalCommitRegex)

      if (match === null) {
        return undefined
      }

      const groups = match.groups ?? {}
      const type = groups.type
      const isBreaking =
        Boolean(groups.breaking) || value.message.includes('BREAKING CHANGE:')

      return isBreaking
        ? 'major'
        : type === 'feat'
        ? 'minor'
        : type === 'fix'
        ? 'patch'
        : undefined
    })
    .filter((value): value is 'major' | 'minor' | 'patch' => isString(value))
    .reduce(
      (prev, next): Record<'major' | 'minor' | 'patch', boolean> => {
        prev[next] = true

        return prev
      },
      { major: false, minor: false, patch: false }
    )

  const increment = commits.major
    ? 'major'
    : commits.minor
    ? 'minor'
    : commits.patch
    ? 'patch'
    : DEFAULT_INCREMENT

  return {
    major: increment === 'major' ? value.major + 1 : value.major,
    minor: increment === 'minor' ? value.minor + 1 : value.minor,
    patch: increment === 'patch' ? value.patch + 1 : value.patch
  }
}

const getVersion = async () => {
  if (REF_TYPE === 'tag') {
    const version = semver.parse(
      semver.clean(REF_NAME, SEMVER_OPTIONS),
      SEMVER_OPTIONS
    )

    if (version === null) {
      throw new Error(`Not semver string: ${REF_NAME}`)
    }

    return version
  } else {
    await assertRepoLatestCommit()
    await assertRepoNotShallow()
    asserPreReleaseIdentifier()

    const lastGitTag = await getLastGitTag()

    if (lastGitTag === undefined) {
      return semver.parse(
        `0.1.0-${REF_NAME}+${COMMITISH}`,
        SEMVER_OPTIONS
      ) as semver.SemVer
    } else {
      core.info(`Last tag: ${lastGitTag}`)

      const { major, minor, patch } = semver.parse(
        semver.clean(lastGitTag),
        SEMVER_OPTIONS
      ) as semver.SemVer

      return toSemver({
        ...(await bump(lastGitTag, {
          major,
          minor,
          patch
        })),
        prerelease: [REF_NAME, COMMITISH]
      })
    }
  }
}

const run = async () => {
  const { raw: version, prerelease } = await getVersion()
  const isPrerelese = prerelease.length > 0
  const isTag = REF_TYPE === 'tag'
  const environment = isTag
    ? isPrerelese
      ? 'staging'
      : 'production'
    : 'testing'

  core.info(`version: ${version}`)
  core.info(`environment: ${environment}`)
  core.info(`commitish: ${COMMITISH}`)

  core.setOutput('version', version)
  core.setOutput('environment', environment)
  core.setOutput('commitish', COMMITISH)
}

function handleError(err: unknown): void {
  const message = isError(err)
    ? err.message
    : isString(err)
    ? err
    : 'Unknown Error'

  core.setFailed(message)
}

process.on('unhandledRejection', handleError)
run().catch(handleError)
