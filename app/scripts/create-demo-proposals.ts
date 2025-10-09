import {
	getFullnodeUrl,
	SuiClient,
} from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';

const client = new SuiClient({
	url: getFullnodeUrl('testnet'),
});
const MULTISIG_ADDRESS =
	'0xd7cd4de83dd4ac8ce21852073d05e1f0e83f4577133e836ccbe812bb4ced967f';

const buildSimpleTx = async () => {
	const tx = new Transaction();

	tx.setSender(MULTISIG_ADDRESS);

	const coin = tx.splitCoins(tx.gas, [1000000]);
	tx.transferObjects([coin], '0x1');

	const built = await tx.build({ client });

	// eslint-disable-next-line no-console
	console.log(toBase64(built));
};

buildSimpleTx();
