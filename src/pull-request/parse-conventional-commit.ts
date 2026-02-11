export interface ParsedConventionalCommit {
  breaking: boolean
  header: string | null
  raw: string
  scope: string | null
  subject: string | null
  type: string | null
}

const HEADER_PATTERN =
  /^(?<type>\w*)(?:\((?<scope>[\w$.\-* ]*)\))?(?<breaking>!)?:\s(?<subject>.*)$/
const BREAKING_CHANGE_PATTERN = /(?:^|\n)BREAKING(?:-| )CHANGE:/m

/**
 * Parse the first line of a commit message using conventional commit header syntax.
 *
 * This intentionally vendors only the subset we need for PR merge-strategy safety.
 */
export const parseConventionalCommit = (message: string): ParsedConventionalCommit => {
  const raw = String(message ?? '').replaceAll('\r\n', '\n')

  if (raw.length === 0) {
    return {
      breaking: false,
      header: null,
      raw,
      scope: null,
      subject: null,
      type: null,
    }
  }

  const [header = ''] = raw.split('\n', 1)
  const match = HEADER_PATTERN.exec(header)

  if (match === null) {
    return {
      breaking: BREAKING_CHANGE_PATTERN.test(raw),
      header,
      raw,
      scope: null,
      subject: null,
      type: null,
    }
  }

  const groups = match.groups ?? {}

  return {
    breaking: Boolean(groups.breaking) || BREAKING_CHANGE_PATTERN.test(raw),
    header,
    raw,
    scope: groups.scope ?? null,
    subject: groups.subject ?? null,
    type: groups.type ?? null,
  }
}
