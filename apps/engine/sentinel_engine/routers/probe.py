from fastapi import APIRouter

router = APIRouter(prefix="/probe", tags=["probe"])


@router.get("/")
def probe_status() -> dict[str, str]:
    return {"module": "probe", "status": "not_implemented"}
