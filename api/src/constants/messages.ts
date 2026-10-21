// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The personal messages a key signs, as the API verifies them. They come
 * from the SDKs, which is what integrators sign with, so the texts have one
 * source and cannot drift: the legacy routes verify the legacy SDK's, the
 * `/v1` routes the current SDK's.
 */

export { PersonalMessages as V1Messages } from '@mysten/sagat';
export { PersonalMessages as LegacyMessages } from '@mysten/sagat-legacy';
