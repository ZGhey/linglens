import { describe, expect, it } from 'vitest'
import { lineAt, textBetween, wordBounds, type LineBox } from '@/content/sites/gmail'

const line = (text: string, top: number, left = 100): LineBox => ({
  text,
  left,
  top,
  right: left + text.length * 7,
  bottom: top + 18,
})

describe('Gmail preview selection helpers', () => {
  const lines = [
    line('Acceptance of the consolidated Annual Financial Statements of Australian', 680),
    line('Computer Society Incorporated (the Association) and its subsidiaries (the', 700),
    line('3.', 740, 40),
    line('Annual Financial Statements', 740, 100),
  ]

  it('finds the line under a point, preferring the one containing x on a shared row', () => {
    expect(lineAt(lines, 150, 690)).toBe(0)
    expect(lineAt(lines, 45, 745)).toBe(2)
    expect(lineAt(lines, 200, 745)).toBe(3)
    // Between lines: nearest vertically.
    expect(lineAt(lines, 150, 699)).toBe(0)
  })

  it('reads a drag across a line wrap as one phrase, either direction', () => {
    const a = { line: 0, offset: lines[0].text.indexOf('Australian') }
    const b = { line: 1, offset: 'Computer Society'.length }
    expect(textBetween(lines, a, b)).toBe('Australian Computer Society')
    expect(textBetween(lines, b, a)).toBe('Australian Computer Society')
  })

  it('selects whole words, and CJK runs, on double-click', () => {
    const t = 'the Association) and'
    expect(t.slice(...wordBounds(t, 6))).toBe('Association')
    expect(wordBounds(t, 3)).toEqual([3, 3]) // on a space: nothing
    const zh = '上下文感知，术语'
    expect(zh.slice(...wordBounds(zh, 1))).toBe('上下文感知')
  })
})
