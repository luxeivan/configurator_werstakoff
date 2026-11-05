import { describe, expect, it, vi } from 'vitest';
import { requireAuth, requireRole } from './auth.js';

function run(middleware, session) {
  const next = vi.fn();
  middleware({ session }, {}, next);
  return next;
}

describe('auth middleware', () => {
  it('rejects guest', () => {
    const next = run(requireAuth, {});
    expect(next.mock.calls[0][0].status).toBe(401);
  });

  it('accepts fresh auth', () => {
    const next = run(requireAuth, { userId: 1, role: 'admin', authAt: new Date().toISOString() });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects stale auth', () => {
    const next = run(requireAuth, {
      userId: 1,
      role: 'admin',
      authAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(next.mock.calls[0][0].code).toBe('SESSION_EXPIRED');
  });

  it('enforces roles', () => {
    const middleware = requireRole('admin');
    const next = run(middleware, { userId: 1, role: 'manager', authAt: new Date().toISOString() });
    expect(next.mock.calls[0][0].status).toBe(403);
  });
});
