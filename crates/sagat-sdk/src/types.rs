// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use std::fmt;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;
use time::{
    Duration, OffsetDateTime, UtcOffset, format_description::FormatItem, macros::format_description,
};

pub type Result<T> = std::result::Result<T, SagatError>;

const DEFAULT_EXPIRY_DURATION: Duration = Duration::minutes(30);
const EXPIRY_FORMAT: &[FormatItem<'static>] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z");

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct Expiry(String);

impl Expiry {
    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

impl From<&str> for Expiry {
    fn from(value: &str) -> Self {
        Self(value.to_owned())
    }
}

impl From<&String> for Expiry {
    fn from(value: &String) -> Self {
        Self(value.clone())
    }
}

impl From<String> for Expiry {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<&Expiry> for Expiry {
    fn from(value: &Expiry) -> Self {
        value.clone()
    }
}

impl From<OffsetDateTime> for Expiry {
    fn from(value: OffsetDateTime) -> Self {
        Self(
            value
                .to_offset(UtcOffset::UTC)
                .format(EXPIRY_FORMAT)
                .expect("fixed expiry format should be valid"),
        )
    }
}

impl AsRef<str> for Expiry {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl fmt::Display for Expiry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

pub fn default_expiry() -> Expiry {
    (OffsetDateTime::now_utc() + DEFAULT_EXPIRY_DURATION).into()
}

#[derive(Debug, Error)]
pub enum SagatError {
    #[error(transparent)]
    Http(reqwest::Error),
    #[error(transparent)]
    Json(serde_json::Error),
    #[error("missing auth token")]
    MissingAuthToken,
    #[error("{0:?} auth mode is not supported")]
    UnsupportedAuthMode(AuthMode),
}

impl From<reqwest::Error> for SagatError {
    fn from(error: reqwest::Error) -> Self {
        Self::Http(error)
    }
}

impl From<serde_json::Error> for SagatError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum AuthMode {
    #[default]
    Script,
    Cookie,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub success: Option<bool>,
    pub token: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCheckResponse {
    pub authenticated: bool,
    pub addresses: Vec<Address>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Address {
    pub address: String,
    pub public_key: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMultisigRequest {
    pub public_keys: Vec<String>,
    pub weights: Vec<u64>,
    pub threshold: u64,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedMessageRequest {
    pub signature: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigWithMembers {
    pub address: String,
    pub is_verified: bool,
    pub threshold: u64,
    pub name: Option<String>,
    pub members: Vec<MultisigMember>,
    pub total_members: usize,
    pub total_weight: u64,
    pub proposers: Vec<MultisigProposer>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Multisig {
    pub address: String,
    pub is_verified: bool,
    pub threshold: u64,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigMember {
    pub multisig_address: String,
    pub public_key: String,
    pub weight: u64,
    pub is_accepted: bool,
    pub is_rejected: bool,
    pub order: u64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum ProposalStatus {
    #[default]
    Pending = 0,
    Cancelled = 1,
    Success = 2,
    Failure = 3,
}

impl ProposalStatus {
    pub(crate) fn as_query_param(self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Cancelled => "CANCELLED",
            Self::Success => "SUCCESS",
            Self::Failure => "FAILURE",
        }
    }

    fn from_u64(value: u64) -> Option<Self> {
        match value {
            0 => Some(Self::Pending),
            1 => Some(Self::Cancelled),
            2 => Some(Self::Success),
            3 => Some(Self::Failure),
            _ => None,
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "0" | "PENDING" => Some(Self::Pending),
            "1" | "CANCELLED" => Some(Self::Cancelled),
            "2" | "SUCCESS" => Some(Self::Success),
            "3" | "FAILURE" => Some(Self::Failure),
            _ => None,
        }
    }
}

impl Serialize for ProposalStatus {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for ProposalStatus {
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct ProposalStatusVisitor;

        impl<'de> serde::de::Visitor<'de> for ProposalStatusVisitor {
            type Value = ProposalStatus;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a proposal status integer or uppercase status string")
            }

            fn visit_u64<E>(self, value: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                ProposalStatus::from_u64(value)
                    .ok_or_else(|| E::custom(format!("invalid proposal status {value}")))
            }

            fn visit_i64<E>(self, value: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                if value < 0 {
                    return Err(E::custom(format!("invalid proposal status {value}")));
                }

                self.visit_u64(value as u64)
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                ProposalStatus::from_str(value)
                    .ok_or_else(|| E::custom(format!("invalid proposal status {value}")))
            }
        }

        deserializer.deserialize_any(ProposalStatusVisitor)
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProposalRequest {
    pub multisig_address: String,
    pub transaction_bytes: String,
    pub signature: String,
    pub description: Option<String>,
    pub network: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    pub id: u64,
    pub multisig_address: String,
    pub digest: String,
    pub status: ProposalStatus,
    pub transaction_bytes: String,
    pub proposer_address: String,
    pub description: Option<String>,
    #[serde(default)]
    pub total_weight: u64,
    #[serde(default)]
    pub current_weight: u64,
    pub network: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalWithSignatures {
    pub id: u64,
    pub multisig_address: String,
    pub digest: String,
    pub status: ProposalStatus,
    pub transaction_bytes: String,
    pub proposer_address: String,
    pub description: Option<String>,
    #[serde(default)]
    pub total_weight: u64,
    #[serde(default)]
    pub current_weight: u64,
    pub network: String,
    #[serde(default)]
    pub signatures: Vec<ProposalSignature>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProposal {
    pub id: u64,
    pub multisig_address: String,
    pub digest: String,
    pub status: ProposalStatus,
    pub transaction_bytes: String,
    pub proposer_address: String,
    pub description: Option<String>,
    #[serde(default)]
    pub total_weight: u64,
    #[serde(default)]
    pub current_weight: u64,
    pub network: String,
    #[serde(default)]
    pub signatures: Vec<ProposalSignature>,
    pub multisig: PublicProposalMultisig,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProposalMultisig {
    pub address: String,
    pub name: Option<String>,
    pub threshold: u64,
    pub members: Vec<PublicProposalMember>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProposalMember {
    pub public_key: String,
    pub weight: u64,
    pub order: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalSignature {
    pub proposal_id: u64,
    pub public_key: String,
    pub signature: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MultisigProposer {
    pub address: String,
    pub added_by: String,
    pub added_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub has_next_page: bool,
    #[serde(default)]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub per_page: u64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoteProposalRequest {
    pub signature: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoteProposalResponse {
    pub has_reached_threshold: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct GetProposalsParams {
    pub status: Option<ProposalStatus>,
    pub next_cursor: Option<u64>,
    pub per_page: Option<u64>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetInvitationsParams {
    #[serde(skip_serializing_if = "is_false")]
    pub show_rejected: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuccessResponse {
    pub success: Option<bool>,
    pub message: Option<String>,
    pub verified: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectMultisigInviteResponse {
    pub message: String,
    pub address: String,
}

fn is_false(value: &bool) -> bool {
    !*value
}
