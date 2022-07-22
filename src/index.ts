import * as core from '@actions/core'
import * as github from '@actions/github'
import { execa } from 'execa'
import { isError, isString, kebabCase } from 'lodash-es'
import assert from 'node:assert'
import semver from 'semver'

const exec = async (cmd: string, args: string[]) => {
  const res = await execa(cmd, args)
  return res.stdout.trim()
}

const SEMVER_OPTIONS = { loose: false, includePrerelease: true }
const COMMITISH = github.context.sha.slice(0, 7)
const REF_TYPE = process.env.GITHUB_REF_TYPE as 'branch' | 'tag'
const REF_NAME = process.env.GITHUB_REF_NAME as string

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

export async function getLastGitVersion(): Promise<string | undefined> {
  // const list = await exec('bash', [
  //   '-c',
  //   'git describe --abbrev=0 --always --tags $(git rev-list --tags --remove-empty --date-order) '
  // ])

  const list = (
    await exec('git', ['--no-pager', 'tag', '-l', '--sort=creatordate'])
  )
    .split('\n')
    .map((value) => semver.clean(value, SEMVER_OPTIONS))
    .filter((value): value is string => isString(value))

  const listSorted = [...list].sort((a, b) =>
    semver.compareBuild(a, b, SEMVER_OPTIONS)
  )

  if (listSorted[0] !== list[0]) {
    core.debug(
      `Different first entry in:\n ${JSON.stringify([list, listSorted])}`
    )
    throw new Error('Git commit history is inconsistent.')
  }

  return list[0]
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

    const lastGitVersion = await getLastGitVersion()

    if (lastGitVersion === undefined) {
      return semver.parse(
        `0.1.0-${REF_NAME}+${COMMITISH}`,
        SEMVER_OPTIONS
      ) as semver.SemVer
    } else {
      core.info(`Last version: ${lastGitVersion}`)

      const { major, minor, patch } = semver.parse(
        lastGitVersion,
        SEMVER_OPTIONS
      ) as semver.SemVer

      return toSemver({
        major,
        minor: minor + 1,
        patch,
        prerelease: [REF_NAME, COMMITISH].map((value) => kebabCase(value))
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
