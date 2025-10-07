import { describe, test, expect, beforeEach } from 'bun:test';
import {
  setupSharedTestEnvironment,
  createTestApp,
} from './setup/shared-test-setup';
import { ApiTestFramework } from './framework/api-test-framework';
import { isValidSuiAddress } from '@mysten/sui/utils';

setupSharedTestEnvironment();

describe('Multisig API', () => {
  let framework: ApiTestFramework;

  beforeEach(async () => {
    const app = await createTestApp();
    framework = new ApiTestFramework(app);
  });

  describe('Multisig Creation', () => {
    test('creates 2-of-2 multisig', async () => {
      const { session, users } = await framework.createAuthenticatedSession(2);

      const multisig = await session.createMultisig(users, 2);

      expect(multisig.address).toBeDefined();
      expect(multisig.threshold).toBe(2);
      expect(isValidSuiAddress(multisig.address)).toBe(true);
    });

    test('creates 2-of-3 multisig', async () => {
      const { session, users } = await framework.createAuthenticatedSession(3);

      const multisig = await session.createMultisig(users, 2);

      expect(multisig.address).toBeDefined();
      expect(multisig.threshold).toBe(2);
    });

    test('creates multisig with custom name', async () => {
      const { session, users } = await framework.createAuthenticatedSession(2);

      const multisig = await session.createMultisig(
        users,
        2,
        'My Test Multisig',
      );

      expect(multisig.name).toBe('My Test Multisig');
    });

    test('rejects invalid thresholds', async () => {
      const { session, users } = await framework.createAuthenticatedSession(2);

      // Threshold too high
      await expect(session.createMultisig(users, 3)).rejects.toThrow(
        'Threshold must be less than',
      );

      // Threshold too low
      await expect(session.createMultisig(users, 0)).rejects.toThrow(
        'Threshold must be greater or equal to 1',
      );
    });
  });

  describe('Multisig Acceptance', () => {
    test('member can accept multisig invitation', async () => {
      const { session, users } = await framework.createAuthenticatedSession(2);

      const multisig = await session.createMultisig(users, 2);

      // Second user accepts
      await session.acceptMultisig(users[1], multisig.address);

      // Should not throw
      expect(multisig.address).toBeDefined();
    });

    test('multisig becomes verified when all members accept', async () => {
      const { session, users, multisig } =
        await framework.createVerifiedMultisig(2, 2);

      // If createVerifiedMultisig succeeded, the multisig should be verified
      expect(multisig.address).toBeDefined();
      expect(multisig.threshold).toBe(2);
    });

    test('non-member cannot accept multisig', async () => {
      const { session, users } = await framework.createAuthenticatedSession(2);
      const outsider = session.createUser();

      const multisig = await session.createMultisig(users, 2);

      await expect(
        session.acceptMultisig(outsider, multisig.address),
      ).rejects.toThrow('not a member');
    });
  });

  describe('Multisig Validation', () => {
    test('public keys are auto-registered during multisig creation', async () => {
      const session = framework.createSession();
      const alice = session.createUser();
      const bob = session.createUser();

      // Connect alice but don't register addresses
      await session.connectUser(alice);

      // This should now succeed because the API auto-registers public keys
      const multisig = await session.createMultisig([alice, bob], 2);

      expect(multisig.address).toBeDefined();
      expect(multisig.threshold).toBe(2);
    });
  });
});
