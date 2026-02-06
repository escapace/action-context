/**
 * Parse the `trusted-bots` action input into a Set of bot login strings.
 *
 * Input format: newline-separated bot logins. Blank lines and
 * leading/trailing whitespace on each line are ignored.
 * Logins are normalized to lowercase (GitHub login matching is case-insensitive).
 */
export const parseTrustedBots = (input: string | undefined): Set<string> => {
  if (input === undefined || input === '') {
    return new Set()
  }

  const logins = input
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0)

  return new Set(logins)
}
