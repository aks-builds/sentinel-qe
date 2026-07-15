from fastapi import APIRouter

router = APIRouter(prefix="/guard", tags=["guard"])


@router.get("/")
def guard_status() -> dict[str, str]:
    return {"module": "guard", "status": "not_implemented"}
