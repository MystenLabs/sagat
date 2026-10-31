// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { VALIDATION } from './lib/constants';

const TITLE_MAX =
	VALIDATION.MAX_PROPOSAL_DESCRIPTION_LENGTH;

/** The markers after a signer's name: a word, or in parentheses inline. */
const MARKERS = {
	you: { word: 'You', parens: '(you)' },
	creator: { word: 'Creator', parens: '(creator)' },
	external: { word: 'External', parens: '(external)' },
} as const;

function signerCount(count: number) {
	return count === 1 ? '1 signer' : `${count} signers`;
}

/**
 * Every user-facing string of the app, by screen. Strings with values are
 * functions. Components import `content` from `@/content`; files under
 * `lib/` import it relatively, since e2e loads them without the alias.
 */
export const content = {
	common: {
		/** Buttons, links and menu items. */
		actions: {
			cancel: 'Cancel',
			close: 'Close',
			back: 'Back',
			continue: 'Continue',
			goBack: 'Go back',
			tryAgain: 'Try again',
			copy: 'Copy',
			copyAddress: 'Copy address',
			viewOnExplorer: 'View on explorer',
			review: 'Review',
			createPod: 'Create a pod',
			newProposal: 'New proposal',
			receive: 'Receive',
			send: 'Send',
			remove: 'Remove',
			reject: 'Reject',
			loadMore: 'Load more',
			signAndExecute: 'Sign and execute',
		},
		/** Field, row and column labels. */
		fields: {
			signer: 'Signer',
			signers: 'Signers',
			weight: 'Weight',
			totalWeight: 'Total weight',
			yourWeight: 'Your weight',
			threshold: 'Threshold',
			suiAddress: 'Sui address',
			address: 'Address',
			publicKey: 'Public key',
			network: 'Network',
			status: 'Status',
			owner: 'Owner',
			asset: 'Asset',
			balance: 'Balance',
			type: 'Type',
			sender: 'Sender',
			gas: 'Gas',
			digest: 'Digest',
			signature: 'Signature',
			actions: 'Actions',
		},
		/** Progress, status and loading lines. */
		states: {
			copied: 'Copied',
			loadingPod: 'Loading pod',
			loadingMore: 'Loading…',
			retrying: 'Trying again…',
			balancesLoadFailed: 'Failed to load balances',
			confirmInWallet: 'Confirm in your wallet…',
			signing: 'Signing…',
			signed: 'Signed',
			notSigned: 'Not signed',
			/** A failed transaction's fallback when the chain gives no reason. */
			failedOnChain: 'The transaction failed on chain.',
		},
		unknownKey: 'Unknown key',
		/** The heading of the wizards' next-steps card. */
		whatHappensNext: 'What happens next',
		/** The transaction preview block's name, as heading or region label. */
		transactionPreview: 'Transaction preview',
		/** "4 of 7": a threshold against the total weight. */
		thresholdLabel: (
			threshold: number,
			totalWeight: number,
		) => `${threshold} of ${totalWeight}`,
		/** Conjunctions, such as the word `joinList` puts before the last item. */
		and: 'and',
		or: 'or',
	},
	shell: {
		reconnectingWallet: 'Reconnecting wallet',
		checkingAuth: 'Checking authentication',
		theme: {
			label: 'Theme',
			ariaLabel: (active: string) => `Theme: ${active}`,
			light: 'Light',
			dark: 'Dark',
			system: 'System',
		},
		alpha: {
			badge: 'ALPHA',
			title: 'Pods is in alpha',
			body: 'Pods is in alpha and still evolving, so some features may change and new ones will roll out along the way. Your funds stay secure on Sui, and nothing moves without the signatures your pod requires.',
		},
		controls: {
			copyToClipboard: 'Copy to clipboard',
			copyFullDigest: 'Copy full digest',
			recognizedCoin: 'Recognized coin',
			coinIcon: (symbol?: string | null) =>
				symbol ? `${symbol} icon` : 'coin icon',
			breadcrumb: 'Breadcrumb',
		},
	},
	sidebar: {
		home: 'Home',
		invitations: 'Invitations',
		developer: 'Developer',
		resources: 'Resources',
		viewDocs: 'View Docs',
		github: 'GitHub',
		collapse: 'Collapse sidebar',
		expand: 'Expand sidebar',
		toggle: 'Toggle Sidebar',
		mobileTitle: 'Sidebar',
		mobileDescription: 'Displays the mobile sidebar.',
	},
	switcher: {
		menuLabel: 'Your pods',
		noAccounts: 'No pods yet',
	},
	receive: {
		title: 'Receive',
		description: (name: string) =>
			`Send SUI and tokens to ${name}.`,
		qrTitle: (address: string) => `QR code for ${address}`,
		note: 'Anyone can send to this address, no approval needed.',
	},
	signedOut: {
		/** What a wallet with no name is called in the copy. */
		unnamedWallet: 'your wallet',
		/** The line shown when the user turns the wallet's request down. */
		declined: (wallet: string) =>
			`You declined the request in ${wallet}. You’re not signed in.`,
		signIn: {
			title: 'Sign in to continue',
			description:
				'Signing proves you own this wallet. It doesn’t send a transaction or move any funds.',
			button: 'Sign in',
			signingIn: 'Signing in…',
		},
		connect: {
			title: 'Connect a wallet to get started',
			description:
				'Connect your wallet to see your pods, proposals and invitations.',
		},
		walletPicker: {
			label: 'Connect wallet',
			noWallets:
				'No wallets found. Install a wallet (e.g. Slush Wallet) to continue.',
		},
		walletMenu: {
			triggerLabel: (label: string) => `Wallet ${label}`,
			disconnect: 'Disconnect',
		},
	},
	firstUse: {
		loading: 'Loading pods',
		title: 'Pods',
		emptyTitle: 'You’re not in any pods yet',
		emptyDescription:
			'Create a pod to hold funds with other signers, or accept an invitation when someone adds you to theirs.',
		viewInvitations: 'View invitations',
	},
	network: {
		menuLabel: 'Network',
		triggerLabel: (network: string) =>
			`Network: ${network}`,
		notInWallet: (wallet: string | undefined) =>
			`Not in ${wallet}`,
		notAvailable: 'Not available',
		switchToMainnet: 'Switch to Mainnet',
		switchToTestnet: 'Switch to Testnet',
		testMode: {
			region: 'Test mode',
			title: 'Test mode.',
			connectedTo: (network: string) =>
				`You’re connected to ${network}.`,
			noRealFunds: 'No real funds will be used.',
		},
		devnet: {
			title: 'Devnet Not Supported',
			body: 'Pods doesn’t support devnet.',
			hint: 'Switch to a supported network to continue.',
		},
	},
	states: {
		loading: 'Loading',
		error: {
			title: 'Something went wrong',
			fallback: 'Try again in a moment.',
		},
		apiUnreachable: {
			title: 'Can’t reach the service',
			body: 'Pods couldn’t connect to its API. Check your connection and try again.',
		},
	},
	dialogs: {
		dismiss: 'Dismiss',
	},
	invitations: {
		page: {
			title: 'Invitations',
			description:
				'Pods you’ve been asked to join as a signer.',
			pendingTab: 'Pending',
			rejectedTab: 'Rejected',
			loadFailed: 'Failed to load invitations',
			emptyPendingTitle: 'No invitations yet',
			emptyPendingDescription:
				'When someone adds you as a signer on a pod, the invitation shows up here.',
			emptyRejectedTitle: 'No rejected invitations',
			emptyRejectedDescription:
				'Invitations you turn down stay here for your records.',
		},
		card: {
			invitedByName: (label: string) =>
				`Invited by ${label}`,
			invitedBy: 'Invited by',
			unknownKey: 'an unknown key',
			rejectedNote: 'You rejected this invitation.',
			review: 'Review invitation',
		},
		/** The error line when the wallet gives no reason. */
		walletRejected: 'The wallet rejected the request.',
		rejectDialog: {
			failedTitle: 'Couldn’t reject the invitation',
			failedDescription:
				'The rejection didn’t go through. Try again, or go back to the invitation.',
			title: 'Reject this invitation?',
			/** `creator` is the creator's name, when the invitation has one. */
			description: (
				name: string,
				creator?: string | null,
			) =>
				`You won’t join ${name}, and ${creator || 'its creator'} will see that you rejected the invitation.`,
			confirm: 'Reject invitation',
		},
		reviewDialog: {
			failedTitle: (name: string) =>
				`Couldn’t join ${name}`,
			failedDescription:
				'Accepting didn’t complete. Try again, or check your pod list in case it went through.',
			title: (name: string) => `Join ${name}?`,
			/** Stands in for an unknown creator, before "invited you as a signer." */
			someone: 'Someone',
			invitedYou: 'invited you as a signer.',
			note: 'Check each address before you accept. Accepting doesn’t move funds or cost gas.',
			accept: 'Accept invitation',
		},
		weightBar: {
			accepted: 'Accepted weight',
		},
	},
	createMultisig: {
		// The wizard's messages, which lib/create-multisig reads.
		invalidKey:
			'This isn’t a valid Sui public key. Check that you copied the whole key.',
		duplicateKey: (other: string) =>
			`${other} already uses this key. Each signer needs their own key.`,
		duplicateKeyYours: (position: number) =>
			`You already use this key (signer ${position}). Each signer needs their own key.`,
		noKey: (label: string) =>
			`No public key found for this address. It hasn’t signed a transaction yet. ${
				label
					? `Ask ${label} for their public key.`
					: 'Ask them for their public key.'
			}`,
		tooFewSigners:
			'Add at least one more signer. A pod needs 2 or more.',
		everyoneMustSign:
			'Every signer must sign every proposal. If one signer loses their key, the pod can’t move funds.',
		emptyAddress:
			'Appears once you add signers and set a threshold.',
		lookupFailed:
			'Couldn’t look up this address. Check your connection and try again.',
		createFailed:
			'Couldn’t create the pod. Nothing was sent to the signers and your setup is still here. Check your connection and try again.',
		labelInvalid:
			'This name has hidden characters (such as a zero-width joiner) that can’t be saved. Remove them to continue.',

		title: 'Create a pod',
		breadcrumbParent: 'Pods',
		steps: ['Name', 'Signers and threshold', 'Review'],

		/** What copy calls a signer without a label. */
		you: 'You',
		youInline: 'you',
		signerN: (position: number) => `Signer ${position}`,
		/** The duplicate-key owner: "Daniel (signer 2)". */
		signerWithPosition: (name: string, position: number) =>
			`${name} (signer ${position})`,
		/** The success banner's name for an unnamed signer with no address. */
		aSigner: 'a signer',

		nameRequired: 'Give the pod a name.',
		nameTooLong: (length: number, max: number) =>
			`${length} of ${max} characters. Use ${max} or fewer.`,

		blockedNoKey: (position: number) =>
			`Add a public key for signer ${position}, or remove the row, to continue.`,
		addressNoKey: (position: number) =>
			`Add a public key for signer ${position}, or remove the row to see the address.`,
		/** "signer 2", "signers 2 and 3". */
		blockedSigners: (count: number, positions: string) =>
			`${count === 1 ? 'signer' : 'signers'} ${positions}`,
		blockedFinish: (which: string) =>
			`Finish or remove ${which} to continue.`,
		addressFinish: (which: string) =>
			`Finish or remove ${which} to see the address.`,

		aloneYou: (weight: number, threshold: number) =>
			`You can approve proposals alone. Your weight (${weight}) is at or above the threshold (${threshold}). Lower your weight below ${threshold}, or raise the threshold above ${weight}.`,
		aloneNamed: (
			name: string,
			weight: number,
			threshold: number,
		) =>
			`${name} can approve proposals alone. ${name}’s weight (${weight}) is at or above the threshold (${threshold}). Lower ${name}’s weight below ${threshold}, or raise the threshold above ${weight}.`,
		aloneMany: (names: string, highest: number) =>
			`${names} can approve proposals alone. Raise the threshold to ${highest + 1} or more so every proposal needs at least two signers.`,

		/** Labels shared by the steps and the side cards. */
		fields: {
			name: 'Name',
		},

		nameStep: {
			title: 'Name your pod',
			description:
				'Signers see this name in their invitation.',
			label: 'Pod name',
			placeholder: 'e.g. Treasury Operations',
			count: (length: number, max: number) =>
				`${length} of ${max} characters`,
		},

		signersStep: {
			title: 'Signers',
			description:
				'Paste each signer’s public key, or search by their address.',
			count: (count: number, max: number) =>
				`${count} of ${max}`,
			addSigner: 'Add signer',
			maxSigners: (max: number) => `Up to ${max} signers`,
			orderNote:
				'Signer order affects the address. Drag to reorder before you create the pod.',
			thresholdTitle: 'Approval threshold',
			thresholdDescription:
				'How much signer weight a proposal needs before it can be executed.',
			ofTotalWeight: (totalWeight: number) =>
				`of ${totalWeight} total weight`,
		},

		signerRow: {
			dragLabel: (position: number) =>
				`Drag to reorder signer ${position}`,
			drag: 'Drag to reorder',
			yourNamePlaceholder: 'Your name',
			namePlaceholder: 'Name',
			nameLabel: (position: number) =>
				`Signer ${position} name`,
			weightLabel: (position: number) =>
				`Signer ${position} weight`,
			removeLabel: (position: number) =>
				`Remove signer ${position}`,
			remove: 'Remove signer',
			keyPlaceholder:
				'Paste a public key, or search by address',
			keyLabel: (position: number) =>
				`Signer ${position} public key or address`,
			clear: 'Clear',
			labelCount: (length: number, max: number) =>
				`Name: ${length} of ${max} characters${length > max ? `. Use ${max} or fewer.` : ''}`,
			yourWallet: 'Your connected wallet',
			validKey: 'Valid public key',
			lookingUp: 'Looking up the public key…',
		},

		stepper: {
			decrease: (label: string) =>
				`Decrease ${label.toLowerCase()}`,
			increase: (label: string) =>
				`Increase ${label.toLowerCase()}`,
		},

		reviewStep: {
			title: 'Review and create',
			description:
				'Check the setup before you create the pod.',
			editName: 'Edit name',
			signersAndThreshold: 'Signers and threshold',
			edit: 'Edit',
			creating: 'Creating pod…',
			create: 'Create pod',
		},

		preview: {
			title: 'Pod preview',
			notSet: 'Not set',
			live: 'Live preview of the current setup',
			/** "3 (+1 incomplete)". */
			signersIncomplete: (
				signers: number,
				incomplete: number,
			) => `${signers} (+${incomplete} incomplete)`,
		},

		nextSteps: {
			createdTitle: 'The pod is created',
			createdBody: (name: string) =>
				`${name} appears in your sidebar.`,
			acceptTitle: 'Signers accept',
			acceptBody: (invited: string) =>
				`${invited} will each get an invitation. They’ll see the pod once they accept.`,
			fundTitle: 'Fund the pod',
			fundBodyTest:
				'Get test SUI from the Sui faucet and send it to the pod’s Sui address. Test funds have no value, so it’s a safe way to try a proposal.',
			fundBody: (threshold: number, totalWeight: number) =>
				`Send SUI and tokens to the pod’s Sui address. Wait until every signer has accepted before you move real funds, so a wrong key is caught first. Moving them out needs approvals worth ${threshold} of the pod’s ${totalWeight} weight.`,
		},

		/** The create wizard's Help card. */
		help: [
			{
				id: 'what-is-a-multisig',
				question: 'What is a pod?',
				answer:
					'A shared Sui account that moves funds only when enough of its signers approve. No single key controls it unless you give that key enough weight.',
			},
			{
				id: 'weights-and-threshold',
				question: 'How do weights and the threshold work?',
				answer:
					'Each signer’s approval counts for their weight. A proposal can be executed once the approvals add up to the threshold.',
			},
			{
				id: 'public-key',
				question: 'What is a public key?',
				answer:
					'The shareable half of a signer’s wallet key, which Sui uses to check their signatures. Sharing it is safe, and an address that has signed a transaction before is enough to find it.',
			},
			{
				id: 'after-create',
				question: 'What happens after I create it?',
				answer:
					'Every other signer gets an invitation to accept. The Sui address can receive funds right away, but wait until everyone has accepted before you move real funds.',
			},
		],
	},
	wizard: {
		stepOf: (step: number, total: number) =>
			`Step ${step} of ${total}`,
		stepsLabel: 'Steps',
		/** Read after a finished step's label. */
		done: ' (done)',
	},
	/** The status line under a Sui address field. */
	addressField: {
		valid: 'Valid Sui address',
		invalid:
			'This isn’t a valid Sui address. Check you pasted all of it: 0x and 64 characters.',
		clear: 'Clear address',
	},
	/** The new-proposal wizard. lib/new-proposal reads the top-level keys. */
	newProposal: {
		chooseAsset: 'Choose an asset to send.',
		invalidAmount: (decimals: number) =>
			decimals === 0
				? 'Enter a whole number.'
				: `Enter a valid amount (up to ${decimals} decimals).`,
		zeroAmount: 'Enter an amount above 0.',
		overBalance: (symbol: string, balance: string) =>
			`More than the pod holds. The ${symbol} balance is ${balance}.`,
		/** Stands in for the symbol in the amount errors while it is unknown. */
		unknownSymbol: 'asset',
		addressPlaceholder:
			'Paste the full Sui address, starting with 0x',
		titlePlaceholderTransfer: 'Filled in from the transfer',
		titlePlaceholder: 'Add a title',
		titleHintTransfer:
			'Signers see this title in the proposal list. You can change it.',
		/** Under an empty title that no transfer fills in. */
		titleHintEmpty:
			'Without a title, signers see the proposal’s digest instead.',
		titleHintBytes:
			'Bytes don’t include a title. Name it so signers know what it does.',
		titleTooLong: (length: number) =>
			`${length} of ${TITLE_MAX} characters. Use ${TITLE_MAX} or fewer.`,
		unreadableBytes:
			'Pods can’t read this as a transaction. Paste the full base64 bytes or JSON, the way your tool exported them.',
		bytesUnresolved:
			'This JSON transaction isn’t fully built. Set its sender, gas and inputs before pasting it.',
		bytesWrongSender: (
			sender: string,
			accountName: string,
		) =>
			`These bytes are sent from ${sender}, not ${accountName}. Build the transaction with this pod as the sender.`,
		bytesRead: (commands: number) =>
			`Read as a transaction with ${commands} ${commands === 1 ? 'command' : 'commands'}, sent from this pod.`,
		bytesPlaceholder:
			'Paste the transaction as base64 bytes or JSON',
		typeNote:
			'You can review everything before anyone signs.',
		transferNote:
			'Pods simulates the transfer before anyone signs. You’ll see the result on the next step.',
		bytesNote:
			'Pods simulates the transaction before anyone signs. You’ll see the result on the next step.',
		buildFailed: (reason?: string) =>
			reason
				? `Couldn’t build the transfer: ${reason}`
				: 'Couldn’t build the transfer. Check your connection and try again.',
		noGas:
			'This pod has no SUI to pay gas. Send it some SUI before proposing a transfer.',
		maxPartial: (amount: string, symbol: string) =>
			`One transfer sends up to ${amount} ${symbol} from this pod: it holds its ${symbol} in more coins than one transfer can spend. Max fills that amount; the rest goes with the next transfer.`,
		overMax: (amount: string, symbol: string) =>
			`One transfer can send up to ${amount} ${symbol} from this pod. Use Max for the most it can send.`,
		simulationFailed: (reason: string) =>
			`Simulation failed: ${reason}. If executed, it would fail and the pod would still pay gas.`,
		/** The reason in `simulationFailed` when the simulation gives none. */
		simulationFailedFallback:
			'the transaction would fail on-chain',
		simulationUnreachable:
			'Couldn’t simulate the transaction. Check your connection and try again.',
		coinDataFailed:
			'Couldn’t load this coin’s details. Try again in a moment.',
		gasCoinsFailed:
			'Couldn’t load this pod’s coins, which Max and the amount check need. Try again.',
		createFailed:
			'Pods couldn’t create the proposal. Nothing was sent to the other signers. Check your connection and try again.',
		signatureDeclined:
			'The wallet didn’t sign the proposal. Nothing was created.',

		/** The default title of a transfer. */
		transferTitle: (
			amount: string,
			symbol: string,
			recipient: string,
		) => `Send ${amount} ${symbol} to ${recipient}`,

		title: 'New proposal',
		breadcrumbProposals: 'Proposals',
		steps: ['Type', 'Details', 'Review'],

		/** The radio cards on the Type step. */
		types: {
			transfer: {
				title: 'Transfer',
				description:
					'Send tokens from the pod to one address.',
			},
			bytes: {
				title: 'Transaction bytes',
				description:
					'Paste a transaction built somewhere else, such as the Sui CLI, and propose it as it is.',
			},
		},

		typeStep: {
			title: 'Choose a type',
			description:
				'What should this proposal do? Signers see the type in the proposal list.',
			groupLabel: 'Proposal type',
		},

		transferStep: {
			description: (account: string) =>
				`Send tokens from ${account} to one address.`,
			amountLabel: 'Amount',
			amountPlaceholder: '0.00',
			max: 'Max',
			recipientLabel: 'To',
			building: 'Building…',
		},

		assetSelect: {
			loading: 'Loading assets',
			noAssets: 'No assets to send',
			choose: 'Choose an asset',
			balance: (amount: string) => `Balance ${amount}`,
		},

		bytesStep: {
			description:
				'Paste a transaction built somewhere else. Pods reads it and simulates it before anyone signs.',
			bytesLabel: 'Bytes',
		},

		/** The title on the review step. */
		titleLabel: 'Title',
		/** The title field on the details steps. */
		titleFieldLabel: 'Title (optional)',

		review: {
			title: 'Review and propose',
			description:
				'Check the proposal before you sign and send it to the other signers.',
			creating: 'Creating proposal…',
			propose: 'Propose and sign',
			proposeAnyway: 'Propose and sign anyway',
			noTitle: 'No title',
			editTitle: 'Edit title',
		},

		from: {
			title: 'From',
			account: 'Pod',
			gasPaidBy: 'Paid from the pod',
		},

		nextSteps: {
			approveTitle: 'Your wallet asks you to approve',
			approveBody:
				'Approve the request in your wallet. Nothing is created until you do.',
			createdTitle: 'The proposal is created',
			createdBody:
				'It shows in Proposals with your signature.',
			createdBodyWithWeight: (
				yourWeight: number,
				threshold: number,
			) =>
				`It shows in Proposals with your signature, ${yourWeight} of the ${threshold} weight it needs.`,
			signTitle: 'The other signers sign',
			signBody: (threshold: number) =>
				`Once signatures reach ${threshold}, anyone can execute it.`,
		},

		/** The wizard's Help card. */
		help: [
			{
				id: 'what-happens',
				question: 'What happens when I propose?',
				answer:
					'Pods simulates the transaction, then your wallet asks you to sign. The proposal goes to Proposals with your signature counted.',
			},
			{
				id: 'who-can-see',
				question: 'Who can see and sign it?',
				answer:
					'Every signer of the pod, and anyone with the link, can see it. Only signers can sign. An external proposer can propose but not sign.',
			},
			{
				id: 'expiry',
				question: 'When does a proposal expire?',
				answer:
					'Only when its transaction uses address balances. The network sets the expiry at up to two epochs, about two days, and the proposal shows it. Other proposals don’t expire.',
			},
			{
				id: 'change',
				question: 'Can I change it after proposing?',
				answer:
					'No. A proposal can’t be edited after proposing. To change it, cancel it and propose again.',
			},
		],
	},
	/** The assets tab: its header, the balance list and each asset row. */
	assets: {
		header: {
			title: 'Balances',
			countEmpty: 'Balances for this pod',
			count: (count: number, hasMore: boolean) =>
				`${count}${hasMore ? '+' : ''} ${
					count === 1 && !hasMore ? 'balance' : 'balances'
				} tracked`,
			refresh: 'Refresh balances (5s cooldown)',
			explorer: 'Explorer',
		},
		list: {
			emptyTitle: 'No assets yet',
			emptyDescription:
				'This pod doesn’t hold any coins yet.',
		},
		row: {
			/** The raw on-chain amount, as a tooltip on the balance. */
			rawAmount: (raw: string) => `${raw} (raw)`,
			/** `signedPercent` is "+1.25" or "-0.40". */
			priceChange24h: (signedPercent: string) =>
				`(${signedPercent}% 24h)`,
		},
		tokens: {
			title: 'Tokens',
			refreshPrices: 'Refresh prices',
			pricesUpdated: (when: string) =>
				`Prices updated ${when}`,
			emptyTitle: 'No tokens yet.',
			price: 'Price',
			value: 'Value',
			noPrice: 'No price',
			verified: 'Verified',
			unverified: 'Unverified',
			unverifiedTokens: 'Unverified tokens',
			/** The raw on-chain amount, as a tooltip on a balance shown without decimals. */
			rawAmount: (raw: string) => `${raw} (raw)`,
		},
		/** Shown through `newProposal.buildFailed` when a transfer can't build. */
		transferErrors: {
			amountNotPositive:
				'Amount must be greater than zero.',
			maxOnlySui:
				'MAX gas-coin transfer is only supported for SUI.',
		},
	},
	/** The account pages' shell and the overview tab. */
	overview: {
		/** The account's pages, by `MULTISIG_PAGES` id: the sidebar items and page titles. */
		pages: {
			overview: 'Overview',
			proposals: 'Proposals',
			assets: 'Assets',
			signers: 'Members',
		},
		joined: (name: string, pendingMembers: number) =>
			`You joined ${name}.${
				pendingMembers > 0
					? ` ${pendingMembers} ${
							pendingMembers === 1
								? 'signer hasn’t'
								: 'signers haven’t'
						} accepted yet.`
					: ''
			}`,
		created: (invited: string) =>
			`Pod created. Invitations sent to ${invited}.`,

		value: {
			total: 'Total value',
			pricesUnavailable:
				'Prices are unavailable right now.',
			excludesUnpriced: (unpriced: number) =>
				`Excludes ${unpriced} ${unpriced === 1 ? 'token' : 'tokens'} without a price.`,
			noPrices: 'No prices for the tokens this pod holds.',
		},

		tokens: {
			viewAll: 'View all assets',
		},

		openProposals: {
			title: 'Open proposals',
			viewAll: 'View all proposals',
			emptyTitle: 'No proposals yet.',
		},

		setup: {
			title: 'Setup',
			created: 'Created',
			createdUnknown: 'Unknown',
			createdBy: 'Created by',
			download: 'Download setup',
		},

		/** The creator of an account from before the API recorded it. */
		creatorUnknown: 'Unknown',
	},
	/** The proposals list: tabs, table, rows, status chips, expiry, weight. */
	proposals: {
		tabs: {
			all: 'All',
			pending: 'To sign',
			waiting: 'Awaiting others',
			ready: 'Ready',
			executed: 'Executed',
			cancelled: 'Cancelled',
			expired: 'Expired',
		},
		// What an empty tab says.
		empty: {
			title: {
				all: 'No proposals yet',
				pending: 'Nothing to sign',
				waiting: 'Nothing awaiting others',
				ready: 'Nothing ready to execute',
				executed: 'No executed proposals',
				cancelled: 'No cancelled proposals',
				expired: 'No expired proposals',
			},
			allDescription:
				'Proposals show up here when a signer or external proposer creates one.',
			description: 'Proposals in this state show up here.',
		},
		refresh: 'Refresh proposals',
		table: {
			proposal: 'Proposal',
			proposer: 'Proposer',
			loadFailed: 'Proposals didn’t load',
			loadFailedBody:
				'Pods couldn’t load your proposals. Check your connection and try again.',
		},
		row: {
			youSigned: 'You signed',
			executeFailed: (message: string) =>
				`Couldn’t execute: ${message}`,
			moreActions: 'More actions',
			download: 'Download',
		},
		/** The status chip's label for where a proposal stands. */
		status: {
			executed: 'Executed',
			cancelled: 'Cancelled',
			failed: 'Failed',
			ready: 'Ready',
			pending: 'Pending',
			expired: 'Expired',
		},
		expiry: {
			expired: 'Expired',
			expiresIn: (timeLeft: string) =>
				`Expires in ${timeLeft}`,
			expiredExplain: (lastEpoch: bigint) =>
				`This transaction could only execute until the end of epoch ${lastEpoch}, so it can’t run anymore. Cancel it and propose it again.`,
			explain: (lastEpoch: bigint, endsAt: string | null) =>
				`This transaction can only execute until the end of epoch ${lastEpoch}, around ${endsAt}. After that, it has to be proposed again.`,
		},
		/** How long until a time, e.g. "2 days", "5 hours" or "12 minutes". */
		timeLeft: {
			underAMinute: 'less than a minute',
			days: (days: number) =>
				days === 1 ? '1 day' : `${days} days`,
			hours: (hours: number) =>
				hours === 1 ? '1 hour' : `${hours} hours`,
			minutes: (minutes: number) =>
				minutes === 1 ? '1 minute' : `${minutes} minutes`,
		},
		weight: {
			/** "2 of 4", the weight tooltip. */
			label: (current: number, total: number) =>
				`${current} of ${total}`,
			ariaLabel: (label: string) => `Weight ${label}`,
		},
	},
	/** The proposal page and its cards and dialogs. */
	proposal: {
		shared: {
			heading: 'Proposal',
			backLabel: 'Proposals',
			proposedBy: 'Proposed by',
			copyLink: 'Copy link',
			execute: 'Execute',
			executing: 'Executing…',
			cancelProposal: 'Cancel proposal',
		},
		load: {
			failed: 'Failed to load proposal',
			notFound: 'This proposal doesn’t exist.',
			hint: 'Check that the link is correct.',
			invalidDigest: 'Invalid digest',
			loading: 'Loading proposal',
			missingDigestTitle: 'Missing digest',
			missingDigestDescription:
				'Add the proposal digest to the URL as ?digest=… to open it.',
		},
		detail: {
			export: 'Export',
			switchToSeePreview: (network: string) =>
				`Switch to ${network} to see the transaction preview.`,
			notSimulated:
				'The transaction could not be simulated.',
			networkMismatch: (
				proposalNetwork: string,
				network: string,
			) =>
				`This proposal is on ${proposalNetwork}, but you’re on ${network}.`,
			switchTo: (network: string) => `Switch to ${network}`,
			/** `reason` from `withReason`: ": why", or nothing. */
			simulationFailed: (reason: string) =>
				`Simulation failed${reason}. If executed, it would fail and the pod would still pay gas.`,
			executionFailed: (reason: string) =>
				`Execution failed${reason}. No funds moved, but the pod paid gas.`,
		},
		approvals: {
			heading: 'Approvals',
			/** "Threshold 4 of 7". */
			threshold: (label: string) => `Threshold ${label}`,
			notNeeded: 'Not needed',
			executeAfterSigning: 'Execute after signing',
			signAnyway: 'Sign anyway',
			signProposal: 'Sign proposal',
			simulating: 'Simulating…',
			/** The line under the heading. */
			status: {
				executing: 'Threshold reached. Executing…',
				needs: (missing: number) =>
					`Needs ${missing} more weight.`,
				ready: 'Threshold reached. Ready to execute.',
				/** Ready, but the simulation fails. */
				readyFailing: 'Threshold reached.',
				executed: 'Threshold reached. Executed.',
				failed: 'Threshold reached. Execution failed.',
			},
			/** The note under the actions. */
			notes: {
				executing:
					'Submitted to the network. Waiting for it to confirm, this usually takes a few seconds. You can leave this page.',
				failed:
					'This proposal can’t be retried. Propose it again to collect new signatures.',
				cancelled:
					'Cancelled, so it can’t be signed or executed in Pods.',
				outsider:
					'Only this pod’s signers can sign or execute it.',
				expired:
					'This proposal can’t be signed or executed. Cancel it to take it off the open proposals.',
				readyFailing:
					'Execute simulates it again first, in case something has changed, like the pod’s balance.',
				gasPaidAbout: (gas: string) =>
					`Gas is paid from the pod, about ${gas}.`,
				gasPaid: 'Gas is paid from the pod.',
				signingFailing:
					'Signing adds your approval to a transaction that would fail as things stand.',
				notSimulated:
					'The transaction couldn’t be simulated. Check it in your wallet before you sign.',
				reachesThresholdGas:
					'Your signature reaches the threshold. Gas is paid from the pod.',
				reachesThreshold:
					'Your signature reaches the threshold.',
				needsAfterYours: (after: number) =>
					`Needs ${after} more weight after yours.`,
				/** Once the viewer signed. */
				waiting: {
					anyOther:
						'You signed. Any other signer can approve it.',
					one: (name: string) =>
						`You signed. ${name} can approve it.`,
					anyOneOf: (names: string) =>
						`You signed. Any one of ${names} can approve it.`,
					needs: (missing: number) =>
						`You signed. Needs ${missing} more weight from the other signers.`,
				},
			},
			/** Execute's second simulation of a failing proposal. */
			recheck: {
				couldNotRunTitle: 'Simulation couldn’t run',
				/** `reason` from `withReason`: ": why", or nothing. */
				couldNotRun: (reason: string) =>
					`The last simulation failed, and it couldn’t be simulated again${reason}.`,
				stillFailsTitle: 'Simulation still fails',
				stillFails: (reason: string) =>
					`It still fails after a second simulation${reason}.`,
			},
			executeAnyway: {
				/** `recheck`: the recheck's message, which leads the body. */
				body: (recheck: string, gas: string | null) =>
					`${recheck} If you execute, the proposal closes and can’t be retried, and the pod still pays gas${gas ? ` (about ${gas})` : ''}.`,
				confirm: 'Execute anyway',
			},
		},
		activity: {
			heading: 'Activity',
			you: (name: string) =>
				`${name} ${MARKERS.you.parens}`,
			external: (name: string) =>
				`${name} ${MARKERS.external.parens}`,
			proposedAndSigned: (proposer: string) =>
				`Proposed and signed by ${proposer}`,
			proposed: (proposer: string) =>
				`Proposed by ${proposer}`,
			signedBy: (name: string) => `Signed by ${name}`,
			thresholdReached: 'Threshold reached',
			executed: 'Executed',
			failed: 'Execution failed',
			cancelled: 'Cancelled',
			expired: 'Expired',
		},
		cancel: {
			title: 'Cancel this proposal?',
			/** `ready`: the signatures already meet the threshold. */
			alone: (title: string, ready: boolean) =>
				`Nobody else has signed “${title}” yet. It moves to the Cancelled tab, and no one can sign or execute it in Pods after this.${ready ? ' Your signature already meets the threshold and stays valid on chain, so anyone holding it can still execute the transaction.' : ''}`,
			others: (title: string, ready: boolean) =>
				`“${title}” ends for every signer and moves to the Cancelled tab. No one can sign or execute it in Pods after this.${ready ? ' The signatures already collected stay valid on chain.' : ''}`,
			cancelling: 'Cancelling…',
		},
		execute: {
			notPending: 'Proposal is not pending',
		},
		/** The Transaction card of an executed or failed proposal. */
		onChain: {
			heading: 'Transaction',
			gas: (gas: string) => `Gas ${gas}`,
			loadFailed: (message: string) =>
				`Couldn’t load the transaction from the chain: ${message}`,
			noExplorer: (network: string) =>
				`${network} has no explorer.`,
		},
	},
	signers: {
		title: 'Signers',
		columns: {
			invitation: 'Invitation',
		},
		markers: MARKERS,
		status: {
			accepted: 'Accepted',
			rejected: 'Rejected',
			pending: 'Invited',
		},
		loadError:
			'The latest pod details couldn’t be loaded, so this may be out of date.',
		summary: {
			bothAccepted: 'Both accepted',
			allAccepted: (total: number) =>
				`All ${total} accepted`,
			accepted: (accepted: number, total: number) =>
				`${accepted} of ${total} accepted`,
			oneRejected: (name: string) => `${name} rejected`,
			manyRejected: (count: number) => `${count} rejected`,
		},
		notice: {
			oneRejected: (name: string) =>
				`${name} rejected the invitation to join this pod, but can still sign a proposal you share.`,
			manyRejected: (count: number) =>
				`${count} signers rejected their invitations to join this pod, but can still sign a proposal you share.`,
			cantReachThreshold: (who: string) =>
				`${who} The rest can’t reach the threshold without them.`,
		},
		accountStatus: {
			needsRejected: (rejected: number) =>
				`${signerCount(rejected)} rejected, and the threshold needs them.`,
			manyRejected: (rejected: number) =>
				`${signerCount(rejected)} rejected their invitations.`,
			oneRejected: (name: string) =>
				`${name} rejected the invitation.`,
		},
	},
	proposers: {
		title: 'External proposers',
		addButton: 'Add external proposer',
		explanation:
			'External proposers are outside addresses, like a payments service, that can create proposals but can’t sign or execute them.',
		empty: 'No external proposers yet.',
		columns: {
			proposer: 'External proposer',
			added: 'Added',
		},
		addedBy: 'by',
		removeLabel: (address: string) => `Remove ${address}`,
		addDialog: {
			title: 'Add external proposer',
			description: (accountName: string) =>
				`This address can create proposals for ${accountName}. It can’t sign or execute them.`,
			addressPlaceholder: '0x…',
			submit: 'Add proposer',
		},
		removeDialog: {
			title: 'Remove external proposer?',
			/** Follows the proposer's address and a space. */
			description: (accountName: string) =>
				`won’t be able to create proposals for ${accountName} anymore.`,
		},
	},
	tools: {
		pages: {
			signatureAnalyzer: {
				name: 'Signature Analyzer',
				description:
					'Decode a Sui signature. Works for pod and single signatures.',
			},
			sign: {
				name: 'Transaction Signer',
				description:
					'Preview a Sui transaction and sign it with your connected wallet.',
			},
			broadcast: {
				name: 'Broadcasts',
				description:
					'Send a signed transaction to the Sui network.',
			},
		},
		transactionDigest: 'Transaction digest',
		copyDigest: 'Copy digest',
		signatureAnalyzer: {
			bytesLabel: 'Signature bytes',
			bytesPlaceholder:
				'Paste the signature bytes (base64)',
			unreadable:
				'Pods can’t read this as a signature. Paste the full signature in base64, the way your wallet or tool exported it.',
			multisigTitle: 'Pod',
			multisigAddress: 'Pod address',
			combinedPublicKey: 'Combined public key',
			signersTitle: (count: number) => `Signers (${count})`,
			signaturesTitle: (count: number) =>
				`Signatures (${count})`,
			signerNumber: (number: number) => `Signer ${number}`,
			weight: (weight: number) => `Weight ${weight}`,
			signatureTitle: 'Signature',
			scheme: 'Scheme',
		},
		sign: {
			dataLabel: 'Transaction data',
			dataPlaceholder:
				'Paste the transaction data (JSON or base64)',
			unreadable:
				'Pods can’t read this as a transaction. Paste the full data as JSON or base64, and check the network above.',
			networkWarning:
				'Make sure the network above matches the transaction.',
			previewing: 'Previewing transaction…',
			wouldFail: 'Transaction would fail on-chain',
			failedPrefix: 'Transaction failed:',
			executed:
				'Executed. The network accepted this transaction.',
			signed:
				'Signed. Copy the signature and share it with the other signers.',
			startOver: 'Start over',
			copySignature: 'Copy signature',
			connectWallet:
				'Connect a wallet to sign this transaction.',
			thresholdNote: (
				accountName: string,
				threshold: string,
			) =>
				`${accountName}’s threshold is ${threshold}, so it can’t run on your signature alone. Sign to add yours.`,
			foreignSender:
				'The sender isn’t your connected wallet, so this can’t run on your signature alone. Sign to add yours.',
			sign: 'Sign',
		},
		broadcast: {
			bytesLabel: 'Transaction bytes',
			bytesPlaceholder:
				'Paste the transaction bytes (base64)',
			bytesUnreadable:
				'Pods can’t read this as transaction bytes. Paste the full bytes in base64.',
			signatureLabel: 'Combined signature',
			signaturePlaceholder:
				'Paste the combined signature (base64)',
			signatureUnreadable:
				'Pods can’t read this as a signature. Paste the combined signature in base64.',
			sent: 'Sent. The network accepted this transaction.',
			another: 'Broadcast another',
			/**
			 * The failure line, on the picked network or on another one,
			 * with the node's message when it sent one.
			 */
			error: (message?: string) =>
				message
					? `Broadcast failed: ${message}`
					: 'Broadcast failed.',
			errorOn: (network: string, message?: string) =>
				message
					? `Broadcast on ${network} failed: ${message}`
					: `Broadcast on ${network} failed.`,
			broadcasting: 'Broadcasting…',
			submit: 'Broadcast transaction',
		},
	},
	transactionPreview: {
		views: {
			simulation: 'Simulation result',
			analyzer: 'Static analyzer',
		},
		help: {
			ariaLabel:
				'About the simulation and the static analyzer',
			simulation:
				'One dry run against the current on-chain state. It shows the expected effects, but it can miss some of what could leave the pod, because on-chain state can change before the transaction runs.',
			analyzer:
				'Reads the transaction itself and estimates the most that can leave the pod, not counting gas. It helps protect against on-chain state attacks.',
		},
		tabs: {
			balanceChanges: 'Balance changes',
			objectChanges: 'Object changes',
			events: 'Events',
			commands: 'Commands',
			rawJson: 'Raw JSON',
		},
		/** The status chip. */
		status: {
			passed: 'Simulation passed',
			failed: 'Simulation failed',
			pending: 'Simulating…',
		},
		recipient: 'Recipient',
		gasRebate: (amount: string) => `${amount} rebate`,
		rawJsonAriaLabel: 'Simulation result as JSON',
		rawJsonEmpty:
			'Nothing to show until the simulation runs.',
		ledgerHash: 'Ledger hash',
		signingNotice:
			'Always check the transaction in your wallet before you sign. Your wallet is the final word on what you approve.',
		showRaw: 'Show raw transaction',
		hideRaw: 'Hide raw transaction',
		rawBytesAriaLabel: 'Raw transaction bytes',
		details: {
			error: 'Error',
			epoch: 'Epoch',
		},
		balances: {
			change: 'Change',
			emptyFailed:
				'No balance changes to show. The simulation stopped before the transaction finished.',
			empty: 'No balance changes.',
			gasOwner: (name: string) => `${name} (gas)`,
		},
		events: {
			empty: 'No events were emitted.',
			package: 'Package',
			module: 'Module',
			data: 'Data',
			dataAriaLabel: 'Event data',
		},
		objects: {
			empty: 'No object changes.',
			all: 'All',
			kinds: {
				published: 'Published',
				created: 'Created',
				deleted: 'Deleted',
				wrapped: 'Wrapped',
				transferred: 'Transferred',
				mutated: 'Mutated',
			},
			objectId: 'Object ID',
		},
		owner: {
			immutable: 'Immutable',
			shared: 'Shared',
			unknown: 'Unknown Owner',
			parseFailed: 'Failed to find or parse owner.',
			sender: 'Sender',
		},
		commands: {
			empty: 'No commands.',
			descriptions: {
				MoveCall: 'Calls a smart contract function',
				TransferObjects: 'Transfers objects to an address',
				SplitCoins: 'Splits a coin into several',
				MergeCoins: 'Merges coins into one',
				Publish: 'Publishes a new package',
				Upgrade: 'Upgrades a package',
				MakeMoveVec: 'Creates a vector of Move values',
			} as Record<string, string>,
			missingInput: 'Missing input',
			pureBcs: 'Pure (BCS)',
			objectKinds: {
				shared: 'Shared',
				receiving: 'Receiving',
				owned: 'Owned',
			},
			objectKind: (kind: string) => `${kind} object`,
			target: 'Target',
			typeArguments: 'Type arguments',
			arguments: 'Arguments',
			objects: 'Objects',
			to: 'To',
			fromCoin: 'From coin',
			amounts: 'Amounts',
			intoCoin: 'Into coin',
			fromCoins: 'From coins',
			elements: 'Elements',
		},
		intent: {
			title: 'Static analyzer',
			advisory: 'Advisory',
			analyzing: 'Analyzing transaction intent…',
			unavailable: (message: string) =>
				`Transaction analyzer unavailable: ${message}`,
			senderFlows: 'Most that can leave the pod',
			sponsorFlows: 'Sponsor asset movement',
			noFlows:
				'No non-zero sender or sponsor balance outflows detected.',
			findings: 'Analyzer findings',
			moreFindings: (count: number) =>
				`+${count} more finding${count === 1 ? '' : 's'}`,
			commands: 'Commands',
			noCommands: 'No command details available.',
			objectAccess: 'Object access',
			read: (count: number) => `Read: ${count}`,
			mutate: (count: number) => `Mutate: ${count}`,
			transfer: (count: number) => `Transfer: ${count}`,
			moreObjects: (count: number) =>
				`+${count} more object${count === 1 ? '' : 's'}`,
			loadingCoin: 'Loading coin metadata…',
			footnote:
				'An estimate of the most this transaction can move out of the pod, not counting gas, and the objects it uses. Compare it with the simulation result and with your wallet before you sign.',
		},
	},
	toasts: {
		addressCopied: 'Address copied',
		copiedWithExclamation: 'Copied!',
		copyFailed: 'Failed to copy to clipboard',
		walletDisconnected: 'Wallet disconnected',
		authenticationFailed: (message: string) =>
			`Authentication failed: ${message}`,
		disconnectFailed: (message: string) =>
			`Disconnect failed: ${message}`,
		lateSignInKeptSession:
			'Sign-out didn’t finish: a late sign-in kept the session.',
		notAvailableInWallet: (wallet: string | undefined) =>
			`Not available in ${wallet}`,
		invitationRejected: 'Invitation rejected',
		proposalCreated: 'Proposal created',
		coinTypeCopied: 'Coin type copied',
		proposalCancelled: 'Proposal cancelled',
		proposalCancelFailed: (message: string) =>
			`Failed to cancel proposal: ${message}`,
		proposalExecuted: 'Proposal executed',
		proposalExecuteFailed: 'Couldn’t execute the proposal',
		/** The link on a failed execution toast. */
		seeDetails: 'See details',
		proposalSignFailed: 'Couldn’t sign the proposal',
		signatureAdded: 'Signature added',
		signatureAddedNeeds: (missing: number) =>
			`Signature added. Needs ${missing} more weight.`,
		proposalLinkCopied: 'Link copied',
		digestCopied: 'Digest copied',
		proposerAdded: 'External proposer added',
		proposerAddFailed: 'Failed to add proposer',
		proposerRemoved: 'External proposer removed',
		proposerRemoveFailed: 'Failed to remove proposer',
		signatureCopied: 'Signature copied',
		signFailed: 'Failed to sign the transaction',
		ledgerHashCopied: 'Ledger hash copied',
	},
	errors: {
		noWalletConnected: 'No wallet connected',
		serviceUnreachable: 'Can’t reach the service',
		noConnectedAccount: 'No connected account',
		multisigAsMember:
			'This address is a pod. A pod can’t be added as a signer of another pod.',
	},
} as const;
