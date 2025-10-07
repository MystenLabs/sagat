# Sagat - Sui Multisig Management Platform

Sagat is a full-stack application for managing Sui blockchain multisig wallets, built with a Bun/TypeScript API backend and React frontend.

## Architecture

- **Backend API** (`/api`): Bun + Hono + PostgreSQL + Drizzle ORM
- **Frontend** (`/app`): React + Vite + TypeScript + Tailwind CSS
- **Database**: PostgreSQL with Drizzle ORM migrations
- **Blockchain**: Sui Network integration via @mysten/sui

## Quick Start with Docker (Local Development)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Development Setup

```bash
# Clone and navigate to project
git clone <repository-url>
cd sagat

# Start all services for local development
docker-compose up

# Or run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

**Access points:**

- Frontend (Vite dev server): http://localhost:5173
- API (with hot reload): http://localhost:3000
- PostgreSQL: localhost:5432

The setup includes:

- Hot reloading for both API and frontend
- File watching for automatic rebuilds
- PostgreSQL database with persistent data
- Development-optimized configuration

## Local Development (without Docker)

### Backend API Setup

```bash
cd api

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your database URL and JWT secret

# Generate database schema
bun run db:generate

# Run migrations (if needed)
bun run db:migrate

# Start development server with hot reload
bun run dev
```

### Frontend Setup

```bash
cd app

# Install dependencies
bun install

# Start development server
bun run dev
```

### Database Setup

If running locally without Docker:

1. Install PostgreSQL locally
2. Create database: `createdb multisig_db`
3. Update `DATABASE_URL` in `api/.env`

## Environment Variables

### API Environment Variables

The Docker setup uses predefined development values. For manual setup, create `api/.env` from `api/.env.example`:

```bash
# Database Configuration (for manual setup without Docker)
DATABASE_URL=postgresql://sagat:dev_password@localhost:5432/multisig_db

# JWT Secret (development only - use strong secret in production)
JWT_SECRET=local-dev-jwt-secret-not-for-production

# Supported Sui Networks
SUPPORTED_NETWORKS=mainnet,testnet,localnet
```

## API Endpoints

- `GET /` - Health check
- `POST /auth/*` - Authentication routes
- `GET|POST /addresses/*` - Address management
- `GET|POST /multisig/*` - Multisig wallet operations
- `GET|POST /proposals/*` - Proposal management

## Testing

### API Tests

```bash
cd api
bun run test:e2e
```

### Testing with Sui Localnet

To test proposals against a local Sui network:

```bash
# Switch to localnet and start Sui
sui client switch --env localnet
sui start --force-regenesis --with-faucet

# Run API tests
cd api
bun run test:e2e
```

## Docker Development Commands

```bash
# Start development environment
docker-compose up

# Start in detached mode
docker-compose up -d

# View container logs
docker-compose logs api
docker-compose logs frontend
docker-compose logs postgres

# Follow logs in real-time
docker-compose logs -f

# Execute commands in running containers
docker-compose exec api bun run db:migrate
docker-compose exec postgres psql -U sagat -d multisig_db

# Rebuild services (after dependency changes)
docker-compose up --build

# Stop services
docker-compose down

# Remove containers and volumes (fresh start)
docker-compose down -v
```

## Database Management

```bash
# Generate new migrations
docker-compose exec api bun run db:generate

# Run migrations
docker-compose exec api bun run db:migrate

# Access PostgreSQL directly
docker-compose exec postgres psql -U sagat -d multisig_db
```

## Project Structure

```
sagat/
├── api/                     # Backend API
│   ├── src/                # Source code
│   ├── drizzle/            # Database migrations
│   ├── test/               # E2E tests
│   └── Dockerfile          # API container
├── app/                    # Frontend React app
│   ├── src/                # Source code
│   └── Dockerfile          # Frontend container
├── docker-compose.yml      # Local development setup
├── init-db.sql            # Database initialization
└── README.md              # This file
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000, 5173, 5432, and 8080 are available
2. **Database connection errors**: Check PostgreSQL container is running and healthy
3. **Build failures**: Clear Docker cache with `docker system prune`

### Logs and Debugging

```bash
# View all service logs
docker-compose logs

# Follow logs for specific service
docker-compose logs -f api

# Check container status
docker-compose ps

# Check health status
docker-compose exec api curl -f http://localhost:3000/
docker-compose exec frontend curl -f http://localhost:80/
```

## Development Workflow

1. Start the development environment: `docker-compose up`
2. Make changes to source code in `api/` or `app/` directories
3. Changes are automatically detected and services reload
4. Access frontend at http://localhost:5173 and API at http://localhost:3000
5. Run tests before committing changes
6. Use `docker-compose down` to stop services when done

## Production Deployment

The Docker setup is optimized for local development. For production deployment:

1. Use the individual Dockerfiles in `/api` and `/app` directories
2. Configure secure JWT secrets and database passwords
3. Set up proper CORS origins in the API
4. Configure SSL/TLS termination
5. Set up database backups and monitoring
6. Use container orchestration platform (Kubernetes, etc.)
