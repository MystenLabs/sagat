// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable no-console */

// Runs each `test/*.test.ts` file in its own `bun test` process. Files can't
// share a process: each one points `src/db` at its own database with
// `mock.module`, which applies to the whole process.
//
// At most 4 files run at once (E2E_CONCURRENCY overrides it): each file's pg
// pool can open up to 10 connections, and Postgres allows 100 by default.
// Extra arguments, e.g. `--bail`, are passed to every `bun test`.
import { Glob } from 'bun';

// Slowest first, so none of them starts last and runs alone. Files not listed
// run after these.
const SLOW_FILES = [
	'address-balance-proposals.test.ts',
	'proposal-business-logic.test.ts',
	'address-aliases.test.ts',
	'object-collision.test.ts',
];

const testDir = import.meta.dir;
const concurrency =
	Number(process.env.E2E_CONCURRENCY) || 4;
const extraArgs = process.argv.slice(2);

const rank = (file: string) => {
	const index = SLOW_FILES.indexOf(file);
	return index === -1 ? SLOW_FILES.length : index;
};

const files = [...new Glob('*.test.ts').scanSync(testDir)]
	.sort()
	.sort((a, b) => rank(a) - rank(b));

type Result = {
	file: string;
	passed: boolean;
	seconds: number;
};

async function runFile(file: string): Promise<Result> {
	const start = performance.now();
	const child = Bun.spawn(
		[
			process.execPath,
			'test',
			'--timeout',
			'30000',
			`./test/${file}`,
			...extraArgs,
		],
		{
			cwd: `${testDir}/..`,
			// Piped output has no color; keep it when the runner is on a terminal.
			env: process.stdout.isTTY
				? { FORCE_COLOR: '1', ...process.env }
				: process.env,
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);

	// Both streams go into one buffer in arrival order, printed once the file
	// is done so output from different files doesn't interleave.
	const chunks: Uint8Array[] = [];
	const collect = async (
		stream: ReadableStream<Uint8Array>,
	) => {
		const reader = stream.getReader();
		for (
			let read = await reader.read();
			!read.done;
			read = await reader.read()
		)
			chunks.push(read.value);
	};
	await Promise.all([
		collect(child.stdout),
		collect(child.stderr),
	]);
	const exitCode = await child.exited;

	// bun doesn't always print the file name, so say which file this is.
	process.stdout.write(`\n==> ${file}\n`);
	process.stdout.write(Buffer.concat(chunks));
	return {
		file,
		passed: exitCode === 0,
		seconds: (performance.now() - start) / 1000,
	};
}

const start = performance.now();
const queue = [...files];
const results: Result[] = [];
const worker = async () => {
	for (let file = queue.shift(); file; file = queue.shift())
		results.push(await runFile(file));
};
await Promise.all(
	Array.from({ length: concurrency }, worker),
);
const wall = (performance.now() - start) / 1000;

console.log(
	`\n${results.length} files, ${concurrency} at a time, ${wall.toFixed(1)}s:`,
);
for (const { file, passed, seconds } of results)
	console.log(
		`  ${passed ? 'pass' : 'FAIL'} ${seconds.toFixed(1).padStart(5)}s  ${file}`,
	);

const failed = results.filter((r) => !r.passed).length;
if (failed > 0 || results.length === 0) {
	console.log(
		results.length === 0
			? 'No test files found.'
			: `${failed} of ${results.length} files failed.`,
	);
	process.exit(1);
}
