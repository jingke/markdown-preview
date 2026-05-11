# Mermaid SVG Export Design

## Goal

Allow users to export rendered Mermaid diagrams as SVG files from the Markdown preview.

## Scope

The feature supports both diagram-level and document-level export:

- Each successfully rendered Mermaid diagram shows an `Export SVG` action.
- The main toolbar shows `Export Mermaid SVGs` to download all successfully rendered Mermaid diagrams in the current preview.
- Diagrams that fail to render are not exported.

## Architecture

`MermaidDiagram` already receives Mermaid source and mounts the rendered SVG returned by `mermaid.render`. It will keep the latest valid SVG markup in component state and expose it through a new registration callback. `MarkdownPreview` will pass each Mermaid block's source offset to `MermaidDiagram` as a stable registration key. `MarkdownWorkspace` will maintain a map of exported SVG records and use it for the toolbar export-all action.

The implementation will use native browser downloads with `Blob` and `URL.createObjectURL`. Export-all will trigger separate SVG downloads rather than introducing a zip dependency.

## Components

- `frontend/src/components/mermaid_diagram.tsx`: stores rendered SVG markup, renders the per-diagram export button, and registers/unregisters export data.
- `frontend/src/components/markdown_preview.tsx`: passes export registration callback and stable diagram IDs based on Markdown source offsets.
- `frontend/src/markdown_workspace.tsx`: owns the export registry and toolbar export-all action.
- `frontend/src/App.css`: styles the export button row without disrupting existing Mermaid zoom and error states.
- `frontend/src/components/mermaid_diagram.test.tsx` and `frontend/src/App.test.tsx`: cover per-diagram and export-all behavior.

## Data Flow

1. Mermaid source renders through `mermaid.render`.
2. On success, `MermaidDiagram` stores the SVG markup and registers `{ id, svg, fileName }` with `MarkdownWorkspace`.
3. On render error, unmount, source change, or invalid SVG output, the diagram unregisters its ID.
4. Per-diagram export downloads the stored SVG for that rendered diagram.
5. Toolbar export-all downloads each registered SVG in preview order.

## Error Handling

If no Markdown exists, the existing PDF export behavior remains unchanged. If no valid Mermaid SVGs are currently registered, the SVG export-all button is disabled and no downloads are attempted. Individual diagram export buttons are hidden or disabled unless the diagram has a valid SVG.

## Testing

Vitest tests will verify:

- Successful Mermaid render still mounts the SVG.
- Per-diagram `Export SVG` creates a Blob download with SVG content.
- The toolbar export-all action is disabled when no Mermaid SVGs are available.
- The toolbar export-all action downloads every registered rendered diagram.
