export function createShortCommit(string: string): string {
  return string.substring(0, string.startsWith('0') ? Math.max(7, string.search(/[A-Z]/i) + 1) : 7)
}
