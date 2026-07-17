// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use sagat_sdk::{
    AuthMode, CreateMultisigRequest, CreateProposalRequest, GetInvitationsParams,
    GetProposalsParams, ProposalStatus, SagatClient, SagatError, SignedMessageRequest,
    VoteProposalRequest,
};
use serde_json::json;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{body_json, header, method, path, query_param},
};

fn json_ok() -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(json!({}))
}

fn client(server: &MockServer) -> SagatClient {
    SagatClient::new(server.uri(), AuthMode::Script)
}

async fn authenticated_client(server: &MockServer) -> SagatClient {
    Mock::given(method("POST"))
        .and(path("/auth/script-connect"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt",
        })))
        .expect(1)
        .mount(server)
        .await;

    let mut client = client(server);
    client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect("connect should store auth token");
    client
}

#[tokio::test]
async fn connect_posts_signature_and_expiry_to_script_connect() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/script-connect"))
        .and(body_json(json!({
            "signature": "sig",
            "expiry": "2026-05-29T12:00:00.000Z",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt",
        })))
        .expect(1)
        .mount(&server)
        .await;

    let mut client = client(&server);
    let response = client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect("connect should return auth response");

    assert_eq!(response.token.as_deref(), Some("jwt"));
    assert_eq!(response.success, None);
}

#[tokio::test]
async fn connect_errors_in_cookie_mode_without_requesting_server() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/connect"))
        .respond_with(json_ok())
        .expect(0)
        .mount(&server)
        .await;

    let mut client = SagatClient::new(server.uri(), AuthMode::Cookie);
    let error = client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect_err("cookie auth should be unsupported");

    assert!(matches!(
        error,
        SagatError::UnsupportedAuthMode(AuthMode::Cookie)
    ));
}

#[tokio::test]
async fn disconnect_clears_token_so_check_auth_fails_locally() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/script-connect"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt",
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/auth/check"))
        .respond_with(json_ok())
        .expect(0)
        .mount(&server)
        .await;

    let mut client = client(&server);
    client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect("connect should store auth token");

    let response = client
        .disconnect()
        .await
        .expect("disconnect should clear auth token");
    assert_eq!(response.success, Some(true));

    let error = client
        .check_auth()
        .await
        .expect_err("check_auth should fail after disconnect clears the token");
    assert!(matches!(error, SagatError::MissingAuthToken));
}

#[tokio::test]
async fn check_auth_gets_auth_check() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/script-connect"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt",
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/auth/check"))
        .and(header("authorization", "Bearer jwt"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "authenticated": true,
            "addresses": [{
                "address": "0xabc",
                "publicKey": "pk",
            }],
        })))
        .expect(1)
        .mount(&server)
        .await;

    let mut client = client(&server);
    client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect("connect should store auth token");

    let response = client
        .check_auth()
        .await
        .expect("check_auth should return auth response");

    assert!(response.authenticated);
    assert_eq!(response.addresses[0].address, "0xabc");
    assert_eq!(response.addresses[0].public_key, "pk");
}

#[tokio::test]
async fn create_multisig_posts_to_multisig() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/script-connect"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt",
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/multisig"))
        .and(header("authorization", "Bearer jwt"))
        .and(body_json(json!({
            "publicKeys": ["pk1", "pk2"],
            "weights": [1, 2],
            "threshold": 2,
            "name": "Treasury",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "multisig": {
                "address": "0xmultisig",
                "isVerified": false,
                "threshold": 2,
                "name": "Treasury",
            },
            "members": [
                {
                    "multisigAddress": "0xmultisig",
                    "publicKey": "pk1",
                    "weight": 1,
                    "isAccepted": true,
                    "isRejected": false,
                    "order": 0,
                },
                {
                    "multisigAddress": "0xmultisig",
                    "publicKey": "pk2",
                    "weight": 2,
                    "isAccepted": false,
                    "isRejected": false,
                    "order": 1,
                }
            ],
        })))
        .expect(1)
        .mount(&server)
        .await;

    let mut client = client(&server);
    client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect("connect should store auth token");

    let multisig = client
        .create_multisig(CreateMultisigRequest {
            public_keys: vec!["pk1".into(), "pk2".into()],
            weights: vec![1, 2],
            threshold: 2,
            name: Some("Treasury".into()),
        })
        .await
        .expect("create_multisig should flatten API response");

    assert_eq!(multisig.address, "0xmultisig");
    assert_eq!(multisig.threshold, 2);
    assert_eq!(multisig.total_members, 2);
    assert_eq!(multisig.total_weight, 3);
    assert_eq!(multisig.members[0].public_key, "pk1");
    assert!(multisig.proposers.is_empty());
}

#[tokio::test]
async fn get_multisig_gets_multisig_by_address() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/auth/script-connect"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "token": "jwt",
        })))
        .expect(1)
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/multisig/0xmultisig"))
        .and(header("authorization", "Bearer jwt"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "address": "0xmultisig",
            "isVerified": true,
            "threshold": 2,
            "name": "Treasury",
            "members": [
                {
                    "multisigAddress": "0xmultisig",
                    "publicKey": "pk1",
                    "weight": 1,
                    "isAccepted": true,
                    "isRejected": false,
                    "order": 0,
                },
                {
                    "multisigAddress": "0xmultisig",
                    "publicKey": "pk2",
                    "weight": 2,
                    "isAccepted": true,
                    "isRejected": false,
                    "order": 1,
                }
            ],
            "totalMembers": 2,
            "totalWeight": 3,
            "proposers": [
                {
                    "address": "0xproposer",
                    "addedBy": "0xmember",
                    "addedAt": "2026-05-29T12:00:00.000Z",
                }
            ],
        })))
        .expect(1)
        .mount(&server)
        .await;

    let mut client = client(&server);
    client
        .connect("sig".into(), "2026-05-29T12:00:00.000Z")
        .await
        .expect("connect should store auth token");

    let multisig = client
        .get_multisig("0xmultisig".into())
        .await
        .expect("get_multisig should return multisig details");

    assert_eq!(multisig.address, "0xmultisig");
    assert!(multisig.is_verified);
    assert_eq!(multisig.threshold, 2);
    assert_eq!(multisig.name.as_deref(), Some("Treasury"));
    assert_eq!(multisig.members.len(), 2);
    assert_eq!(multisig.members[1].public_key, "pk2");
    assert_eq!(multisig.total_members, 2);
    assert_eq!(multisig.total_weight, 3);
    assert_eq!(multisig.proposers[0].address, "0xproposer");
}

#[tokio::test]
async fn accept_multisig_invite_posts_to_accept() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/multisig/0xmultisig/accept"))
        .and(body_json(json!({
            "signature": "sig",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "address": "0xmultisig",
            "isVerified": true,
            "threshold": 2,
            "name": "Treasury",
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .accept_multisig_invite(
            "0xmultisig".into(),
            SignedMessageRequest {
                signature: "sig".into(),
            },
        )
        .await
        .expect("accept_multisig_invite should return the accepted multisig");

    assert_eq!(response.address, "0xmultisig");
    assert!(response.is_verified);
    assert_eq!(response.threshold, 2);
    assert_eq!(response.name.as_deref(), Some("Treasury"));
}

#[tokio::test]
async fn reject_multisig_invite_posts_to_reject() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/multisig/0xmultisig/reject"))
        .and(body_json(json!({
            "signature": "sig",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "message": "Multisig invitation rejected and removed",
            "address": "0xmultisig",
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .reject_multisig_invite(
            "0xmultisig".into(),
            SignedMessageRequest {
                signature: "sig".into(),
            },
        )
        .await
        .expect("reject_multisig_invite should return rejection details");

    assert_eq!(response.address, "0xmultisig");
    assert_eq!(response.message, "Multisig invitation rejected and removed");
}

#[tokio::test]
async fn create_proposal_posts_to_proposals() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/proposals"))
        .and(body_json(json!({
            "multisigAddress": "0xmultisig",
            "transactionBytes": "tx-bytes",
            "signature": "sig",
            "description": "Pay vendor",
            "network": "testnet",
        })))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "id": 42,
            "multisigAddress": "0xmultisig",
            "digest": "abc123",
            "status": 0,
            "transactionBytes": "tx-bytes",
            "proposerAddress": "0xproposer",
            "description": "Pay vendor",
            "network": "testnet",
        })))
        .expect(1)
        .mount(&server)
        .await;

    let proposal = client(&server)
        .create_proposal(CreateProposalRequest {
            multisig_address: "0xmultisig".into(),
            transaction_bytes: "tx-bytes".into(),
            signature: "sig".into(),
            description: Some("Pay vendor".into()),
            network: "testnet".into(),
        })
        .await
        .expect("create_proposal should return created proposal");

    assert_eq!(proposal.id, 42);
    assert_eq!(proposal.status, ProposalStatus::Pending);
    assert_eq!(proposal.current_weight, 0);
}

#[tokio::test]
async fn get_proposals_gets_proposals_with_query_params() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/proposals"))
        .and(header("authorization", "Bearer jwt"))
        .and(query_param("multisigAddress", "0xmultisig"))
        .and(query_param("network", "testnet"))
        .and(query_param("status", "PENDING"))
        .and(query_param("nextCursor", "42"))
        .and(query_param("perPage", "1"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "data": [
                {
                    "id": 41,
                    "multisigAddress": "0xmultisig",
                    "digest": "abc123",
                    "status": 0,
                    "transactionBytes": "tx-bytes",
                    "proposerAddress": "0xproposer",
                    "description": null,
                    "network": "testnet",
                    "signatures": [
                        {
                            "proposalId": 41,
                            "publicKey": "pk1",
                            "signature": "sig",
                        }
                    ],
                }
            ],
            "hasNextPage": true,
            "nextCursor": "41",
            "perPage": 1,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let proposals = client
        .get_proposals(
            "0xmultisig".into(),
            "testnet".into(),
            GetProposalsParams {
                status: Some(ProposalStatus::Pending),
                next_cursor: Some(42),
                per_page: Some(1),
            },
        )
        .await
        .expect("get_proposals should return paginated proposals");

    assert!(proposals.has_next_page);
    assert_eq!(proposals.next_cursor.as_deref(), Some("41"));
    assert_eq!(proposals.data[0].signatures[0].public_key, "pk1");
}

#[tokio::test]
async fn get_proposal_by_digest_gets_digest_route() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/proposals/digest/abc123"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": 42,
            "multisigAddress": "0xmultisig",
            "digest": "abc123",
            "status": 0,
            "transactionBytes": "tx-bytes",
            "proposerAddress": "0xproposer",
            "description": null,
            "totalWeight": 2,
            "currentWeight": 1,
            "network": "testnet",
            "signatures": [
                {
                    "proposalId": 42,
                    "publicKey": "pk1",
                    "signature": "sig",
                }
            ],
            "multisig": {
                "address": "0xmultisig",
                "name": "Treasury",
                "threshold": 2,
                "members": [
                    {
                        "publicKey": "pk1",
                        "weight": 1,
                        "order": 0,
                    }
                ],
            },
        })))
        .expect(1)
        .mount(&server)
        .await;

    let proposal = client(&server)
        .get_proposal_by_digest("abc123".into())
        .await
        .expect("get_proposal_by_digest should return public proposal");

    assert_eq!(proposal.digest, "abc123");
    assert_eq!(proposal.multisig.members[0].public_key, "pk1");
}

#[tokio::test]
async fn vote_for_proposal_posts_to_vote() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/proposals/42/vote"))
        .and(body_json(json!({
            "signature": "sig",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "hasReachedThreshold": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .vote_for_proposal(
            42,
            VoteProposalRequest {
                signature: "sig".into(),
            },
        )
        .await
        .expect("vote_for_proposal should return threshold state");

    assert!(response.has_reached_threshold);
}

#[tokio::test]
async fn cancel_proposal_posts_to_cancel() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/proposals/42/cancel"))
        .and(body_json(json!({
            "signature": "sig",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "message": "Proposal cancelled successfully",
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .cancel_proposal(
            42,
            SignedMessageRequest {
                signature: "sig".into(),
            },
        )
        .await
        .expect("cancel_proposal should return message");

    assert_eq!(
        response.message.as_deref(),
        Some("Proposal cancelled successfully")
    );
}

#[tokio::test]
async fn register_public_keys_posts_extra_public_keys() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/addresses"))
        .and(header("authorization", "Bearer jwt"))
        .and(body_json(json!({
            "extraPublicKeys": ["pk1", "pk2"],
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "success": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let response = client
        .register_public_keys(vec!["pk1".into(), "pk2".into()])
        .await
        .expect("register_public_keys should return success");

    assert_eq!(response.success, Some(true));
}

#[tokio::test]
async fn register_public_key_posts_single_extra_public_key() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/addresses"))
        .and(header("authorization", "Bearer jwt"))
        .and(body_json(json!({
            "extraPublicKeys": ["pk1"],
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "success": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let response = client
        .register_public_key("pk1".into())
        .await
        .expect("register_public_key should return success");

    assert_eq!(response.success, Some(true));
}

#[tokio::test]
async fn get_multisig_connections_gets_addresses_connections() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/addresses/connections"))
        .and(header("authorization", "Bearer jwt"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "pk1": [],
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let connections = client
        .get_multisig_connections()
        .await
        .expect("get_multisig_connections should return grouped multisigs");

    assert!(connections.contains_key("pk1"));
}

#[tokio::test]
async fn get_invitations_gets_public_key_route() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/addresses/invitations/pk1"))
        .and(header("authorization", "Bearer jwt"))
        .and(query_param("showRejected", "true"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let invitations = client
        .get_invitations(
            "pk1".into(),
            GetInvitationsParams {
                show_rejected: true,
            },
        )
        .await
        .expect("get_invitations should return invitation multisigs");

    assert!(invitations.is_empty());
}

#[tokio::test]
async fn verify_proposal_posts_to_verify() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/proposals/42/verify"))
        .and(header("authorization", "Bearer jwt"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "verified": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let response = client
        .verify_proposal(42)
        .await
        .expect("verify_proposal should return verification status");

    assert_eq!(response.verified, Some(true));
}

#[tokio::test]
async fn verify_proposal_by_digest_posts_to_verify_by_digest() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/proposals/abc123/verify-by-digest"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "verified": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .verify_proposal_by_digest("abc123".into())
        .await
        .expect("verify_proposal_by_digest should return verification status");

    assert_eq!(response.verified, Some(true));
}

#[tokio::test]
async fn get_address_info_gets_address_route() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/addresses/0xaddress"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "address": "0xaddress",
            "publicKey": "pk1",
        })))
        .expect(1)
        .mount(&server)
        .await;

    let address = client(&server)
        .get_address_info("0xaddress".into())
        .await
        .expect("get_address_info should return address details");

    assert_eq!(address.public_key, "pk1");
}

#[tokio::test]
async fn register_addresses_posts_to_addresses_without_extra_keys() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/addresses"))
        .and(header("authorization", "Bearer jwt"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "success": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let client = authenticated_client(&server).await;
    let response = client
        .register_addresses()
        .await
        .expect("register_addresses should return success");

    assert_eq!(response.success, Some(true));
}

#[tokio::test]
async fn add_multisig_proposer_posts_proposer_signature_and_expiry() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/multisig/0xmultisig/add-proposer"))
        .and(body_json(json!({
            "proposer": "0xproposer",
            "signature": "sig",
            "expiry": "2026-05-29T12:00:00.000Z",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "success": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .add_multisig_proposer(
            "0xmultisig".into(),
            "0xproposer".into(),
            "sig".into(),
            "2026-05-29T12:00:00.000Z",
        )
        .await
        .expect("add_multisig_proposer should return success");

    assert_eq!(response.success, Some(true));
}

#[tokio::test]
async fn remove_multisig_proposer_posts_proposer_signature_and_expiry() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/multisig/0xmultisig/remove-proposer"))
        .and(body_json(json!({
            "proposer": "0xproposer",
            "signature": "sig",
            "expiry": "2026-05-29T12:00:00.000Z",
        })))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "success": true,
        })))
        .expect(1)
        .mount(&server)
        .await;

    let response = client(&server)
        .remove_multisig_proposer(
            "0xmultisig".into(),
            "0xproposer".into(),
            "sig".into(),
            "2026-05-29T12:00:00.000Z",
        )
        .await
        .expect("remove_multisig_proposer should return success");

    assert_eq!(response.success, Some(true));
}
