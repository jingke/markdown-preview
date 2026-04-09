import io

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import MAX_UPLOAD_BYTES, validate_markdown_filename


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_upload_valid_markdown(client: TestClient) -> None:
    response = client.post(
        "/api/preview/upload",
        files={"file": ("notes.md", io.BytesIO(b"# Title\n\nHello"), "text/markdown")},
    )
    assert response.status_code == 200
    assert response.json() == {"content": "# Title\n\nHello"}


def test_upload_markdown_uppercase_extension(client: TestClient) -> None:
    response = client.post(
        "/api/preview/upload",
        files={"file": ("README.MD", io.BytesIO(b"ok"), "text/plain")},
    )
    assert response.status_code == 200
    assert response.json() == {"content": "ok"}


def test_upload_rejects_non_markdown_extension(client: TestClient) -> None:
    response = client.post(
        "/api/preview/upload",
        files={"file": ("notes.txt", io.BytesIO(b"# hi"), "text/plain")},
    )
    assert response.status_code == 400
    assert "extension" in response.json()["detail"].lower()


def test_upload_rejects_oversized_file(client: TestClient) -> None:
    payload: bytes = b"x" * (MAX_UPLOAD_BYTES + 1)
    response = client.post(
        "/api/preview/upload",
        files={"file": ("big.md", io.BytesIO(payload), "text/markdown")},
    )
    assert response.status_code == 413
    assert "large" in response.json()["detail"].lower()


def test_upload_rejects_invalid_utf8(client: TestClient) -> None:
    response = client.post(
        "/api/preview/upload",
        files={"file": ("bad.md", io.BytesIO(b"\xff\xfe\x00"), "text/markdown")},
    )
    assert response.status_code == 400
    assert "utf-8" in response.json()["detail"].lower()


def test_upload_missing_file_field(client: TestClient) -> None:
    response = client.post("/api/preview/upload")
    assert response.status_code == 422


def test_validate_markdown_filename_accepts_dot_markdown() -> None:
    validate_markdown_filename("doc.markdown")


def test_validate_markdown_filename_rejects_pdf() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_markdown_filename("x.pdf")
    assert exc_info.value.status_code == 400


def test_openapi_docs_available(client: TestClient) -> None:
    response = client.get("/docs")
    assert response.status_code == 200
