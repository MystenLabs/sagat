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
import { AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { FieldDisplay } from '@/components/ui/FieldDisplay';
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
		<div className="bg-white border rounded-lg">
			<div className="p-4 border-b">
				<h3 className="text-lg font-semibold">
					Signature #{index}
				</h3>
				<p className="text-sm text-gray-600">{scheme}</p>
			</div>
			<div className="p-4">
				<div className="space-y-3">
					<FieldDisplay
						label="Sui Address"
						value={suiAddress}
					/>
					<FieldDisplay
						label="Sui Format Public Key ( flag | pk )"
						value={signature.publicKey.toSuiPublicKey()}
					/>
					<FieldDisplay
						label="Serialized Signature"
						value={signature.serializedSignature}
					/>
					<FieldDisplay
						label="Public Key"
						value={signature.publicKey.toBase64()}
					/>
				</div>
			</div>
		</div>
	);
}

function MultiSigDetails({
	multisigInfo,
}: {
	multisigInfo: MultiSigInfo;
}) {
	return (
		<div className="bg-white border border-blue-200 rounded-lg">
			<div className="p-4 border-b border-blue-200">
				<h3 className="text-lg font-semibold">
					MultiSig Configuration
				</h3>
				<p className="text-sm text-gray-600">
					Combined MultiSig Public Key Information
				</p>
			</div>
			<div className="p-4">
				<div className="space-y-4">
					<FieldDisplay
						label="MultiSig Address"
						value={multisigInfo.publicKey.toSuiAddress()}
						copyMessage="Copied multisig address to clipboard"
					/>
					<FieldDisplay
						label="MultiSig Public Key"
						value={multisigInfo.publicKey.toSuiPublicKey()}
						copyMessage="Copied multisig public key to clipboard"
					/>
					<FieldDisplay
						label="Threshold"
						value={multisigInfo.threshold}
						copyable={false}
					/>

					<div className="space-y-1">
						<div className="text-sm font-medium text-gray-700">
							Participants (
							{multisigInfo.participants.length})
						</div>
						<div className="space-y-3">
							{multisigInfo.participants.map(
								(participant, index) => (
									<div
										key={index}
										className="bg-gray-50 rounded-md p-3 border"
									>
										<div className="flex justify-between items-start mb-2">
											<span className="font-medium text-gray-900">
												Participant #{index + 1}
											</span>
											<div className="flex gap-2">
												<span className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs font-medium">
													{participant.keyType}
												</span>
												<span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
													Weight: {participant.weight}
												</span>
											</div>
										</div>
										<div className="space-y-2 text-sm">
											<div className="flex items-center justify-between">
												<div className="flex-1 min-w-0">
													<span className="text-gray-600">
														Address:
													</span>{' '}
													<span className="font-mono">
														{participant.suiAddress}
													</span>
												</div>
											</div>
											<div className="flex items-center justify-between">
												<div className="flex-1 min-w-0">
													<span className="text-gray-600">
														Public Key:
													</span>{' '}
													<span className="font-mono break-all">
														{participant.publicKey.toBase64()}
													</span>
												</div>
											</div>
										</div>
									</div>
								),
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
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
		<div className="flex flex-col gap-4">
			<div className="grid w-full gap-1.5">
				<label className="text-sm font-medium text-gray-700">
					Signature Bytes (base64 encoded)
				</label>
				<Textarea
					rows={4}
					value={signature}
					onChange={(e) => setSignature(e.target.value)}
					placeholder="Paste your signature bytes here (base64 encoded)..."
				/>
			</div>

			{error && (
				<div className="border border-red-200 bg-red-50 rounded-lg p-4">
					<div className="flex items-center gap-2 mb-2">
						<AlertCircle className="w-5 h-5 text-red-600" />
						<h3 className="font-medium text-red-900">
							Error
						</h3>
					</div>
					<p className="text-sm text-red-700">
						{error.message}
					</p>
				</div>
			)}

			<div className="flex flex-col gap-6 mt-6">
				{multisigInfo && (
					<MultiSigDetails multisigInfo={multisigInfo} />
				)}

				{listSignaturePubKeys &&
					listSignaturePubKeys.length > 0 && (
						<div className="flex flex-col gap-4">
							<h3 className="text-2xl font-bold">
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
		</div>
	);
}
