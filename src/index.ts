import * as core from '@actions/core'
import * as github from '@actions/github'
import { RequestError } from '@octokit/request-error'
import { isError, isString } from 'es-toolkit'
import assert from 'node:assert'
import { REF_TYPE, SHORT_COMMIT } from './constants'
import { getChangelog } from './utilities/get-changelog'
import { getVersion } from './utilities/get-current-version'
import { getInput } from './utilities/get-input'
import { isLatestVersion } from './utilities/is-latest-version'
import { setOutputVersions } from './utilities/set-output-versions'

const run = async () => {
  const currentVersion = await getVersion()
  const token = getInput('token')

  assert(currentVersion !== null, 'Failed to derive a semantic version.')
  assert(typeof token === 'string', 'Empty github token.')

  const { prerelease, version } = currentVersion

  const isPrerelease = prerelease.length > 0
  const isTag = REF_TYPE === 'tag'
  const environment = isTag ? (isPrerelease ? 'staging' : 'production') : 'testing'
  const changelog = isTag ? await getChangelog({ prerelease: isPrerelease, token }) : ''
  const latest = await isLatestVersion(currentVersion)
  const prereleaseIdentifier = isPrerelease ? `${prerelease[0]}` : ''

  core.info(`version: ${version}`)
  core.info(`environment: ${environment}`)
  core.info(`commitish: ${SHORT_COMMIT}`)
  core.info(`latest: ${latest}`)

  core.setOutput('changelog', changelog)
  core.setOutput('commitish', SHORT_COMMIT)
  core.setOutput('environment', environment)
  core.setOutput('latest', latest)
  core.setOutput('prerelease-identifier', prereleaseIdentifier)
  core.setOutput('prerelease', isPrerelease)
  core.setOutput('version', version)

  const octokit = github.getOctokit(token)

  const githubPages =
    (
      await octokit.rest.repos.getPages({ ...github.context.repo }).catch((error) => {
        console.log(error)
        if (error instanceof RequestError && error.status === 404) {
          return undefined
        }

        throw error
      })
    )?.data?.build_type === 'workflow'

  core.setOutput('github-pages', githubPages)

  await setOutputVersions()
}

const onError = (error: unknown): void =>
  core.setFailed(isError(error) ? error.message : isString(error) ? error : 'Unknown Error')

process.on('unhandledRejection', onError)
run().catch(onError)
