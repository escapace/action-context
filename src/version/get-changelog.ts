import * as core from '@actions/core'
import type { ChangelogOptions } from 'changelogithub'
import { generate, hasTagOnGitHub, isRepoShallow } from 'changelogithub'

export const getChangelog = async (options: Pick<ChangelogOptions, 'prerelease' | 'token'>) => {
  try {
    const { commits, config, output } = await generate({
      capitalize: false,
      contributors: false,
      emoji: false,
      style: 'markdown',
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

    return output
  } catch (error) {
    if (error instanceof Error) {
      core.warning(error.message)
    }

    return
  }
}
