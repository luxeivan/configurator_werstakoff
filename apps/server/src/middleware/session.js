import { randomBytes } from 'node:crypto';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '../session/options.js';

export async function sessionMiddleware(req, res, next) {
  try {
    const session = await getIronSession(req, res, sessionOptions);
    let changed = false;

    if (!session.guestId) {
      session.guestId = randomBytes(32).toString('hex');
      changed = true;
    }
    if (!session.csrfToken) {
      session.csrfToken = randomBytes(32).toString('hex');
      changed = true;
    }
    if (changed) await session.save();

    req.session = session;
    next();
  } catch (error) {
    next(error);
  }
}
