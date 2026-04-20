import os
import re
from typing import Annotated

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024
READ_CHUNK_BYTES: int = 64 * 1024
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".md", ".markdown"})

MERMAID_AI_MAX_CHART_CHARS: int = 32_000
MERMAID_AI_MAX_RESPONSE_CHARS: int = 32_000
GROQ_CHAT_URL: str = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL: str = "qwen/qwen3-32b"


def strip_mermaid_fence_wrappers(raw: str) -> str:
    text: str = raw.strip()
    if not text.startswith("```"):
        return text
    lines: list[str] = text.split("\n")
    if not lines:
        return text
    first: str = lines[0].strip()
    if first.startswith("```"):
        lines = lines[1:]
    while lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


def normalize_fixed_mermaid(content: str) -> str:
    stripped: str = strip_mermaid_fence_wrappers(content)
    stripped = re.sub(r"^```mermaid\s*", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def get_allowed_origins() -> list[str]:
    frontend_origin: str | None = os.environ.get("FRONTEND_ORIGIN")
    origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    if frontend_origin and frontend_origin not in origins:
        origins.append(frontend_origin)
    return origins


app: FastAPI = FastAPI(title="Markdown Preview API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PreviewResponse(BaseModel):
    content: str


class MermaidAiFixRequest(BaseModel):
    chart: str
    error_message: str
    attempt_index: int = 0
    groq_api_key: str | None = None
    groq_model: str | None = None


class MermaidAiFixResponse(BaseModel):
    fixed_chart: str


async def read_upload_bytes_limited(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total: int = 0
    while True:
        chunk: bytes = await file.read(READ_CHUNK_BYTES)
        if not chunk:
            break
        next_total: int = total + len(chunk)
        if next_total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large (max {max_bytes} bytes)",
            )
        total = next_total
        chunks.append(chunk)
    return b"".join(chunks)


def validate_markdown_filename(filename: str) -> None:
    lower_name: str = filename.lower()
    if not any(lower_name.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"File must have extension {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/mermaid/ai-fix", response_model=MermaidAiFixResponse)
async def mermaid_ai_fix(body: MermaidAiFixRequest) -> MermaidAiFixResponse:
    if len(body.chart) > MERMAID_AI_MAX_CHART_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Chart too large (max {MERMAID_AI_MAX_CHART_CHARS} characters)",
        )
    request_key: str = (body.groq_api_key or "").strip()
    api_key: str | None = request_key or os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "No Groq API key: add it under AI diagram fix on this page, "
                "or set GROQ_API_KEY on the server."
            ),
        )
    request_model: str = (body.groq_model or "").strip()
    model: str = request_model or os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL)
    system_prompt: str = (
        "You fix Mermaid diagram syntax. Reply with ONLY the raw Mermaid diagram text. "
        "No markdown code fences, no backticks, no explanation, no commentary."
    )
    user_prompt: str = (
        f"The diagram failed to render with this error:\n{body.error_message}\n\n"
        f"Attempt number: {body.attempt_index}\n\n"
        f"Original Mermaid source:\n{body.chart}\n\n"
        "Output only corrected Mermaid that should parse in Mermaid.js v11."
    )
    payload: dict = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(GROQ_CHAT_URL, json=payload, headers=headers)
    except httpx.RequestError as err:
        raise HTTPException(
            status_code=502,
            detail="Could not reach the AI service",
        ) from err
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="The AI service returned an error",
        )
    try:
        data: dict = response.json()
        content: str | None = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content")
        )
    except (TypeError, ValueError, IndexError, KeyError) as err:
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from the AI service",
        ) from err
    if content is None or not isinstance(content, str):
        raise HTTPException(
            status_code=502,
            detail="Empty response from the AI service",
        )
    fixed_chart: str = normalize_fixed_mermaid(content)
    if not fixed_chart:
        raise HTTPException(
            status_code=502,
            detail="The AI returned an empty diagram",
        )
    if len(fixed_chart) > MERMAID_AI_MAX_RESPONSE_CHARS:
        raise HTTPException(
            status_code=502,
            detail="The AI returned a diagram that is too large",
        )
    return MermaidAiFixResponse(fixed_chart=fixed_chart)


@app.post("/api/preview/upload", response_model=PreviewResponse)
async def preview_upload(
    file: Annotated[UploadFile, File(description="Markdown file to preview")],
) -> PreviewResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    validate_markdown_filename(file.filename)
    raw: bytes = await read_upload_bytes_limited(file, MAX_UPLOAD_BYTES)
    try:
        content: str = raw.decode("utf-8")
    except UnicodeDecodeError as err:
        raise HTTPException(
            status_code=400,
            detail="File must be valid UTF-8",
        ) from err
    return PreviewResponse(content=content)
