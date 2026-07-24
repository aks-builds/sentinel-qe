from fastapi import APIRouter
from pydantic import BaseModel

from sentinel_engine.guard.attacks import load_attack_library

router = APIRouter(prefix="/guard", tags=["guard"])


@router.get("/")
def guard_status() -> dict[str, str]:
    return {"module": "guard", "status": "not_implemented"}


class AttackResponse(BaseModel):
    id: str
    category: str
    name: str
    prompt: str


@router.get("/attacks", response_model=list[AttackResponse])
def list_attacks() -> list[AttackResponse]:
    return [
        AttackResponse(id=attack.id, category=attack.category, name=attack.name, prompt=attack.prompt)
        for attack in load_attack_library()
    ]
