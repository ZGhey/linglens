import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Popup } from '@/content/popup'

function shadowOf(popup: Popup): ShadowRoot {
  return popup.element.shadowRoot as ShadowRoot
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('Popup error rendering (ticket 08)', () => {
  it('shows a distinct message per error kind', () => {
    const a = new Popup()
    a.showAt(10, 10)
    a.renderError('x', { kind: 'missing-key', message: '' })
    const missing = shadowOf(a).querySelector('.cl-error')!.textContent!

    const b = new Popup()
    b.showAt(10, 10)
    b.renderError('x', { kind: 'rate-limited', message: '' })
    const limited = shadowOf(b).querySelector('.cl-error')!.textContent!

    expect(missing).not.toBe(limited)
    expect(missing.toLowerCase()).toContain('key')
    expect(limited.toLowerCase()).toContain('rate')
  })

  it('offers an Open settings action for key errors and invokes the callback', () => {
    const onOpen = vi.fn()
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderError('x', { kind: 'invalid-key', message: '' }, onOpen)

    const btn = shadowOf(popup).querySelector('button')
    expect(btn?.textContent).toBe('Open settings')
    btn!.dispatchEvent(new Event('click'))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('does not show a settings action for non-key errors', () => {
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderError('x', { kind: 'network', message: '' }, vi.fn())
    expect(shadowOf(popup).querySelector('button')).toBeNull()
  })

  it('never leaves the loading spinner up once an error renders', () => {
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderLoading('x')
    expect(shadowOf(popup).querySelector('.cl-spinner')).not.toBeNull()
    popup.renderError('x', { kind: 'unknown', message: '' })
    expect(shadowOf(popup).querySelector('.cl-spinner')).toBeNull()
  })

  it('shows the specific backend message for an unknown error instead of the generic copy', () => {
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderError('x', { kind: 'unknown', message: 'The provider returned an empty response.' })
    const text = shadowOf(popup).querySelector('.cl-error')?.textContent ?? ''
    expect(text).toContain('empty response')
  })

  it('falls back to the generic copy for an unknown error with no message', () => {
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderError('x', { kind: 'unknown', message: '' })
    expect(shadowOf(popup).querySelector('.cl-error')?.textContent).toContain('Something went wrong')
  })
})

describe('Popup follow-up thread', () => {
  it('renders the input only when a follow-up handler is provided (cap reached = none)', () => {
    const withInput = new Popup()
    withInput.showAt(10, 10)
    withInput.renderExplanation('t', 'answer', { onFollowUp: vi.fn() })
    expect(shadowOf(withInput).querySelector('.cl-ask input')).not.toBeNull()

    const capped = new Popup()
    capped.showAt(10, 10)
    capped.renderExplanation('t', 'answer', {})
    expect(shadowOf(capped).querySelector('.cl-ask')).toBeNull()
  })

  it('submits a typed question and clears the input', () => {
    const onFollowUp = vi.fn()
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderExplanation('t', 'answer', { onFollowUp })
    const input = shadowOf(popup).querySelector<HTMLInputElement>('.cl-ask input')!
    input.value = '  why?  '
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onFollowUp).toHaveBeenCalledWith('why?')
    expect(input.value).toBe('')
  })

  it('renders completed turns and a follow-up error without wiping them', () => {
    const popup = new Popup()
    popup.showAt(10, 10)
    popup.renderExplanation('t', 'original', {
      thread: [{ question: 'q1', answer: 'a1' }],
      onFollowUp: vi.fn(),
    })
    const root = shadowOf(popup)
    expect(root.querySelector('.cl-q')?.textContent).toBe('q1')
    popup.showFollowUpError({ kind: 'rate-limited', message: '' })
    expect(root.querySelector('.cl-followup-error')).not.toBeNull()
    expect(root.querySelector('.cl-q')?.textContent).toBe('q1')
  })
})
