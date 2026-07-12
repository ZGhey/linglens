// Shared skeleton for Linglens's on-page overlays. Each overlay (the trigger
// icon, the explanation popup, the PDF notice) lives in its own Shadow DOM so
// the page's CSS can't reach in and the overlay's CSS can't leak out. This base
// owns that boilerplate — host element, shadow root, injected <style>, mounting,
// and teardown — so the subclasses only build their own content and positioning.

export class ShadowHost {
  private host: HTMLElement
  /** The shadow root subclasses append their content to. */
  protected root: ShadowRoot

  constructor(hostId: string, styles: string) {
    this.host = document.createElement('div')
    this.host.id = hostId
    this.root = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = styles
    this.root.appendChild(style)
  }

  /** Attach the host to the page (idempotent). */
  protected mount(): void {
    if (!this.host.isConnected) document.body.appendChild(this.host)
  }

  remove(): void {
    this.host.remove()
  }

  /** The host node — used for containment checks (is a click inside us?). */
  get element(): HTMLElement {
    return this.host
  }
}
