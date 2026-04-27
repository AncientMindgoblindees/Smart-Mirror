from backend.api import health


def test_health_route_returns_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_d1_reports_unconfigured_when_env_missing(client, monkeypatch):
    monkeypatch.setattr(health.config, "D1_WORKER_URL", "")
    monkeypatch.setattr(health.config, "MIRROR_SYNC_TOKEN", "")

    response = client.get("/api/health/d1")

    assert response.status_code == 200
    assert response.json()["d1_configured"] is False
    assert response.json()["ok"] is False


def test_health_d1_returns_mocked_worker_success(client, monkeypatch):
    class FakeResponse:
        status_code = 200
        text = "ok"

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url, headers):
            assert url == "https://worker.example/health"
            assert headers == {"Authorization": "Bearer test-token"}
            return FakeResponse()

    monkeypatch.setattr(health.config, "D1_WORKER_URL", "https://worker.example")
    monkeypatch.setattr(health.config, "MIRROR_SYNC_TOKEN", "test-token")
    monkeypatch.setattr(health.httpx, "AsyncClient", FakeAsyncClient)

    response = client.get("/api/health/d1")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["status_code"] == 200
    assert response.json()["worker_host"] == "worker.example"

