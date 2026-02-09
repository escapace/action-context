export const PAGINATION_PER_PAGE = 100
export const MAX_PAGINATION_PAGES = 100

export const paginateRest = async <T>(
  fetchPage: (page: number, perPage: number) => Promise<readonly T[]>,
): Promise<T[]> => {
  const items: T[] = []

  for (let page = 1; page <= MAX_PAGINATION_PAGES; page++) {
    const pageItems = await fetchPage(page, PAGINATION_PER_PAGE)

    items.push(...pageItems)

    if (pageItems.length < PAGINATION_PER_PAGE) {
      return items
    }
  }

  throw new Error(
    `[PAGINATION_LIMIT_REACHED] Reached pagination limit (${MAX_PAGINATION_PAGES} pages x ${PAGINATION_PER_PAGE} per page).`,
  )
}
