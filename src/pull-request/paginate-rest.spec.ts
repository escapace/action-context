import { describe, expect, it, vi } from 'vitest'
import { MAX_PAGINATION_PAGES, PAGINATION_PER_PAGE, paginateRest } from './paginate-rest'

describe('paginateRest', () => {
  it('collects pages until a short page is returned', async () => {
    const fullPage: number[] = Array.from({ length: PAGINATION_PER_PAGE }, () => 1)

    const fetchPage = vi
      .fn<(_: number, __: number) => Promise<number[]>>()
      .mockResolvedValueOnce(fullPage)
      .mockResolvedValueOnce([2, 3])

    await expect(paginateRest(fetchPage)).resolves.toEqual([...fullPage, 2, 3])

    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, PAGINATION_PER_PAGE)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, PAGINATION_PER_PAGE)
  })

  it('throws when pagination exceeds max pages', async () => {
    const fullPage: number[] = Array.from({ length: PAGINATION_PER_PAGE }, () => 1)

    const fetchPage = vi
      .fn<(_: number, __: number) => Promise<number[]>>()
      .mockResolvedValue(fullPage)

    await expect(paginateRest(fetchPage)).rejects.toThrow('PAGINATION_LIMIT_REACHED')
    expect(fetchPage).toHaveBeenCalledTimes(MAX_PAGINATION_PAGES)
  })
})
