// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use sagat_sdk::{
    accept_multisig_invitation_message, add_multisig_proposer_message, cancel_proposal_message,
    connect_message, default_expiry, reject_multisig_invitation_message,
    remove_multisig_proposer_message,
};
use time::macros::datetime;

#[test]
fn connect_message_matches_typescript_sdk() {
    assert_eq!(
        connect_message("2026-05-29T12:00:00.000Z"),
        "Verifying address ownership until: 2026-05-29T12:00:00.000Z"
    );
}

#[test]
fn string_expiry_is_preserved_verbatim() {
    let expiry = String::from("caller-specific-expiry");

    assert_eq!(
        connect_message(&expiry),
        "Verifying address ownership until: caller-specific-expiry"
    );
}

#[test]
fn connect_message_accepts_datetime_expiry() {
    assert_eq!(
        connect_message(datetime!(2026-05-29 12:00:00.123 UTC)),
        "Verifying address ownership until: 2026-05-29T12:00:00.123Z"
    );
}

#[test]
fn default_expiry_uses_api_timestamp_format() {
    let expiry = default_expiry();
    let value = expiry.as_str();

    assert_eq!(value.len(), "YYYY-MM-DDTHH:MM:SS.sssZ".len());
    assert_eq!(&value[4..5], "-");
    assert_eq!(&value[7..8], "-");
    assert_eq!(&value[10..11], "T");
    assert_eq!(&value[13..14], ":");
    assert_eq!(&value[16..17], ":");
    assert_eq!(&value[19..20], ".");
    assert_eq!(&value[23..24], "Z");
}

#[test]
fn accept_multisig_invitation_message_matches_typescript_sdk() {
    assert_eq!(
        accept_multisig_invitation_message("0xabc"),
        "Participating in multisig 0xabc"
    );
}

#[test]
fn reject_multisig_invitation_message_matches_typescript_sdk() {
    assert_eq!(
        reject_multisig_invitation_message("0xabc"),
        "Rejecting multisig invitation 0xabc"
    );
}

#[test]
fn add_multisig_proposer_message_matches_typescript_sdk() {
    assert_eq!(
        add_multisig_proposer_message("0xproposer", "0xmultisig", "2026-05-29T12:00:00.000Z"),
        "Adding proposer 0xproposer to multisig 0xmultisig. Valid until: 2026-05-29T12:00:00.000Z"
    );
}

#[test]
fn remove_multisig_proposer_message_matches_typescript_sdk() {
    assert_eq!(
        remove_multisig_proposer_message("0xproposer", "0xmultisig", "2026-05-29T12:00:00.000Z"),
        "Removing proposer 0xproposer from multisig 0xmultisig. Valid until: 2026-05-29T12:00:00.000Z"
    );
}

#[test]
fn cancel_proposal_message_matches_typescript_sdk() {
    assert_eq!(cancel_proposal_message(42), "Cancel proposal 42");
}
