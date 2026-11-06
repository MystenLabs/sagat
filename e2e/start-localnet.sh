#!/bin/sh
# Copyright (c) Mysten Labs, Inc.
# SPDX-License-Identifier: Apache-2.0

# Starts a fresh local network for the tests: start-localnet.sh <rpc-port> <faucet-port>
#
# `sui start --force-regenesis` runs its fullnode with aggressive pruning: an
# hour after start, it raises the lowest available checkpoint to the tip every
# ~10s. The gRPC API reports any transaction below it as not found, so a
# transaction the app just waited for can be gone by the time the API verifies
# it. Generate the config ourselves and keep two epochs instead, so a
# transaction stays readable for at least a full epoch.
set -eu

# `sui start` only reads the generated fullnode config since 1.74.1.
version="$(sui --version | sed -E 's/^sui ([0-9]+\.[0-9]+\.[0-9]+).*/\1/')"
if ! printf '%s\n' 1.74.1 "$version" | sort -C -t. -k1,1n -k2,2n -k3,3n; then
	echo "start-localnet.sh: needs sui 1.74.1 or later (found $version): suiup install sui@mainnet" >&2
	exit 1
fi

# LOCALNET_DIR picks the data directory, so a second network (say, one kept
# running for manual testing) does not get wiped by the next test run.
dir="${LOCALNET_DIR:-$(dirname "$0")/.cache/localnet}"
rm -rf "$dir"
mkdir -p "$dir"

# Long epochs so an epoch change never lands mid-test.
sui genesis --working-dir "$dir" --with-faucet --epoch-duration-ms 3600000 >/dev/null

sed -i.bak 's/^  num-epochs-to-retain: 0$/  num-epochs-to-retain: 2/' "$dir/fullnode.yaml"
if ! grep -q '^  num-epochs-to-retain: 2$' "$dir/fullnode.yaml"; then
	echo "start-localnet.sh: could not set pruning retention in $dir/fullnode.yaml" >&2
	exit 1
fi

exec sui start --network.config "$dir" --fullnode-rpc-port "$1" --with-faucet="$2"
