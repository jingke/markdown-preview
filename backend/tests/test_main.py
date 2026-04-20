import asyncio
import io
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile

from app.main import MAX_UPLOAD_BYTES, read_upload_bytes_limited, validate_markdown_filename


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


def test_mermaid_ai_fix_returns_503_when_groq_key_missing(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    response = client.post(
        "/api/mermaid/ai-fix",
        json={
            "chart": "flowchart LR\nA-->B",
            "error_message": "test error",
            "attempt_index": 0,
        },
    )
    assert response.status_code == 503
    assert "Groq API key" in response.json()["detail"]


def test_mermaid_ai_fix_uses_key_from_request_body_when_env_unset(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "flowchart LR\n  X --> Y"}}]
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    with patch("app.main.httpx.AsyncClient") as mock_ac:
        mock_ac.return_value.__aenter__.return_value = mock_client
        mock_ac.return_value.__aexit__.return_value = None
        response = client.post(
            "/api/mermaid/ai-fix",
            json={
                "chart": "flowchart LR\nA-->B",
                "error_message": "e",
                "attempt_index": 0,
                "groq_api_key": "from-body",
                "groq_model": "custom-model-id",
            },
        )
    assert response.status_code == 200
    assert response.json() == {"fixed_chart": "flowchart LR\n  X --> Y"}
    call_kw = mock_client.post.call_args
    assert call_kw is not None
    sent_payload: dict = call_kw[1]["json"]
    assert sent_payload["model"] == "custom-model-id"
    sent_headers: dict[str, str] = call_kw[1]["headers"]
    assert sent_headers["Authorization"] == "Bearer from-body"


def test_mermaid_ai_fix_returns_fixed_chart_when_groq_succeeds(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [{"message": {"content": "flowchart LR\n  A --> B"}}]
    }
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    with patch("app.main.httpx.AsyncClient") as mock_ac:
        mock_ac.return_value.__aenter__.return_value = mock_client
        mock_ac.return_value.__aexit__.return_value = None
        response = client.post(
            "/api/mermaid/ai-fix",
            json={
                "chart": "flowchart bad",
                "error_message": "parse error",
                "attempt_index": 0,
            },
        )
    assert response.status_code == 200
    assert response.json() == {"fixed_chart": "flowchart LR\n  A --> B"}


def test_mermaid_ai_fix_rejects_oversized_chart(client: TestClient) -> None:
    huge: str = "x" * (33_000)
    response = client.post(
        "/api/mermaid/ai-fix",
        json={"chart": huge, "error_message": "e"},
    )
    assert response.status_code == 400
    assert "large" in response.json()["detail"].lower()


def test_read_upload_bytes_limited_accepts_exact_max() -> None:
    async def run() -> None:
        data: bytes = b"y" * MAX_UPLOAD_BYTES
        upload = UploadFile(io.BytesIO(data), filename="ok.md")
        raw: bytes = await read_upload_bytes_limited(upload, MAX_UPLOAD_BYTES)
        assert len(raw) == MAX_UPLOAD_BYTES

    asyncio.run(run())


def test_read_upload_bytes_limited_rejects_over_max() -> None:
    async def run() -> None:
        data: bytes = b"z" * (MAX_UPLOAD_BYTES + 1)
        upload = UploadFile(io.BytesIO(data), filename="big.md")
        with pytest.raises(HTTPException) as exc_info:
            await read_upload_bytes_limited(upload, MAX_UPLOAD_BYTES)
        assert exc_info.value.status_code == 413

    asyncio.run(run())
