// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Response schemas derived from the tables in `db/schema.ts` with
 * drizzle-zod, so a column change shows up in the spec snapshot instead of
 * drifting from the rows the services return.
 *
 * Shapes that join data onto a row (members with their account key labels,
 * signer sets with members) belong in their own module per resource, with a
 * public schema and an authenticated one where they differ: key labels are
 * only ever returned to members, never on an unauthenticated route.
 */

import { createSelectSchema } from 'drizzle-zod';

import { SchemaAddresses } from '../../db/schema';
import { SuiAddressSchema } from './common';

// A registered address and its public key.
export const AddressSchema = createSelectSchema(
	SchemaAddresses,
	{
		publicKey: (schema) =>
			schema.openapi({
				description:
					'The Sui public key, base64, with its scheme flag.',
				example:
					'AJDCUe2/8eIAPvKY5uE9GHnWf1xdNThxNVL94GxOx1Yz',
			}),
		address: SuiAddressSchema,
	},
).openapi('Address');
