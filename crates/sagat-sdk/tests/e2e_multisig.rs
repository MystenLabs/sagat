// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

mod e2e_support;

use e2e_support::{
    api_url, connected_client, fixture_accept_signature, fixture_key, fixture_reject_signature,
};
use sagat_sdk::{
    AuthMode, CreateMultisigRequest, GetInvitationsParams, SagatClient, SignedMessageRequest,
};

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn connects_and_manages_multisig_against_sagat_api() {
    let api_url = api_url();
    let creator_key = fixture_key();
    let invitee_key = fixture_key();

    let mut client = SagatClient::new(api_url, AuthMode::Script);
    let auth = client
        .connect(
            creator_key.connect_signature.clone(),
            creator_key.expiry.clone(),
        )
        .await
        .expect("connect should return a script JWT");
    assert!(auth.token.is_some());

    let auth_check = client
        .check_auth()
        .await
        .expect("check_auth should accept the script JWT");
    assert!(auth_check.authenticated);
    assert_eq!(auth_check.addresses[0].address, creator_key.address);
    assert_eq!(auth_check.addresses[0].public_key, creator_key.public_key);

    let registered = client
        .register_addresses()
        .await
        .expect("register_addresses should register JWT public keys");
    assert_eq!(registered.success, Some(true));

    let multisig = client
        .create_multisig(CreateMultisigRequest {
            public_keys: vec![
                creator_key.public_key.clone(),
                invitee_key.public_key.clone(),
            ],
            weights: vec![1, 1],
            threshold: 1,
            name: Some("Rust SDK E2E".into()),
        })
        .await
        .expect("create_multisig should create a 1-of-2 multisig");

    assert_eq!(multisig.name.as_deref(), Some("Rust SDK E2E"));
    assert_eq!(multisig.threshold, 1);
    assert_eq!(multisig.total_members, 2);
    assert_eq!(multisig.total_weight, 2);
    assert!(
        multisig
            .members
            .iter()
            .any(|member| member.public_key == creator_key.public_key)
    );
    assert!(
        multisig
            .members
            .iter()
            .any(|member| member.public_key == invitee_key.public_key)
    );

    let fetched = client
        .get_multisig(multisig.address.clone())
        .await
        .expect("get_multisig should fetch the created multisig");
    assert_eq!(fetched.address, multisig.address);
    assert!(
        fetched
            .members
            .iter()
            .any(|member| member.public_key == creator_key.public_key)
    );
    assert!(
        fetched
            .members
            .iter()
            .any(|member| member.public_key == invitee_key.public_key)
    );
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn accepts_multisig_invitation_against_sagat_api() {
    let api_url = api_url();
    let creator_key = fixture_key();
    let invitee_key = fixture_key();

    let creator = connected_client(&api_url, &creator_key).await;
    let multisig = creator
        .create_multisig(CreateMultisigRequest {
            public_keys: vec![
                creator_key.public_key.clone(),
                invitee_key.public_key.clone(),
            ],
            weights: vec![1, 1],
            threshold: 2,
            name: Some("Rust SDK Invite E2E".into()),
        })
        .await
        .expect("create_multisig should create a pending 2-of-2 multisig");
    assert!(!multisig.is_verified);

    let invitee = connected_client(&api_url, &invitee_key).await;
    let invitations = invitee
        .get_invitations(
            invitee_key.public_key.clone(),
            GetInvitationsParams::default(),
        )
        .await
        .expect("get_invitations should list the invitee's pending multisig");
    assert!(
        invitations
            .iter()
            .any(|item| item.address == multisig.address)
    );

    let accept_signature = fixture_accept_signature(&invitee_key, &multisig.address);
    let accepted = invitee
        .accept_multisig_invite(
            multisig.address.clone(),
            SignedMessageRequest {
                signature: accept_signature,
            },
        )
        .await
        .expect("accept_multisig_invite should accept the pending invitation");
    assert_eq!(accepted.address, multisig.address);
    assert!(accepted.is_verified);
    assert_eq!(accepted.threshold, 2);
    assert_eq!(accepted.name.as_deref(), Some("Rust SDK Invite E2E"));

    let fetched = invitee
        .get_multisig(multisig.address.clone())
        .await
        .expect("accepted invitee should be able to fetch the multisig");
    assert!(fetched.is_verified);
    assert!(fetched.members.iter().all(|member| member.is_accepted));

    let connections = invitee
        .get_multisig_connections()
        .await
        .expect("get_multisig_connections should include accepted multisigs");
    let invitee_connections = connections
        .get(&invitee_key.public_key)
        .expect("connections should be grouped by invitee public key");
    assert!(
        invitee_connections
            .iter()
            .any(|item| item.address == multisig.address)
    );

    let pending_invitations = invitee
        .get_invitations(
            invitee_key.public_key.clone(),
            GetInvitationsParams::default(),
        )
        .await
        .expect("get_invitations should still be callable after acceptance");
    assert!(
        !pending_invitations
            .iter()
            .any(|item| item.address == multisig.address)
    );
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn rejects_multisig_invitation_and_filters_rejected_invitations_against_sagat_api() {
    let api_url = api_url();
    let creator_key = fixture_key();
    let invitee_key = fixture_key();

    let creator = connected_client(&api_url, &creator_key).await;
    let multisig = creator
        .create_multisig(CreateMultisigRequest {
            public_keys: vec![
                creator_key.public_key.clone(),
                invitee_key.public_key.clone(),
            ],
            weights: vec![1, 1],
            threshold: 2,
            name: Some("Rust SDK Reject Invite E2E".into()),
        })
        .await
        .expect("create_multisig should create a pending 2-of-2 multisig");

    let invitee = connected_client(&api_url, &invitee_key).await;
    let pending = invitee
        .get_invitations(
            invitee_key.public_key.clone(),
            GetInvitationsParams::default(),
        )
        .await
        .expect("get_invitations should list the invitee's pending multisig");
    assert!(pending.iter().any(|item| item.address == multisig.address));

    let reject_signature = fixture_reject_signature(&invitee_key, &multisig.address);
    let rejected = invitee
        .reject_multisig_invite(
            multisig.address.clone(),
            SignedMessageRequest {
                signature: reject_signature,
            },
        )
        .await
        .expect("reject_multisig_invite should reject the pending invitation");
    assert_eq!(rejected.address, multisig.address);

    let hidden = invitee
        .get_invitations(
            invitee_key.public_key.clone(),
            GetInvitationsParams::default(),
        )
        .await
        .expect("default get_invitations should hide rejected invitations");
    assert!(!hidden.iter().any(|item| item.address == multisig.address));

    let visible = invitee
        .get_invitations(
            invitee_key.public_key.clone(),
            GetInvitationsParams {
                show_rejected: true,
            },
        )
        .await
        .expect("showRejected get_invitations should include rejected invitations");
    assert!(visible.iter().any(|item| item.address == multisig.address));
}
