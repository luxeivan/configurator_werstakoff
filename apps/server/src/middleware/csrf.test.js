import { describe, expect, it, vi } from 'vitest';
import { csrfProtection } from './csrf.js';

function makeReq({ method = 'POST', token, expected = 'secret-token' } = {}) {
  return {
    method,
    session: { csrfToken: expected },
    get: (name) => (name.toLowerCase() === 'x-csrf-token' ? token : undefined),
  };
}

describe('csrfProtection', () => {
  it('allows safe methods', () => {
    const next = vi.fn();
    csrfProtection(makeReq({ method: 'GET', token: undefined }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a mutation without token', () => {
    const next = vi.fn();
    csrfProtection(makeReq(), {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe('CSRF_INVALID');
  });

  it('rejects a wrong token', () => {
    const next = vi.fn();
    csrfProtection(makeReq({ token: 'wrong' }), {}, next);
    expect(next.mock.calls[0][0].code).toBe('CSRF_INVALID');
  });

  it('accepts the session token', () => {
    const next = vi.fn();
    csrfProtection(makeReq({ token: 'secret-token' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
