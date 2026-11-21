"""API tests. A fake converter script stands in for pdf2docx, so these run
without the conversion library: pip install fastapi python-multipart pytest httpx
"""
import importlib
import sys
import textwrap
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

FRONTEND = "https://toolvault.aftabjordan1.workers.dev"
PDF = b"%PDF-1.4\n%fake test file\n"

FAKE_CONVERTERS = {
    "ok": "open(sys.argv[2], 'wb').write(b'docx-bytes')",
    "slow": "import time; time.sleep(30)",
    "encrypted": "print('ValueError: document is encrypted', file=sys.stderr); sys.exit(1)",
    "broken": "print('RuntimeError: bad xref table', file=sys.stderr); sys.exit(1)",
    "empty": "open(sys.argv[2], 'wb').close()",
}


def load_main(monkeypatch, **env):
    for key in ("ALLOWED_ORIGINS", "MAX_UPLOAD_MB", "CONVERSION_TIMEOUT_SECONDS", "MAX_CONCURRENT_CONVERSIONS"):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    sys.modules.pop("main", None)
    return importlib.import_module("main")


def use_fake_converter(monkeypatch, main, tmp_path, kind):
    script = tmp_path / f"fake_{kind}.py"
    script.write_text("import sys\n" + textwrap.dedent(FAKE_CONVERTERS[kind]) + "\n")
    monkeypatch.setattr(main, "CONVERTER_SCRIPT", str(script))


def upload(client, data=PDF, name="report.pdf"):
    return client.post("/api/convert", files={"file": (name, data, "application/pdf")}, headers={"Origin": FRONTEND})


def preflight(client, origin):
    return client.options("/api/convert", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})


# --- CORS -------------------------------------------------------------------

def test_cors_defaults_to_toolvault_frontend(monkeypatch):
    main = load_main(monkeypatch)
    client = TestClient(main.app)
    assert main.APP_ORIGINS == [FRONTEND]
    assert preflight(client, FRONTEND).headers["access-control-allow-origin"] == FRONTEND
    rejected = preflight(client, "https://other.example")
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_cors_reads_comma_separated_origins(monkeypatch):
    main = load_main(monkeypatch, ALLOWED_ORIGINS="https://a.example/, https://b.example")
    assert main.APP_ORIGINS == ["https://a.example", "https://b.example"]
    client = TestClient(main.app)
    assert preflight(client, "https://b.example").headers["access-control-allow-origin"] == "https://b.example"
    assert preflight(client, FRONTEND).status_code == 400


def test_cors_wildcard_only_when_explicit(monkeypatch):
    assert load_main(monkeypatch, ALLOWED_ORIGINS="*").APP_ORIGINS == ["*"]
    assert load_main(monkeypatch, ALLOWED_ORIGINS="   ").APP_ORIGINS == [FRONTEND]


# --- Conversion -------------------------------------------------------------

def test_successful_conversion_returns_docx(monkeypatch, tmp_path):
    main = load_main(monkeypatch)
    use_fake_converter(monkeypatch, main, tmp_path, "ok")
    response = upload(TestClient(main.app))
    assert response.status_code == 200
    assert response.content == b"docx-bytes"
    assert 'filename="report.docx"' in response.headers["content-disposition"]
    assert response.headers["access-control-allow-origin"] == FRONTEND


@pytest.mark.parametrize("name,data,status", [
    ("notes.txt", PDF, 400),
    ("empty.pdf", b"", 400),
    ("fake.pdf", b"hello world", 400),
])
def test_rejects_invalid_uploads(monkeypatch, tmp_path, name, data, status):
    main = load_main(monkeypatch)
    use_fake_converter(monkeypatch, main, tmp_path, "ok")
    assert upload(TestClient(main.app), data=data, name=name).status_code == status


def test_rejects_oversized_upload(monkeypatch, tmp_path):
    main = load_main(monkeypatch, MAX_UPLOAD_MB="1")
    use_fake_converter(monkeypatch, main, tmp_path, "ok")
    response = upload(TestClient(main.app), data=PDF + b"0" * (1024 * 1024))
    assert response.status_code == 413


def test_slow_conversion_is_killed_with_504(monkeypatch, tmp_path):
    main = load_main(monkeypatch, CONVERSION_TIMEOUT_SECONDS="1")
    use_fake_converter(monkeypatch, main, tmp_path, "slow")
    response = upload(TestClient(main.app))
    assert response.status_code == 504
    assert "1 seconds" in response.json()["detail"]


@pytest.mark.parametrize("kind,text", [
    ("encrypted", "password-protected"),
    ("broken", "Conversion failed"),
    ("empty", "No Word document"),
])
def test_conversion_failures_return_422(monkeypatch, tmp_path, kind, text):
    main = load_main(monkeypatch)
    use_fake_converter(monkeypatch, main, tmp_path, kind)
    response = upload(TestClient(main.app))
    assert response.status_code == 422
    assert text in response.json()["detail"]


def test_busy_converter_returns_503(monkeypatch, tmp_path):
    main = load_main(monkeypatch)
    use_fake_converter(monkeypatch, main, tmp_path, "ok")

    class FullSlots:
        def locked(self):
            return True

    monkeypatch.setattr(main, "conversion_slots", FullSlots())
    response = upload(TestClient(main.app))
    assert response.status_code == 503
    assert response.headers["retry-after"] == "30"
    assert response.headers["access-control-allow-origin"] == FRONTEND


def test_invalid_numeric_settings_fall_back_to_defaults(monkeypatch):
    main = load_main(monkeypatch, MAX_UPLOAD_MB="lots", CONVERSION_TIMEOUT_SECONDS="0")
    assert main.MAX_UPLOAD_BYTES == 25 * 1024 * 1024
    assert main.CONVERSION_TIMEOUT_SECONDS == 90
