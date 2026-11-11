import { describe, expect, it } from 'vitest'
import {
  fileNameFromUrl,
  isReaderLoadable,
  looksLikePdf,
  pdfUrlFromReaderSearch,
  readerUrlFor,
} from '@/pdf/routing'

describe('PDF reader routing', () => {
  it('accepts only http(s) and file URLs', () => {
    expect(isReaderLoadable('https://a.test/x.pdf')).toBe(true)
    expect(isReaderLoadable('http://a.test/x.pdf')).toBe(true)
    expect(isReaderLoadable('file:///Users/me/x.pdf')).toBe(true)
    expect(isReaderLoadable('blob:https://a.test/123')).toBe(false)
    expect(isReaderLoadable('javascript:alert(1)')).toBe(false)
    expect(isReaderLoadable('not a url')).toBe(false)
  })

  it('round-trips the PDF URL through the reader query', () => {
    const pdf = 'https://a.test/dir/My%20Doc.pdf?x=1&y=2#page=3'
    const url = new URL(readerUrlFor('chrome-extension://id/src/reader/index.html', pdf))
    expect(pdfUrlFromReaderSearch(url.search)).toBe(pdf)
  })

  it('rejects a missing or unsafe file parameter', () => {
    expect(pdfUrlFromReaderSearch('')).toBeNull()
    expect(pdfUrlFromReaderSearch('?file=javascript%3Aalert(1)')).toBeNull()
  })

  it('derives a readable file name', () => {
    expect(fileNameFromUrl('https://a.test/dir/My%20Doc.pdf')).toBe('My Doc.pdf')
    expect(fileNameFromUrl('https://a.test/')).toBe('https://a.test/')
  })
})

describe('looksLikePdf', () => {
  const bytes = (s: string) => new TextEncoder().encode(s)
  it('detects the PDF header, including after leading junk', () => {
    expect(looksLikePdf(bytes('%PDF-1.7\n...'))).toBe(true)
    expect(looksLikePdf(bytes('\n\n  %PDF-1.4'))).toBe(true)
  })
  it('rejects HTML error pages and empty bodies', () => {
    expect(looksLikePdf(bytes('<!doctype html><title>403</title>'))).toBe(false)
    expect(looksLikePdf(new Uint8Array())).toBe(false)
  })
})
