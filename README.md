# Sagat - Sui Multisig Management Platform

Sagat is a full-stack application for managing Sui blockchain multisig wallets, built with a Bun/TypeScript API backend and React frontend.

## Architecture

- **Backend API** (`/api`): Bun + Hono + PostgreSQL + Drizzle ORM
- **Frontend** (`/app`): React + Vite + TypeScript + Tailwind CSS
- **Database**: PostgreSQL with Drizzle ORM migrations
- **Blockchain**: Sui Network integration via @mysten/sui

## Starting to work locally

You can run, from the root of the repository:

```sh
bun run dev
```

This will build the SDK and spin up the frontend and the API.
They are all in "watch" mode, so all changes would reflect as you are
developing.

## Testing

- `app/test`: unit tests (`cd app && bun run test`).
- `api/test`: API tests against a local Sui network (see `api/README.md`).
- `e2e`: Playwright tests that drive the app in a browser against the API and
  a local Sui network (see `e2e/README.md`, or run `bun run test:ui-e2e`).
