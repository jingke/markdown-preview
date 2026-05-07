import '@testing-library/jest-dom/vitest'

/** jsdom has no ResizeObserver; App uses it for toolbar and preview scroll sync. */
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock
