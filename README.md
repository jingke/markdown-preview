# markdown-preview

Upload and display Markdown files with embedded [Mermaid](https://mermaid.js.org/) diagrams.

- **Frontend**: React, TypeScript, Vite — [`react-markdown`](https://github.com/remarkjs/react-markdown) with [GFM](https://github.com/remarkjs/remark-gfm), [`mermaid`](https://github.com/mermaid-js/mermaid), [`github-markdown-css`](https://github.com/sindresorhus/github-markdown-css).
- **Backend**: FastAPI — `GET /health`, `POST /api/preview/upload` (multipart field `file`, `.md` / `.markdown`, max 5 MB, UTF-8).

## Prerequisites

- Python 3.10+ with `venv`
- Node.js 24 (e.g. `nvm use 24`)

## Run locally

### 1. Backend

```bash
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate   # Windows: ..\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Optional: set `FRONTEND_ORIGIN` if the UI is not on `http://localhost:5173` (CORS adds this origin automatically).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`). The dev server proxies `/api` and `/health` to `http://127.0.0.1:8000`.

Use **Choose .md file** to upload a Markdown file. If the API is down, the app still previews the file locally and shows a short notice.

## Tests

### Backend (pytest)

From the repository root (with the virtualenv activated):

```bash
pip install -r backend/requirements-dev.txt
cd backend
pytest
```

### Frontend (Vitest)

```bash
cd frontend
npm test
```

Use `npm run test:watch` for watch mode.

## API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `GET` | `/health` | Liveness JSON: `{ "status": "ok" }` |
| `POST` | `/api/preview/upload` | Form field `file`: `.md` / `.markdown`, UTF-8, max 5 MB. Response: `{ "content": "..." }` |

## Sample Markdown with Mermaid

Save as `example.md` and open it in the app:

````markdown
# Diagram example

```mermaid
flowchart LR
  A[Markdown] --> B[Preview]
  B --> C[Mermaid]
```
````

GFM tables and task lists are supported via `remark-gfm`.

## Production build (frontend)

```bash
cd frontend
npm run build
```

Serve the `frontend/dist` static files with any static host; configure that host to proxy `/api` and `/health` to your FastAPI process, or run the API behind the same origin.
