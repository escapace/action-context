/* eslint-disable typescript/no-non-null-assertion */
import * as core from '@actions/core'
import * as github from '@actions/github'
import { getGitDiff } from 'changelogen'
import type { ChangelogOptions } from 'changelogithub'
import { generate, hasTagOnGitHub, isRepoShallow } from 'changelogithub'
import { isError, isPlainObject, isString, last } from 'es-toolkit'
import { execa } from 'execa'
import assert from 'node:assert'
import { readFile, stat } from 'node:fs/promises'
import { isNativeError } from 'node:util/types'
import semver from 'semver'
import { packageEnginesFromDirectory, packageEnginesMaximumVersions } from './versions'

export const isFile = async (path: string) =>
  await stat(path)
    .then((stats) => stats.isFile())
    .catch(() => false)

const createChangelog = async (options: Pick<ChangelogOptions, 'prerelease' | 'token'>) => {
  try {
    const { commits, config, md } = await generate({
      capitalize: false,
      contributors: false,
      emoji: false,
      ...options,
    })

    // eslint-disable-next-line typescript/strict-boolean-expressions
    if (!config.token) {
      throw new Error('no GitHub token found')
    }

    if (!(await hasTagOnGitHub(config.to, config))) {
      throw new Error(`current ref "${config.to}" is not available as tags on GitHub`)
    }

    // eslint-disable-next-line typescript/strict-boolean-expressions
    if (!commits.length && (await isRepoShallow())) {
      throw new Error(
        'the repo seems to be clone shallowly, specify `fetch-depth: 0` in your ci config',
      )
    }

    return md
  } catch (error) {
    if (error instanceof Error) {
      core.warning(error.message)
    }

    return
  }
}

const exec = async (cmd: string, arguments_: string[]) => {
  const process = await execa(cmd, arguments_)
  return process.stdout.trim()
}

function shortenCommitHash(string: string): string {
  return string.substring(0, string.startsWith('0') ? Math.max(7, string.search(/[A-Z]/i) + 1) : 7)
}

const SEMVER_OPTIONS = { includePrerelease: true, loose: false }
const COMMITISH = shortenCommitHash(github.context.sha)
const REF_TYPE = process.env.GITHUB_REF_TYPE as 'branch' | 'tag'
const REF_NAME = process.env.GITHUB_REF_NAME!
const DEFAULT_INCREMENT = 'patch'
const EVENT_NAME = process.env.GITHUB_EVENT_NAME!

core.debug(
  `${JSON.stringify({
    GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
    GITHUB_HEAD_REF: process.env.GITHUB_HEAD_REF,
    GITHUB_REF: process.env.GITHUB_REF,
    GITHUB_REF_NAME: process.env.GITHUB_REF_NAME,
    GITHUB_REF_TYPE: process.env.GITHUB_REF_TYPE,
  })}`,
)

export const getBranch = () => {
  // Return the branch associated with the current GitHub Actions event. For
  // pull_request events, return the head (a.k.a., from) branch, not the base
  // (a.k.a., to) branch. For push events, return the branch that was pushed to.

  if (EVENT_NAME === 'pull_request') {
    return process.env.GITHUB_HEAD_REF!
  }

  const reference = process.env.GITHUB_REF!

  const match = /refs\/heads\/(?<value>[^/]+)/.exec(reference)
  const groups = match?.groups ?? {}
  const value = groups?.value

  assert.ok(isString(value), `Expected ${reference} to match '/refs\\/heads\\/(?<value>[^/]+)/'`)

  core.info(`Current branch: ${value}`)

  return value
}

export const assertRepoNotShallow = async () =>
  assert.notEqual(await exec('git', ['rev-parse', '--is-shallow-repository']), 'true')

const assertBranchLatestCommit = async (branch: string) => {
  if (REF_TYPE === 'branch' && EVENT_NAME !== 'pull_request') {
    assert.equal(await exec('git', ['rev-parse', '--verify', branch]), github.context.sha)
  }
}

const preReleaseCase = (value: string) => value.replace(/[^\dA-Z-]/gi, '-')

export async function getLastGitTag(branch?: string): Promise<string | undefined> {
  const list = (
    await exec('git', [
      '--no-pager',
      'tag',
      '--list',
      '--sort=authordate',
      ...(typeof branch === 'string' ? ['--merged', branch] : []),
    ])
  )
    .split('\n')
    .filter((value): value is string => semver.clean(value, SEMVER_OPTIONS) !== null)
    .sort((a, b) =>
      semver.compareBuild(
        semver.clean(a, SEMVER_OPTIONS)!,
        semver.clean(b, SEMVER_OPTIONS)!,
        SEMVER_OPTIONS,
      ),
    )

  core.debug(`getLastGitTag():\n ${JSON.stringify(list)}`)

  return last(list)
}

const toSemver = (properties: {
  major: number
  minor: number
  patch: number
  prerelease: Array<number | string>
}) => {
  const { major, minor, patch, prerelease } = properties

  const string = `${major}.${minor}.${patch}${prerelease.length === 0 ? '' : `-${prerelease.join('.')}`}`

  const version = semver.parse(string, { ...SEMVER_OPTIONS, loose: true })

  core.debug(
    `toSemver()\n ${JSON.stringify([
      { major, minor, patch, prerelease },
      { string, version },
    ])}`,
  )

  return version
}

const ConventionalCommitRegex =
  /(?<type>[a-z]+)(\((?<scope>.+)\))?(?<breaking>!)?: (?<description>.+)/i

const bump = async (lastGitTag: string, value: { major: number; minor: number; patch: number }) => {
  const commits = (await getGitDiff(lastGitTag, 'HEAD'))
    .map((value) => {
      const match = ConventionalCommitRegex.exec(value.message)

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

const getVersion = async () => {
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

    const lastGitTag = await getLastGitTag(branch)

    if (lastGitTag === undefined) {
      return semver.parse(`0.1.0-${preReleaseCase(branch)}+${COMMITISH}`, SEMVER_OPTIONS)
    } else {
      core.info(`Last tag: ${lastGitTag}`)

      const { major, minor, patch } = semver.parse(
        semver.clean(lastGitTag, SEMVER_OPTIONS),
        SEMVER_OPTIONS,
      )!

      return toSemver({
        ...(await bump(lastGitTag, {
          major,
          minor,
          patch,
        })),
        prerelease: [preReleaseCase(branch), COMMITISH],
      })
    }
  }
}

const isLatest = async (currentVersion: semver.SemVer) => {
  const tag = await getLastGitTag()

  if (tag === undefined) {
    return true
  }

  const latestVersion = semver.clean(tag, SEMVER_OPTIONS)!

  return semver.gte(currentVersion, latestVersion, SEMVER_OPTIONS)
}

const parseInput = (value: string) => (value === '' ? undefined : value)

const run = async () => {
  const currentVersion = await getVersion()
  const token = parseInput(core.getInput('token'))

  if (currentVersion === null) {
    throw new Error('Failed to derive a semantic version.')
  }

  const { prerelease, version } = currentVersion

  const isPrerelease = prerelease.length > 0
  const isTag = REF_TYPE === 'tag'
  const environment = isTag ? (isPrerelease ? 'staging' : 'production') : 'testing'
  const changelog = isTag ? await createChangelog({ prerelease: isPrerelease, token }) : ''
  const latest = await isLatest(currentVersion)
  const preid = isPrerelease ? `${prerelease[0]}` : ''

  core.info(`version: ${version}`)
  core.info(`environment: ${environment}`)
  core.info(`commitish: ${COMMITISH}`)
  core.info(`latest: ${latest}`)

  core.setOutput('changelog', changelog)
  core.setOutput('commitish', COMMITISH)
  core.setOutput('environment', environment)
  core.setOutput('latest', latest)
  core.setOutput('preid', preid)
  core.setOutput('prerelease', isPrerelease)
  core.setOutput('version', version)

  try {
    const nodeVersionFromInput = parseInput(core.getInput('node-version'))
    const node =
      typeof nodeVersionFromInput === 'string'
        ? (semver.clean(nodeVersionFromInput) ?? undefined)
        : undefined

    const versions: Array<Record<string, string | undefined>> = [{ node }]

    if (await isFile('package.json')) {
      const { engines } = JSON.parse(await readFile('package.json', 'utf8')) as {
        engines?: Record<string, string | undefined>
      }

      if (engines !== undefined) {
        versions.push(engines)
      }

      versions.push(...(await packageEnginesFromDirectory(process.cwd())))
    }

    if (await isFile('versions.json')) {
      const values = JSON.parse(await readFile('versions.json', 'utf8')) as unknown

      if (isPlainObject(values)) {
        Object.entries(values).forEach(([key, value]) => {
          if (
            typeof key === 'string' &&
            (typeof value === 'string' ||
              (isPlainObject(value) && typeof (value as { version?: string }).version === 'string'))
          ) {
            const version = value as string | { version: string }

            versions.push({ [key]: typeof version === 'string' ? version : version.version })
          }
        })
      }
    }

    for (const [name, version] of packageEnginesMaximumVersions(versions)) {
      core.info(`${name}: ${version}`)
      core.setOutput(name, version)
    }
  } catch (error) {
    core.error(isNativeError(error) ? error : 'Unknown Error')
  }
}

function handleError(error: unknown): void {
  const message = isError(error) ? error.message : isString(error) ? error : 'Unknown Error'

  core.setFailed(message)
}

process.on('unhandledRejection', handleError)
run().catch(handleError)
