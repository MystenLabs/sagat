import { describe, test, expect, beforeEach } from 'bun:test';
import {
  setupSharedTestEnvironment,
  createTestApp,
} from './setup/shared-test-setup';
import { ApiTestFramework, newUser } from './framework/api-test-framework';
import { Transaction } from '@mysten/sui/transactions';
import { getLocalClient } from './setup/sui-network';
import { ProposalStatus } from '../src/db/schema';
import { AuthErrors } from '../src/errors';

const client = getLocalClient();

setupSharedTestEnvironment();

describe('Proposal Business Logic', () => {
  let framework: ApiTestFramework;

  beforeEach(async () => {
    const app = await createTestApp();
    framework = new ApiTestFramework(app);
  });

  describe('Transaction Validation', () => {
    test('validates transaction signature before creating proposal', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      // Try to create proposal with invalid signature (using wrong keypair)
      const wrongUser = session.createUser();
      const recipient =
        '0x1234567890123456789012345678901234567890123456789012345678901234';

      // Build transaction
      const tx = new Transaction();
      tx.setSender(multisig.address);
      const [coin] = tx.splitCoins(tx.gas, [1000000]);
      tx.transferObjects([coin], recipient);

      const txBytes = await tx.build({ client });
      const signature = await wrongUser.keypair.signTransaction(txBytes);

      const response = await session.getApp().request('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multisigAddress: multisig.address,
          network: 'localnet',
          transactionBytes: txBytes.toBase64(),
          signature: signature.signature,
          description: 'Test proposal',
        }),
      });

      expect(response.ok).toBe(false);
      const error = await response.text();
      expect(error).toContain('not a member');
    });

    test('prevents duplicate proposals with same transaction digest', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const recipient =
        '0x2222222222222222222222222222222222222222222222222222222222222222';

      // Build identical transactions
      const tx1 = new Transaction();
      tx1.setSender(multisig.address);
      const [coin1] = tx1.splitCoins(tx1.gas, [1000000]);
      tx1.transferObjects([coin1], recipient);

      const txBytes1 = await tx1.build({ client });
      const signature1 = await users[0].keypair.signTransaction(txBytes1);

      // Create first proposal
      const response1 = await session.getApp().request('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multisigAddress: multisig.address,
          network: 'localnet',
          transactionBytes: txBytes1.toBase64(),
          signature: signature1.signature,
          description: 'First proposal',
        }),
      });
      expect(response1.ok).toBe(true);

      // Build identical transaction
      const tx2 = new Transaction();
      tx2.setSender(multisig.address);
      const [coin2] = tx2.splitCoins(tx2.gas, [1000000]);
      tx2.transferObjects([coin2], recipient);

      const txBytes2 = await tx2.build({ client });
      const signature2 = await users[0].keypair.signTransaction(txBytes2);

      // Try to create identical proposal - should fail
      const response2 = await session.getApp().request('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multisigAddress: multisig.address,
          network: 'localnet',
          transactionBytes: txBytes2.toBase64(),
          signature: signature2.signature,
          description: 'Duplicate proposal',
        }),
      });

      expect(response2.ok).toBe(false);
      const error = await response2.text();
      expect(error).toContain('same digest');
    });
  });

  describe('Weighted Voting Logic', () => {
    test('calculates threshold with weighted votes correctly', async () => {
      const { session, users } = await framework.createAuthenticatedSession(3);

      // Create 3-member multisig with different weights: [1, 2, 1], threshold 3
      const multisig = await session.createCustomMultisig(
        users,
        [1, 2, 1],
        3,
        undefined,
        true,
      );

      // Verify multisig (accept invitations)
      await session.acceptMultisig(users[1], multisig.address);
      await session.acceptMultisig(users[2], multisig.address);

      const recipient =
        '0x3333333333333333333333333333333333333333333333333333333333333333';

      // Build and submit proposal
      const tx = new Transaction();
      tx.setSender(multisig.address);
      const [coin] = tx.splitCoins(tx.gas, [500000]);
      tx.transferObjects([coin], recipient);

      const txBytes = await tx.build({ client });
      const signature = await users[0].keypair.signTransaction(txBytes);

      const response = await session.getApp().request('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multisigAddress: multisig.address,
          network: 'localnet',
          transactionBytes: txBytes.toBase64(),
          signature: signature.signature,
          description: 'Test proposal',
        }),
      });

      expect(response.ok).toBe(true);
      const proposal = await response.json();

      // Alice voted (weight 1), now Bob votes (weight 2) = total 3, should reach threshold
      const voteResult = await session.voteOnProposal(
        users[1],
        proposal.id,
        proposal.transactionBytes,
      );

      expect(voteResult.hasReachedThreshold).toBe(true);
    });

    test('does not reach threshold with insufficient weighted votes', async () => {
      const { session, users } = await framework.createAuthenticatedSession(3);

      // Create multisig with weights [1, 1, 1], threshold 3
      const multisig = await session.createCustomMultisig(
        users,
        [1, 1, 1],
        3,
        undefined,
        true,
      );

      // Verify multisig
      await session.acceptMultisig(users[1], multisig.address);
      await session.acceptMultisig(users[2], multisig.address);

      // Build and submit proposal
      const tx = new Transaction();
      tx.setSender(multisig.address);
      const [coin] = tx.splitCoins(tx.gas, [500000]);
      tx.transferObjects(
        [coin],
        '0x4444444444444444444444444444444444444444444444444444444444444444',
      );

      const txBytes = await tx.build({ client });
      const signature = await users[0].keypair.signTransaction(txBytes);

      const response = await session.getApp().request('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multisigAddress: multisig.address,
          network: 'localnet',
          transactionBytes: txBytes.toBase64(),
          signature: signature.signature,
        }),
      });

      expect(response.ok).toBe(true);
      const proposal = await response.json();

      // Only Alice (1) + Bob (1) = 2 votes, need 3 for threshold
      const voteResult = await session.voteOnProposal(
        users[1],
        proposal.id,
        txBytes.toBase64(),
      );

      expect(voteResult.hasReachedThreshold).toBe(false);
    });
  });

  describe('Vote Validation', () => {
    test('prevents duplicate voting by same member', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      // Build and submit proposal
      const tx = new Transaction();
      tx.setSender(multisig.address);
      const [coin] = tx.splitCoins(tx.gas, [500000]);
      tx.transferObjects(
        [coin],
        '0x5555555555555555555555555555555555555555555555555555555555555555',
      );

      const txBytes = await tx.build({ client });
      const signature = await users[0].keypair.signTransaction(txBytes);

      const response = await session.getApp().request('/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          multisigAddress: multisig.address,
          network: 'localnet',
          transactionBytes: txBytes.toBase64(),
          signature: signature.signature,
        }),
      });

      expect(response.ok).toBe(true);
      const proposal = await response.json();

      // Try to vote again with the proposer (who already voted during creation)
      await expect(
        session.voteOnProposal(users[0], proposal.id, txBytes.toBase64()),
      ).rejects.toThrow('already voted');
    });
  });

  describe('Member Access Control', () => {
    test('only verified multisig members can create proposals', async () => {
      const { session, users } = await framework.createAuthenticatedSession(2);
      const alice = newUser();

      // Create multisig but don't have all members accept
      const multisig = await session.createMultisig(
        [users[0], alice],
        2,
        undefined,
        true,
      );

      await expect(
        session.createSimpleTransferProposal(
          alice,
          multisig.address,
          '0x7777777777777777777777777777777777777777777777777777777777777777',
          500000,
        ),
      ).rejects.toThrow(AuthErrors.NotAMultisigMember);
    });

    test('only multisig members can vote on proposals', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const proposal = await session.createSimpleTransferProposal(
        users[0],
        multisig.address,
        '0x8888888888888888888888888888888888888888888888888888888888888888',
        500000,
      );

      // Create outsider who is not a multisig member
      const outsider = session.createUser();

      await expect(
        session.voteOnProposal(
          outsider,
          proposal.id,
          proposal.transactionBytes,
        ),
      ).rejects.toThrow(AuthErrors.NotAMultisigMember);
    });
  });

  describe('Proposer Access Control', () => {
    test('non-multisig/non-proposer members cannot create proposals', async () => {
      const { session, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const outsider = newUser();

      await expect(
        session.createSimpleTransferProposal(
          outsider,
          multisig.address,
          '0x7777777777777777777777777777777777777777777777777777777777777777',
          500000,
        ),
      ).rejects.toThrow(AuthErrors.NotAMultisigMember);
    });

    test('Proposers can create proposals', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const proposer = session.createUser();

      await framework.addProposer(users[0], proposer.address, multisig.address);

      const proposal = await session.createSimpleTransferProposal(
        proposer,
        multisig.address,
        '0x9999999999999999999999999999999999999999999999999999999999999999',
        1000000,
        'Proposal from proposer',
      );

      expect(proposal.id).toBeDefined();
      expect(proposal.transactionBytes).toBeDefined();
    });

    test('Only members can add proposers', async () => {
      const { session, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const outsider = session.createUser();

      await expect(
        framework.addProposer(outsider, outsider.address, multisig.address),
      ).rejects.toThrow(AuthErrors.NotAMultisigMember);
    });

    test('Try to add proposer with expired signature', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const proposer = session.createUser();

      await expect(
        framework.addProposer(
          users[0],
          proposer.address,
          multisig.address,
          '2021-01-01',
        ),
      ).rejects.toThrow('Signature has expired');
    });

    test('Add proposer, propose, remove proposer, try to propose and fail', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const proposer = session.createUser();

      await framework.addProposer(users[0], proposer.address, multisig.address);

      const proposal = await session.createSimpleTransferProposal(
        proposer,
        multisig.address,
        '0x9999999999999999999999999999999999999999999999999999999999999999',
        1000000,
      );

      expect(proposal.id).toBeDefined();

      const listOfProposals = await session.getProposals(
        multisig.address,
        'localnet',
      );

      expect(listOfProposals.length).toBe(1);

      await framework.removeProposer(
        users[0],
        proposer.address,
        multisig.address,
      );

      const shouldBeCancelled = await session.getProposals(
        multisig.address,
        'localnet',
      );

      expect(shouldBeCancelled.length).toBe(1);
      expect(shouldBeCancelled.length).toBe(1);
      expect(shouldBeCancelled[0].status).toBe(ProposalStatus.CANCELLED);

      await expect(
        session.createSimpleTransferProposal(
          proposer,
          multisig.address,
          '0x9999999999999999999999999999999999999999999999999999999999999999',
          1000000,
        ),
      ).rejects.toThrow(AuthErrors.NotAMultisigMember);
    });
  });

  describe('Proposal State Management', () => {
    test('creates proposal with correct initial state', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(2, 2);

      const proposal = await session.createSimpleTransferProposal(
        users[0],
        multisig.address,
        '0x9999999999999999999999999999999999999999999999999999999999999999',
        1000000,
        'Test proposal',
      );

      expect(proposal.id).toBeDefined();
      expect(proposal.transactionBytes).toBeDefined();

      // Proposal should be created with proposer's signature already included
      // (This is business logic - proposer auto-votes when creating)
    });

    test('tracks signatures and calculates threshold correctly', async () => {
      const { session, users, multisig } =
        await framework.createFundedVerifiedMultisig(3, 2);

      const proposal = await session.createSimpleTransferProposal(
        users[0],
        multisig.address,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        750000,
      );

      // First additional vote - should reach threshold (proposer + 1 vote = 2 votes, threshold = 2)
      const voteResult = await session.voteOnProposal(
        users[1],
        proposal.id,
        proposal.transactionBytes,
      );
      expect(voteResult.hasReachedThreshold).toBe(true);
    });
  });
});
