import type { AccessTokenPayload } from '../lib/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // passport (@types/passport) already augments `Request.user?: User` — augmenting the
    // `User` interface itself (rather than redeclaring `Request.user`) lets both passport's
    // and our own typing merge instead of conflicting.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AccessTokenPayload {}
  }
}

export {};
