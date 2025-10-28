// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	collectDefaultMetrics,
	Counter,
	Gauge,
	Histogram,
	Registry,
} from 'prom-client';

// Single registry for all metrics
export const register = new Registry();

// Enable default metrics collection (Node.js runtime metrics)
collectDefaultMetrics({ register });

// HTTP Request Metrics
export const httpRequestDuration = new Histogram({
	name: 'http_request_duration_seconds',
	help: 'Duration of HTTP requests in seconds',
	labelNames: ['method', 'route', 'status_code'],
	registers: [register],
});

export const httpRequestTotal = new Counter({
	name: 'http_requests_total',
	help: 'Total number of HTTP requests',
	labelNames: ['method', 'route', 'status_code'],
	registers: [register],
});

// Authentication Metrics
export const authAttempts = new Counter({
	name: 'auth_attempts_total',
	help: 'Total number of authentication attempts',
	labelNames: ['status'],
	registers: [register],
});

export const activeJwtTokens = new Gauge({
	name: 'active_jwt_tokens',
	help: 'Number of active JWT tokens',
	registers: [register],
});

// Multisig Transaction Metrics
// We use counters for all events and derive state using PromQL
// This avoids expensive database queries while maintaining real-time accuracy

export const MultisigEventType = {
	PROPOSAL_CREATED: 'proposal_created',
	SIGNATURE_ADDED: 'signature_added',
	PROPOSAL_CANCELLED: 'proposal_cancelled',
	PROPOSAL_SUCCESS: 'proposal_success',
	PROPOSAL_FAILURE: 'proposal_failure',
} as const;

export type MultisigEventType =
	(typeof MultisigEventType)[keyof typeof MultisigEventType];

export const multisigProposalEvents = new Counter({
	name: 'multisig_proposal_events_total',
	help: 'Total number of multisig proposal events (derive state with PromQL)',
	labelNames: ['network', 'event_type'] as const,
	registers: [register],
});

// Example PromQL queries to derive state from events:
// - Pending: multisig_proposal_events_total{event_type="proposal_created"}
//           - multisig_proposal_events_total{event_type="proposal_cancelled"}
//           - multisig_proposal_events_total{event_type="proposal_success"}
//           - multisig_proposal_events_total{event_type="proposal_failure"}
// - Cancelled: multisig_proposal_events_total{event_type="proposal_cancelled"}
// - Success: multisig_proposal_events_total{event_type="proposal_success"}
// - Failed: multisig_proposal_events_total{event_type="proposal_failure"}
// - Signatures: multisig_proposal_events_total{event_type="signature_added"}

// Database Metrics
export const dbQueryDuration = new Histogram({
	name: 'db_query_duration_seconds',
	help: 'Duration of database queries in seconds',
	labelNames: ['operation', 'table'],
	registers: [register],
});

export const dbConnectionPoolSize = new Gauge({
	name: 'db_connection_pool_size',
	help: 'Number of connections in the database pool',
	labelNames: ['state'],
	registers: [register],
});

export const dbQueryErrors = new Counter({
	name: 'db_query_errors_total',
	help: 'Total number of database query errors',
	labelNames: ['operation', 'table'],
	registers: [register],
});

// RPC Metrics
export const rpcRequestDuration = new Histogram({
	name: 'rpc_request_duration_seconds',
	help: 'Duration of RPC requests in seconds',
	labelNames: ['network', 'method'],
	registers: [register],
});

export const rpcRequestErrors = new Counter({
	name: 'rpc_request_errors_total',
	help: 'Total number of RPC request errors',
	labelNames: ['network', 'method', 'error_type'],
	registers: [register],
});

// No database polling needed!
// All multisig state is derived from event counters using PromQL
// This is real-time, accurate, and has zero database overhead
