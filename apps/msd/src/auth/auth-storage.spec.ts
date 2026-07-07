import { describe, it, expect, beforeEach } from 'vitest';
import { readToken, writeToken, AUTH_TOKEN_KEY } from './auth-storage';
describe('auth-storage', () => {
beforeEach(() => {
  localStorage.clear();
});
it('should save token in localStorage', () => {
 writeToken('abc123');
  expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('abc123');
});
it('should read token from localStorage', () => {
  localStorage.setItem(AUTH_TOKEN_KEY, 'abc123');
  expect(readToken()).toBe('abc123');
});
it('should return null when no token is present', () => {
  expect(readToken()).toBeNull();
});
it('should remove token from localStorage when called', () => {
  localStorage.setItem(AUTH_TOKEN_KEY, 'abc123');
  writeToken(null);
  expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
});
});