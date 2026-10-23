import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import content from '../../../content.json';

import { Contact } from './contact';

const contactUs = vi.fn();
vi.mock('../../../api/catalog', () => ({
  getCatalogContactUs: () => contactUs(),
}));

const t = content.contact;
const renderContact = () =>
  render(
    <MemoryRouter>
      <Contact />
    </MemoryRouter>,
  );

beforeEach(() => {
  contactUs.mockResolvedValue({ data: null });
});

describe('Contact', () => {
  it('shows the default address and email and a map of the address', async () => {
    renderContact();
    expect(await screen.findByText(t.defaults.address)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: t.defaults.email }).getAttribute('href'),
    ).toBe(`mailto:${t.defaults.email}`);
    const map = screen.getByTitle(t.mapTitle);
    expect(map.getAttribute('src')).toContain(
      encodeURIComponent(t.defaults.address),
    );
    expect(
      screen.getByRole('complementary', { name: t.mapTitle }),
    ).toBeTruthy();
  });

  it('prefers the CMS details and map embed', async () => {
    contactUs.mockResolvedValue({
      data: {
        address: '1 MG Road, Pune',
        phone: '98765 43210',
        email: 'hi@example.com',
        mapEmbedUrl: 'https://maps.example/embed',
      },
    });
    renderContact();
    expect(await screen.findByText('1 MG Road, Pune')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: '98765 43210' }).getAttribute('href'),
    ).toBe('tel:9876543210');
    expect(screen.getByTitle(t.mapTitle).getAttribute('src')).toBe(
      'https://maps.example/embed',
    );
  });

  it('asks for the required fields before sending', () => {
    renderContact();
    const form = screen.getByRole('form', { name: t.form.heading });
    fireEvent.submit(form);
    expect(screen.getByRole('alert').textContent).toBe(t.form.required);
  });
});
