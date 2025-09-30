import {
  AuthConnectRequest,
  AuthResponse,
  AuthCheckResponse,
  CreateMultisigRequest,
  AcceptMultisigRequest,
  Multisig,
  CreateProposalRequest,
  Proposal,
  ProposalWithSignatures,
  VoteProposalRequest,
  CancelProposalRequest,
  ProposalStatus,
  MultisigWithMembers,
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      // Important: include credentials to send/receive cookies
      credentials: 'include',
    });

    if (!response.ok) {
      // Special handling for auth check endpoint
      if (endpoint === '/auth/check' && response.status === 401) {
        // Return unauthenticated response instead of throwing
        return { authenticated: false } as T;
      }

      let errorMessage = `Request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If response is not JSON, use default error message
      }
      throw new Error(errorMessage);
    }

    // Handle empty responses (like 204)
    const text = await response.text();
    if (!text) return {} as T;

    try {
      return JSON.parse(text);
    } catch {
      // If response is not JSON, return text as is
      return text as T;
    }
  }

  // Auth endpoints
  async connect(data: AuthConnectRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/connect', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async disconnect(): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/disconnect', {
      method: 'POST',
    });
  }

  // Check if user is authenticated (has valid cookie)
  // This would need to be added to the backend
  async checkAuth(): Promise<AuthCheckResponse> {
    return this.request<AuthCheckResponse>('/auth/check');
  }

  // Multisig endpoints
  async createMultisig(data: CreateMultisigRequest): Promise<Multisig> {
    return this.request<Multisig>('/multisig', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getMultisig(address: string): Promise<MultisigWithMembers> {
    return this.request<MultisigWithMembers>(`/multisig/${address}`);
  }


  async acceptMultisigInvite(
    address: string,
    data: AcceptMultisigRequest
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/multisig/${address}/accept`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async rejectMultisigInvite(
    address: string,
    data: AcceptMultisigRequest
  ): Promise<{ message: string; address: string }> {
    return this.request<{ message: string; address: string }>(`/multisig/${address}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Proposal endpoints
  async createProposal(data: CreateProposalRequest): Promise<Proposal> {
    return this.request<Proposal>('/proposals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getProposals(params: {
    multisigAddress?: string;
    status?: ProposalStatus;
    network: string;
  }): Promise<ProposalWithSignatures[]> {
    const searchParams = new URLSearchParams();
    if (params.multisigAddress) {
      searchParams.append('multisigAddress', params.multisigAddress);
    }
    if (params.status !== undefined) {
      const statusString = ProposalStatus[params.status];
      searchParams.append('status', statusString);
    }
    searchParams.append('network', params.network);

    const query = searchParams.toString();
    return this.request<ProposalWithSignatures[]>(`/proposals${query ? `?${query}` : ''}`);
  }

  async voteOnProposal(
    proposalId: number,
    data: VoteProposalRequest
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/proposals/${proposalId}/vote`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelProposal(
    proposalId: number,
    data: CancelProposalRequest
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/proposals/${proposalId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyProposal(proposalId: number): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/proposals/${proposalId}/verify`, {
      method: 'POST',
    });
  }

  // Address endpoints
  async registerAddresses(extraPublicKeys: string[] = []): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('/addresses', {
      method: 'POST',
      body: JSON.stringify({ extraPublicKeys }),
    });
  }

  async registerPublicKey(publicKey: string): Promise<{ success: boolean }> {
    return this.registerAddresses([publicKey]);
  }

  async getMultisigConnections(showPending = false): Promise<Record<string, MultisigWithMembers[]>> {
    const params = showPending ? '?showPending=true' : '';
    return this.request<Record<string, MultisigWithMembers[]>>(`/addresses/connections${params}`);
  }

  async getAddressInfo(address: string): Promise<{ publicKey: string; address: string }> {
    return this.request<{ publicKey: string; address: string }>(`/addresses/${address}`);
  }
}

export const apiClient = new ApiClient();
