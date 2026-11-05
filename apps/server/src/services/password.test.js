import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies a valid password', async () => {
    const hash = await hashPassword('strong-password-123');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('strong-password-123', hash)).resolves.toBe(true);
  });

  it('rejects an invalid password', async () => {
    const hash = await hashPassword('strong-password-123');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects malformed hashes', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });
});
