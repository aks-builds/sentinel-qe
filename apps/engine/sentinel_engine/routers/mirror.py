from fastapi import APIRouter

router = APIRouter(prefix="/mirror", tags=["mirror"])


@router.get("/")
def mirror_status() -> dict[str, str]:
    return {"module": "mirror", "status": "not_implemented"}
