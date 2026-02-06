import * as core from '@actions/core'
import { isString } from 'es-toolkit'
import assert from 'node:assert'
import { EVENT_NAME } from '../constants'

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
