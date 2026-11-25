.PHONY: setup test test-web test-py lint typecheck docker-up docker-down

setup:
	cp -n .env.example .env || true
	pnpm install
	uv sync --all-packages

test-web:
	node --test apps/web/tests/*.test.mjs

test-py:
	.venv/bin/python -m unittest discover -s apps/api/tests -v
	.venv/bin/python -m unittest discover -s apps/ai-engine/tests -v
	.venv/bin/python -m unittest discover -s apps/worker/tests -v
	.venv/bin/python -m unittest discover -s apps/scheduler/tests -v

test: test-web test-py

lint:
	pnpm --filter @careerscout/web lint

typecheck:
	pnpm --filter @careerscout/web exec tsc --noEmit

docker-up:
	cp -n .env.example .env || true
	docker compose up --build

docker-down:
	docker compose down
