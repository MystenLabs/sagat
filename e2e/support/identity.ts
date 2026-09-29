// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SagatClient } from '@mysten/sagat';
import { type Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

import { E2E } from './env';

// A test user: a fresh keypair per test, so every test gets its own
// multisig addresses and tests never collide, even when run in parallel.
export class Identity {
	readonly address: string;
	readonly publicKey: string;
	// The SDK client, pointed at the e2e API. It keeps this identity's session
	// cookie, since Node's fetch has no cookie jar.
	readonly api: SagatClient;
	#cookie: string | null = null;

	constructor(
		readonly name: string,
		readonly keypair: Ed25519Keypair,
	) {
		this.address = keypair.toSuiAddress();
		this.publicKey = keypair
			.getPublicKey()
			.toSuiPublicKey();
		this.api = new SagatClient(
			E2E.apiUrl,
			'cookie',
			async (input, init) => {
				const headers = new Headers(init?.headers);
				if (this.#cookie)
					headers.set('Cookie', this.#cookie);
				const response = await fetch(input, {
					...init,
					headers,
				});
				const cookie = response.headers
					.get('set-cookie')
					?.match(/connected-wallet=[^;]*/)?.[0];
				if (cookie) this.#cookie = cookie;
				return response;
			},
		);
	}

	async signMessage(message: string) {
		const { signature } =
			await this.keypair.signPersonalMessage(
				new TextEncoder().encode(message),
			);
		return signature;
	}

	// Signs base64 transaction bytes, as stored by the API.
	async signTransaction(transactionBytes: string) {
		const { signature } =
			await this.keypair.signTransaction(
				fromBase64(transactionBytes),
			);
		return signature;
	}
}
