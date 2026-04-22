import '@testing-library/jest-dom/vitest'

/** jsdom has no ResizeObserver; App uses it for toolbar and preview scroll sync. */
class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock

/** jsdom URL may omit Blob helpers used by downloads. */
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = (): string => 'blob:vitest-mock-url'
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = (): void => {}
}
