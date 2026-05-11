# Mermaid SVG Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-diagram and export-all SVG downloads for successfully rendered Mermaid diagrams.

**Architecture:** Keep SVG export data close to the existing Mermaid renderer, then register it with the workspace for toolbar-level export. Use browser-native Blob downloads and avoid new dependencies.

**Tech Stack:** React 19, TypeScript, Vite, Mermaid 11, Vitest, Testing Library.

---

## File Structure

- Modify `frontend/src/components/mermaid_diagram.tsx` to add SVG download helpers, export state, per-diagram button, and registration lifecycle.
- Modify `frontend/src/components/markdown_preview.tsx` to pass stable diagram export IDs and a registration callback.
- Modify `frontend/src/markdown_workspace.tsx` to maintain registered SVG exports and add the export-all toolbar button.
- Modify `frontend/src/App.css` to style Mermaid export actions.
- Modify `frontend/src/components/mermaid_diagram.test.tsx` for per-diagram export coverage.
- Modify `frontend/src/App.test.tsx` for toolbar export-all coverage.

---

### Task 1: Per-Diagram SVG Export

**Files:**
- Modify: `frontend/src/components/mermaid_diagram.tsx`
- Test: `frontend/src/components/mermaid_diagram.test.tsx`

- [ ] **Step 1: Write a failing test**

Add a test that renders a Mermaid diagram, clicks `Export SVG`, and verifies `Blob` and `URL.createObjectURL` are called with SVG content.

- [ ] **Step 2: Implement download helpers and button**

Add a typed export record, keep the successful `mermaid.render` SVG string in state, and add an `Export SVG` button that calls a helper using `Blob`, `URL.createObjectURL`, a temporary anchor, and `URL.revokeObjectURL`.

- [ ] **Step 3: Run focused test**

Run `nvm use 24 && npm test -- --run frontend/src/components/mermaid_diagram.test.tsx` from `frontend`.

---

### Task 2: Export-All Registry

**Files:**
- Modify: `frontend/src/components/markdown_preview.tsx`
- Modify: `frontend/src/markdown_workspace.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write a failing workspace test**

Add coverage showing `Export Mermaid SVGs` is disabled when there are no rendered Mermaid diagrams and downloads every registered SVG when diagrams render successfully.

- [ ] **Step 2: Wire registration through preview**

Add a callback prop to `MarkdownPreview` and pass a stable diagram ID from the Mermaid code block source offset to `MermaidDiagram`.

- [ ] **Step 3: Add workspace export-all state**

Store registered Mermaid SVGs in `MarkdownWorkspace`, clear them when Markdown changes, and add a toolbar button that downloads each SVG with a stable filename.

- [ ] **Step 4: Run focused tests**

Run `nvm use 24 && npm test -- --run frontend/src/App.test.tsx frontend/src/components/mermaid_diagram.test.tsx` from `frontend`.

---

### Task 3: Styling And Verification

**Files:**
- Modify: `frontend/src/App.css`
- Possibly modify: `README.md`

- [ ] **Step 1: Style action row**

Add lightweight styles for Mermaid export actions so they fit the existing `file-button` style and do not interfere with error states or zoom layout.

- [ ] **Step 2: Run lint and build**

Run `nvm use 24 && npm run lint && npm run build` from `frontend`.

- [ ] **Step 3: Update docs only if needed**

If behavior is user-visible enough for README, add a short note under the usage section.

---

## Self-Review

The plan covers all spec requirements: per-diagram export, export-all export, failed-render exclusion, native download behavior, and focused frontend tests. No zip dependency or backend change is included.
