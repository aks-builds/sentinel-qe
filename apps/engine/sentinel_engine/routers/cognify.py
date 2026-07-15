from fastapi import APIRouter

router = APIRouter(prefix="/cognify", tags=["cognify"])


@router.get("/")
def cognify_status() -> dict[str, str]:
    return {"module": "cognify", "status": "not_implemented"}
