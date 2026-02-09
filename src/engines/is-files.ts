import { stat } from 'node:fs/promises'

export const isFile = async (path: string) =>
  await stat(path)
    .then((stats) => stats.isFile())
    .catch(() => false)
