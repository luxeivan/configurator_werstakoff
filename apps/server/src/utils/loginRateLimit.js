const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function keyFor(ip, email) {
  return `${ip || 'unknown'}:${String(email || '').toLowerCase()}`;
}

export function checkLoginRateLimit(ip, email) {
  const key = keyFor(ip, email);
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS };
  }

  if (current.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - current.count };
}

export function registerLoginFailure(ip, email) {
  const key = keyFor(ip, email);
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
  }
}

export function clearLoginFailures(ip, email) {
  attempts.delete(keyFor(ip, email));
}

export function resetLoginRateLimit() {
  attempts.clear();
}
