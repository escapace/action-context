import * as core from '@actions/core'
import { isError, isString } from 'es-toolkit'
import assert from 'node:assert'
import { createContext } from './context/create-context'
import { getChangelog } from './utilities/get-changelog'
import { getVersion } from './utilities/get-current-version'
import { isLatestVersion } from './utilities/is-latest-version'
import { setOutputGithubPages } from './utilities/set-output-github-pages'
import { setOutputs } from './utilities/output'
import { setOutputPullRequest } from './utilities/pull-request/set-output-pull-request'
import { setOutputVersions } from './utilities/set-output-versions'

const run = async () => {
  const context = await createContext()
  const { inputs } = context
  const currentVersion = await getVersion(context)

  assert(currentVersion !== null, 'Failed to derive a semantic version.')

  const { prerelease, version } = currentVersion

  const isPrerelease = prerelease.length > 0
  const isTag = context.referenceType === 'tag'
  const environment = isTag ? (isPrerelease ? 'staging' : 'production') : 'testing'
  const changelog = isTag
    ? await getChangelog({ prerelease: isPrerelease, token: inputs.token })
    : ''
  const latest = await isLatestVersion(currentVersion)
  const prereleaseIdentifier = isPrerelease ? `${prerelease[0]}` : ''

  setOutputs({
    changelog,
    environment,
    latest,
    'prerelease': isPrerelease,
    'prerelease-identifier': prereleaseIdentifier,
    'short-commit': context.versionCommitShaShort,
    version,
  })

  await setOutputVersions(context)
  await setOutputGithubPages(context)
  await setOutputPullRequest(context)
}

const onError = (error: unknown): void =>
  core.setFailed(isError(error) ? error.message : isString(error) ? error : 'Unknown Error')

process.on('unhandledRejection', onError)
run().catch(onError)
