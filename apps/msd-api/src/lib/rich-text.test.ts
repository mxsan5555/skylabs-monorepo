import { describe, it, expect } from 'vitest';
import { sanitizeRichText, htmlToPlainText } from './rich-text';

describe('sanitizeRichText', () => {
  it('passes through content made only of the editor toolbar\'s own tags', () => {
    expect(sanitizeRichText('<p><strong>Bold</strong> and <em>italic</em></p>')).toBe(
      '<p><strong>Bold</strong> and <em>italic</em></p>',
    );
  });

  it('strips a script tag entirely (XSS payload)', () => {
    expect(sanitizeRichText('<p>Hello</p><script>alert(1)</script>')).toBe('<p>Hello</p>');
  });

  it('strips an inline event-handler attribute', () => {
    expect(sanitizeRichText('<p onclick="alert(1)">Hello</p>')).toBe('<p>Hello</p>');
  });

  it('strips a javascript: link href but keeps the text', () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">Click</a></p>')).toBe('<p><a>Click</a></p>');
  });

  it('keeps a real http(s) link href', () => {
    expect(sanitizeRichText('<p><a href="https://example.com">Click</a></p>')).toBe(
      '<p><a href="https://example.com">Click</a></p>',
    );
  });

  it('treats Quill\'s empty-editor markup as no content', () => {
    expect(sanitizeRichText('<p><br></p>')).toBeNull();
    expect(sanitizeRichText('<p></p>')).toBeNull();
    expect(sanitizeRichText('')).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText(undefined)).toBeNull();
  });
});

describe('htmlToPlainText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToPlainText('<p>Hello <strong>world</strong></p><p>Second line</p>')).toBe('Hello world Second line');
  });

  it('does not count markup toward meaningful text length', () => {
    const html = '<p><strong>Hi</strong></p>'; // 2 visible chars, far more markup chars
    expect(htmlToPlainText(html).length).toBe(2);
  });

  it('returns empty string for null/undefined/empty input', () => {
    expect(htmlToPlainText(null)).toBe('');
    expect(htmlToPlainText(undefined)).toBe('');
    expect(htmlToPlainText('')).toBe('');
  });
});
