// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// Validation schemas for multisig creation
export const memberSchema = z.object({
	id: z.string(),
	publicKey: z.string().min(1, 'Public key required'),
	weight: z.number().min(1).max(255),
	isCreator: z.boolean().optional(),
	error: z.string().optional(),
});

export const createMultisigSchema = z
	.object({
		name: z
			.string()
			.max(255, 'Name must be 255 characters or less'),
		members: z
			.array(memberSchema)
			.min(2, 'At least 2 members required')
			.max(10, 'Maximum 10 members allowed'),
		threshold: z.number().min(1),
	})
	.refine(
		(data) => {
			const totalWeight = data.members.reduce(
				(sum, m) => sum + m.weight,
				0,
			);
			return data.threshold <= totalWeight;
		},
		{
			message: 'Threshold cannot exceed total weight',
			path: ['threshold'],
		},
	)
	.refine(
		(data) => {
			// Check for duplicate public keys
			const publicKeys = data.members
				.map((m) => m.publicKey)
				.filter(Boolean);
			const uniqueKeys = new Set(publicKeys);
			return uniqueKeys.size === publicKeys.length;
		},
		{
			message: 'Duplicate public keys are not allowed',
			path: ['members'],
		},
	);

export type Member = z.infer<typeof memberSchema>;
export type CreateMultisigForm = z.infer<
	typeof createMultisigSchema
>;
