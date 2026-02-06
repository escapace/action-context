import * as core from '@actions/core'
import { isPlainObject } from 'es-toolkit'
import { readFile } from 'node:fs/promises'
import { isNativeError } from 'node:util/types'
import semver from 'semver'
import { getInput } from './get-input'
import { isFile } from './is-files'
import { parseDevEngines as parseDevelopmentEngines, workspaceEngines } from './workspace-engines'
import { workspaceEnginesMaximumVersions } from './workspace-engines-maximum-versions'

export const setOutputVersions = async () => {
  try {
    const nodeVersionFromInput = getInput('node-version')
    const node =
      typeof nodeVersionFromInput === 'string'
        ? (semver.clean(nodeVersionFromInput) ?? undefined)
        : undefined

    const versions: Array<Record<string, string | undefined>> = [{ node }]

    if (await isFile('package.json')) {
      const { devEngines, engines } = JSON.parse(await readFile('package.json', 'utf8')) as {
        devEngines?: Parameters<typeof parseDevelopmentEngines>[0]
        engines?: Record<string, string | undefined>
      }

      if (engines !== undefined) {
        versions.push(engines)
      }

      versions.push(
        ...parseDevelopmentEngines(devEngines).filter(
          (value): value is Record<string, string> => value !== undefined,
        ),
      )

      versions.push(...(await workspaceEngines(process.cwd())))
    }

    if (await isFile('versions.json')) {
      const values = JSON.parse(await readFile('versions.json', 'utf8')) as unknown

      if (isPlainObject(values)) {
        Object.entries(values).forEach(([key, value]) => {
          if (
            typeof key === 'string' &&
            (typeof value === 'string' ||
              (isPlainObject(value) && typeof (value as { version?: string }).version === 'string'))
          ) {
            const version = value as string | { version: string }

            versions.push({ [key]: typeof version === 'string' ? version : version.version })
          }
        })
      }
    }

    for (const [name, version] of workspaceEnginesMaximumVersions(versions)) {
      core.info(`${name}: ${version}`)
      core.setOutput(name, version)
    }
  } catch (error) {
    core.error(isNativeError(error) ? error : 'Unknown Error')
  }
}
