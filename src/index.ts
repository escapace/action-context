import * as core from '@actions/core'
import * as github from '@actions/github'
import { isError, isString } from 'es-toolkit'
import assert from 'node:assert'
import { REF_TYPE, SHORT_COMMIT } from './constants'
import { getChangelog } from './utilities/get-changelog'
import { getVersion } from './utilities/get-current-version'
import { getInput } from './utilities/get-input'
import { isLatestVersion } from './utilities/is-latest-version'
import { setOutputGithubPages } from './utilities/set-output-github-pages'
import { setOutputs } from './utilities/output'
import { setOutputPullRequest } from './utilities/pull-request/set-output-pull-request'
import { setOutputVersions } from './utilities/set-output-versions'

const run = async () => {
  const currentVersion = await getVersion()
  const token = getInput('token')

  assert(currentVersion !== null, 'Failed to derive a semantic version.')
  assert(typeof token === 'string', 'Empty github token.')

  const octokit = github.getOctokit(token)

  const { prerelease, version } = currentVersion

  const isPrerelease = prerelease.length > 0
  const isTag = REF_TYPE === 'tag'
  const environment = isTag ? (isPrerelease ? 'staging' : 'production') : 'testing'
  const changelog = isTag ? await getChangelog({ prerelease: isPrerelease, token }) : ''
  const latest = await isLatestVersion(currentVersion)
  const prereleaseIdentifier = isPrerelease ? `${prerelease[0]}` : ''

  setOutputs({
    changelog,
    environment,
    latest,
    'prerelease': isPrerelease,
    'prerelease-identifier': prereleaseIdentifier,
    'short-commit': SHORT_COMMIT,
    version,
  })

  await setOutputVersions()
  await setOutputGithubPages(octokit)
  await setOutputPullRequest(octokit)
}

const onError = (error: unknown): void =>
  core.setFailed(isError(error) ? error.message : isString(error) ? error : 'Unknown Error')

process.on('unhandledRejection', onError)
run().catch(onError)
