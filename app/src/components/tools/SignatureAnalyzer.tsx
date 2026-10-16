// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	parseSerializedSignature,
	toSerializedSignature,
	type PublicKey,
	type SignatureScheme,
} from '@mysten/sui/cryptography';
import {
	MultiSigPublicKey,
	parsePartialSignatures,
} from '@mysten/sui/multisig';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';
import { useEffect, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Chip } from '@/components/ui/chip';
import { FieldDisplay } from '@/components/ui/FieldDisplay';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

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
		keyType: string;
	}[];
}

// Helper function to determine key type from flag
function getKeyTypeFromFlag(flag: number): string {
	switch (flag) {
		case 0:
			return 'Ed25519';
		case 1:
			return 'Secp256k1';
		case 2:
			return 'Secp256r1';
		case 3:
			return 'MultiSig';
		case 5:
			return 'ZkLogin';
		default:
			return `Unknown (${flag})`;
	}
}
/*
MultiSig (v2)
AwIAvlJnUP0iJFZL+QTxkKC9FHZGwCa5I4TITHS/QDQ12q1sYW6SMt2Yp3PSNzsAay0Fp2MPVohqyyA02UtdQ2RNAQGH0eLk4ifl9h1I8Uc+4QlRYfJC21dUbP8aFaaRqiM/f32TKKg/4PSsGf9lFTGwKsHJYIMkDoqKwI8Xqr+3apQzAwADAFriILSy9l6XfBLt5hV5/1FwtsIsAGFow3tefGGvAYCDAQECHRUjB8a3Kw7QQYsOcM2A5/UpW42G9XItP1IT+9I5TzYCADtqJ7zOtqQtYqOo0CpvDXNlMhV3HeJDpjrASKGLWdopAwMA
*/

/*
Single Sig
AIYbCXAhPmILpWq6xsEY/Nu310Kednlb60Qcd/nD+u2WCXE/FvSXNRUQW9OQKGqt2CeskPyv2SEhaKMZ8gLkdQ8mmO01tDJz7vn6/2dqh+WEcmx7I/NKn8H6ornbk+HM4g==
*/

function Signature({
	signature,
	index,
}: {
	signature: SignaturePubkeyPair;
	index: number;
}) {
	const suiAddress = signature.publicKey.toSuiAddress();
	const scheme = signature.signatureScheme.toString();

	return (
		<Panel
			title={`Signature #${index}`}
			subtitle={scheme}
			data-testid="signature-card"
			data-address={suiAddress}
			data-scheme={scheme}
		>
			<FieldDisplay
				label="Sui address"
				value={suiAddress}
			/>
			<FieldDisplay
				label="Sui public key (flag | pk)"
				value={signature.publicKey.toSuiPublicKey()}
			/>
			<FieldDisplay
				label="Serialized signature"
				value={signature.serializedSignature}
			/>
			<FieldDisplay
				label="Public key"
				value={signature.publicKey.toBase64()}
			/>
		</Panel>
	);
}

function MultiSigDetails({
	multisigInfo,
}: {
	multisigInfo: MultiSigInfo;
}) {
	return (
		<Panel
			title="Multisig configuration"
			subtitle="The combined public key and its signers"
			data-testid="multisig-details"
			data-address={multisigInfo.publicKey.toSuiAddress()}
			data-threshold={multisigInfo.threshold}
		>
			<FieldDisplay
				label="Multisig address"
				value={multisigInfo.publicKey.toSuiAddress()}
				copyMessage="Multisig address copied"
			/>
			<FieldDisplay
				label="Multisig public key"
				value={multisigInfo.publicKey.toSuiPublicKey()}
				copyMessage="Multisig public key copied"
			/>
			<FieldDisplay
				label="Threshold"
				value={multisigInfo.threshold}
				copyable={false}
			/>

			<div className="flex flex-col gap-2">
				<div className="text-12 text-muted-foreground">
					Participants ({multisigInfo.participants.length})
				</div>
				<ul className="flex flex-col gap-2">
					{multisigInfo.participants.map(
						(participant, index) => (
							<li
								key={index}
								className="flex flex-col gap-2 rounded-lg border bg-surface p-3"
								data-testid="multisig-participant"
								data-address={participant.suiAddress}
								data-weight={participant.weight}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="text-13 font-medium">
										Participant #{index + 1}
									</span>
									<div className="flex gap-1.5">
										<Chip variant="tag">
											{participant.keyType}
										</Chip>
										<Chip variant="neutral">
											Weight {participant.weight}
										</Chip>
									</div>
								</div>
								<dl className="grid gap-1 text-12">
									<div className="flex gap-2">
										<dt className="w-20 shrink-0 text-muted-foreground">
											Address
										</dt>
										<dd className="min-w-0 font-mono break-all">
											{participant.suiAddress}
										</dd>
									</div>
									<div className="flex gap-2">
										<dt className="w-20 shrink-0 text-muted-foreground">
											Public key
										</dt>
										<dd className="min-w-0 font-mono break-all">
											{participant.publicKey.toBase64()}
										</dd>
									</div>
								</dl>
							</li>
						),
					)}
				</ul>
			</div>
		</Panel>
	);
}

/** A titled block of fields inside the tool card. */
function Panel({
	title,
	subtitle,
	children,
	...props
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
} & React.ComponentProps<'section'>) {
	return (
		<section
			className="flex flex-col gap-4 rounded-lg border p-4"
			{...props}
		>
			<div className="flex flex-col gap-0.5">
				<h3 className="text-14 font-medium">{title}</h3>
				{subtitle && (
					<p className="text-12 text-muted-foreground">
						{subtitle}
					</p>
				)}
			</div>
			{children}
		</section>
	);
}

export default function SignatureAnalyzer() {
	const [signature, setSignature] = useState('');
	const [error, setError] = useState<Error | null>(null);
	const [listSignaturePubKeys, setListSignaturePubkeys] =
		useState<SignaturePubkeyPair[] | null>(null);
	const [multisigInfo, setMultisigInfo] =
		useState<MultiSigInfo | null>(null);

	// Auto-analyze on input change with debounce
	useEffect(() => {
		// Clear everything first
		setError(null);
		setMultisigInfo(null);
		setListSignaturePubkeys(null);

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
								(publicKey as { keyType?: string })
									.keyType ||
								getKeyTypeFromFlag(publicKey.flag()),
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
					// Handle single signatures
					try {
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
									publicKey: publicKey,
								}),
							},
						]);
					} catch (keyError) {
						throw new Error(
							`Failed to parse public key for ${parsedSignature.signatureScheme}: ${keyError instanceof Error ? keyError.message : 'Unknown error'}`,
						);
					}
				}
			} catch (e) {
				setError(
					e instanceof Error
						? e
						: new Error(
								'Failed to parse signature. Please check the format.',
							),
				);
			}
		}, 350); // 500ms debounce

		return () => clearTimeout(timer);
	}, [signature]);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Label htmlFor="signature-bytes">
					Signature bytes (base64)
				</Label>
				<Textarea
					id="signature-bytes"
					rows={4}
					data-testid="signature-input"
					value={signature}
					onChange={(e) => setSignature(e.target.value)}
					placeholder="Paste a serialized signature…"
					className="font-mono text-12"
				/>
			</div>

			{error && (
				<Alert
					variant="error"
					data-testid="signature-error"
				>
					<span className="font-medium">
						Couldn't parse the signature.
					</span>{' '}
					{error.message}
				</Alert>
			)}

			{multisigInfo && (
				<MultiSigDetails multisigInfo={multisigInfo} />
			)}

			{listSignaturePubKeys &&
				listSignaturePubKeys.length > 0 && (
					<div className="flex flex-col gap-3">
						<h3 className="text-16 font-semibold">
							Signatures
						</h3>
						{listSignaturePubKeys.map(
							(signature, index) => (
								<Signature
									key={index}
									index={index}
									signature={signature}
								/>
							),
						)}
					</div>
				)}
		</div>
	);
}
