// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// The API keeps its own copy of the signed messages, so it needs neither
// SDK at runtime. A text that drifts from an SDK would refuse every
// signature made with that SDK.

import { PersonalMessages } from '@mysten/sagat';
import { PersonalMessages as LegacyPersonalMessages } from '@mysten/sagat-legacy';
import { expect, test } from 'bun:test';

import {
	LegacyMessages,
	V1Messages,
} from '../src/constants/messages';

type Messages = Record<
	string,
	(...args: never[]) => string
>;

// Every message of `messages`, built from the same arguments.
const render = (messages: Messages) =>
	Object.fromEntries(
		Object.entries(messages).map(([name, message]) => [
			name,
			(message as (...args: string[]) => string)(
				'0xproposer',
				'0xaccount',
				'2026-10-21T00:00:00.000Z',
			),
		]),
	);

test('the legacy texts are the legacy SDK ones', () => {
	expect(render(LegacyMessages)).toEqual(
		render(LegacyPersonalMessages),
	);
});

test('the /v1 texts are the SDK ones', () => {
	expect(render(V1Messages)).toEqual(
		render(PersonalMessages),
	);
});
