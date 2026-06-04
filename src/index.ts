import * as core from '@actions/core'
import { isError, isString } from 'es-toolkit'
import { createContext } from './context/create-context'
import { setOutputGithubPages } from './github-pages/set-output-github-pages'
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
    // JSON.stringify escapes CR/LF and quotes the value, so attacker-controlled
    // text (e.g. commit messages embedded in `changelog`) cannot inject runner
    // workflow commands via line-leading `::cmd::` markers on stdout.
    core.info(`${name}: ${JSON.stringify(value)}`)
    core.setOutput(name, value)
  }

  // Set context output as JSON snapshot of all outputs
  core.setOutput('context', JSON.stringify(context.outputs))
}

const onError = (error: unknown): void =>
  core.setFailed(isError(error) ? error.message : isString(error) ? error : 'Unknown Error')

process.on('unhandledRejection', onError)
run().catch(onError)
