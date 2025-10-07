import { Hono } from 'hono';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { getLocalClient, fundAddress } from '../setup/sui-network';
import { MIST_PER_SUI } from '@mysten/sui/utils';
import { ProposalWithSignatures } from '../../src/db/schema';
import { PaginatedResponse } from '../../src/utils/pagination';

const client = getLocalClient();

export interface TestUser {
  keypair: Ed25519Keypair;
  publicKey: string;
  address: string;
}

export interface TestMultisig {
  address: string;
  threshold: number;
  name?: string;
}

export interface TestProposal {
  id: number;
  transactionBytes: string;
}

export const newUser = (): TestUser => {
  const keypair = new Ed25519Keypair();
  return {
    keypair,
    publicKey: keypair.getPublicKey().toSuiPublicKey(),
    address: keypair.toSuiAddress(),
  };
};

const createExpirationDateForMessage = (): string => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 30);
  return expiry.toISOString();
};

export class TestSession {
  private cookie: string = '';
  private users: TestUser[] = [];

  constructor(private app: Hono) {}

  createUser(): TestUser {
    const user = newUser();
    this.users.push(user);
    return user;
  }

  private async signMessage(
    keypair: Ed25519Keypair,
    message: string,
  ): Promise<string> {
    const bytes = new TextEncoder().encode(message);
    const { signature } = await keypair.signPersonalMessage(bytes);
    return signature;
  }

  async connectUser(user: TestUser): Promise<void> {
    const expiry = createExpirationDateForMessage();
    const message = `Verifying address ownership until: ${expiry}`;
    const signature = await this.signMessage(user.keypair, message);

    const headers: any = { 'Content-Type': 'application/json' };
    if (this.cookie) headers.Cookie = this.cookie;

    const response = await this.app.request('/auth/connect', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        signature: signature,
        expiry,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Auth failed for user ${user.address}: ${response.status}`,
      );
    }

    this.cookie =
      response.headers
        .get('set-cookie')
        ?.match(/connected-wallet=([^;]+)/)?.[0] || '';

    // Track connected user if not already tracked
    if (!this.users.find((u) => u.address === user.address)) {
      this.users.push(user);
    }
  }

  async registerAddresses(): Promise<void> {
    if (!this.cookie) {
      throw new Error('No users connected - call connectUsers first');
    }

    const response = await this.app.request('/addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: this.cookie,
      },
    });

    if (!response.ok) {
      throw new Error(`Address registration failed: ${response.status}`);
    }
  }

  async createMultisig(
    members: TestUser[],
    threshold: number,
    name?: string,
    fund: boolean = false,
  ): Promise<TestMultisig> {
    return this.createCustomMultisig(
      members,
      members.map(() => 1),
      threshold,
      name,
      fund,
    );
  }

  async createCustomMultisig(
    members: TestUser[],
    weights: number[],
    threshold: number,
    name?: string,
    fund: boolean = false,
  ): Promise<TestMultisig> {
    const response = await this.app.request('/multisig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
      body: JSON.stringify({
        publicKeys: members.map((m) => m.publicKey),
        weights,
        threshold,
        name,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Multisig creation failed: ${response.status} - ${error}`,
      );
    }

    const { multisig } = await response.json();

    // Only fund if explicitly requested
    if (fund) await fundAddress(multisig.address);

    return multisig;
  }

  async multiCoinsToAddress(
    keypair: Ed25519Keypair,
    recipient: string,
    count: number,
    totalPerCoin: number = 0.1 * Number(MIST_PER_SUI),
  ): Promise<void> {
    await fundAddress(keypair.toSuiAddress());

    const tx = new Transaction();
    tx.setSender(keypair.toSuiAddress());
    for (let i = 0; i < count; i++) {
      tx.moveCall({
        target: '0x2::pay::split_and_transfer',
        arguments: [
          tx.gas,
          tx.pure.u64(totalPerCoin),
          tx.pure.address(recipient),
        ],
        typeArguments: ['0x2::sui::SUI'],
      });
    }
    // use the first user's gas to send a few sui to the multisig.
    const result = await keypair.signAndExecuteTransaction({
      transaction: tx,
      client,
    });

    await client.waitForTransaction({ digest: result.digest });
  }

  async acceptMultisig(
    member: TestUser,
    multisigAddress: string,
  ): Promise<void> {
    const message = `Participating in multisig ${multisigAddress}`;
    const signature = await this.signMessage(member.keypair, message);

    const response = await this.app.request(
      `/multisig/${multisigAddress}/accept`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: signature,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Multisig acceptance failed: ${response.status} - ${error}`,
      );
    }
  }

  // Expose app for direct API calls when needed
  getApp(): Hono {
    return this.app;
  }

  async createProposal(
    proposer: TestUser,
    multisigAddress: string,
    network: string,
    transactionBytes: string,
    description?: string,
  ): Promise<ProposalWithSignatures> {
    const txBytes = Transaction.from(transactionBytes);
    const builtTx = await txBytes.build({ client });
    const signature = await proposer.keypair.signTransaction(builtTx);

    const response = await this.app.request('/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        multisigAddress,
        network,
        transactionBytes,
        signature: signature.signature,
        description,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Proposal creation failed: ${response.status} - ${error}`,
      );
    }
    return response.json();
  }

  async getProposals({
    multisigAddress,
    network,
    status,
    cursor,
  }: {
    multisigAddress: string;
    network: string;
    status?: string;
    cursor?: { nextCursor?: number; perPage?: number };
  }): Promise<PaginatedResponse<ProposalWithSignatures>> {
    const queryParams = new URLSearchParams();
    queryParams.append('multisigAddress', multisigAddress);
    queryParams.append('network', network);
    if (status) queryParams.append('status', status);
    if (cursor) {
      if (cursor.nextCursor)
        queryParams.append('nextCursor', cursor.nextCursor.toString());
      if (cursor.perPage)
        queryParams.append('perPage', cursor.perPage.toString());
    }

    const response = await this.app.request(
      `/proposals?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Cookie: this.cookie },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Proposal retrieval failed: ${response.status} - ${error}`,
      );
    }
    return response.json();
  }

  // Simple helper for repetitive test transfers - builds transaction inline for clarity
  async createSimpleTransferProposal(
    proposer: TestUser,
    multisigAddress: string,
    recipient: string,
    amount: number,
    description?: string,
  ): Promise<{ id: number; transactionBytes: string }> {
    const tx = new Transaction();
    tx.setSender(multisigAddress);
    const [coin] = tx.splitCoins(tx.gas, [amount]);
    tx.transferObjects([coin], recipient);

    const txBytes = await tx.build({ client });
    const signature = await proposer.keypair.signTransaction(txBytes);

    const response = await this.app.request('/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        multisigAddress,
        network: 'localnet',
        transactionBytes: txBytes.toBase64(),
        signature: signature.signature,
        description,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Proposal creation failed: ${response.status} - ${error}`,
      );
    }

    const proposal = await response.json();

    return proposal;
  }

  async voteOnProposal(
    voter: TestUser,
    proposalId: number,
    transactionBytes: string,
  ): Promise<{ hasReachedThreshold: boolean }> {
    const txBytes = Transaction.from(transactionBytes);
    const builtTx = await txBytes.build({ client });
    const signature = await voter.keypair.signTransaction(builtTx);

    const response = await this.app.request(`/proposals/${proposalId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signature: signature.signature,
      }),
    }
  );

    if (!response.ok) {
      const error = await response.text();
      let message = `Voting failed: ${response.status}`;
      try {
        const parsed = JSON.parse(error);
        message = parsed.error || message;
      } catch {
        message += ` - ${error}`;
      }
      throw new Error(message);
    }

    return response.json();
  }

  async disconnect(): Promise<void> {
    await this.app.request('/auth/disconnect', { method: 'POST' });
    this.cookie = '';
    this.users = [];
  }

  getConnectedUsers(): TestUser[] {
    if (!this.cookie) return [];

    try {
      // Extract JWT from cookie
      const jwtMatch = this.cookie.match(/connected-wallet=([^;]+)/);
      if (!jwtMatch) return [];

      const jwt = jwtMatch[1];

      // Decode JWT payload (it's base64 encoded)
      const parts = jwt.split('.');
      if (parts.length !== 3) return [];

      const payload = JSON.parse(atob(parts[1]));
      const publicKeysFromJWT = payload.publicKeys || [];

      // Map JWT public keys back to our test users
      return this.users.filter((user) =>
        publicKeysFromJWT.includes(user.publicKey),
      );
    } catch (error) {
      console.warn('Failed to decode JWT:', error);
      return [];
    }
  }

  hasActiveCookie(): boolean {
    return !!this.cookie && this.getConnectedUsers().length > 0;
  }

  getCookie(): string {
    return this.cookie;
  }
}

export class ApiTestFramework {
  constructor(private app: Hono) {}

  createSession(): TestSession {
    return new TestSession(this.app);
  }

  // Helper methods for common workflows
  async createAuthenticatedSession(userCount: number = 2): Promise<{
    session: TestSession;
    users: TestUser[];
  }> {
    const session = this.createSession();
    const users: TestUser[] = [];

    for (let i = 0; i < userCount; i++) {
      users.push(session.createUser());
    }

    for (const user of users) await session.connectUser(user);
    await session.registerAddresses();

    return { session, users };
  }

  async createVerifiedMultisig(
    userCount: number = 2,
    threshold?: number,
    name?: string,
    fund: boolean = false,
  ): Promise<{
    session: TestSession;
    users: TestUser[];
    multisig: TestMultisig;
  }> {
    const { session, users } = await this.createAuthenticatedSession(userCount);
    const actualThreshold = threshold || userCount;

    const multisig = await session.createMultisig(
      users,
      actualThreshold,
      name,
      fund,
    );

    // Accept for all non-creator members
    for (let i = 1; i < users.length; i++) {
      await session.acceptMultisig(users[i], multisig.address);
    }

    return { session, users, multisig };
  }

  async createFundedVerifiedMultisig(
    userCount: number = 2,
    threshold?: number,
    name?: string,
  ): Promise<{
    session: TestSession;
    users: TestUser[];
    multisig: TestMultisig;
  }> {
    return this.createVerifiedMultisig(userCount, threshold, name, true);
  }

  async addProposer(
    member: TestUser,
    proposer: string,
    multisigAddress: string,
    customExpiry?: string,
  ): Promise<void> {
    const expiry = customExpiry || createExpirationDateForMessage();
    const message = `Adding proposer ${proposer} to multisig ${multisigAddress}. Valid until: ${expiry}`;
    const bytes = new TextEncoder().encode(message);
    const signature = await member.keypair.signPersonalMessage(bytes);

    const response = await this.app.request(
      `/multisig/${multisigAddress}/add-proposer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposer,
          signature: signature.signature,
          expiry,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Multisig proposer addition failed: ${response.status} - ${error}`,
      );
    }
  }

  // Remove proposer for a multisig.
  async removeProposer(
    member: TestUser,
    proposer: string,
    multisigAddress: string,
  ): Promise<void> {
    const expiry = createExpirationDateForMessage();
    const message = `Removing proposer ${proposer} from multisig ${multisigAddress}. Valid until: ${expiry}`;
    const bytes = new TextEncoder().encode(message);
    const signature = await member.keypair.signPersonalMessage(bytes);

    const response = await this.app.request(
      `/multisig/${multisigAddress}/remove-proposer`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposer,
          signature: signature.signature,
          expiry,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Multisig proposer removal failed: ${response.status} - ${error}`,
      );
    }
  }
}
