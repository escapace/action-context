import { groupBy, kebabCase, mapValues, uniq } from 'es-toolkit'
import { compare, minVersion, validRange } from 'semver'

export const workspaceEnginesMaximumVersions = (
  engines: Array<Record<string, string | undefined> | undefined>,
) => {
  const map = new Map<string, string>()

  const records = mapValues(
    groupBy(
      engines
        .map((value) => Object.entries(value ?? {}))
        .flat()
        .map(([key, value]) =>
          value === undefined || validRange(value, true) === null
            ? undefined
            : ([key, value] as const),
        )
        .filter((value): value is [string, string] => value !== undefined),
      ([key]) => key,
    ),
    (entries) => {
      const versions = uniq(entries.map(([_, value]) => value))

      return versions.sort((a, b) => compare(minVersion(b)!, minVersion(a)!, true))[0]
    },
  )

  for (const [key, value] of Object.entries(records)) {
    if (typeof value !== 'string') {
      continue
    }

    const version = minVersion(value)?.toString()

    if (typeof version !== 'string') {
      continue
    }

    const name = `${kebabCase(key)}-version`

    const previousVersion = map.get(name)

    if (previousVersion !== undefined && previousVersion !== version) {
      throw new Error(`Inconsistent '${name}' versions.`)
    }

    map.set(name, version)
  }

  return map
}
