import * as core from '@actions/core'
import { isError, isString } from 'es-toolkit'
import path from 'node:path'
import { workspaceProjects } from './workspace-projects'
import { isNativeError } from 'node:util/types'
import type { Context } from '../types'

export const setOutputGithubPages = async (context: Context) => {
  const { outputs } = context

  try {
    const githubPages =
      (
        await context.octokit.rest.repos
          .getPages({ owner: context.repositoryOwner, repo: context.repositoryName })
          .catch((error) => {
            if (isError(error) && Reflect.get(error, 'status') === 404) {
              return undefined
            }

            throw error
          })
      )?.data?.build_type === 'workflow'

    if (!githubPages) {
      outputs['github-pages'] = githubPages

      return
    }

    const directory = process.cwd()

    const projects = (await workspaceProjects(directory)).filter((value) =>
      isString(value.manifest?.scripts?.['build:github-pages']),
    )

    outputs['github-pages'] = githubPages

    if (projects.length === 1) {
      outputs['github-pages-path'] = path.relative(
        directory,
        path.join(path.resolve(directory, projects[0].rootDir), 'lib/github-pages'),
      )
    }
  } catch (error) {
    outputs['github-pages'] = false
    core.error(isNativeError(error) ? error : 'Unknown Error')
  }
}
