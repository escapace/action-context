import * as core from '@actions/core'
import * as github from '@actions/github'
import { isError, isString } from 'es-toolkit'
import path from 'node:path'
import { workspaceProjects } from './workspace-projects'
import { isNativeError } from 'node:util/types'

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
      return core.setOutput('github-pages', githubPages)
    }

    const directory = process.cwd()

    const projects = (await workspaceProjects(directory)).filter((value) =>
      isString(value.manifest?.scripts?.['build:github-pages']),
    )

    if (projects.length !== 1) {
      return core.setOutput('github-pages', githubPages)
    }

    const githubPagesPath = path.relative(
      directory,
      path.join(path.resolve(directory, projects[0].rootDir), 'lib/github-pages'),
    )

    core.info(`github-pages ${githubPages}`)
    core.info(`github-pages-path ${githubPagesPath}`)
    core.setOutput('github-pages', githubPages)
    core.setOutput('github-pages-path', githubPagesPath)
  } catch (error) {
    core.setOutput('github-pages', false)
    core.error(isNativeError(error) ? error : 'Unknown Error')
  }
}
