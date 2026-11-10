"""Live audit L6 (_security/live.md): an id past SQLite's 64-bit range is a
client error (422), not a 500."""
import pytest

HUGE = "99999999999999999999"


@pytest.mark.parametrize("url", [
    f"/api/v1/contracts/{HUGE}",
    f"/api/v1/vendors/{HUGE}",
    f"/api/v1/institutions/{HUGE}",
    f"/api/v1/contracts?vendor_id={HUGE}",
])
def test_oversized_int_is_422(client, url):
    assert client.get(url).status_code == 422
