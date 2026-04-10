/** Scroll positions (px) to align each preview heading at the top of the scroll container. */
export interface SectionScrollMap {
  readonly sourceStarts: readonly number[]
  readonly previewScrollTops: readonly number[]
}

const ATX_HEADING_LINE: RegExp = /^\s{0,3}#{1,6}(?:\s|$)/

/**
 * Character offsets of ATX heading line starts in `markdown`, excluding headings
 * inside fenced ``` code blocks.
 */
export function extractHeadingCharOffsets(markdown: string): number[] {
  const offsets: number[] = []
  let inFence: boolean = false
  let lineStart: number = 0
  const len: number = markdown.length
  let i: number = 0
  while (i <= len) {
    const lineEnd: number = markdown.indexOf('\n', i)
    const end: number = lineEnd === -1 ? len : lineEnd
    const line: string = markdown.slice(lineStart, end)
    const trimmed: string = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
    } else if (!inFence && ATX_HEADING_LINE.test(line)) {
      offsets.push(lineStart)
    }
    if (lineEnd === -1) {
      break
    }
    i = lineEnd + 1
    lineStart = i
  }
  return offsets
}

function buildSectionStarts(
  markdownLength: number,
  headingOffsets: readonly number[],
): number[] {
  const starts: number[] = [0]
  for (let h: number = 0; h < headingOffsets.length; h++) {
    const off: number = headingOffsets[h]
    if (starts[starts.length - 1] !== off) {
      starts.push(off)
    }
  }
  if (starts[starts.length - 1] !== markdownLength) {
    starts.push(markdownLength)
  }
  return starts
}

/**
 * Top of `el` relative to `scrollContainer` for scrollTop alignment (accounts for
 * current container scroll).
 */
export function getScrollAlignTop(
  scrollContainer: HTMLElement,
  el: HTMLElement,
): number {
  const cRect: DOMRect = scrollContainer.getBoundingClientRect()
  const eRect: DOMRect = el.getBoundingClientRect()
  return eRect.top - cRect.top + scrollContainer.scrollTop
}

export function buildSectionScrollMap(
  markdown: string,
  headingOffsets: readonly number[],
  previewContainer: HTMLElement,
  headingElements: readonly HTMLElement[],
): SectionScrollMap {
  const n: number = Math.min(headingOffsets.length, headingElements.length)
  const trimmedOffsets: number[] = headingOffsets.slice(0, n)
  const sourceStarts: number[] = buildSectionStarts(
    markdown.length,
    trimmedOffsets,
  )
  const maxPreviewScroll: number = Math.max(
    0,
    previewContainer.scrollHeight - previewContainer.clientHeight,
  )
  const previewScrollTops: number[] = [0]
  for (let h: number = 0; h < n; h++) {
    previewScrollTops.push(
      getScrollAlignTop(previewContainer, headingElements[h]),
    )
  }
  previewScrollTops.push(maxPreviewScroll)
  return { sourceStarts, previewScrollTops }
}

function findSectionIndex(
  starts: readonly number[],
  position: number,
): number {
  if (starts.length < 2) {
    return 0
  }
  const lastStart: number = starts[starts.length - 1]
  if (position >= lastStart) {
    return starts.length - 2
  }
  for (let i: number = 0; i < starts.length - 1; i++) {
    if (position >= starts[i] && position < starts[i + 1]) {
      return i
    }
  }
  return starts.length - 2
}

/** Map source character index to proportional scroll in preview. */
export function sourceCharToPreviewScroll(
  map: SectionScrollMap,
  charIndex: number,
): number {
  const { sourceStarts, previewScrollTops } = map
  if (sourceStarts.length < 2) {
    return 0
  }
  const clamped: number = Math.max(
    0,
    Math.min(charIndex, sourceStarts[sourceStarts.length - 1]),
  )
  const i: number = findSectionIndex(sourceStarts, clamped)
  const s0: number = sourceStarts[i]
  const s1: number = sourceStarts[i + 1]
  const p0: number = previewScrollTops[i]
  const p1: number = previewScrollTops[i + 1]
  const span: number = s1 - s0
  if (span <= 0) {
    return p0
  }
  const t: number = (clamped - s0) / span
  return p0 + t * (p1 - p0)
}

/** Map preview scroll position to equivalent source character index. */
export function previewScrollToSourceChar(
  map: SectionScrollMap,
  scrollTop: number,
): number {
  const { sourceStarts, previewScrollTops } = map
  if (sourceStarts.length < 2) {
    return 0
  }
  const maxP: number = previewScrollTops[previewScrollTops.length - 1]
  const clamped: number = Math.max(0, Math.min(scrollTop, maxP))
  let i: number = previewScrollTops.length - 2
  for (let k: number = 0; k < previewScrollTops.length - 1; k++) {
    const p0: number = previewScrollTops[k]
    const p1: number = previewScrollTops[k + 1]
    const isLast: boolean = k === previewScrollTops.length - 2
    if (
      clamped >= p0 &&
      (isLast ? clamped <= p1 : clamped < p1)
    ) {
      i = k
      break
    }
  }
  const p0: number = previewScrollTops[i]
  const p1: number = previewScrollTops[i + 1]
  const s0: number = sourceStarts[i]
  const s1: number = sourceStarts[i + 1]
  const pSpan: number = p1 - p0
  if (pSpan <= 0) {
    return s0
  }
  const t: number = (clamped - p0) / pSpan
  return s0 + t * (s1 - s0)
}

export function charIndexToTextareaScroll(
  textarea: HTMLTextAreaElement,
  markdownLength: number,
  charIndex: number,
): number {
  const max: number = Math.max(
    0,
    textarea.scrollHeight - textarea.clientHeight,
  )
  if (markdownLength <= 0 || max <= 0) {
    return 0
  }
  const ratio: number = Math.max(
    0,
    Math.min(1, charIndex / markdownLength),
  )
  return ratio * max
}

export function textareaScrollToCharIndex(
  textarea: HTMLTextAreaElement,
  markdownLength: number,
): number {
  const max: number = Math.max(
    0,
    textarea.scrollHeight - textarea.clientHeight,
  )
  if (markdownLength <= 0 || max <= 0) {
    return 0
  }
  const ratio: number = textarea.scrollTop / max
  return ratio * markdownLength
}
