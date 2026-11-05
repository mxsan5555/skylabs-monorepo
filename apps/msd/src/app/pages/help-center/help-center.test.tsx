import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HelpCenter } from './help-center';
import content from '../../../content.json';

const { listCatalogFaqsMock } = vi.hoisted(() => ({ listCatalogFaqsMock: vi.fn() }));

vi.mock('../../../api/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../../api/catalog')>('../../../api/catalog');
  return { ...actual, listCatalogFaqs: listCatalogFaqsMock };
});

const t = content.helpCenter;
const headers = () => Array.from(document.querySelectorAll('sky-accordion-item')).map((el) => (el as unknown as { header: string }).header ?? el.getAttribute('header'));

const search = (value: string) =>
  act(() => {
    document.querySelector('sky-action-field')?.dispatchEvent(new CustomEvent('sky-submit', { detail: { value } }));
  });

const renderPage = () =>
  render(
    <MemoryRouter>
      <HelpCenter />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Feature: public Help Center (StaticPage frame)
 * Scenario: CMS FAQs (`GET /catalog/faqs`) in an accordion, searchable by question and answer;
 * the content.json FAQs show while the CMS has none.
 */
describe('HelpCenter (public page)', () => {
  it('shows the CMS FAQs when there are any', async () => {
    listCatalogFaqsMock.mockResolvedValue({ data: [{ id: 'f1', question: 'Is parking free?', answer: 'Yes, at most spas.' }] });
    renderPage();

    expect(await screen.findByText('Yes, at most spas.')).toBeTruthy();
    expect(headers()).toEqual(['Is parking free?']);
  });

  it('shows the default FAQs when the CMS has none', async () => {
    listCatalogFaqsMock.mockResolvedValue({ data: [] });
    renderPage();

    expect(await screen.findByText(t.faqs[0].answer)).toBeTruthy();
    expect(headers()).toEqual(t.faqs.map((f) => f.question));
  });

  it('filters by the submitted search and announces the result count', async () => {
    listCatalogFaqsMock.mockResolvedValue({ data: [] });
    renderPage();
    await screen.findByText(t.faqs[0].answer);

    search('razorpay');
    expect(headers()).toEqual(['Which payment methods can I use?']);
    expect(screen.getByText(t.resultCountOne.replace('{query}', 'razorpay'))).toBeTruthy();

    search('zzz');
    expect(headers()).toEqual([]);
    expect(screen.getByText(t.noResults.replace('{query}', 'zzz'))).toBeTruthy();
  });
});
