import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_endpoint(client: AsyncClient):
    """Register a new user and validate response."""
    payload = {
        "email": "testuser@example.com",
        "full_name": "Test User",
        "password": "Passw0rdA"
    }
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == payload["email"]
    assert data["full_name"] == payload["full_name"]
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_login_endpoint(client: AsyncClient):
    """Login with existing user and check token shape."""
    # Ensure user exists
    await client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "full_name": "Login User", "password": "Passw0rdA"}
    )

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "Passw0rdA"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data and "refresh_token" in data
    assert data.get("token_type") == "bearer"
