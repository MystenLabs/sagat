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
