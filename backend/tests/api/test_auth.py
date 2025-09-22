import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_endpoint(client: AsyncClient):
    """Test user registration endpoint."""
    response = await client.post("/api/v1/auth/register")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data


@pytest.mark.asyncio
async def test_login_endpoint(client: AsyncClient):
    """Test user login endpoint."""
    response = await client.post("/api/v1/auth/login")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data