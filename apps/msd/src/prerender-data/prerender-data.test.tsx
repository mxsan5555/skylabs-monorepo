import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PRERENDER_SCRIPT_ID,
  PrerenderDataProvider,
  categoryDataKey,
  readPrerenderPayload,
  usePrerenderedData,
} from './prerender-data';

function addScript(text: string) {
  const el = document.createElement('script');
  el.id = PRERENDER_SCRIPT_ID;
  el.type = 'application/json';
  el.textContent = text;
  document.body.appendChild(el);
}

afterEach(() => {
  document.getElementById(PRERENDER_SCRIPT_ID)?.remove();
});

describe('readPrerenderPayload', () => {
  it('returns {} when the script is absent', () => {
    expect(readPrerenderPayload()).toEqual({});
  });

  it('returns {} when the script holds invalid JSON', () => {
    addScript('{not json');
    expect(readPrerenderPayload()).toEqual({});
  });

  it('returns the parsed payload when present', () => {
    addScript('{"shell":{"a":1}}');
    expect(readPrerenderPayload()).toEqual({ shell: { a: 1 } });
  });
});

describe('usePrerenderedData', () => {
  it('returns the keyed data inside a provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PrerenderDataProvider payload={{ shell: { a: 1 } }}>{children}</PrerenderDataProvider>
    );
    const { result } = renderHook(() => usePrerenderedData('shell'), { wrapper });
    expect(result.current).toEqual({ a: 1 });
  });

  it('returns undefined outside a provider', () => {
    const { result } = renderHook(() => usePrerenderedData('shell'));
    expect(result.current).toBeUndefined();
  });
});

describe('categoryDataKey', () => {
  it('keys by slug, plus city when given', () => {
    expect(categoryDataKey('massage')).toBe('category:massage');
    expect(categoryDataKey('massage', 'Pune')).toBe('category:massage:Pune');
  });
});
