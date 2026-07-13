// jsdom lacks ResizeObserver, which the popup uses to keep itself on screen as
// its thread grows. Chrome has it natively, so this is a test-environment gap,
// not a production concern — stub it rather than guarding the source.
//
// jsdom also does no layout (offsetWidth/offsetHeight are always 0), so the
// stub never fires: the popup's geometry is covered by the Playwright e2e,
// which runs in a real browser. These DOM tests only cover its markup.

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverStub
