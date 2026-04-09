import os
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({".md", ".markdown"})


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


@app.post("/api/preview/upload", response_model=PreviewResponse)
async def preview_upload(
    file: Annotated[UploadFile, File(description="Markdown file to preview")],
) -> PreviewResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    validate_markdown_filename(file.filename)
    raw: bytes = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {MAX_UPLOAD_BYTES} bytes)",
        )
    try:
        content: str = raw.decode("utf-8")
    except UnicodeDecodeError as err:
        raise HTTPException(
            status_code=400,
            detail="File must be valid UTF-8",
        ) from err
    return PreviewResponse(content=content)
