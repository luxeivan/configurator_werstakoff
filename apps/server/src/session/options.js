import { env } from '../config/env.js';

export const SESSION_COOKIE_NAME = 'planner_session';
export const GUEST_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionOptions = {
  password: env.sessionSecret,
  cookieName: SESSION_COOKIE_NAME,
  ttl: GUEST_SESSION_TTL_SECONDS,
  cookieOptions: {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
  },
};
