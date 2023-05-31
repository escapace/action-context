import * as core from '@actions/core'
import * as github from '@actions/github'
import { getGitDiff } from 'changelogen'
import type { ChangelogOptions } from 'changelogithub'
import { generate, hasTagOnGitHub, isRepoShallow } from 'changelogithub'
import { execa } from 'execa'
import { isError, isString, last } from 'lodash-es'
import assert from 'node:assert'
import semver from 'semver'

const createChangelog = async (
  options: Pick<ChangelogOptions, 'token' | 'prerelease'>
) => {
  try {
    const { config, md, commits } = await generate({
      emoji: false,
      capitalize: false,
      ...options
    })

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!config.token) {
      throw new Error('no GitHub token found')
    }

    if (!(await hasTagOnGitHub(config.to, config))) {
      throw new Error(
        `current ref "${config.to}" is not available as tags on GitHub`
      )
    }

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!commits.length && (await isRepoShallow())) {
      throw new Error(
        'the repo seems to be clone shallowly, specify `fetch-depth: 0` in your ci config'
      )
    }

    return md
  } catch (e) {
    if (e instanceof Error) {
      core.error(e.message)
    }

    return undefined
  }
}

const exec = async (cmd: string, args: string[]) => {
  const res = await execa(cmd, args)
  return res.stdout.trim()
}

const SEMVER_OPTIONS = { loose: false, includePrerelease: true }
const COMMITISH = github.context.sha.slice(0, 7)
const REF_TYPE = process.env.GITHUB_REF_TYPE as 'branch' | 'tag'
const REF_NAME = process.env.GITHUB_REF_NAME as string
const DEFAULT_INCREMENT = 'patch' as const
const EVENT_NAME = process.env.GITHUB_EVENT_NAME as string

core.debug(
  `${JSON.stringify({
    GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
    GITHUB_HEAD_REF: process.env.GITHUB_HEAD_REF,
    GITHUB_REF: process.env.GITHUB_REF,
    GITHUB_REF_NAME: process.env.GITHUB_REF_NAME,
    GITHUB_REF_TYPE: process.env.GITHUB_REF_TYPE
  })}`
)

export const getBranch = () => {
  // Return the branch associated with the current GitHub Actions event. For
  // pull_request events, return the head (a.k.a., from) branch, not the base
  // (a.k.a., to) branch. For push events, return the branch that was pushed to.

  if (EVENT_NAME === 'pull_request') {
    return process.env.GITHUB_HEAD_REF as string
  }

  const ref = process.env.GITHUB_REF as string

  // const pattern =

  const match = ref.match(/refs\/heads\/(?<value>[^/]+)/)
  const groups = match?.groups ?? {}
  const value = groups?.value

  if (!isString(value)) {
    assert.ok(`Expected ${ref} to match '/refs\\/heads\\/(?<value>[^/]+)/'`)
  }

  core.info(`Current branch: ${value}`)

  return value
}

export const assertRepoNotShallow = async () =>
  assert.notEqual(
    await exec('git', ['rev-parse', '--is-shallow-repository']),
    'true'
  )

const assertRepoLatestCommit = async (branch: string) => {
  if (REF_TYPE === 'branch' && EVENT_NAME !== 'pull_request') {
    assert.equal(
      await exec('git', ['rev-parse', '--verify', branch]),
      github.context.sha
    )
  }
}

const preReleaseCase = (value: string) => value.replace(/[^0-9A-Za-z-]/gm, '-')

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

  // const listSorted = [...list].sort((a, b) =>
  //   semver.compareBuild(
  //     semver.clean(a, SEMVER_OPTIONS) as string,
  //     semver.clean(b, SEMVER_OPTIONS) as string,
  //     SEMVER_OPTIONS
  //   )
  // )

  core.debug(`getLastGitVersion():\n ${JSON.stringify(list)}`)

  // if (last(listSorted) !== last(list)) {
  //   throw new Error('Git commit history is inconsistent.')
  // }

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

  switch (increment) {
    case 'major':
      return { major: value.major + 1, minor: 0, patch: 0 }
    case 'minor':
      return { major: value.major, minor: value.minor + 1, patch: 0 }
    case 'patch':
      return { major: value.major, minor: value.minor, patch: value.patch + 1 }
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
    await assertRepoNotShallow()
    const branch = getBranch()
    await assertRepoLatestCommit(branch)

    const lastGitTag = await getLastGitTag()

    if (lastGitTag === undefined) {
      return semver.parse(
        `0.1.0-${preReleaseCase(branch)}+${COMMITISH}`,
        SEMVER_OPTIONS
      )
    } else {
      core.info(`Last tag: ${lastGitTag}`)

      const { major, minor, patch } = semver.parse(
        semver.clean(lastGitTag, SEMVER_OPTIONS),
        SEMVER_OPTIONS
      ) as semver.SemVer

      return toSemver({
        ...(await bump(lastGitTag, {
          major,
          minor,
          patch
        })),
        prerelease: [preReleaseCase(branch), COMMITISH]
      })
    }
  }
}

const run = async () => {
  const sv = await getVersion()
  const token = core.getInput('token')

  if (sv === null) {
    throw new Error('Failed to derive a semantic version.')
  }

  const { version, prerelease } = sv

  const isPrerelese = prerelease.length > 0
  const isTag = REF_TYPE === 'tag'
  const environment = isTag
    ? isPrerelese
      ? 'staging'
      : 'production'
    : 'testing'
  const changelog = await createChangelog({ prerelease: isPrerelese, token })

  core.info(`version: ${version}`)
  core.info(`environment: ${environment}`)
  core.info(`commitish: ${COMMITISH}`)

  core.setOutput('version', version)
  core.setOutput('environment', environment)
  core.setOutput('commitish', COMMITISH)
  core.setOutput('changelog', changelog)
  core.setOutput('prerelease', isPrerelese)
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
