#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MANIFEST="$ROOT_DIR/crates/sagat-sdk/Cargo.toml"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_RUNTIME="${POSTGRES_RUNTIME:-auto}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sagat-sdk-e2e-postgres}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
TEST_DB_NAME="${TEST_DB_NAME:-sagat_rust_e2e_$(date +%s)_$$}"
POSTGRES_ADMIN_URL="${POSTGRES_ADMIN_URL:-postgresql://localhost:5432/postgres}"
DATABASE_URL="${DATABASE_URL:-${POSTGRES_ADMIN_URL%/*}/$TEST_DB_NAME}"
SAGAT_API_PORT="${SAGAT_API_PORT:-$((30000 + RANDOM % 10000))}"
SAGAT_API_URL="http://127.0.0.1:$SAGAT_API_PORT"
API_LOG="${API_LOG:-${TMPDIR:-/tmp}/sagat-rust-sdk-api.log}"
SUI_RPC_URL="${SUI_RPC_URL_localnet:-http://127.0.0.1:9000}"
SUI_LOG="${SUI_LOG:-${TMPDIR:-/tmp}/sagat-rust-sdk-sui.log}"
START_SUI="${START_SUI:-1}"

COMPOSE=()
POSTGRES_EXEC=()
POSTGRES_STOP=()
POSTGRES_DROP=()
STARTED_POSTGRES=0
CREATED_DB=0
STARTED_API=0
STARTED_SUI=0
API_PID=""
SUI_PID=""
CARGO_TEST_ARGS=()
TEST_BINARY_ARGS=()

log() {
	printf '[sagat-sdk-e2e] %s\n' "$*"
}

fail() {
	printf '[sagat-sdk-e2e] error: %s\n' "$*" >&2
	exit 1
}

usage() {
	cat <<'EOF'
Usage: bash crates/sagat-sdk/e2e/run.sh [--test <target>] [test-filter ...] [-- <libtest-args>...]

Examples:
  bash crates/sagat-sdk/e2e/run.sh
  bash crates/sagat-sdk/e2e/run.sh --test e2e_proposals
  bash crates/sagat-sdk/e2e/run.sh --test e2e_proposals weighted_votes

The --test flag is passed to Cargo and selects an integration test target such
as crates/sagat-sdk/tests/e2e_proposals.rs. Test filters and args after -- are
passed to the Rust test binary.
EOF
}

parse_test_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
			-h|--help)
				usage
				exit 0
				;;
			--test)
				[[ $# -ge 2 ]] || fail "--test requires an integration test target"
				CARGO_TEST_ARGS+=(--test "$2")
				shift 2
				;;
			--test=*)
				CARGO_TEST_ARGS+=(--test "${1#--test=}")
				shift
				;;
			--)
				shift
				TEST_BINARY_ARGS+=("$@")
				return
				;;
			*)
				TEST_BINARY_ARGS+=("$1")
				shift
				;;
		esac
	done
}

cleanup() {
	local status=$?

	if [[ "$STARTED_API" == "1" && -n "$API_PID" ]]; then
		log "stopping Sagat API"
		kill "$API_PID" 2>/dev/null || true
		wait "$API_PID" 2>/dev/null || true
	fi

	if [[ "$CREATED_DB" == "1" && "${KEEP_DB:-0}" != "1" ]]; then
		log "dropping test database $TEST_DB_NAME"
		"${POSTGRES_DROP[@]}" \
			-c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEST_DB_NAME';" \
			-c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" >/dev/null || true
	fi

	if [[ "$STARTED_SUI" == "1" && "${KEEP_SUI:-0}" != "1" ]]; then
		log "stopping Sui localnet"
		kill "$SUI_PID" 2>/dev/null || true
		pkill -P "$SUI_PID" 2>/dev/null || true
		wait "$SUI_PID" 2>/dev/null || true
	fi

	if [[ "$STARTED_POSTGRES" == "1" && "${KEEP_POSTGRES:-0}" != "1" ]]; then
		log "stopping Postgres"
		"${POSTGRES_STOP[@]}" >/dev/null || true
	fi

	exit "$status"
}

trap cleanup EXIT INT TERM

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

detect_docker_compose() {
	if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
		COMPOSE=(docker compose -f "$ROOT_DIR/docker-compose.yml")
	elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
		COMPOSE=(docker-compose -f "$ROOT_DIR/docker-compose.yml")
	else
		fail "docker compose is installed but the Docker daemon is not reachable"
	fi
}

docker_compose_postgres_running() {
	"${COMPOSE[@]}" ps --status running --services "$POSTGRES_SERVICE" 2>/dev/null \
		| grep -qx "$POSTGRES_SERVICE"
}

podman_ready() {
	podman info >/dev/null 2>&1
}

podman_postgres_running() {
	podman ps --format '{{.Names}}' 2>/dev/null | grep -qx "$POSTGRES_CONTAINER"
}

podman_postgres_exists() {
	podman container exists "$POSTGRES_CONTAINER" >/dev/null 2>&1
}

local_postgres_ready() {
	command -v psql >/dev/null 2>&1 && psql "$POSTGRES_ADMIN_URL" -c "SELECT 1;" >/dev/null 2>&1
}

use_local_postgres() {
	require_command psql
	if ! local_postgres_ready; then
		fail "local Postgres is not reachable at POSTGRES_ADMIN_URL=$POSTGRES_ADMIN_URL"
	fi
	POSTGRES_EXEC=(psql "$POSTGRES_ADMIN_URL")
	POSTGRES_DROP=(psql "$POSTGRES_ADMIN_URL")
	POSTGRES_STOP=(true)
}

use_docker_compose_postgres() {
	require_command docker
	detect_docker_compose
	POSTGRES_EXEC=("${COMPOSE[@]}" exec -T "$POSTGRES_SERVICE")
	POSTGRES_DROP=("${COMPOSE[@]}" exec -T "$POSTGRES_SERVICE" psql -U sagat -d postgres)
	POSTGRES_STOP=("${COMPOSE[@]}" stop "$POSTGRES_SERVICE")
}

use_podman_postgres() {
	require_command podman
	if ! podman_ready; then
		fail "podman is installed but not running; run 'podman machine init' once, then 'podman machine start'"
	fi
	POSTGRES_EXEC=(podman exec -i "$POSTGRES_CONTAINER")
	POSTGRES_DROP=(podman exec -i "$POSTGRES_CONTAINER" psql -U sagat -d postgres)
	POSTGRES_STOP=(podman stop "$POSTGRES_CONTAINER")
}

detect_postgres_runtime() {
	case "$POSTGRES_RUNTIME" in
		external|local)
			use_local_postgres
			POSTGRES_RUNTIME=external
			;;
		docker|docker-compose)
			use_docker_compose_postgres
			;;
		podman)
			use_podman_postgres
			;;
		auto)
			if local_postgres_ready; then
				use_local_postgres
				POSTGRES_RUNTIME=external
			elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
				use_docker_compose_postgres
				POSTGRES_RUNTIME=docker-compose
			elif command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
				use_docker_compose_postgres
				POSTGRES_RUNTIME=docker-compose
			elif command -v podman >/dev/null 2>&1; then
				use_podman_postgres
				POSTGRES_RUNTIME=podman
			else
				fail "local Postgres, docker compose, or podman is required"
			fi
			;;
		*)
			fail "unsupported POSTGRES_RUNTIME=$POSTGRES_RUNTIME; use auto, external, docker-compose, docker, or podman"
			;;
	esac
}

wait_for_postgres() {
	if [[ "$POSTGRES_RUNTIME" == "external" ]]; then
		return
	fi

	log "waiting for Postgres"
	for _ in {1..60}; do
		if "${POSTGRES_EXEC[@]}" pg_isready -U sagat -d multisig_db >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
	done
	fail "Postgres did not become ready"
}

create_test_db() {
	log "creating test database $TEST_DB_NAME"
	if [[ "$POSTGRES_RUNTIME" == "external" ]]; then
		"${POSTGRES_EXEC[@]}" -c "CREATE DATABASE $TEST_DB_NAME;" >/dev/null
	else
		"${POSTGRES_EXEC[@]}" psql -U sagat -d postgres \
			-c "CREATE DATABASE $TEST_DB_NAME;" >/dev/null
	fi
	CREATED_DB=1
}

migrate_test_db() {
	log "migrating test database"
	(cd "$ROOT_DIR/api" && DATABASE_URL="$DATABASE_URL" bun run db:migrate)
}

sui_ready() {
	curl -sf -X POST "$SUI_RPC_URL" \
		-H "Content-Type: application/json" \
		-d '{"jsonrpc":"2.0","id":1,"method":"sui_getChainIdentifier","params":[]}' \
		2>/dev/null | grep -q result
}

start_sui_if_requested() {
	if [[ "$START_SUI" != "1" ]]; then
		return
	fi

	require_command curl
	if sui_ready; then
		log "Sui localnet is already running"
		return
	fi

	require_command sui
	log "starting Sui localnet with faucet; log: $SUI_LOG"
	sui start --force-regenesis --with-faucet >"$SUI_LOG" 2>&1 &
	SUI_PID=$!
	STARTED_SUI=1

	log "waiting for Sui localnet"
	for _ in {1..90}; do
		if sui_ready; then
			return
		fi
		sleep 2
	done

	tail -40 "$SUI_LOG" >&2 || true
	fail "Sui localnet did not become ready"
}

start_postgres() {
	detect_postgres_runtime

	if [[ "$POSTGRES_RUNTIME" == "external" ]]; then
		log "using external Postgres at $POSTGRES_ADMIN_URL"
	elif [[ "$POSTGRES_RUNTIME" == "podman" ]]; then
		if podman_postgres_running; then
			log "Podman Postgres is already running"
		elif podman_postgres_exists; then
			log "starting existing Podman Postgres container"
			podman start "$POSTGRES_CONTAINER" >/dev/null
			STARTED_POSTGRES=1
		else
			log "starting Podman Postgres container"
			podman run -d \
				--name "$POSTGRES_CONTAINER" \
				-e POSTGRES_USER=sagat \
				-e POSTGRES_PASSWORD=sagat_dev_password \
				-e POSTGRES_DB=multisig_db \
				-p 5432:5432 \
				"$POSTGRES_IMAGE" >/dev/null
			STARTED_POSTGRES=1
		fi
	else
		if docker_compose_postgres_running; then
			log "Docker Compose Postgres is already running"
		else
			log "starting Docker Compose Postgres"
			"${COMPOSE[@]}" up -d "$POSTGRES_SERVICE"
			STARTED_POSTGRES=1
		fi
	fi

	wait_for_postgres
	create_test_db
}

start_api() {
	require_command bun
	require_command curl

	log "building TypeScript SDK for the API import"
	(cd "$ROOT_DIR/sdk" && bun run build)

	log "starting Sagat API at $SAGAT_API_URL; log: $API_LOG"
	DATABASE_URL="$DATABASE_URL" \
	JWT_SECRET="${JWT_SECRET:-a-super-long-jwt-secret-to-use-in-the-service}" \
	SUPPORTED_NETWORKS="${SUPPORTED_NETWORKS:-localnet}" \
	CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-http://localhost:3000,http://localhost:5173}" \
	SUI_RPC_URL_localnet="$SUI_RPC_URL" \
	SAGAT_API_PORT="$SAGAT_API_PORT" \
		bun run "$ROOT_DIR/crates/sagat-sdk/e2e/api-server.ts" >"$API_LOG" 2>&1 &
	API_PID=$!
	STARTED_API=1

	for _ in {1..60}; do
		if curl -sf "$SAGAT_API_URL/health" >/dev/null 2>&1; then
			return
		fi
		if ! kill -0 "$API_PID" 2>/dev/null; then
			tail -80 "$API_LOG" >&2 || true
			fail "Sagat API exited before becoming ready"
		fi
		sleep 1
	done

	tail -80 "$API_LOG" >&2 || true
	fail "Sagat API did not become ready"
}

run_rust_e2e() {
	local cargo_cmd=(cargo test --manifest-path "$MANIFEST")

	if [[ ${#CARGO_TEST_ARGS[@]} -gt 0 ]]; then
		cargo_cmd+=("${CARGO_TEST_ARGS[@]}")
	fi

	cargo_cmd+=(-- --ignored --nocapture)

	if [[ ${#TEST_BINARY_ARGS[@]} -gt 0 ]]; then
		cargo_cmd+=("${TEST_BINARY_ARGS[@]}")
	fi

	log "running Rust SDK e2e tests"
	SAGAT_API_URL="$SAGAT_API_URL" "${cargo_cmd[@]}"
}

parse_test_args "$@"
start_postgres
migrate_test_db
start_sui_if_requested
start_api
run_rust_e2e
