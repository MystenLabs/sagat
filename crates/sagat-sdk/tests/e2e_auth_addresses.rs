// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

mod e2e_support;

use e2e_support::{api_url, assert_bad_request, fixture_key};
use sagat_sdk::{AuthMode, SagatClient, SagatError};

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn registers_and_looks_up_addresses_against_sagat_api() {
    let api_url = api_url();
    let user = fixture_key();
    let extra = fixture_key();
    let mut client = SagatClient::new(api_url, AuthMode::Script);

    let auth = client
        .connect(user.connect_signature.clone(), user.expiry.clone())
        .await
        .expect("connect should return a script JWT");
    assert!(auth.token.is_some());

    let auth_check = client
        .check_auth()
        .await
        .expect("check_auth should accept the script JWT");
    assert!(auth_check.authenticated);
    assert_eq!(auth_check.addresses[0].address, user.address);
    assert_eq!(auth_check.addresses[0].public_key, user.public_key);

    let registered = client
        .register_addresses()
        .await
        .expect("register_addresses should register the connected public key");
    assert_eq!(registered.success, Some(true));

    let address = client
        .get_address_info(user.address.clone())
        .await
        .expect("get_address_info should find the connected address");
    assert_eq!(address.address, user.address);
    assert_eq!(address.public_key, user.public_key);

    let registered_extra = client
        .register_public_key(extra.public_key.clone())
        .await
        .expect("register_public_key should register an extra public key");
    assert_eq!(registered_extra.success, Some(true));

    let extra_address = client
        .get_address_info(extra.address.clone())
        .await
        .expect("get_address_info should find the extra registered address");
    assert_eq!(extra_address.address, extra.address);
    assert_eq!(extra_address.public_key, extra.public_key);
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn returns_error_for_unregistered_address_against_sagat_api() {
    let client = SagatClient::new(api_url(), AuthMode::Script);
    let error = client
        .get_address_info(
            "0x000000000000000000000000000000000000000000000000000000000000dead".into(),
        )
        .await
        .expect_err("get_address_info should fail for an unregistered address");

    assert_bad_request(error);
}

#[tokio::test]
#[ignore = "starts Sagat API dependencies; run crates/sagat-sdk/e2e/run.sh"]
async fn requires_authentication_for_address_registration() {
    let client = SagatClient::new(api_url(), AuthMode::Script);
    let error = client
        .register_addresses()
        .await
        .expect_err("register_addresses should require a stored script JWT");

    assert!(matches!(error, SagatError::MissingAuthToken));
}
