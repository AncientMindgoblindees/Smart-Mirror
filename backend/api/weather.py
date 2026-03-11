from fastapi import APIRouter

from backend.schemas.weather import WeatherCurrentOut
from backend.services import weather_service


router = APIRouter(prefix="/weather", tags=["weather"])


@router.get(
    "/current",
    response_model=WeatherCurrentOut,
    summary="Get current weather",
)
async def get_current_weather() -> WeatherCurrentOut:
    return await weather_service.get_current_weather()
