from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def get_notifications():
    return {"message": "Get notifications endpoint - to be implemented"}


@router.post("/settings")
async def update_notification_settings():
    return {"message": "Update notification settings - to be implemented"}