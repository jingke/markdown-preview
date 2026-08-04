"""Durable Markdown uploads: SQLite metadata + files on disk under a configurable root."""

from __future__ import annotations

import os
import re
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


def get_document_store_root() -> Path:
    env_path: str | None = os.environ.get("DOCUMENT_STORE_ROOT")
    if env_path and env_path.strip():
        return Path(env_path).expanduser().resolve()
    return (Path(__file__).resolve().parent.parent / "data").resolve()


def _db_path(root: Path) -> Path:
    return root / "documents.sqlite3"


def _files_dir(root: Path) -> Path:
    return root / "files"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sanitize_original_filename(filename: str) -> str:
    base: str = os.path.basename(filename.strip())
    if not base or base in (".", ".."):
        raise ValueError("Invalid filename")
    if any(ord(c) < 32 for c in base):
        raise ValueError("Filename contains control characters")
    if len(base) > 255:
        base = base[:255]
    return base


_DOCUMENT_ID_PATTERN: re.Pattern[str] = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
)


def is_valid_document_id(doc_id: str) -> bool:
    return bool(_DOCUMENT_ID_PATTERN.match(doc_id))


def init_document_store(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    files_dir: Path = _files_dir(root)
    files_dir.mkdir(parents=True, exist_ok=True)
    conn: sqlite3.Connection = sqlite3.connect(_db_path(root))
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY NOT NULL,
                original_filename TEXT NOT NULL,
                bytes_size INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                blob_relpath TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


@dataclass(frozen=True)
class SavedDocument:
    id: str
    filename: str
    size_bytes: int
    created_at: str


@dataclass(frozen=True)
class DocumentSummary:
    id: str
    filename: str
    size_bytes: int
    created_at: str


@dataclass(frozen=True)
class DocumentWithContent:
    id: str
    filename: str
    size_bytes: int
    created_at: str
    content: str


def save_markdown_documents(
    root: Path,
    items: list[tuple[str, str]],
) -> list[SavedDocument]:
    if not items:
        return []
    init_document_store(root)
    files_dir: Path = _files_dir(root)
    out: list[SavedDocument] = []
    conn: sqlite3.Connection = sqlite3.connect(_db_path(root))
    try:
        for original_name, utf8_text in items:
            safe_name: str = sanitize_original_filename(original_name)
            body: bytes = utf8_text.encode("utf-8")
            doc_id: str = str(uuid.uuid4())
            rel_path: str = f"files/{doc_id}.md"
            abs_path: Path = root / rel_path
            tmp_path: Path = abs_path.with_suffix(abs_path.suffix + ".tmp")
            tmp_path.write_bytes(body)
            tmp_path.replace(abs_path)
            created: str = _utc_now_iso()
            conn.execute(
                """
                INSERT INTO documents (id, original_filename, bytes_size, created_at, blob_relpath)
                VALUES (?, ?, ?, ?, ?)
                """,
                (doc_id, safe_name, len(body), created, rel_path),
            )
            out.append(
                SavedDocument(
                    id=doc_id,
                    filename=safe_name,
                    size_bytes=len(body),
                    created_at=created,
                ),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return out


def list_documents(root: Path) -> list[DocumentSummary]:
    if not _db_path(root).is_file():
        return []
    conn: sqlite3.Connection = sqlite3.connect(_db_path(root))
    try:
        rows = conn.execute(
            """
            SELECT id, original_filename, bytes_size, created_at
            FROM documents
            ORDER BY created_at DESC
            """
        ).fetchall()
    finally:
        conn.close()
    return [
        DocumentSummary(
            id=str(r[0]),
            filename=str(r[1]),
            size_bytes=int(r[2]),
            created_at=str(r[3]),
        )
        for r in rows
    ]


def get_document(root: Path, doc_id: str) -> DocumentWithContent | None:
    if not is_valid_document_id(doc_id):
        return None
    if not _db_path(root).is_file():
        return None
    conn: sqlite3.Connection = sqlite3.connect(_db_path(root))
    try:
        row = conn.execute(
            """
            SELECT id, original_filename, bytes_size, created_at, blob_relpath
            FROM documents WHERE id = ?
            """,
            (doc_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    rel_blob: str = str(row[4])
    if not re.match(r"^files/[0-9a-f-]{36}\.md$", rel_blob):
        return None
    abs_blob: Path = (root / rel_blob).resolve()
    expected_prefix: Path = _files_dir(root).resolve()
    try:
        abs_blob.relative_to(expected_prefix)
    except ValueError:
        return None
    if not abs_blob.is_file():
        return None
    raw: bytes = abs_blob.read_bytes()
    try:
        text: str = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return DocumentWithContent(
        id=str(row[0]),
        filename=str(row[1]),
        size_bytes=int(row[2]),
        created_at=str(row[3]),
        content=text,
    )


def delete_document(root: Path, doc_id: str) -> bool:
    if not is_valid_document_id(doc_id):
        return False
    if not _db_path(root).is_file():
        return False
    conn: sqlite3.Connection = sqlite3.connect(_db_path(root))
    rel_blob: str | None = None
    try:
        row = conn.execute(
            "SELECT blob_relpath FROM documents WHERE id = ?",
            (doc_id,),
        ).fetchone()
        if row is None:
            return False
        rel_blob = str(row[0])
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    if rel_blob and re.match(r"^files/[0-9a-f-]{36}\.md$", rel_blob):
        path: Path = (root / rel_blob).resolve()
        if path.is_file() and path.parent.resolve() == _files_dir(root).resolve():
            path.unlink(missing_ok=True)
    return True
