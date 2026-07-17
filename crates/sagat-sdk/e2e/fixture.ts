// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

import {
	fundAddress,
	getLocalClient,
} from '../../../api/test/setup/sui-network';
import { PersonalMessages } from '../../../sdk/src/constants';

const client = getLocalClient();

const signPersonalMessage = async (
	keypair: Ed25519Keypair,
	message: string,
) => {
	const { signature } = await keypair.signPersonalMessage(
		new TextEncoder().encode(message),
	);
	return signature;
};

const fixtureKey = async () => {
	const keypair = new Ed25519Keypair();
	const expiry = new Date(
		Date.now() + 10 * 60 * 1000,
	).toISOString();
	const connectSignature = await signPersonalMessage(
		keypair,
		PersonalMessages.connect(expiry),
	);

	return {
		address: keypair.toSuiAddress(),
		publicKey: keypair.getPublicKey().toSuiPublicKey(),
		secretKey: keypair.getSecretKey(),
		connectSignature,
		expiry,
	};
};

const requireArg = (index: number, name: string) => {
	const value = process.argv[index];
	if (!value)
		throw new Error(`missing required argument: ${name}`);
	return value;
};

const gasCoinProposal = async (
	secretKey: string,
	sender: string,
	coinIndex: number,
	recipient: string,
	amount: number,
) => {
	const keypair = Ed25519Keypair.fromSecretKey(secretKey);
	const coins = await client.listCoins({ owner: sender });
	const gasCoin = coins.objects[coinIndex];

	if (!gasCoin) {
		throw new Error(
			`missing gas coin at index ${coinIndex}; only found ${coins.objects.length}`,
		);
	}

	const tx = new Transaction();
	tx.setSender(sender);
	tx.setGasPayment([
		{
			objectId: gasCoin.objectId,
			version: gasCoin.version,
			digest: gasCoin.digest,
		},
	]);
	const [coin] = tx.splitCoins(tx.gas, [amount]);
	tx.transferObjects([coin], recipient);

	const built = await tx.build({ client });
	const { signature } =
		await keypair.signTransaction(built);

	return {
		transactionBytes: built.toBase64(),
		signature,
	};
};

const multiCoinsToAddress = async (
	secretKey: string,
	recipient: string,
	count: number,
	amountPerCoin: number,
) => {
	const keypair = Ed25519Keypair.fromSecretKey(secretKey);

	if (!(await fundAddress(keypair.toSuiAddress()))) {
		throw new Error(
			`failed to fund source address: ${keypair.toSuiAddress()}`,
		);
	}

	const tx = new Transaction();
	tx.setSender(keypair.toSuiAddress());
	for (let i = 0; i < count; i++) {
		tx.moveCall({
			target: '0x2::pay::split_and_transfer',
			arguments: [
				tx.gas,
				tx.pure.u64(amountPerCoin),
				tx.pure.address(recipient),
			],
			typeArguments: ['0x2::sui::SUI'],
		});
	}

	const result = await keypair.signAndExecuteTransaction({
		transaction: tx,
		client,
	});

	if (result.$kind !== 'Transaction') {
		throw new Error(
			'multi-coin funding transaction failed',
		);
	}

	await client.waitForTransaction({
		digest: result.Transaction.digest,
	});

	return {
		success: true,
		digest: result.Transaction.digest,
	};
};

const transactionSignature = async (
	secretKey: string,
	transactionBytes: string,
) => {
	const keypair = Ed25519Keypair.fromSecretKey(secretKey);
	const tx = Transaction.from(transactionBytes);
	const built = await tx.build({ client });
	const { signature } =
		await keypair.signTransaction(built);

	return { signature };
};

const mismatchedSignatureProposal = async (
	secretKey: string,
	sender: string,
	coinIndex: number,
	signedRecipient: string,
	signedAmount: number,
	submittedRecipient: string,
	submittedAmount: number,
) => {
	const signed = await gasCoinProposal(
		secretKey,
		sender,
		coinIndex,
		signedRecipient,
		signedAmount,
	);
	const submitted = await gasCoinProposal(
		secretKey,
		sender,
		coinIndex,
		submittedRecipient,
		submittedAmount,
	);

	return {
		transactionBytes: submitted.transactionBytes,
		signature: signed.signature,
	};
};

const command = process.argv[2] ?? 'key';

if (
	command === 'accept-signature' ||
	command === 'reject-signature' ||
	command === 'cancel-proposal-signature' ||
	command === 'add-proposer-signature' ||
	command === 'remove-proposer-signature'
) {
	const secretKey = requireArg(3, 'secret-key');
	const keypair = Ed25519Keypair.fromSecretKey(secretKey);
	let message: string;

	if (command === 'cancel-proposal-signature') {
		const proposalId = Number(requireArg(4, 'proposal-id'));
		message = PersonalMessages.cancelProposal(proposalId);
	} else if (
		command === 'add-proposer-signature' ||
		command === 'remove-proposer-signature'
	) {
		const proposer = requireArg(4, 'proposer');
		const multisigAddress = requireArg(
			5,
			'multisig-address',
		);
		const expiry = requireArg(6, 'expiry');
		message =
			command === 'add-proposer-signature'
				? PersonalMessages.addMultisigProposer(
						proposer,
						multisigAddress,
						expiry,
					)
				: PersonalMessages.removeMultisigProposer(
						proposer,
						multisigAddress,
						expiry,
					);
	} else {
		const multisigAddress = requireArg(
			4,
			'multisig-address',
		);
		message =
			command === 'accept-signature'
				? PersonalMessages.acceptMultisigInvitation(
						multisigAddress,
					)
				: PersonalMessages.rejectMultisigInvitation(
						multisigAddress,
					);
	}

	const signature = await signPersonalMessage(
		keypair,
		message,
	);

	process.stdout.write(JSON.stringify({ signature }));
} else if (command === 'key') {
	process.stdout.write(JSON.stringify(await fixtureKey()));
} else if (command === 'fund-address') {
	const address = requireArg(3, 'address');
	if (!(await fundAddress(address))) {
		throw new Error(`failed to fund address: ${address}`);
	}
	process.stdout.write(JSON.stringify({ success: true }));
} else if (command === 'gas-coin-proposal') {
	const secretKey = requireArg(3, 'secret-key');
	const sender = requireArg(4, 'sender');
	const coinIndex = Number(requireArg(5, 'coin-index'));
	const recipient = requireArg(6, 'recipient');
	const amount = Number(requireArg(7, 'amount'));

	process.stdout.write(
		JSON.stringify(
			await gasCoinProposal(
				secretKey,
				sender,
				coinIndex,
				recipient,
				amount,
			),
		),
	);
} else if (command === 'multi-coins-to-address') {
	const secretKey = requireArg(3, 'secret-key');
	const recipient = requireArg(4, 'recipient');
	const count = Number(requireArg(5, 'count'));
	const amountPerCoin = Number(
		requireArg(6, 'amount-per-coin'),
	);

	process.stdout.write(
		JSON.stringify(
			await multiCoinsToAddress(
				secretKey,
				recipient,
				count,
				amountPerCoin,
			),
		),
	);
} else if (command === 'transaction-signature') {
	const secretKey = requireArg(3, 'secret-key');
	const transactionBytes = requireArg(
		4,
		'transaction-bytes',
	);

	process.stdout.write(
		JSON.stringify(
			await transactionSignature(
				secretKey,
				transactionBytes,
			),
		),
	);
} else if (command === 'mismatched-signature-proposal') {
	const secretKey = requireArg(3, 'secret-key');
	const sender = requireArg(4, 'sender');
	const coinIndex = Number(requireArg(5, 'coin-index'));
	const signedRecipient = requireArg(6, 'signed-recipient');
	const signedAmount = Number(
		requireArg(7, 'signed-amount'),
	);
	const submittedRecipient = requireArg(
		8,
		'submitted-recipient',
	);
	const submittedAmount = Number(
		requireArg(9, 'submitted-amount'),
	);

	process.stdout.write(
		JSON.stringify(
			await mismatchedSignatureProposal(
				secretKey,
				sender,
				coinIndex,
				signedRecipient,
				signedAmount,
				submittedRecipient,
				submittedAmount,
			),
		),
	);
} else {
	throw new Error(
		`unknown fixture command: ${command}; expected key, accept-signature, reject-signature, cancel-proposal-signature, add-proposer-signature, remove-proposer-signature, fund-address, gas-coin-proposal, multi-coins-to-address, transaction-signature, or mismatched-signature-proposal`,
	);
}
