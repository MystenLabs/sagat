// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

#![allow(dead_code)]

use std::{env, path::PathBuf, process::Command};

use sagat_sdk::{
    AuthMode, CreateMultisigRequest, MultisigWithMembers, SagatClient, SagatError,
    SignedMessageRequest,
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureKey {
    pub address: String,
    pub public_key: String,
    pub secret_key: String,
    pub connect_signature: String,
    pub expiry: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignatureFixture {
    signature: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalFixture {
    pub transaction_bytes: String,
    pub signature: String,
}

#[derive(Debug, Deserialize)]
struct SuccessFixture {
    success: bool,
}

pub struct VerifiedMultisigGroupFixture {
    pub keys: Vec<FixtureKey>,
    pub clients: Vec<SagatClient>,
    pub multisig: MultisigWithMembers,
}

pub fn api_url() -> String {
    env::var("SAGAT_API_URL").expect("SAGAT_API_URL must be set; run crates/sagat-sdk/e2e/run.sh")
}

pub fn assert_bad_request(error: SagatError) {
    assert_http_status(error, reqwest::StatusCode::BAD_REQUEST);
}

fn assert_http_status(error: SagatError, status: reqwest::StatusCode) {
    match error {
        SagatError::Http(error) => {
            assert_eq!(error.status(), Some(status));
        }
        error => panic!("expected HTTP {status}, got {error:?}"),
    }
}

pub async fn connected_client(api_url: &str, key: &FixtureKey) -> SagatClient {
    let mut client = SagatClient::new(api_url.to_owned(), AuthMode::Script);
    client
        .connect(key.connect_signature.clone(), key.expiry.clone())
        .await
        .expect("connect should return a script JWT");
    client
}

pub fn fixture_key() -> FixtureKey {
    let output = run_fixture_command(&["key"], "key fixture generator");
    serde_json::from_slice(&output).expect("key fixture generator should return JSON")
}

pub fn fixture_accept_signature(key: &FixtureKey, multisig_address: &str) -> String {
    fixture_multisig_invitation_signature("accept-signature", &key.secret_key, multisig_address)
}

pub fn fixture_reject_signature(key: &FixtureKey, multisig_address: &str) -> String {
    fixture_multisig_invitation_signature("reject-signature", &key.secret_key, multisig_address)
}

pub fn fixture_cancel_proposal_signature(key: &FixtureKey, proposal_id: u64) -> String {
    let proposal_id = proposal_id.to_string();
    let output = run_fixture_command(
        &["cancel-proposal-signature", &key.secret_key, &proposal_id],
        "proposal cancellation signature generator",
    );
    let fixture: SignatureFixture =
        serde_json::from_slice(&output).expect("signature generator should return JSON");
    fixture.signature
}

pub fn fixture_add_proposer_signature(
    key: &FixtureKey,
    proposer: &str,
    multisig_address: &str,
    expiry: &str,
) -> String {
    fixture_proposer_signature(
        "add-proposer-signature",
        key,
        proposer,
        multisig_address,
        expiry,
    )
}

pub fn fixture_remove_proposer_signature(
    key: &FixtureKey,
    proposer: &str,
    multisig_address: &str,
    expiry: &str,
) -> String {
    fixture_proposer_signature(
        "remove-proposer-signature",
        key,
        proposer,
        multisig_address,
        expiry,
    )
}

pub fn fixture_fund_address(address: &str) {
    let output = run_fixture_command(&["fund-address", address], "address funder");
    let fixture: SuccessFixture =
        serde_json::from_slice(&output).expect("address funder should return JSON");
    assert!(fixture.success, "address funder should return success");
}

pub fn fixture_gas_coin_proposal(
    key: &FixtureKey,
    sender: &str,
    coin_index: usize,
    recipient: &str,
    amount: u64,
) -> ProposalFixture {
    let coin_index = coin_index.to_string();
    let amount = amount.to_string();
    let output = run_fixture_command(
        &[
            "gas-coin-proposal",
            &key.secret_key,
            sender,
            &coin_index,
            recipient,
            &amount,
        ],
        "gas coin proposal fixture generator",
    );
    serde_json::from_slice(&output).expect("gas coin proposal fixture should return JSON")
}

pub fn fixture_multi_coins_to_address(
    key: &FixtureKey,
    recipient: &str,
    count: usize,
    amount_per_coin: u64,
) {
    let count = count.to_string();
    let amount_per_coin = amount_per_coin.to_string();
    let output = run_fixture_command(
        &[
            "multi-coins-to-address",
            &key.secret_key,
            recipient,
            &count,
            &amount_per_coin,
        ],
        "multi-coin funding fixture",
    );
    let fixture: SuccessFixture =
        serde_json::from_slice(&output).expect("multi-coin funding fixture should return JSON");
    assert!(
        fixture.success,
        "multi-coin funding fixture should return success"
    );
}

pub fn fixture_transaction_signature(key: &FixtureKey, transaction_bytes: &str) -> String {
    let output = run_fixture_command(
        &["transaction-signature", &key.secret_key, transaction_bytes],
        "transaction signature generator",
    );
    let fixture: SignatureFixture =
        serde_json::from_slice(&output).expect("signature generator should return JSON");
    fixture.signature
}

pub fn fixture_mismatched_signature_proposal(
    key: &FixtureKey,
    sender: &str,
    coin_index: usize,
    signed_recipient: &str,
    signed_amount: u64,
    submitted_recipient: &str,
    submitted_amount: u64,
) -> ProposalFixture {
    let coin_index = coin_index.to_string();
    let signed_amount = signed_amount.to_string();
    let submitted_amount = submitted_amount.to_string();
    let output = run_fixture_command(
        &[
            "mismatched-signature-proposal",
            &key.secret_key,
            sender,
            &coin_index,
            signed_recipient,
            &signed_amount,
            submitted_recipient,
            &submitted_amount,
        ],
        "mismatched proposal signature fixture generator",
    );
    serde_json::from_slice(&output).expect("mismatched proposal fixture should return JSON")
}

pub async fn verified_multisig(
    api_url: &str,
    name: &str,
    weights: Vec<u64>,
    threshold: u64,
) -> VerifiedMultisigGroupFixture {
    assert!(
        weights.len() >= 2,
        "multisig fixture requires at least two members"
    );

    let keys = (0..weights.len())
        .map(|_| fixture_key())
        .collect::<Vec<_>>();
    let public_keys = keys
        .iter()
        .map(|key| key.public_key.clone())
        .collect::<Vec<_>>();

    let creator = connected_client(api_url, &keys[0]).await;
    let created = creator
        .create_multisig(CreateMultisigRequest {
            public_keys,
            weights,
            threshold,
            name: Some(name.into()),
        })
        .await
        .expect("create_multisig should create a pending multisig");

    let mut clients = vec![creator];
    for key in keys.iter().skip(1) {
        let client = connected_client(api_url, key).await;
        let accept_signature = fixture_accept_signature(key, &created.address);
        client
            .accept_multisig_invite(
                created.address.clone(),
                SignedMessageRequest {
                    signature: accept_signature,
                },
            )
            .await
            .expect("fixture member should accept and verify the multisig");
        clients.push(client);
    }

    let multisig = clients
        .last()
        .expect("fixture should have at least one client")
        .get_multisig(created.address)
        .await
        .expect("verified multisig should be fetchable by a member");

    VerifiedMultisigGroupFixture {
        keys,
        clients,
        multisig,
    }
}

fn run_fixture_command(args: &[&str], expectation: &str) -> Vec<u8> {
    // TODO: Move Sui key, funding, transaction-building, and signing fixtures into a Rust e2e
    // crate using the Sui Rust SDK instead of shelling out to the TypeScript fixture.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixture_script = manifest_dir.join("e2e").join("fixture.ts");

    let output = Command::new("bun")
        .arg("run")
        .arg(&fixture_script)
        .args(args)
        .output()
        .unwrap_or_else(|error| panic!("failed to run e2e {expectation}: {error}"));

    if !output.status.success() {
        panic!(
            "{expectation} failed\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    output.stdout
}

fn fixture_multisig_invitation_signature(
    command: &str,
    secret_key: &str,
    multisig_address: &str,
) -> String {
    let output = run_fixture_command(
        &[command, secret_key, multisig_address],
        "invitation signature generator",
    );
    let fixture: SignatureFixture =
        serde_json::from_slice(&output).expect("signature generator should return JSON");
    fixture.signature
}

fn fixture_proposer_signature(
    command: &str,
    key: &FixtureKey,
    proposer: &str,
    multisig_address: &str,
    expiry: &str,
) -> String {
    let output = run_fixture_command(
        &[command, &key.secret_key, proposer, multisig_address, expiry],
        "proposer signature generator",
    );
    let fixture: SignatureFixture =
        serde_json::from_slice(&output).expect("signature generator should return JSON");
    fixture.signature
}
