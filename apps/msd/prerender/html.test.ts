import { describe, expect, it } from 'vitest';
import { assembleHtml } from './html';

const template = `<!doctype html><html lang="en"><head><meta charset="utf-8" /><link rel="stylesheet" href="/a.css"></head><body><div id="root"></div><script type="module" src="/a.js"></script></body></html>`;

const appHtml =
  '<title>Deals near you</title><meta name="description" content="Spa deals"/><link rel="canonical" href="https://x.in/"/>' +
  '<meta property="og:title" content="Deals"/><header><h1>Hi</h1></header>' +
  '<script type="application/ld+json">{"@type":"WebSite"}</script>';

describe('assembleHtml', () => {
  const out = assembleHtml(template, { appHtml, payload: { shell: { note: '</script><b>' } } });
  const [head, body] = out.split('</head>');

  it('puts the app inside a prerendered root', () => {
    expect(body).toContain('<div id="root" data-prerendered><header><h1>Hi</h1></header>');
  });

  it('moves title, meta and canonical link into head', () => {
    expect(head).toContain('<title>Deals near you</title>');
    expect(head).toContain('<meta name="description" content="Spa deals"/>');
    expect(head).toContain('<link rel="canonical" href="https://x.in/"/>');
    expect(head).toContain('<meta property="og:title" content="Deals"/>');
    expect(body).not.toMatch(/<title>|<meta |rel="canonical"/);
    expect(out.match(/<title>/g)).toHaveLength(1);
  });

  it('keeps the template head tags', () => {
    expect(head).toContain('<meta charset="utf-8" />');
    expect(head).toContain('<link rel="stylesheet" href="/a.css">');
  });

  it('appends the escaped data script before </body>', () => {
    expect(body).toContain(
      '<script type="application/json" id="__MSD_DATA__">{"shell":{"note":"\u003c/script>\u003cb>"}}</script></body>',
    );
  });

  it('leaves JSON-LD in the body', () => {
    expect(body).toContain('<script type="application/ld+json">{"@type":"WebSite"}</script>');
  });
});
