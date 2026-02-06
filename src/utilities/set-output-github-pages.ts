import * as core from '@actions/core'
import * as github from '@actions/github'
import { isError, isString } from 'es-toolkit'
import path from 'node:path'
import { workspaceProjects } from './workspace-projects'
import { isNativeError } from 'node:util/types'
import { setOutputs } from './output'

export const setOutputGithubPages = async (octokit: ReturnType<typeof github.getOctokit>) => {
  try {
    const githubPages =
      (
        await octokit.rest.repos.getPages({ ...github.context.repo }).catch((error) => {
          if (isError(error) && Reflect.get(error, 'status') === 404) {
            return undefined
          }

          throw error
        })
      )?.data?.build_type === 'workflow'

    if (!githubPages) {
      return setOutputs({ 'github-pages': githubPages })
    }

    const directory = process.cwd()

    const projects = (await workspaceProjects(directory)).filter((value) =>
      isString(value.manifest?.scripts?.['build:github-pages']),
    )

    if (projects.length !== 1) {
      return setOutputs({ 'github-pages': githubPages })
    }

    const githubPagesPath = path.relative(
      directory,
      path.join(path.resolve(directory, projects[0].rootDir), 'lib/github-pages'),
    )

    const outputs = {
      'github-pages': githubPages,
      'github-pages-path': githubPagesPath,
    }

    setOutputs(outputs)
  } catch (error) {
    setOutputs({ 'github-pages': false })
    core.error(isNativeError(error) ? error : 'Unknown Error')
  }
}
