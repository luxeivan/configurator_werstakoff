import { describe, expect, it } from 'vitest';
import { canAccessOrder, hashGuestSession } from './orders.js';

describe('order access', () => {
  const row = {
    id: 1,
    userId: 2,
    customerSessionHash: hashGuestSession('guest-a'),
  };

  it('гостевая сессия видит только свой заказ', () => {
    expect(canAccessOrder(row, { session: { guestId: 'guest-a' } })).toBe(true);
    expect(canAccessOrder(row, { session: { guestId: 'guest-b' } })).toBe(false);
    expect(canAccessOrder(row, { session: {} })).toBe(false);
  });

  it('владелец-пользователь и staff имеют доступ', () => {
    expect(canAccessOrder(row, { session: { userId: 2 } })).toBe(true);
    expect(canAccessOrder(row, { session: { userId: 3 } })).toBe(false);
    expect(canAccessOrder(row, { session: { role: 'manager' } })).toBe(true);
    expect(canAccessOrder(row, { session: { role: 'admin' } })).toBe(true);
    expect(canAccessOrder(null, {})).toBe(false);
  });

  it('хеш гостя стабилен и не раскрывает guestId', () => {
    expect(hashGuestSession('guest-a')).toHaveLength(64);
    expect(hashGuestSession('guest-a')).not.toContain('guest-a');
    expect(hashGuestSession('guest-a')).not.toBe(hashGuestSession('guest-b'));
  });
});
