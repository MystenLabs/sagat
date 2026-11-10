// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export const QueryKeys = {
	Multisig: 'multisig',
	Multisigs: 'multisigs',
	User: 'user',
	Balances: 'balances',
	OwnedObjects: 'owned-objects',
	SuiGasCoins: 'sui-gas-coins',
	CoinMetadata: 'coin-metadata',
	SuinsDefaultName: 'suins-default-name',
	RecognizedCoins: 'recognized-coins',
	Proposal: 'proposal-single',
	Proposals: 'proposals',
	Pending: 'pending',
	All: 'all',
	Executed: 'executed',
	Invitations: 'invitations',
	EpochInfo: 'epoch-info',
	OnChainTransaction: 'on-chain-transaction',
	ApiHealth: 'api-health',
} as const;

export const MutationKeys = {
	SignIn: 'sign-in',
	SignOut: 'sign-out',
	BuildTransfer: 'build-transfer',
	SignProposal: 'sign-proposal',
	AddProposer: 'add-proposer',
	RemoveProposer: 'remove-proposer',
	RejectInvitation: 'reject-invitation',
	AcceptInvitation: 'accept-invitation',
	ExecuteProposal: 'execute-proposal',
	CreateProposal: 'create-proposal',
	VerifyProposal: 'verify-proposal',
	CreateMultisig: 'create-multisig',
	TransactionAnalysis: 'transaction-analysis',
	CancelProposal: 'cancel-proposal',
	DryRun: 'dry-run',
} as const;
