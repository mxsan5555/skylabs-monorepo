import { describe, expect, it } from 'vitest';
import { shouldFailBuild } from './build-policy';

describe('shouldFailBuild', () => {
  it('fails a production build when the API is down', () => {
    expect(shouldFailBuild({ vercelEnv: 'production', rendered: 0, apiDown: true, allowEmpty: false })).toMatch(/API/);
  });

  it('fails a production build that rendered zero routes', () => {
    expect(shouldFailBuild({ vercelEnv: 'production', rendered: 0, apiDown: false, allowEmpty: false })).toMatch(/0 routes/);
  });

  it('passes a production build that rendered routes', () => {
    expect(shouldFailBuild({ vercelEnv: 'production', rendered: 12, apiDown: false, allowEmpty: false })).toBeNull();
  });

  it('passes when PRERENDER_ALLOW_EMPTY is set', () => {
    expect(shouldFailBuild({ vercelEnv: 'production', rendered: 0, apiDown: true, allowEmpty: true })).toBeNull();
  });

  it('never fails preview or local builds', () => {
    expect(shouldFailBuild({ vercelEnv: 'preview', rendered: 0, apiDown: true, allowEmpty: false })).toBeNull();
    expect(shouldFailBuild({ vercelEnv: undefined, rendered: 0, apiDown: true, allowEmpty: false })).toBeNull();
  });
});
