export interface MermaidSvgExportRecord {
  id: string
  svg: string
  fileName: string
  order: number
}

export type MermaidSvgExportChangeHandler = (
  id: string,
  record: MermaidSvgExportRecord | null,
) => void

export function downloadSvgFile(svgMarkup: string, fileName: string): void {
  const blob: Blob = new Blob([svgMarkup], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url: string = URL.createObjectURL(blob)
  const anchor: HTMLAnchorElement = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
