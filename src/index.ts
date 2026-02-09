import * as core from '@actions/core'
import { isError, isString } from 'es-toolkit'
import { createContext } from './context/create-context'
import { setOutputGithubPages } from './utilities/set-output-github-pages'
import { setOutputPullRequest } from './pull-request/set-output-pull-request'
import { setOutputEngines } from './engines/set-output-engines'
import { setOutputVersion } from './version/set-output-version'

const run = async () => {
  const context = await createContext()

  await setOutputVersion(context)
  await setOutputEngines(context)
  await setOutputGithubPages(context)
  await setOutputPullRequest(context)

  for (const [name, value] of Object.entries(context.outputs)) {
    core.info(`${name}: ${String(value)}`)
    core.setOutput(name, value)
  }
}

const onError = (error: unknown): void =>
  core.setFailed(isError(error) ? error.message : isString(error) ? error : 'Unknown Error')

process.on('unhandledRejection', onError)
run().catch(onError)
