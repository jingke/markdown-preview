/** Fraction of the split width taken by the Markdown source pane. */
export const DEFAULT_SOURCE_RATIO: number = 0.5

/** Keeps both panes usable no matter how far the splitter is dragged. */
export const MIN_SOURCE_RATIO: number = 0.15
export const MAX_SOURCE_RATIO: number = 0.85

const STORAGE_KEY_SOURCE_RATIO: string = 'markdown-preview:source-ratio'

export function clampSourceRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_SOURCE_RATIO
  }
  return Math.min(MAX_SOURCE_RATIO, Math.max(MIN_SOURCE_RATIO, ratio))
}

export function readSourceRatioFromStorage(): number {
  try {
    const stored: string | null = localStorage.getItem(STORAGE_KEY_SOURCE_RATIO)
    if (stored === null || stored === '') {
      return DEFAULT_SOURCE_RATIO
    }
    return clampSourceRatio(Number.parseFloat(stored))
  } catch {
    return DEFAULT_SOURCE_RATIO
  }
}

export function persistSourceRatio(ratio: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_SOURCE_RATIO, String(ratio))
  } catch {
    /* ignore quota / private mode */
  }
}
