# Windows has no built-in `make` — install via `choco install make` (or `winget install GnuWin32.Make`).

.PHONY: help install dev client server build start typecheck test test-e2e

help:
	@echo Available commands: && \
	echo   make install      Install dependencies for both server and client && \
	echo   make dev          Run server and client together && \
	echo   make client       Run the client dev server && \
	echo   make server       Run the server dev server && \
	echo   make build        Build server and client && \
	echo   make start        Run the built server && \
	echo   make typecheck    Typecheck both workspaces && \
	echo   make test         Run client unit tests && \
	echo   make test-e2e     Run client e2e tests

install:
	npm install

dev:
	mkdir -p client/public/fonts && cp -r client/src/assets/fonts/* client/public/fonts/
	npm run dev

client:
	mkdir -p client/public/fonts && cp -r client/src/assets/fonts/* client/public/fonts/
	npm run dev:client

server:
	npm run dev:server

build:
	mkdir -p client/public/fonts && cp -r client/src/assets/fonts/* client/public/fonts/
	npm run build

start:
	npm start

typecheck:
	npm run typecheck

test:
	npm run test

test-e2e:
	npm run test:e2e
