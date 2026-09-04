import type { AccessTokenPayload } from '../lib/jwt';

// `@types/passport` (pulled in transitively by passport-google-oauth20) already declares
// `Express.Request.user?: Express.User` globally. Redeclaring `Request.user` here directly
// would conflict with that declaration; instead we shape the (otherwise empty) `Express.User`
// interface itself, which passport's own `Request.user` picks up.
declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AccessTokenPayload {}

    interface Request {
      // Set by middleware/validate.ts's `validateQuery` — the Zod-parsed, coerced/defaulted
      // form of `req.query` (which itself is a getter-only object on some Express/Node
      // versions and can't be reassigned in place). Callers cast this to the specific
      // schema's inferred shape, e.g. `req.validatedQuery as ReturnType<typeof FooSchema.parse>`.
      validatedQuery?: unknown;
    }
  }
}

export {};
