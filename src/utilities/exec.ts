import { execa } from 'execa'

export const exec = async (cmd: string, arguments_: string[]) => {
  const process = await execa(cmd, arguments_)
  return process.stdout.trim()
}
