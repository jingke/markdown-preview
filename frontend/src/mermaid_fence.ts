/** Rebuilds a fenced mermaid block for splicing into Markdown source. */
export function buildMermaidFence(innerDiagram: string): string {
  const body: string = innerDiagram.replace(/\n$/, '')
  return '```mermaid\n' + body + '\n```'
}
