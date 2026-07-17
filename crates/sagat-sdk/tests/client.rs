// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use sagat_sdk::{AuthMode, SagatClient};

#[test]
fn client_can_be_constructed() {
    let client = SagatClient::new("https://api.sagat.example", AuthMode::Script);

    assert_eq!(client.api_url(), "https://api.sagat.example");
    assert_eq!(client.mode(), AuthMode::Script);
}

// Test plan for the first real client implementation:
// - connect posts signature and expiry to /auth/connect.
// - disconnect posts to /auth/disconnect.
// - cookie mode sends credentials/cookie support when the HTTP layer exposes it.
// - script mode sends bearer authorization once token support exists.
// - list endpoints encode query params correctly.
// - non-2xx JSON errors become client errors with the API error message.
// - non-2xx text errors fall back to the response body.
// - success responses deserialize into the public SDK types.
