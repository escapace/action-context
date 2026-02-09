import { exec } from '../utilities/exec'

export const assertRepoNotShallow = async (): Promise<void> => {
  const shallow = await exec('git', ['rev-parse', '--is-shallow-repository'])

  if (shallow === 'true') {
    throw new Error(
      'Repository history is shallow. Use actions/checkout with fetch-depth: 0 to derive versions and latest reliably.',
    )
  }
}
