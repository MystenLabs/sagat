# Sagat - IOTA Multisig Management Platform

Sagat is a full-stack application for managing IOTA blockchain multisig wallets, built with a Bun/TypeScript API backend and React frontend.

## Architecture

- **Backend API** (`/api`): Bun + Hono + PostgreSQL + Drizzle ORM
- **Frontend** (`/app`): React + Vite + TypeScript + Tailwind CSS
- **Database**: PostgreSQL with Drizzle ORM migrations
- **Blockchain**: IOTA Network integration via @iota/iota-sdk

## Starting to work locally

First create a `.env` file `/api/.env` based on the `.env.example` file.
Start postgres locally using Docker:

```sh
docker compose up postgres -d
```

Then you can run, from the root of the repository:

```sh
bun install
bun run dev
```

This will build the SDK and spin up the frontend and the API.
They are all in "watch" mode, so all changes would reflect as you are
developing.
