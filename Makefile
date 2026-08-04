.PHONY: install dev dev-web dev-api build docker-up docker-down rebuild lint format

install:
	cd frontend && npm install
	cd backend && uv lock && uv sync

dev:
	cd frontend && npm run dev

dev-api:
	cd backend && uv run uvicorn app.main:app --app-dir src/api --reload --port 8000

build:
	cd frontend && npm run build

docker-up:
	docker compose up --build

docker-down:
	docker compose down

rebuild: docker-down docker-up

lint:
	cd frontend && npm run lint
	cd backend && uv run ruff check .

format:
	cd frontend && npx prettier --write .
	cd backend && uv run black .
