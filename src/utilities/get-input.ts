import * as core from '@actions/core'

export const getInput = (name: string, options?: core.InputOptions) => {
  const value = core.getInput(name, options)

  return value === '' ? undefined : value
}
