import type { AccessTokenPayload } from '../lib/jwt';

// `@types/passport` (pulled in transitively by passport-google-oauth20) already declares
// `Express.Request.user?: Express.User` globally. Redeclaring `Request.user` here directly
// would conflict with that declaration; instead we shape the (otherwise empty) `Express.User`
// interface itself, which passport's own `Request.user` picks up.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AccessTokenPayload {}
  }
}

export {};
