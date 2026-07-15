from fastapi import FastAPI

app = FastAPI(title="Sentinel Engine")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
