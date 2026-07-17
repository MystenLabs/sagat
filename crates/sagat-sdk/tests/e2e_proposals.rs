// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

mod e2e_support;

use std::collections::HashSet;

use e2e_support::{
    FixtureKey, ProposalFixture, VerifiedMultisigGroupFixture, api_url, assert_bad_request,
    fixture_add_proposer_signature, fixture_cancel_proposal_signature, fixture_fund_address,
    fixture_gas_coin_proposal, fixture_key, fixture_mismatched_signature_proposal,
    fixture_multi_coins_to_address, fixture_remove_proposer_signature,
    fixture_transaction_signature, verified_multisig,
};
use sagat_sdk::{
    CreateProposalRequest, GetProposalsParams, Proposal, ProposalStatus, SagatClient,
    SignedMessageRequest, VoteProposalRequest,
};

const NETWORK: &str = "localnet";

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn creates_votes_and_fetches_proposal_against_sagat_api() {
    let api_url = api_url();
    let fixture =
        verified_multisig(&api_url, "Rust SDK Proposal Workflow E2E", vec![1, 1, 1], 2).await;
    fixture_fund_address(&fixture.multisig.address);

    let proposal = create_transfer_proposal(
        &fixture,
        0,
        0,
        "0x1234567890123456789012345678901234567890123456789012345678901234",
        1_000_000,
        "Transfer 1 MIST to recipient",
    )
    .await;

    assert_eq!(proposal.multisig_address, fixture.multisig.address);
    assert_eq!(proposal.status, ProposalStatus::Pending);

    let fetched = fixture.clients[0]
        .get_proposal_by_digest(proposal.digest.clone())
        .await
        .expect("get_proposal_by_digest should fetch the created proposal");
    assert_eq!(fetched.id, proposal.id);
    assert_eq!(fetched.signatures.len(), 1);
    assert_eq!(fetched.current_weight, 1);
    assert_eq!(fetched.total_weight, fixture.multisig.threshold);

    let vote = vote_for_proposal(&fixture.clients[1], &fixture.keys[1], &proposal).await;
    assert!(vote);

    let fetched_after_vote = fixture.clients[0]
        .get_proposal_by_digest(proposal.digest)
        .await
        .expect("get_proposal_by_digest should include the second signature");
    assert_eq!(fetched_after_vote.signatures.len(), 2);
    assert_eq!(fetched_after_vote.current_weight, 2);
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn paginates_proposals_against_sagat_api() {
    let api_url = api_url();
    let fixture =
        verified_multisig(&api_url, "Rust SDK Proposal Pagination E2E", vec![1, 1], 2).await;
    fixture_multi_coins_to_address(&fixture.keys[0], &fixture.multisig.address, 3, 100_000_000);

    for index in 0..3 {
        create_transfer_proposal(
            &fixture,
            0,
            index,
            "0x666",
            100_000,
            &format!("Proposal {}", index + 1),
        )
        .await;
    }

    let mut cursor = None;
    let mut ids = HashSet::new();
    loop {
        let page = fixture.clients[0]
            .get_proposals(
                fixture.multisig.address.clone(),
                NETWORK.into(),
                GetProposalsParams {
                    status: None,
                    next_cursor: cursor,
                    per_page: Some(1),
                },
            )
            .await
            .expect("get_proposals should return a paginated proposal page");

        assert_eq!(page.data.len(), 1);
        assert!(ids.insert(page.data[0].id));

        if !page.has_next_page {
            break;
        }

        cursor = page
            .next_cursor
            .as_deref()
            .map(str::parse)
            .transpose()
            .expect("next cursor should be numeric");
    }

    assert_eq!(ids.len(), 3);
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn cancels_proposal_against_sagat_api() {
    let api_url = api_url();
    let fixture = verified_multisig(
        &api_url,
        "Rust SDK Proposal Cancellation E2E",
        vec![1, 1],
        2,
    )
    .await;
    fixture_fund_address(&fixture.multisig.address);

    let proposal = create_transfer_proposal(
        &fixture,
        0,
        0,
        "0x7777777777777777777777777777777777777777777777777777777777777777",
        500_000,
        "Proposal cancelled by creator",
    )
    .await;
    let cancelled = cancel_proposal(&fixture.clients[0], &fixture.keys[0], proposal.id).await;
    assert_eq!(
        cancelled.message.as_deref(),
        Some("Proposal cancelled successfully")
    );

    let fetched = fixture.clients[0]
        .get_proposal_by_digest(proposal.digest)
        .await
        .expect("get_proposal_by_digest should fetch the cancelled proposal");
    assert_eq!(fetched.status, ProposalStatus::Cancelled);
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn returns_error_for_invalid_proposal_request_against_sagat_api() {
    let api_url = api_url();
    let fixture = verified_multisig(
        &api_url,
        "Rust SDK Invalid Proposal Request E2E",
        vec![1, 1],
        2,
    )
    .await;
    fixture_fund_address(&fixture.multisig.address);

    let proposal = fixture_mismatched_signature_proposal(
        &fixture.keys[0],
        &fixture.multisig.address,
        0,
        "0x1111111111111111111111111111111111111111111111111111111111111111",
        500_000,
        "0x2222222222222222222222222222222222222222222222222222222222222222",
        999_999,
    );

    let error = fixture.clients[0]
        .create_proposal(create_proposal_request(
            &fixture.multisig.address,
            &proposal,
            Some("Proposal with mismatched signature"),
        ))
        .await
        .expect_err("create_proposal should propagate an API validation error");
    assert_bad_request(error);
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn external_proposer_can_create_and_be_removed_against_sagat_api() {
    let api_url = api_url();
    let fixture =
        verified_multisig(&api_url, "Rust SDK External Proposer E2E", vec![1, 1], 2).await;
    let proposer = fixture_key();
    fixture_fund_address(&fixture.multisig.address);

    add_proposer(
        &fixture.clients[0],
        &fixture.keys[0],
        &proposer.address,
        &fixture.multisig.address,
    )
    .await;
    let with_proposer = fixture.clients[0]
        .get_multisig(fixture.multisig.address.clone())
        .await
        .expect("get_multisig should include the added proposer");
    assert!(
        with_proposer
            .proposers
            .iter()
            .any(|item| item.address == proposer.address)
    );

    let proposal_fixture = fixture_gas_coin_proposal(
        &proposer,
        &fixture.multisig.address,
        0,
        "0x9999999999999999999999999999999999999999999999999999999999999999",
        500_000,
    );
    let proposal = fixture.clients[0]
        .create_proposal(create_proposal_request(
            &fixture.multisig.address,
            &proposal_fixture,
            Some("Proposal from external proposer"),
        ))
        .await
        .expect("external proposer should be able to create a proposal");
    assert_eq!(proposal.proposer_address, proposer.address);

    remove_proposer(
        &fixture.clients[0],
        &fixture.keys[0],
        &proposer.address,
        &fixture.multisig.address,
    )
    .await;
    let without_proposer = fixture.clients[0]
        .get_multisig(fixture.multisig.address.clone())
        .await
        .expect("get_multisig should reflect the removed proposer");
    assert!(
        !without_proposer
            .proposers
            .iter()
            .any(|item| item.address == proposer.address)
    );
}

async fn create_transfer_proposal(
    fixture: &VerifiedMultisigGroupFixture,
    signer_index: usize,
    coin_index: usize,
    recipient: &str,
    amount: u64,
    description: &str,
) -> Proposal {
    let transaction = fixture_gas_coin_proposal(
        &fixture.keys[signer_index],
        &fixture.multisig.address,
        coin_index,
        recipient,
        amount,
    );

    fixture.clients[signer_index]
        .create_proposal(create_proposal_request(
            &fixture.multisig.address,
            &transaction,
            Some(description),
        ))
        .await
        .expect("create_proposal should create the proposal")
}

fn create_proposal_request(
    multisig_address: &str,
    proposal: &ProposalFixture,
    description: Option<&str>,
) -> CreateProposalRequest {
    CreateProposalRequest {
        multisig_address: multisig_address.into(),
        transaction_bytes: proposal.transaction_bytes.clone(),
        signature: proposal.signature.clone(),
        description: description.map(Into::into),
        network: NETWORK.into(),
    }
}

async fn vote_for_proposal(client: &SagatClient, key: &FixtureKey, proposal: &Proposal) -> bool {
    let signature = fixture_transaction_signature(key, &proposal.transaction_bytes);
    client
        .vote_for_proposal(proposal.id, VoteProposalRequest { signature })
        .await
        .expect("vote_for_proposal should accept the member vote")
        .has_reached_threshold
}

async fn cancel_proposal(
    client: &SagatClient,
    key: &FixtureKey,
    proposal_id: u64,
) -> sagat_sdk::SuccessResponse {
    let signature = fixture_cancel_proposal_signature(key, proposal_id);
    client
        .cancel_proposal(proposal_id, SignedMessageRequest { signature })
        .await
        .expect("cancel_proposal should cancel the pending proposal")
}

async fn add_proposer(
    client: &SagatClient,
    key: &FixtureKey,
    proposer: &str,
    multisig_address: &str,
) {
    let expiry = key.expiry.clone();
    let signature = fixture_add_proposer_signature(key, proposer, multisig_address, &expiry);
    client
        .add_multisig_proposer(multisig_address.into(), proposer.into(), signature, expiry)
        .await
        .expect("add_multisig_proposer should add an external proposer");
}

async fn remove_proposer(
    client: &SagatClient,
    key: &FixtureKey,
    proposer: &str,
    multisig_address: &str,
) {
    let expiry = key.expiry.clone();
    let signature = fixture_remove_proposer_signature(key, proposer, multisig_address, &expiry);
    client
        .remove_multisig_proposer(multisig_address.into(), proposer.into(), signature, expiry)
        .await
        .expect("remove_multisig_proposer should remove the external proposer");
}
