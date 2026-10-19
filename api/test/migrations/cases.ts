// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect } from 'bun:test';

import { publicTables, type ScratchDb } from './helpers';

/**
 * One upgrade scenario: a database at `baseline` holding `seed`, migrated to
 * `target`. Each entry in `preserved` reads the same rows twice, once with
 * the baseline names and once with the target names; the two results must be
 * identical. `verify` holds the checks specific to the migration.
 *
 * To cover a new migration, add a case with the previous migration as the
 * baseline. Older cases keep working: they stop at their own target.
 */
export interface MigrationCase {
	name: string;
	baseline: number;
	target: number;
	seed: string;
	preserved: {
		label: string;
		before: string;
		after: string;
	}[];
	verify: (db: ScratchDb) => Promise<void>;
}

const accountRotation: MigrationCase = {
	name: '0009 account rotation (multisigs -> accounts and signer sets)',
	baseline: 8,
	target: 9,
	seed: `
		INSERT INTO addresses (public_key, address) VALUES
			('AKEY1', '0xa1'), ('AKEY2', '0xa2'), ('AKEY3', '0xa3');
		INSERT INTO multisigs (address, is_verified, threshold, name) VALUES
			('0xmsig_treasury', true, 2, 'Treasury'),
			('0xmsig_unnamed', false, 1, NULL);
		INSERT INTO multisig_members (multisig_address, public_key, weight, is_accepted, is_rejected, "order") VALUES
			('0xmsig_treasury', 'AKEY1', 1, true, false, 0),
			('0xmsig_treasury', 'AKEY2', 1, true, false, 1),
			('0xmsig_treasury', 'AKEY3', 2, true, false, 2),
			('0xmsig_unnamed', 'AKEY1', 1, true, false, 0),
			('0xmsig_unnamed', 'AKEY2', 1, false, true, 1);
		INSERT INTO multisig_proposers (multisig_address, address, added_by, added_at) VALUES
			('0xmsig_treasury', '0xbot', '0xa1', '2025-10-01 12:00:00');
		INSERT INTO proposals (multisig_address, digest, status, transaction_bytes, proposer_address, description, network, created_at) VALUES
			('0xmsig_treasury', 'DIGEST_1', 0, 'BYTES_1', '0xa1', 'Pay vendor', 'testnet', '2025-10-02 09:00:00'),
			('0xmsig_unnamed', 'DIGEST_2', 2, 'BYTES_2', '0xbot', NULL, 'mainnet', '2025-10-03 10:00:00');
		INSERT INTO proposal_signatures (proposal_id, public_key, signature)
			SELECT id, 'AKEY1', 'SIG_1_1' FROM proposals WHERE digest = 'DIGEST_1';
		INSERT INTO proposal_signatures (proposal_id, public_key, signature)
			SELECT id, k, 'SIG_2_' || k FROM proposals, (VALUES ('AKEY1'), ('AKEY2')) v(k) WHERE digest = 'DIGEST_2';
	`,
	preserved: [
		{
			label: 'addresses',
			before: `SELECT public_key, address FROM addresses ORDER BY 1`,
			after: `SELECT public_key, address FROM addresses ORDER BY 1`,
		},
		{
			label: 'multisigs -> signer_sets',
			before: `SELECT address, is_verified, threshold, name FROM multisigs ORDER BY 1`,
			after: `SELECT address, is_verified, threshold, name FROM signer_sets ORDER BY 1`,
		},
		{
			label: 'multisig_members -> signer_set_members',
			before: `SELECT multisig_address, public_key, weight, is_accepted, is_rejected, "order" FROM multisig_members ORDER BY 1, 2`,
			after: `SELECT signer_set_address, public_key, weight, is_accepted, is_rejected, "order" FROM signer_set_members ORDER BY 1, 2`,
		},
		{
			label: 'multisig_proposers -> account_proposers',
			before: `SELECT multisig_address, address, added_by, added_at FROM multisig_proposers ORDER BY 1, 2`,
			after: `SELECT account_address, address, added_by, added_at FROM account_proposers ORDER BY 1, 2`,
		},
		{
			label: 'proposals',
			before: `SELECT id, multisig_address, digest, status, transaction_bytes, proposer_address, description, network, created_at FROM proposals ORDER BY 1`,
			after: `SELECT id, account_address, digest, status, transaction_bytes, proposer_address, description, network, created_at FROM proposals ORDER BY 1`,
		},
		{
			label: 'proposal_signatures',
			before: `SELECT proposal_id, public_key, signature FROM proposal_signatures ORDER BY 1, 2`,
			after: `SELECT proposal_id, public_key, signature FROM proposal_signatures ORDER BY 1, 2`,
		},
	],
	verify: async (db) => {
		// One account per former multisig, with the same address and name.
		expect(
			await db.rows(
				`SELECT a.address, a.name FROM accounts a ORDER BY 1`,
			),
		).toEqual(
			await db.rows(
				`SELECT address, name FROM signer_sets ORDER BY 1`,
			),
		);
		expect(
			Number(
				await db.value(`SELECT count(*) FROM accounts`),
			),
		).toBe(2);

		// Each former multisig is linked to its own account as its original
		// signer set, labelled with its name (NULL included), with a status
		// that follows is_verified.
		expect(
			await db.rows(
				`SELECT account_address, signer_set_address, label, status, drafted_by, created_at IS NOT NULL FROM account_signer_sets ORDER BY 1, 2`,
			),
		).toEqual([
			[
				'0xmsig_treasury',
				'0xmsig_treasury',
				'Treasury',
				'verified',
				'0xmsig_treasury',
				true,
			],
			[
				'0xmsig_unnamed',
				'0xmsig_unnamed',
				null,
				'inviting',
				'0xmsig_unnamed',
				true,
			],
		]);

		expect(
			Number(
				await db.value(
					`SELECT count(*) FROM proposals WHERE executed_via IS NOT NULL`,
				),
			),
		).toBe(0);

		expect(await publicTables(db)).toEqual([
			'account_alias_state',
			'account_aliases',
			'account_proposers',
			'account_signer_sets',
			'accounts',
			'addresses',
			'proposal_signatures',
			'proposals',
			'signer_set_members',
			'signer_sets',
		]);

		// Nothing keeps the old vocabulary: tables, indexes, sequences,
		// constraints, columns.
		expect(
			await db.rows(`
				SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE '%multisig%'
				UNION ALL
				SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conname LIKE '%multisig%'
				UNION ALL
				SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name LIKE '%multisig%'`),
		).toEqual([]);

		const foreignKeys = (
			await db.rows(`
				SELECT conrelid::regclass::text || ' -> ' || confrelid::regclass::text
				FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)
		)
			.map((r) => r[0])
			.sort();
		expect(foreignKeys).toEqual([
			'account_alias_state -> accounts',
			'account_aliases -> accounts',
			'account_proposers -> accounts',
			'account_signer_sets -> accounts',
			'account_signer_sets -> signer_sets',
			'proposal_signatures -> addresses',
			'proposal_signatures -> proposals',
			'proposals -> accounts',
			'signer_set_members -> addresses',
			'signer_set_members -> signer_sets',
		]);

		// The primary key is the only index on signer_sets: the old
		// multisig_address_idx duplicated it and is dropped.
		expect(
			await db.rows(
				`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'signer_sets' ORDER BY 1`,
			),
		).toEqual([['signer_sets_pkey']]);

		// Check constraints on the new tables.
		await expect(
			db.value(`
				INSERT INTO account_alias_state (account_address, network, "exists", observed_at)
				VALUES ('0xmsig_treasury', 'betanet', false, NOW())`),
		).rejects.toThrow(/account_alias_state_network_check/);
		await expect(
			db.value(`
				INSERT INTO account_aliases (account_address, network, alias_address)
				VALUES ('0xmsig_treasury', 'betanet', '0xmsig_treasury')`),
		).rejects.toThrow(/account_aliases_network_check/);
		await expect(
			db.value(`
				INSERT INTO account_signer_sets (account_address, signer_set_address, drafted_by, status)
				VALUES ('0xmsig_treasury', '0xmsig_unnamed', '0xa1', 'linked')`),
		).rejects.toThrow(/account_signer_sets_status_check/);
		expect(
			await db.value(`
				INSERT INTO account_signer_sets (account_address, signer_set_address, drafted_by)
				VALUES ('0xmsig_treasury', '0xmsig_unnamed', '0xa1') RETURNING status`),
		).toBe('draft');

		// The proposal id sequence survived the rename and keeps counting.
		expect(
			await db.value(`
				INSERT INTO proposals (account_address, digest, transaction_bytes, proposer_address, network)
				VALUES ('0xmsig_treasury', 'DIGEST_3', 'BYTES_3', '0xa1', 'testnet') RETURNING id`),
		).toBe(3);

		// Proposals now reference accounts.
		await expect(
			db.value(`
				INSERT INTO proposals (account_address, digest, transaction_bytes, proposer_address, network)
				VALUES ('0xunknown', 'DIGEST_4', 'BYTES_4', '0xa1', 'testnet') RETURNING id`),
		).rejects.toThrow(
			/proposals_account_address_accounts_address_fk/,
		);
	},
};

const accountKeys: MigrationCase = {
	name: '0010 account keys (per-account key labels)',
	baseline: 9,
	target: 10,
	seed: `
		INSERT INTO addresses (public_key, address) VALUES
			('AKEY1', '0xa1'), ('AKEY2', '0xa2');
		INSERT INTO accounts (address, name) VALUES ('0xacc', 'Treasury');
		INSERT INTO signer_sets (address, is_verified, threshold, name) VALUES
			('0xacc', true, 2, 'Treasury');
		INSERT INTO signer_set_members (signer_set_address, public_key, weight, is_accepted, is_rejected, "order") VALUES
			('0xacc', 'AKEY1', 1, true, false, 0),
			('0xacc', 'AKEY2', 1, true, false, 1);
		INSERT INTO account_signer_sets (account_address, signer_set_address, label, status, drafted_by) VALUES
			('0xacc', '0xacc', 'Treasury', 'verified', '0xacc');
	`,
	preserved: [
		{
			label: 'accounts',
			before: `SELECT address, name FROM accounts ORDER BY 1`,
			after: `SELECT address, name FROM accounts ORDER BY 1`,
		},
		{
			label: 'signer_set_members',
			before: `SELECT signer_set_address, public_key, weight, is_accepted, is_rejected, "order" FROM signer_set_members ORDER BY 1, 2`,
			after: `SELECT signer_set_address, public_key, weight, is_accepted, is_rejected, "order" FROM signer_set_members ORDER BY 1, 2`,
		},
		{
			label: 'account_signer_sets',
			before: `SELECT account_address, signer_set_address, label, status, drafted_by FROM account_signer_sets ORDER BY 1, 2`,
			after: `SELECT account_address, signer_set_address, label, status, drafted_by FROM account_signer_sets ORDER BY 1, 2`,
		},
	],
	verify: async (db) => {
		// Additive: the new table starts empty, nothing is seeded.
		expect(
			Number(
				await db.value(`SELECT count(*) FROM account_keys`),
			),
		).toBe(0);
		expect(await publicTables(db)).toContain(
			'account_keys',
		);

		// One row per account and key, label optional (64 chars), updated_at defaulted.
		expect(
			await db.rows(`
				INSERT INTO account_keys (account_address, public_key, label, updated_by)
				VALUES ('0xacc', 'AKEY1', 'Alice''s Ledger', '0xa1'), ('0xacc', 'AKEY2', NULL, '0xa1')
				RETURNING account_address, public_key, label, updated_by, updated_at IS NOT NULL`),
		).toEqual([
			['0xacc', 'AKEY1', "Alice's Ledger", '0xa1', true],
			['0xacc', 'AKEY2', null, '0xa1', true],
		]);
		await expect(
			db.value(`
				INSERT INTO account_keys (account_address, public_key, updated_by)
				VALUES ('0xacc', 'AKEY1', '0xa1')`),
		).rejects.toThrow(
			/account_keys_account_address_public_key_pk/,
		);

		await expect(
			db.value(`
				INSERT INTO account_keys (account_address, public_key, label, updated_by)
				VALUES ('0xacc', 'AKEY2', repeat('x', 65), '0xa1')
				ON CONFLICT (account_address, public_key) DO UPDATE SET label = EXCLUDED.label`),
		).rejects.toThrow(/value too long/);

		// Rows reference a known account and a known key.
		await expect(
			db.value(`
				INSERT INTO account_keys (account_address, public_key, updated_by)
				VALUES ('0xunknown', 'AKEY1', '0xa1')`),
		).rejects.toThrow(
			/account_keys_account_address_accounts_address_fk/,
		);
		await expect(
			db.value(`
				INSERT INTO account_keys (account_address, public_key, updated_by)
				VALUES ('0xacc', 'UNKNOWN_KEY', '0xa1')`),
		).rejects.toThrow(
			/account_keys_public_key_addresses_public_key_fk/,
		);
	},
};

export const migrationCases: MigrationCase[] = [
	accountRotation,
	accountKeys,
];
