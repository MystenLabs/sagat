// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** The real migrations folder, the one `drizzle.config.ts` points at. */
export const MIGRATIONS_FOLDER = resolve(
	__dirname,
	'../../drizzle',
);

const CONNECTION_STRING =
	process.env.TEST_DATABASE_URL ||
	'postgresql://localhost:5432/postgres';

interface JournalEntry {
	idx: number;
	tag: string;
	when: number;
	version: string;
	breakpoints: boolean;
}

interface Journal {
	version: string;
	dialect: string;
	entries: JournalEntry[];
}

export function readJournal(): Journal {
	return JSON.parse(
		readFileSync(
			join(MIGRATIONS_FOLDER, 'meta/_journal.json'),
			'utf8',
		),
	);
}

export function journalEntry(idx: number): JournalEntry {
	const entry = readJournal().entries.find(
		(e) => e.idx === idx,
	);
	if (!entry)
		throw new Error(`No migration with index ${idx}`);
	return entry;
}

export function latestMigrationIndex(): number {
	return Math.max(
		...readJournal().entries.map((e) => e.idx),
	);
}

/** The drizzle snapshot written next to migration `idx`. */
export function readSnapshot(idx: number): Snapshot {
	const file = `${String(idx).padStart(4, '0')}_snapshot.json`;
	return JSON.parse(
		readFileSync(
			join(MIGRATIONS_FOLDER, 'meta', file),
			'utf8',
		),
	);
}

export interface Snapshot {
	tables: Record<
		string,
		{
			name: string;
			columns: Record<
				string,
				{
					name: string;
					type: string;
					notNull: boolean;
					primaryKey: boolean;
					default?: string | number | boolean;
				}
			>;
			indexes: Record<
				string,
				{
					name: string;
					columns: { expression: string }[];
					isUnique: boolean;
				}
			>;
			foreignKeys: Record<
				string,
				{
					name: string;
					tableTo: string;
					onDelete?: string;
					onUpdate?: string;
				}
			>;
			compositePrimaryKeys: Record<
				string,
				{ name: string; columns: string[] }
			>;
			uniqueConstraints: Record<
				string,
				{ name: string; columns: string[] }
			>;
			checkConstraints: Record<
				string,
				{ name: string; value: string }
			>;
		}
	>;
}

/**
 * Returns a migrations folder that stops at migration `idx` (inclusive).
 * For the latest migration this is the real folder. Otherwise it is a
 * temporary copy of the SQL files with a truncated `_journal.json`, which
 * is all drizzle's migrator reads.
 */
export function migrationsUpTo(idx: number): {
	folder: string;
	cleanup: () => void;
} {
	if (idx === latestMigrationIndex())
		return { folder: MIGRATIONS_FOLDER, cleanup: () => {} };

	const journal = readJournal();
	const entries = journal.entries.filter(
		(e) => e.idx <= idx,
	);
	if (!entries.some((e) => e.idx === idx))
		throw new Error(`No migration with index ${idx}`);

	const folder = mkdtempSync(
		join(tmpdir(), `sagat-migrations-${idx}-`),
	);
	mkdirSync(join(folder, 'meta'));
	for (const entry of entries)
		copyFileSync(
			join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
			join(folder, `${entry.tag}.sql`),
		);
	writeFileSync(
		join(folder, 'meta/_journal.json'),
		JSON.stringify({ ...journal, entries }, null, 2),
	);
	return {
		folder,
		cleanup: () =>
			rmSync(folder, { recursive: true, force: true }),
	};
}

function urlFor(dbName: string) {
	const withoutDb = CONNECTION_STRING.split('/')
		.slice(0, -1)
		.join('/');
	return `${withoutDb}/${dbName}`;
}

async function adminQuery(sql: string) {
	const admin = new Pool({
		connectionString: CONNECTION_STRING,
	});
	try {
		await admin.query(sql);
	} finally {
		await admin.end();
	}
}

export interface ScratchDb {
	name: string;
	url: string;
	pool: Pool;
	/** Runs `sql` and returns the rows as arrays, without column names. */
	rows: (sql: string) => Promise<unknown[][]>;
	/** Runs `sql` and returns the first column of the first row. */
	value: (sql: string) => Promise<unknown>;
	/** Applies every migration up to and including `idx`. */
	migrateTo: (idx: number) => Promise<void>;
}

/**
 * Creates an empty database, hands it to `fn`, and drops it afterwards
 * whether `fn` passed or threw.
 */
export async function withScratchDb(
	label: string,
	fn: (db: ScratchDb) => Promise<void>,
) {
	const name = `mig_${label}_${Date.now()}_${Math.random()
		.toString(36)
		.slice(2, 8)}`;
	await adminQuery(`CREATE DATABASE ${name}`);
	const pool = new Pool({ connectionString: urlFor(name) });
	// Notices (e.g. from DO blocks) are expected; keep them out of the output.
	pool.on('connect', (client) => {
		client.on('notice', () => {});
	});

	const db: ScratchDb = {
		name,
		url: urlFor(name),
		pool,
		rows: async (sql) =>
			(await pool.query({ text: sql, rowMode: 'array' }))
				.rows,
		value: async (sql) =>
			(await pool.query({ text: sql, rowMode: 'array' }))
				.rows[0]?.[0],
		migrateTo: async (idx) => {
			const { folder, cleanup } = migrationsUpTo(idx);
			try {
				await migrate(drizzle(pool), {
					migrationsFolder: folder,
				});
			} finally {
				cleanup();
			}
		},
	};

	try {
		await fn(db);
	} finally {
		await pool.end();
		await adminQuery(
			`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`,
		);
	}
}

/** Applied migrations, as recorded by drizzle. */
export async function appliedMigrationCount(db: ScratchDb) {
	return Number(
		await db.value(
			'SELECT count(*) FROM drizzle.__drizzle_migrations',
		),
	);
}

export async function publicTables(db: ScratchDb) {
	return sortBytes(
		(
			await db.rows(
				`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
			)
		).map((r) => r[0] as string),
	);
}

// Sorted in JS so the result does not depend on the database collation.
const sortBytes = (xs: string[]) =>
	xs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Column default as text, written the same way on both sides: `now()` in
 * lower case, string literals without the cast Postgres adds
 * (`'draft'::text`), and `nextval('seq')` without `::regclass`.
 */
function normalizeDefault(value: string | null): string {
	if (value === null) return '';
	const v = value.trim();
	if (/^now\(\)$/i.test(v)) return 'now()';
	const nextval =
		/^nextval\('([^']+)'(?:::regclass)?\)$/i.exec(v);
	if (nextval) return `nextval('${nextval[1]}')`;
	const literal = /^('(?:[^']|'')*')::[a-z ]+$/i.exec(v);
	if (literal) return literal[1];
	return v.toLowerCase();
}

/**
 * A column as `table.column type[(length)] [not null] [default x]`, with
 * the type as `information_schema.columns.data_type` spells it.
 */
function columnLine(c: {
	table: string;
	column: string;
	dataType: string;
	maxLength: number | null;
	notNull: boolean;
	default: string;
}) {
	return (
		`${c.table}.${c.column} ${c.dataType}` +
		(c.maxLength === null ? '' : `(${c.maxLength})`) +
		(c.notNull ? ' not null' : '') +
		(c.default ? ` default ${c.default}` : '')
	);
}

// Drizzle snapshot column types as `information_schema.columns.data_type`.
const SNAPSHOT_DATA_TYPES: Record<string, string> = {
	text: 'text',
	boolean: 'boolean',
	smallint: 'smallint',
	integer: 'integer',
	bigint: 'bigint',
	serial: 'integer',
	timestamp: 'timestamp without time zone',
	varchar: 'character varying',
};

// `pg_constraint.confdeltype` / `confupdtype`, as drizzle spells them.
const FK_ACTIONS: Record<string, string> = {
	a: 'no action',
	r: 'restrict',
	c: 'cascade',
	n: 'set null',
	d: 'set default',
};

/**
 * The parts of the live schema that drizzle's snapshot also records, in a
 * shape that can be compared with `snapshotStructure`: columns with type,
 * length, nullability and default; primary keys; unique and check
 * constraints (names); foreign keys with target table and referential
 * actions; and plain indexes with their columns and uniqueness.
 */
export async function liveStructure(db: ScratchDb) {
	const columns = (
		await db.rows(`
		SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default
		FROM information_schema.columns WHERE table_schema = 'public'`)
	).map(
		([
			table,
			column,
			dataType,
			maxLength,
			isNullable,
			columnDefault,
		]) =>
			columnLine({
				table: table as string,
				column: column as string,
				dataType: dataType as string,
				maxLength:
					maxLength === null ? null : Number(maxLength),
				notNull: isNullable === 'NO',
				default: normalizeDefault(
					columnDefault as string | null,
				),
			}),
	);
	const primaryKeys = await db.rows(`
		SELECT c.conrelid::regclass::text || '(' || string_agg(a.attname, ',' ORDER BY a.attname) || ')'
		FROM pg_constraint c
		JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
		WHERE c.contype = 'p' AND c.connamespace = 'public'::regnamespace
		GROUP BY c.oid, c.conrelid`);
	const uniques = await db.rows(`
		SELECT conrelid::regclass::text || '.' || conname FROM pg_constraint
		WHERE contype = 'u' AND connamespace = 'public'::regnamespace`);
	// Names only: Postgres rewrites the expression of a check constraint.
	const checks = await db.rows(`
		SELECT conrelid::regclass::text || '.' || conname FROM pg_constraint
		WHERE contype = 'c' AND connamespace = 'public'::regnamespace`);
	const foreignKeys = (
		await db.rows(`
		SELECT conrelid::regclass::text || '.' || conname || ' -> ' || confrelid::regclass::text,
			confdeltype, confupdtype
		FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)
	).map(
		([fk, onDelete, onUpdate]) =>
			`${fk} on delete ${FK_ACTIONS[onDelete as string]} on update ${FK_ACTIONS[onUpdate as string]}`,
	);
	// Plain indexes only: the ones that back a primary key or unique
	// constraint are covered above.
	const indexes = await db.rows(`
		SELECT t.relname || '.' || i.relname || '(' || string_agg(a.attname, ',' ORDER BY k.ord) || ')'
			|| CASE WHEN x.indisunique THEN ' unique' ELSE '' END
		FROM pg_index x
		JOIN pg_class i ON i.oid = x.indexrelid
		JOIN pg_class t ON t.oid = x.indrelid
		JOIN pg_namespace n ON n.oid = t.relnamespace
		CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
		JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
		WHERE n.nspname = 'public'
			AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid)
		GROUP BY t.relname, i.relname, x.indisunique`);
	const flat = (rows: unknown[][]) =>
		sortBytes(rows.map((r) => r[0] as string));
	return {
		columns: sortBytes(columns),
		primaryKeys: flat(primaryKeys),
		uniques: flat(uniques),
		checks: flat(checks),
		foreignKeys: sortBytes(foreignKeys),
		indexes: flat(indexes),
	};
}

export function snapshotStructure(snapshot: Snapshot) {
	const columns: string[] = [];
	const primaryKeys: string[] = [];
	const uniques: string[] = [];
	const checks: string[] = [];
	const foreignKeys: string[] = [];
	const indexes: string[] = [];
	for (const table of Object.values(snapshot.tables)) {
		const t = table.name;
		const pk: string[] = [];
		for (const c of Object.values(table.columns)) {
			const type = /^(\w+)(?:\((\d+)\))?$/.exec(c.type);
			const dataType = type && SNAPSHOT_DATA_TYPES[type[1]];
			if (!dataType)
				throw new Error(
					`Unmapped snapshot column type ${c.type} (${t}.${c.name})`,
				);
			columns.push(
				columnLine({
					table: t,
					column: c.name,
					dataType,
					maxLength: type[2] ? Number(type[2]) : null,
					notNull: c.notNull,
					default:
						c.type === 'serial'
							? `nextval('${t}_${c.name}_seq')`
							: normalizeDefault(
									c.default === undefined
										? null
										: String(c.default),
								),
				}),
			);
			if (c.primaryKey) pk.push(c.name);
		}
		if (pk.length)
			primaryKeys.push(`${t}(${pk.sort().join(',')})`);
		for (const p of Object.values(
			table.compositePrimaryKeys,
		))
			primaryKeys.push(
				`${t}(${[...p.columns].sort().join(',')})`,
			);
		for (const u of Object.values(table.uniqueConstraints))
			uniques.push(`${t}.${u.name}`);
		for (const c of Object.values(table.checkConstraints))
			checks.push(`${t}.${c.name}`);
		for (const f of Object.values(table.foreignKeys))
			foreignKeys.push(
				`${t}.${f.name} -> ${f.tableTo} on delete ${f.onDelete ?? 'no action'} on update ${f.onUpdate ?? 'no action'}`,
			);
		for (const i of Object.values(table.indexes))
			indexes.push(
				`${t}.${i.name}(${i.columns.map((c) => c.expression).join(',')})${i.isUnique ? ' unique' : ''}`,
			);
	}
	return {
		columns: sortBytes(columns),
		primaryKeys: sortBytes(primaryKeys),
		uniques: sortBytes(uniques),
		checks: sortBytes(checks),
		foreignKeys: sortBytes(foreignKeys),
		indexes: sortBytes(indexes),
	};
}
