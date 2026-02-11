type CaseType = 'lower-case' | 'pascal-case' | 'sentence-case' | 'start-case' | 'upper-case'

const QUOTED_TEXT_PATTERN = /`.*?`|".*?"|'.*?'/g

const upperFirst = (value: string): string =>
  value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)

const splitWords = (value: string): string[] => {
  const normalized = value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
  const words = normalized.match(/[\p{L}\p{N}]+/gu)

  return words ?? []
}

const toCamelCase = (value: string): string => {
  const words = splitWords(value)

  if (words.length === 0) {
    return ''
  }

  const [head, ...tail] = words

  return [head.toLowerCase(), ...tail.map((word) => upperFirst(word.toLowerCase()))].join('')
}

const toStartCase = (value: string): string =>
  splitWords(value)
    .map((word) => upperFirst(word.toLowerCase()))
    .join(' ')

const toCase = (value: string, target: CaseType): string => {
  switch (target) {
    case 'lower-case':
      return value.toLowerCase()
    case 'pascal-case':
      return upperFirst(toCamelCase(value))
    case 'sentence-case':
      return upperFirst(value)
    case 'start-case':
      return toStartCase(value)
    case 'upper-case':
      return value.toUpperCase()
  }
}

/**
 * Commitlint-style case check with quoted content stripped.
 */
export const ensureCase = (raw: string, target: CaseType): boolean => {
  const input = String(raw ?? '')
    .replace(QUOTED_TEXT_PATTERN, '')
    .trim()
  const transformed = toCase(input, target)

  if (transformed.length === 0 || /^\d/.test(transformed)) {
    return true
  }

  return transformed === input
}
