import * as core from '@actions/core'

export type OutputValue = boolean | number | string | null | undefined

export const setOutputs = <T extends object>(outputs: { [K in keyof T]: OutputValue }): void => {
  for (const [name, value] of Object.entries(outputs)) {
    const outputValue = value as OutputValue

    core.info(`${name}: ${String(outputValue)}`)
    core.setOutput(name, outputValue)
  }
}
