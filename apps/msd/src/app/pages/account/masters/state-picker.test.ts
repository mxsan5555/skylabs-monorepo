import { describe, expect, it } from 'vitest';
import { GLOBAL_OPTION, fromOptionValue, toOptionValue } from './state-picker';

describe('state picker values', () => {
  it('maps nothing chosen, Global and a state to select values and back', () => {
    expect(toOptionValue(undefined)).toBe('');
    expect(toOptionValue(null)).toBe(GLOBAL_OPTION);
    expect(toOptionValue('Delhi')).toBe('Delhi');
    expect(fromOptionValue('')).toBeUndefined();
    expect(fromOptionValue(GLOBAL_OPTION)).toBeNull();
    expect(fromOptionValue('Delhi')).toBe('Delhi');
  });
});
