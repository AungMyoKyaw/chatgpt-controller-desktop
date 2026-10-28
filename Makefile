.PHONY: install dev build format

install:
	bun install --frozen-lockfile

dev:
	bun run sidecar
	bun run tauri dev

build:
	bun run tauri build --bundles app

format:
	bun run format
