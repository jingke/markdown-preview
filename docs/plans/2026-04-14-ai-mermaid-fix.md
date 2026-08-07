# AI Mermaid Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use @superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a Mermaid diagram fails to render in the preview, show an inline error strip with **Fix with AI** that calls a FastAPI backend (Groq, BYOK via `GROQ_API_KEY`), verifies fixes with `mermaid.render` before writing Markdown, supports a bounded retry loop, stale-response guards, a one-shot **Undo** via a preview banner, and post-fix editor focus when the source panel is visible.

**Architecture:** React 19 + Vite frontend calls `POST /api/mermaid/ai-fix` (proxied to FastAPI). The backend forwards to Groq’s OpenAI-compatible chat completions API and returns trimmed Mermaid text only. The client runs an off-DOM `mermaid.render` to validate before `setMarkdown` replaces the fenced block using **unist source offsets** from react-markdown’s `node.position`. Revert state lives in `App` and is cleared on manual edit, dismiss, undo, or file load.

**Tech Stack:** React 19, TypeScript, Vite, react-markdown 10, Mermaid 11, Vitest; FastAPI, Pydantic 2, httpx (async), pytest, Starlette TestClient.

**Reference docs (repo):** [`.cursor/plans/ai_mermaid_fix_button_49263dad.plan.md`](../../.cursor/plans/ai_mermaid_fix_button_49263dad.plan.md) (design mirror).

---

## Prerequisites

- **Node:** 24 (`nvm use 24`) for all `npm` commands.
- **Python:** 3.11+ with a venv for the backend (match whatever the project already uses).
- **Environment:** `GROQ_API_KEY` set when running the API server (get a key from [Groq Console](https://console.groq.com/)); never put this in `VITE_*`.

---

### Task 1: Backend — add httpx and failing tests for `/api/mermaid/ai-fix`

**Files:**

- Modify: [`backend/requirements.txt`](../../backend/requirements.txt) — add pinned `httpx` (match resolver style of existing pins, e.g. `httpx==0.28.1` or current stable).
- Modify: [`backend/tests/test_main.py`](../../backend/tests/test_main.py)
- Later modify: [`backend/app/main.py`](../../backend/app/main.py)

**Step 1: Add dependency**

Add one line for `httpx` with a pinned version next to other deps.

**Step 2: Write failing tests**

Add tests that **do not** call the real Groq API:

1. `test_mermaid_ai_fix_returns_503_when_groq_key_missing` — `monkeypatch.delenv("GROQ_API_KEY", raising=False)` or ensure unset, `POST /api/mermaid/ai-fix` with JSON body `{"chart": "flowchart LR\\nA-->B", "error_message": "x", "attempt_index": 0}`, expect `503` and string `detail` mentioning configuration/key.

2. `test_mermaid_ai_fix_returns_fixed_chart_when_groq_succeeds` — patch `httpx.AsyncClient` (or `main.call_groq` if you extract it) to return a minimal valid Groq JSON body:

```json
{
  "choices": [
    {
      "message": {
        "content": "flowchart LR\\n  A --> B"
      }
    }
  ]
}
```

Expect `200` and `{"fixed_chart": "flowchart LR\\n  A --> B"}` (exact match after any server-side trim).

**Step 3: Run tests — expect FAIL**

```bash
cd /home/alexw/code/markdown-preview/backend && pip install -r requirements.txt && pytest tests/test_main.py -k mermaid_ai -v
```

Expected: **FAIL** — route missing or import error.

**Step 4: Commit (after Task 2 implements route)**

```bash
git add backend/requirements.txt backend/tests/test_main.py backend/app/main.py
git commit -m "feat(api): add mermaid AI fix endpoint and tests"
```

---

### Task 2: Backend — implement `POST /api/mermaid/ai-fix`

**Files:**

- Modify: [`backend/app/main.py`](../../backend/app/main.py)

**Constants (top-level or near route):**

- `MERMAID_AI_MAX_CHART_CHARS: int = 32_000`
- `GROQ_CHAT_URL: str = "https://api.groq.com/openai/v1/chat/completions"`
- Default model env: `GROQ_MODEL` defaulting to `llama-3.1-8b-instant` (or current Groq-recommended small model).

**Models:**

```python
class MermaidAiFixRequest(BaseModel):
    chart: str
    error_message: str
    attempt_index: int = 0

class MermaidAiFixResponse(BaseModel):
    fixed_chart: str
```

**Route behavior:**

1. If `os.environ.get("GROQ_API_KEY")` is falsy → `HTTPException(503, detail="Set GROQ_API_KEY on the server to enable AI diagram fixes.")`
2. If `len(request.chart) > MERMAID_AI_MAX_CHART_CHARS` → `400` with clear detail.
3. Build system + user messages: system = “You output only raw Mermaid diagram text, no markdown fences, no explanation.” User includes `error_message`, `attempt_index`, and `chart`.
4. `async with httpx.AsyncClient(timeout=60.0) as client:` POST to Groq with `Authorization: Bearer …`, `Content-Type: application/json`, body `model`, `messages`, `temperature` low (e.g. `0.2`).
5. On non-200 from Groq: `502` with sanitized detail (no key leak).
6. Parse `choices[0].message.content`; strip optional ` ```mermaid ` fences if present; strip whitespace; reject empty → `502`.
7. If `len(fixed_chart) > MERMAID_AI_MAX_CHART_CHARS` → `502`.

**Step 1: Implement** minimal extraction; keep HTTP call in a small async function for test patching.

**Step 2: Run tests**

```bash
cd /home/alexw/code/markdown-preview/backend && pytest tests/test_main.py -k mermaid_ai -v
```

Expected: **PASS**.

**Step 3: Manual smoke (optional)**

```bash
export GROQ_API_KEY=gsk_...
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
curl -s -X POST http://127.0.0.1:8000/api/mermaid/ai-fix -H 'Content-Type: application/json' -d '{"chart":"flowchart LR\\nA-->B","error_message":"test"}' | jq .
```

---

### Task 3: Frontend — plumb source range and replace callback

**Files:**

- Modify: [`frontend/src/components/markdown_preview.tsx`](../../frontend/src/components/markdown_preview.tsx)
- Modify: [`frontend/src/components/markdown_preview.test.tsx`](../../frontend/src/components/markdown_preview.test.tsx)

**Step 1: Types**

Import `ExtraProps` from `react-markdown`.

Extend props:

```typescript
export interface MarkdownPreviewProps {
  markdown: string
  onMermaidFenceReplace?: (args: {
    sourceRange: { start: number; end: number }
    expectedFence: string
    newInnerDiagram: string
  }) => void
}
```

**Step 2: In `code` component**

For `language === 'mermaid' && !inline`:

- Read `node` from props (`ExtraProps`).
- Compute `sourceRange` from `node?.position?.start?.offset` and `node?.position?.end?.offset`. If either missing, pass `sourceRange: null`.
- `expectedFence` = full fence string: `markdown.slice(start, end)` when range is valid (pass from parent — **parent has `markdown`**). Actually `MarkdownPreview` receives `markdown`; use `props.markdown.slice(start, end)`.

Pass to `MermaidDiagram`:

- `chart={text}`
- `sourceRange={...}`
- `fullMarkdown={markdown}` only if needed for expectedFence — simpler: pass `expectedFence={markdown.slice(start,end)}` when range valid, else `undefined`.

- `onFenceReplaced={onMermaidFenceReplace}` bound from props.

**Step 3: Tests**

Update test to pass mock `onMermaidFenceReplace` if needed; ensure mermaid block still renders.

**Step 4: Run**

```bash
cd /home/alexw/code/markdown-preview/frontend && nvm use 24 && npm test -- --run markdown_preview
```

---

### Task 4: App — replace handler, stale guard, revert banner, editor focus

**Files:**

- Modify: [`frontend/src/App.tsx`](../../frontend/src/App.tsx)
- Possibly add: [`frontend/src/mermaid_fence_replace.ts`](../../frontend/src/mermaid_fence_replace.ts) (optional pure functions for testability)

**Revert state type:**

```typescript
interface MermaidAiRevertState {
  revertRange: { start: number; end: number }
  previousSlice: string
}
```

**Handler `onMermaidFenceReplace`:**

1. If `expectedFence` !== `markdown.slice(sourceRange.start, sourceRange.end)` → **no-op** (stale); optionally `console.warn` in dev only (YAGNI: skip console).
2. Build `newFence`:

```typescript
function buildMermaidFence(inner: string): string {
  return '```mermaid\n' + inner.replace(/\n$/, '') + '\n```'
}
```

3. `const previousSlice = markdown.slice(sourceRange.start, sourceRange.end)`
4. `const nextMarkdown = markdown.slice(0, sourceRange.start) + buildMermaidFence(newInnerDiagram) + markdown.slice(sourceRange.end)`
5. `const newEnd = sourceRange.start + buildMermaidFence(newInnerDiagram).length`
6. `setMarkdown(nextMarkdown)`; `setMermaidAiRevert({ revertRange: { start: sourceRange.start, end: newEnd }, previousSlice })`
7. `requestAnimationFrame` (double if needed per existing scroll helpers): if `isSourceVisible` and `editorRef.current`, `focus()`, `setSelectionRange(sourceRange.start, sourceRange.start)` (caret at **start** of updated fence — fixed policy).

**Banner:** Inside preview `<section>`, **above** `<div className="app-preview-body" ref={previewBodyRef}>`, conditionally render when `mermaidAiRevert !== null`:

- Text: “Diagram source was updated by AI.”
- Button **Undo** → replace `markdown.slice(revertRange.start, revertRange.end)` with `previousSlice` if current slice still equals what we stored as “current fixed” — store `postFixSlice` in state for reliable undo:

**Refined state (recommended):**

```typescript
interface MermaidAiRevertState {
  range: { start: number; end: number }
  previousSlice: string
  postFixSlice: string
}
```

On Undo: if `markdown.slice(range.start, range.end) !== postFixSlice` → clear state (document changed). Else restore `previousSlice`.

**Dismiss:** `setMermaidAiRevert(null)`.

**Clear revert** on: textarea `onChange` (any edit), file upload success, Undo success.

**Step 1: Implement** and wire `MarkdownPreview` prop.

**Step 2: Manual check** in browser with invalid mermaid (after Task 5).

---

### Task 5: `MermaidDiagram` — error UI, AI loop, verify, apply

**Files:**

- Modify: [`frontend/src/components/mermaid_diagram.tsx`](../../frontend/src/components/mermaid_diagram.tsx)
- Modify: [`frontend/src/App.css`](../../frontend/src/App.css)

**Props extension:**

```typescript
export interface MermaidDiagramProps {
  chart: string
  sourceRange: { start: number; end: number } | null
  expectedFence?: string
  onFenceReplaced?: (args: { sourceRange: { start: number; end: number }; expectedFence: string; newInnerDiagram: string }) => void
}
```

**Rendering split:**

- Keep zoom wrapper; when `renderError === null` and SVG mounted, current behavior.
- When error: render **error strip** (role=`alert`, `aria-live="polite"`) instead of raw text in `.mermaid` only — structure per design doc: title, monospace one-line error, **Fix with AI** button (`disabled` + `aria-busy` when loading).

**`useLayoutEffect` for mermaid:** on success set `renderError` null; on catch set `renderError` message string.

**`busyRef`:** prevent double click while async runs.

**`handleFixWithAi`:**

```typescript
const MAX_ATTEMPTS = 3
let errorMsg = renderError ?? ''
let chartIn = chart
for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const res = await fetch('/api/mermaid/ai-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chart: chartIn, error_message: errorMsg, attempt_index: attempt }) })
  if (res.status === 503) { setInlineConfigError(...); return }
  if (!res.ok) { setFetchError(...); return }
  const { fixed_chart } = await res.json()
  const verifyId = `mmd-verify-${reactId}-${attempt}`
  const el = document.createElement('div')
  try {
    await mermaid.render(verifyId, fixed_chart, el)
    // success — commit
    if (!onFenceReplaced || !sourceRange || expectedFence === undefined) return
    onFenceReplaced({ sourceRange, expectedFence, newInnerDiagram: fixed_chart })
    return
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e)
    chartIn = fixed_chart
  }
}
setLoopExhausted(true)
```

Adjust: on success, clear local error state so parent re-render shows diagram.

**Step 1: Implement** components + CSS classes (e.g. `.mermaid-error-strip`, `.mermaid-ai-button` mirroring `.file-button`).

**Step 2: Tests** in Task 6.

---

### Task 6: Frontend tests and CSS

**Files:**

- Modify: [`frontend/src/components/mermaid_diagram.test.tsx`](../../frontend/src/components/mermaid_diagram.test.tsx)
- Modify: [`frontend/src/App.test.tsx`](../../frontend/src/App.test.tsx) if banner affects a11y queries

**Tests:**

1. When `mermaid.render` rejects, error strip shows and **Fix with AI** is present (if `onFenceReplaced` + range provided).
2. Mock `fetch` to resolve with `{ fixed_chart: 'flowchart LR\n A-->B' }`; mock `mermaid.render` to succeed on first call; assert `onFenceReplaced` called with expected args.

**Run:**

```bash
cd /home/alexw/code/markdown-preview/frontend && nvm use 24 && npm test -- --run
npm run build
```

---

### Task 7: Final verification

```bash
cd /home/alexw/code/markdown-preview/backend && pytest
cd /home/alexw/code/markdown-preview/frontend && nvm use 24 && npm test -- --run && npm run build
```

**Manual:** Start backend + `npm run dev`, paste broken Mermaid, click Fix with AI, confirm source updates, banner Undo/Dismiss, second diagram still independent.

---

## Execution handoff

Plan complete and saved to [`docs/plans/2026-04-14-ai-mermaid-fix.md`](2026-04-14-ai-mermaid-fix.md).

**Two execution options:**

1. **Subagent-driven (this session)** — Dispatch a fresh subagent per task, review between tasks. **REQUIRED SUB-SKILL:** @superpowers:subagent-driven-development  
2. **Parallel session** — Open a new session with **@superpowers:executing-plans** and run task-by-task with checkpoints.

**Which approach?**
