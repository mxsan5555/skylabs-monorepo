import type { RequestHandler } from 'express';

/** Marks a legacy path. The successor prefix is shown in the Link header. */
export function deprecatedAlias(successorPrefix: string): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${successorPrefix}>; rel="successor-version"`);
    next();
  };
}
