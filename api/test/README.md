# Multisig API Test Framework

This directory contains a comprehensive test framework for the multisig API, providing clean, isolated tests with proper session management.

## Architecture

### Shared Test Setup (`setup/shared-test-setup.ts`)

- **`setupSharedTestEnvironment()`**: Sets up shared resources like network checking and database pool
- **`createTestApp()`**: Creates a fresh Hono app instance for each test with clean database state
- Each test gets complete isolation with its own app instance and database state

### API Test Framework (`framework/api-test-framework.ts`)

- **`ApiTestFramework`**: Main framework class that manages test scenarios
- **`TestSession`**: Represents a user session with authentication state and operations
- **`TestUser`**: Interface for test users with keypairs, public keys, and addresses

## Key Features

### Complete Isolation

Each test gets its own:

- Fresh Hono app instance
- Clean database state
- Independent authentication sessions
- No shared state between tests

### Session-Based Testing

```typescript
const { session, users, multisig } =
	await framework.createVerifiedMultisig(2, 2);
```

### High-Level Helpers

- `createAuthenticatedSession(userCount)`: Creates authenticated users
- `createVerifiedMultisig(userCount, threshold, name, fund)`: Creates fully verified multisig (no funding by default)
- `createFundedVerifiedMultisig(userCount, threshold, name)`: Creates funded + verified multisig (for proposal tests)
- `session.createMultisig(creator, members, threshold, name, fund)`: Create multisig with optional funding
- `session.createProposal()`, `session.voteOnProposal()`: Proposal operations

### Per-Test Setup

```typescript
beforeEach(async () => {
	const app = await createTestApp(); // Fresh app with clean state
	framework = new ApiTestFramework(app);
});
```

## Test Structure

### Main Test Suite (`multisig-api.test.ts`)

Comprehensive integration tests covering:

- **Authentication**: User auth and address registration
- **Multisig Management**: Creation and verification
- **Proposal Workflow**: Creation, voting, and thresholds
- **Session Management**: Session state and isolation
- **Error Handling**: Invalid operations and edge cases

### Test Suites

- **`multisig-api.test.ts`**: Comprehensive integration tests for the entire API
- **`sui-network.test.ts`**: Network utilities and connection tests

## Usage Examples

### Basic Authentication Test

```typescript
test('single user auth and address registration', async () => {
	const { session, users } =
		await framework.createAuthenticatedSession(1);

	expect(users).toHaveLength(1);
	expect(session.hasActiveCookie()).toBe(true);

	await session.disconnect();
	expect(session.hasActiveCookie()).toBe(false);
});
```

### Complete Workflow Test

```typescript
test('create proposal and collect sufficient votes', async () => {
	const { session, users, multisig } =
		await framework.createVerifiedMultisig(2, 2);

	const proposal = await session.createProposal(
		users[0],
		multisig.address,
		recipient,
		1000000,
		'Send 1 MIST',
	);

	const voteResult = await session.voteOnProposal(
		users[1],
		proposal.id,
		proposal.transactionBytes,
	);
	expect(voteResult.hasReachedThreshold).toBe(true);
});
```

## Benefits

1. **Clean State**: Every test starts with a completely clean slate
2. **High-Level API**: Focus on business logic, not setup boilerplate
3. **Real Integration**: Tests actual API endpoints, not mocked components
4. **Session Management**: Proper authentication state handling with JWT decoding
5. **Isolated**: No test interference or shared state issues
6. **Maintainable**: Single source of truth for test utilities
7. **Performance Optimized**: Optional funding separates fast unit tests from slow blockchain tests

## Performance

### ⚡ Fast Unit Tests (No Funding)

- **Auth/Addresses/Multisig**: ~5-50ms each (database operations only)
- **Total for 20 tests**: ~1 second
- **When to use**: Testing API logic, validation, authentication flow

### 🐌 Blockchain Tests (With Funding)

- **Proposals**: ~400ms-2s each (real Sui network operations)
- **When to use**: Testing actual transaction creation, voting, execution

### 🎯 Speed Strategy

```typescript
// Fast - no funding needed for multisig validation tests
const { multisig } = await framework.createVerifiedMultisig(
	2,
	2,
);

// Slow but necessary - funding required for proposals
const { multisig } =
	await framework.createFundedVerifiedMultisig(2, 2);
```

## Running Tests

```bash
# Run all tests
bun test

# Run specific test suite
bun test test/multisig-api.test.ts

# Run with network check
bun test test/sui-network.test.ts
```

## Requirements

- Local Sui network running (`sui start --force-regenesis --with-faucet`)
- PostgreSQL test database
- All dependencies installed (`bun install`)
