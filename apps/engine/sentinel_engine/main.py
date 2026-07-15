from fastapi import FastAPI

from sentinel_engine.routers import cognify, guard, mirror, probe, reach

app = FastAPI(title="Sentinel Engine")

app.include_router(probe.router)
app.include_router(mirror.router)
app.include_router(guard.router)
app.include_router(cognify.router)
app.include_router(reach.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
