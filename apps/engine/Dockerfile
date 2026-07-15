FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir poetry==2.4.1 \
    && poetry config virtualenvs.create false

COPY pyproject.toml poetry.lock ./
RUN poetry install --no-root --without dev

COPY sentinel_engine ./sentinel_engine

EXPOSE 8000

CMD ["uvicorn", "sentinel_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
