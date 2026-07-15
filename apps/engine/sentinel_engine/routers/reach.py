from fastapi import APIRouter

router = APIRouter(prefix="/reach", tags=["reach"])


@router.get("/")
def reach_status() -> dict[str, str]:
    return {"module": "reach", "status": "not_implemented"}
