// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	parseSerializedSignature,
	SIGNATURE_FLAG_TO_SCHEME,
	toSerializedSignature,
	type PublicKey,
	type SignatureFlag,
	type SignatureScheme,
} from '@mysten/sui/cryptography';
import {
	MultiSigPublicKey,
	parsePartialSignatures,
} from '@mysten/sui/multisig';
import { formatAddress } from '@mysten/sui/utils';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';
import { useEffect, useState, type ReactNode } from 'react';

import { Chip } from '@/components/ui/chip';
import { CopyButton } from '@/components/ui/CopyButton';
import { content } from '@/content';
import { sumWeight, thresholdLabel } from '@/lib/threshold';

import {
	BytesField,
	NetworkField,
	ToolCard,
} from './parts';

const FIELDS = content.common.fields;
const COPY = content.tools.signatureAnalyzer;

interface SignaturePubkeyPair {
	serializedSignature: string;
	signatureScheme: SignatureScheme;
	publicKey: PublicKey;
	signature: Uint8Array;
	weight: number;
}

interface MultiSigInfo {
	publicKey: MultiSigPublicKey;
	threshold: number;
	participants: {
		publicKey: PublicKey;
		weight: number;
		suiAddress: string;
		keyType: SignatureScheme;
	}[];
}

/** A value in full, mono, with a copy button beside it, for a list row. */
function Copyable({ value }: { value: string }) {
	return (
		<span className="flex min-w-0 items-center gap-1 font-mono text-12">
			<span className="min-w-0 break-all">{value}</span>
			<CopyButton value={value} size="inline" />
		</span>
	);
}

/** A titled list of label/value rows. */
function DetailBlock({
	title,
	children,
	...props
}: {
	title: string;
	children: ReactNode;
} & React.ComponentProps<'section'>) {
	return (
		<section className="flex flex-col gap-2" {...props}>
			<h3 className="text-14 font-medium">{title}</h3>
			<div className="flex flex-col divide-y rounded-lg border">
				{children}
			</div>
		</section>
	);
}

function DetailRow({
	label,
	children,
	...props
}: {
	label: ReactNode;
	children: ReactNode;
} & React.ComponentProps<'div'>) {
	return (
		<div
			className="flex items-center justify-between gap-4 px-3 py-2"
			{...props}
		>
			<span className="shrink-0 text-13 text-muted-foreground">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 text-right text-13">
				{children}
			</div>
		</div>
	);
}

function SchemeChip({ scheme }: { scheme: string }) {
	return (
		<Chip variant="tag" className="font-mono">
			{scheme}
		</Chip>
	);
}

function MultiSigDetails({
	multisigInfo,
	signatures,
}: {
	multisigInfo: MultiSigInfo;
	signatures: SignaturePubkeyPair[];
}) {
	const address = multisigInfo.publicKey.toSuiAddress();
	const combinedKey =
		multisigInfo.publicKey.toSuiPublicKey();
	const totalWeight = sumWeight(multisigInfo.participants);
	const signedKeys = new Set(
		signatures.map((sig) => sig.publicKey.toSuiPublicKey()),
	);
	const signerIndex = (suiAddress: string) =>
		multisigInfo.participants.findIndex(
			(participant) =>
				participant.suiAddress === suiAddress,
		);

	return (
		<div
			className="flex flex-col gap-5"
			data-testid="multisig-details"
			data-address={address}
			data-threshold={multisigInfo.threshold}
		>
			<DetailBlock title={COPY.multisigTitle}>
				<DetailRow label={COPY.multisigAddress}>
					<Copyable value={address} />
				</DetailRow>
				<DetailRow label={FIELDS.threshold}>
					{thresholdLabel({
						threshold: multisigInfo.threshold,
						totalWeight,
					})}
				</DetailRow>
				<DetailRow label={COPY.combinedPublicKey}>
					<Copyable value={combinedKey} />
				</DetailRow>
			</DetailBlock>

			<DetailBlock
				title={COPY.signersTitle(
					multisigInfo.participants.length,
				)}
			>
				{multisigInfo.participants.map(
					(participant, index) => {
						const suiPublicKey =
							participant.publicKey.toSuiPublicKey();
						const signed = signedKeys.has(suiPublicKey);
						return (
							<DetailRow
								key={index}
								label={COPY.signerNumber(index + 1)}
								data-testid="multisig-participant"
								data-address={participant.suiAddress}
								data-weight={participant.weight}
								data-signed={signed}
							>
								<Copyable value={participant.suiAddress} />
								<Copyable value={suiPublicKey} />
								<SchemeChip scheme={participant.keyType} />
								<span className="shrink-0 whitespace-nowrap">
									{COPY.weight(participant.weight)}
								</span>
								{signed ? (
									<Chip variant="success">
										{content.common.states.signed}
									</Chip>
								) : (
									<Chip
										variant="tag"
										className="font-mono text-muted-foreground"
									>
										{content.common.states.notSigned}
									</Chip>
								)}
							</DetailRow>
						);
					},
				)}
			</DetailBlock>

			<DetailBlock
				title={COPY.signaturesTitle(signatures.length)}
			>
				{signatures.map((signature, index) => {
					const suiAddress =
						signature.publicKey.toSuiAddress();
					const signer = signerIndex(suiAddress);
					return (
						<DetailRow
							key={index}
							label={
								<>
									{signer >= 0
										? COPY.signerNumber(signer + 1)
										: FIELDS.signer}{' '}
									·{' '}
									<span className="font-mono text-12">
										{formatAddress(suiAddress)}
									</span>
								</>
							}
							data-testid="signature-card"
							data-address={suiAddress}
							data-scheme={signature.signatureScheme.toString()}
						>
							<Copyable
								value={signature.serializedSignature}
							/>
						</DetailRow>
					);
				})}
			</DetailBlock>
		</div>
	);
}

function SingleSignature({
	signature,
}: {
	signature: SignaturePubkeyPair;
}) {
	const suiAddress = signature.publicKey.toSuiAddress();
	const suiPublicKey = signature.publicKey.toSuiPublicKey();

	return (
		<DetailBlock
			title={COPY.signatureTitle}
			data-testid="signature-card"
			data-address={suiAddress}
			data-scheme={signature.signatureScheme.toString()}
		>
			<DetailRow label={COPY.scheme}>
				<SchemeChip scheme={signature.signatureScheme} />
			</DetailRow>
			<DetailRow label={FIELDS.signer}>
				<Copyable value={suiAddress} />
			</DetailRow>
			<DetailRow label={FIELDS.publicKey}>
				<Copyable value={suiPublicKey} />
			</DetailRow>
			<DetailRow label={FIELDS.signature}>
				<Copyable value={signature.serializedSignature} />
			</DetailRow>
		</DetailBlock>
	);
}

export default function SignatureAnalyzer() {
	const [signature, setSignature] = useState('');
	const [error, setError] = useState(false);
	const [listSignaturePubKeys, setListSignaturePubkeys] =
		useState<SignaturePubkeyPair[] | null>(null);
	const [multisigInfo, setMultisigInfo] =
		useState<MultiSigInfo | null>(null);

	// Every edit clears the last reading; the effect reads the new one.
	const handleSignatureChange = (value: string) => {
		setSignature(value);
		setError(false);
		setMultisigInfo(null);
		setListSignaturePubkeys(null);
	};

	// Auto-analyze on input change with debounce
	useEffect(() => {
		// Don't analyze empty input
		if (!signature.trim()) return;

		const timer = setTimeout(() => {
			try {
				const parsedSignature =
					parseSerializedSignature(signature);

				if (
					parsedSignature.signatureScheme === 'MultiSig'
				) {
					// Create MultiSigPublicKey instance to access all the metadata
					const multiSigPubKey = new MultiSigPublicKey(
						parsedSignature.multisig.multisig_pk,
					);

					// Get all participants with their weights
					const participants = multiSigPubKey
						.getPublicKeys()
						.map(({ publicKey, weight }) => ({
							publicKey,
							weight,
							suiAddress: publicKey.toSuiAddress(),
							keyType:
								SIGNATURE_FLAG_TO_SCHEME[
									publicKey.flag() as SignatureFlag
								],
						}));

					// Store multisig information
					setMultisigInfo({
						publicKey: multiSigPubKey,
						threshold: multiSigPubKey.getThreshold(),
						participants,
					});

					// Parse individual signatures
					const partialSignatures = parsePartialSignatures(
						parsedSignature.multisig,
					);
					setListSignaturePubkeys(
						partialSignatures.map((sig) => {
							return {
								signatureScheme: sig.signatureScheme,
								publicKey: sig.publicKey,
								signature: sig.signature,
								weight: sig.weight,
								serializedSignature: toSerializedSignature({
									signatureScheme: sig.signatureScheme,
									signature: sig.signature,
									publicKey: sig.publicKey,
								}),
							};
						}),
					);
				} else {
					const publicKey = publicKeyFromRawBytes(
						parsedSignature.signatureScheme,
						parsedSignature.publicKey,
					);

					setListSignaturePubkeys([
						{
							signatureScheme:
								parsedSignature.signatureScheme,
							publicKey,
							signature: parsedSignature.signature,
							weight: 1,
							serializedSignature: toSerializedSignature({
								signatureScheme:
									parsedSignature.signatureScheme,
								signature: parsedSignature.signature,
								publicKey,
							}),
						},
					]);
				}
			} catch {
				setError(true);
			}
		}, 350);

		return () => clearTimeout(timer);
	}, [signature]);

	return (
		<ToolCard>
			<NetworkField />
			<BytesField
				id="signature-bytes"
				label={COPY.bytesLabel}
				testId="signature-input"
				placeholder={COPY.bytesPlaceholder}
				minHeight="min-h-30"
				value={signature}
				onChange={handleSignatureChange}
				error={error ? COPY.unreadable : undefined}
				errorTestId="signature-error"
			/>

			{multisigInfo && listSignaturePubKeys && (
				<MultiSigDetails
					multisigInfo={multisigInfo}
					signatures={listSignaturePubKeys}
				/>
			)}

			{!multisigInfo &&
				listSignaturePubKeys &&
				listSignaturePubKeys.length > 0 && (
					<SingleSignature
						signature={listSignaturePubKeys[0]}
					/>
				)}
		</ToolCard>
	);
}
