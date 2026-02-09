export type ActionOutputValue = boolean | number | string

export interface ActionOutputs {
  // Core outputs
  'changelog': string
  'environment': string
  'github-pages': boolean
  'github-pages-path': string
  'latest': boolean
  'node-version': string
  'prerelease': boolean
  'prerelease-identifier': string
  'short-commit': string
  'version': string

  // Pull request outputs
  'pr-author-bot': boolean
  'pr-base-ref': string
  'pr-checks-clear': boolean
  'pr-commits-trusted': boolean
  'pr-head-ref': string
  'pr-last-commit-age-minute': number
  'pr-merge-state-clear': boolean
  'pr-mergeable': boolean
  'pr-not-draft': boolean
  'pr-number': number
  'pr-review-clear': boolean

  // Dynamic engine outputs
  [key: string]: ActionOutputValue
}

export const createOutputs = (): ActionOutputs => {
  const state = new Map<string, ActionOutputValue>()

  // eslint-disable-next-line typescript/consistent-type-assertions -- Proxy target is never accessed directly.
  const target = {} as ActionOutputs

  return new Proxy(target, {
    get(_, property) {
      if (typeof property !== 'string') {
        return undefined
      }

      if (property === 'then') {
        return undefined
      }

      if (!state.has(property)) {
        throw new Error(`Output '${property}' has not been set yet.`)
      }

      return state.get(property)
    },

    set(_, property, value: ActionOutputValue) {
      if (typeof property !== 'string') {
        return true
      }

      state.set(property, value)

      return true
    },

    deleteProperty(_, property) {
      if (typeof property !== 'string') {
        return true
      }

      state.delete(property)

      return true
    },

    has(_, property) {
      return typeof property === 'string' && state.has(property)
    },

    ownKeys() {
      return [...state.keys()]
    },

    getOwnPropertyDescriptor(_, property) {
      if (typeof property !== 'string' || !state.has(property)) {
        return undefined
      }

      return {
        configurable: true,
        enumerable: true,
        value: state.get(property),
        writable: true,
      }
    },
  })
}
