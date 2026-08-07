import io

import pytest
from fastapi.testclient import TestClient


def test_documents_save_list_get_delete(client: TestClient) -> None:
    save = client.post(
        "/api/documents/uploads",
        files=[
            ("files", ("a.md", io.BytesIO(b"# A"), "text/markdown")),
            ("files", ("b.md", io.BytesIO(b"# B"), "text/markdown")),
        ],
    )
    assert save.status_code == 200
    payload = save.json()
    assert len(payload["saved"]) == 2
    doc_id: str = payload["saved"][0]["id"]
    assert payload["saved"][0]["filename"] == "a.md"
    assert payload["saved"][0]["size_bytes"] == 3
    lst = client.get("/api/documents")
    assert lst.status_code == 200
    docs = lst.json()["documents"]
    assert len(docs) == 2
    got = client.get(f"/api/documents/{doc_id}")
    assert got.status_code == 200
    assert got.json()["content"] == "# A"
    assert got.json()["filename"] == "a.md"
    deleted = client.delete(f"/api/documents/{doc_id}")
    assert deleted.status_code == 204
    missing = client.get(f"/api/documents/{doc_id}")
    assert missing.status_code == 404


def test_documents_get_unknown_returns_404(client: TestClient) -> None:
    r = client.get("/api/documents/00000000-0000-4000-8000-000000000000")
    assert r.status_code == 404


def test_documents_get_invalid_id_returns_404(client: TestClient) -> None:
    r = client.get("/api/documents/not-a-uuid")
    assert r.status_code == 404


def test_documents_empty_upload_returns_400(client: TestClient) -> None:
    r = client.post("/api/documents/uploads", files=[])
    assert r.status_code == 422
