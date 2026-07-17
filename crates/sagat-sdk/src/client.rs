// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashMap;

use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{
    Address, AuthCheckResponse, AuthMode, AuthResponse, CreateMultisigRequest,
    CreateProposalRequest, Expiry, GetInvitationsParams, GetProposalsParams, Multisig,
    MultisigMember, MultisigWithMembers, PaginatedResponse, Proposal, ProposalStatus,
    ProposalWithSignatures, PublicProposal, RejectMultisigInviteResponse, Result,
    SignedMessageRequest, SuccessResponse, VoteProposalRequest, VoteProposalResponse,
};

#[derive(Clone, Debug)]
pub struct SagatClient {
    api_url: String,
    http_client: reqwest::Client,
    mode: AuthMode,
    token: Option<String>,
}

impl SagatClient {
    pub fn new(api_url: impl Into<String>, mode: AuthMode) -> Self {
        Self {
            api_url: api_url.into(),
            http_client: reqwest::Client::new(),
            mode,
            token: None,
        }
    }

    pub fn api_url(&self) -> &str {
        &self.api_url
    }

    pub fn mode(&self) -> AuthMode {
        self.mode
    }
}

impl Default for SagatClient {
    fn default() -> Self {
        Self::new(String::new(), AuthMode::Script)
    }
}

impl SagatClient {
    pub async fn connect(
        &mut self,
        signature: String,
        expiry: impl Into<Expiry>,
    ) -> Result<AuthResponse> {
        let endpoint = match self.mode {
            AuthMode::Script => "/auth/script-connect",
            AuthMode::Cookie => return Err(crate::SagatError::UnsupportedAuthMode(self.mode)),
        };
        let expiry = expiry.into().into_string();

        let response: AuthResponse = self
            .post(
                endpoint,
                Auth::None,
                json_body(&ConnectRequest { signature, expiry })?,
            )
            .await?;

        if let Some(token) = &response.token {
            self.token = Some(token.clone());
        }

        Ok(response)
    }

    pub async fn disconnect(&mut self) -> Result<AuthResponse> {
        self.token = None;

        Ok(AuthResponse {
            success: Some(true),
            token: None,
        })
    }

    pub async fn check_auth(&self) -> Result<AuthCheckResponse> {
        self.get("/auth/check", Auth::Required).await
    }

    pub async fn create_multisig(
        &self,
        data: CreateMultisigRequest,
    ) -> Result<MultisigWithMembers> {
        let response: CreateMultisigResponse = self
            .post("/multisig", Auth::Required, json_body(&data)?)
            .await?;

        let total_members = response.members.len();
        let total_weight = response.members.iter().map(|member| member.weight).sum();

        Ok(MultisigWithMembers {
            address: response.multisig.address,
            is_verified: response.multisig.is_verified,
            threshold: response.multisig.threshold,
            name: response.multisig.name,
            members: response.members,
            total_members,
            total_weight,
            proposers: Vec::new(),
        })
    }

    pub async fn get_multisig(&self, address: String) -> Result<MultisigWithMembers> {
        self.get(&format!("/multisig/{address}"), Auth::Required)
            .await
    }

    pub async fn accept_multisig_invite(
        &self,
        address: String,
        data: SignedMessageRequest,
    ) -> Result<Multisig> {
        self.post(
            &format!("/multisig/{address}/accept"),
            Auth::None,
            json_body(&data)?,
        )
        .await
    }

    pub async fn reject_multisig_invite(
        &self,
        address: String,
        data: SignedMessageRequest,
    ) -> Result<RejectMultisigInviteResponse> {
        self.post(
            &format!("/multisig/{address}/reject"),
            Auth::None,
            json_body(&data)?,
        )
        .await
    }

    pub async fn create_proposal(&self, data: CreateProposalRequest) -> Result<Proposal> {
        self.post("/proposals", Auth::None, json_body(&data)?).await
    }

    pub async fn get_proposals(
        &self,
        multisig_address: String,
        network: String,
        params: GetProposalsParams,
    ) -> Result<PaginatedResponse<ProposalWithSignatures>> {
        self.get_with_query(
            "/proposals",
            Auth::Required,
            &GetProposalsQuery {
                multisig_address,
                network,
                status: params.status.map(ProposalStatus::as_query_param),
                next_cursor: params.next_cursor,
                per_page: params.per_page,
            },
        )
        .await
    }

    pub async fn get_proposal_by_digest(&self, digest: String) -> Result<PublicProposal> {
        self.get(
            &format!("/proposals/digest/{}", encode_path_segment(&digest)),
            Auth::None,
        )
        .await
    }

    pub async fn vote_for_proposal(
        &self,
        proposal_id: u64,
        data: VoteProposalRequest,
    ) -> Result<VoteProposalResponse> {
        self.post(
            &format!("/proposals/{proposal_id}/vote"),
            Auth::None,
            json_body(&data)?,
        )
        .await
    }

    pub async fn cancel_proposal(
        &self,
        proposal_id: u64,
        data: SignedMessageRequest,
    ) -> Result<SuccessResponse> {
        self.post(
            &format!("/proposals/{proposal_id}/cancel"),
            Auth::None,
            json_body(&data)?,
        )
        .await
    }

    pub async fn register_public_keys(
        &self,
        extra_public_keys: Vec<String>,
    ) -> Result<SuccessResponse> {
        self.post(
            "/addresses",
            Auth::Required,
            json_body(&RegisterPublicKeysRequest { extra_public_keys })?,
        )
        .await
    }

    pub async fn register_public_key(&self, public_key: String) -> Result<SuccessResponse> {
        self.register_public_keys(vec![public_key]).await
    }

    pub async fn get_multisig_connections(
        &self,
    ) -> Result<HashMap<String, Vec<MultisigWithMembers>>> {
        self.get("/addresses/connections", Auth::Required).await
    }

    pub async fn get_invitations(
        &self,
        public_key: String,
        params: GetInvitationsParams,
    ) -> Result<Vec<MultisigWithMembers>> {
        self.get_with_query(
            &format!(
                "/addresses/invitations/{}",
                encode_path_segment(&public_key)
            ),
            Auth::Required,
            &params,
        )
        .await
    }

    pub async fn verify_proposal(&self, proposal_id: u64) -> Result<SuccessResponse> {
        self.post(
            &format!("/proposals/{proposal_id}/verify"),
            Auth::Required,
            None,
        )
        .await
    }

    pub async fn verify_proposal_by_digest(&self, digest: String) -> Result<SuccessResponse> {
        self.post(
            &format!(
                "/proposals/{}/verify-by-digest",
                encode_path_segment(&digest)
            ),
            Auth::None,
            None,
        )
        .await
    }

    pub async fn get_address_info(&self, address: String) -> Result<Address> {
        self.get(
            &format!("/addresses/{}", encode_path_segment(&address)),
            Auth::None,
        )
        .await
    }

    pub async fn register_addresses(&self) -> Result<SuccessResponse> {
        self.post("/addresses", Auth::Required, None).await
    }

    pub async fn add_multisig_proposer(
        &self,
        address: String,
        proposer: String,
        signature: String,
        expiry: impl Into<Expiry>,
    ) -> Result<SuccessResponse> {
        let expiry = expiry.into().into_string();
        self.post(
            &format!("/multisig/{address}/add-proposer"),
            Auth::None,
            json_body(&MultisigProposerRequest {
                proposer,
                signature,
                expiry,
            })?,
        )
        .await
    }

    pub async fn remove_multisig_proposer(
        &self,
        address: String,
        proposer: String,
        signature: String,
        expiry: impl Into<Expiry>,
    ) -> Result<SuccessResponse> {
        let expiry = expiry.into().into_string();
        self.post(
            &format!("/multisig/{address}/remove-proposer"),
            Auth::None,
            json_body(&MultisigProposerRequest {
                proposer,
                signature,
                expiry,
            })?,
        )
        .await
    }

    fn auth_token(&self) -> Result<String> {
        self.token
            .clone()
            .ok_or(crate::SagatError::MissingAuthToken)
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.api_url, path)
    }

    fn request(&self, method: Method, path: &str, auth: Auth) -> Result<reqwest::RequestBuilder> {
        let request = self.http_client.request(method, self.url(path));
        match auth {
            Auth::Required => Ok(request.bearer_auth(self.auth_token()?)),
            Auth::None => Ok(request),
        }
    }

    async fn get<T>(&self, path: &str, auth: Auth) -> Result<T>
    where
        T: DeserializeOwned,
    {
        self.send_request(self.request(Method::GET, path, auth)?)
            .await
    }

    async fn get_with_query<T, Q>(&self, path: &str, auth: Auth, query: &Q) -> Result<T>
    where
        T: DeserializeOwned,
        Q: Serialize + ?Sized,
    {
        self.send_request(self.request(Method::GET, path, auth)?.query(query))
            .await
    }

    async fn post<T>(&self, path: &str, auth: Auth, body: Option<serde_json::Value>) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let request = self.request(Method::POST, path, auth)?;
        let request = match body {
            Some(body) => request.json(&body),
            None => request,
        };
        self.send_request(request).await
    }

    async fn send_request<T>(&self, request: reqwest::RequestBuilder) -> Result<T>
    where
        T: DeserializeOwned,
    {
        Ok(request.send().await?.error_for_status()?.json().await?)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Auth {
    Required,
    None,
}

fn json_body<T>(body: &T) -> Result<Option<serde_json::Value>>
where
    T: Serialize + ?Sized,
{
    Ok(Some(serde_json::to_value(body)?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectRequest {
    signature: String,
    expiry: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMultisigResponse {
    multisig: Multisig,
    members: Vec<MultisigMember>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GetProposalsQuery {
    multisig_address: String,
    network: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_cursor: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    per_page: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterPublicKeysRequest {
    extra_public_keys: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MultisigProposerRequest {
    proposer: String,
    signature: String,
    expiry: String,
}

fn encode_path_segment(segment: &str) -> String {
    utf8_percent_encode(segment, NON_ALPHANUMERIC).to_string()
}
