import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import content from '../../../content.json';
import { SnackbarHost } from '../../../snackbar/snackbar';
import { Support } from './support';

const t = content.support;
const { createCustomerSupport } = vi.hoisted(() => ({ createCustomerSupport: vi.fn() }));
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/support', () => ({ createCustomerSupport: (...a: unknown[]) => createCustomerSupport(...a) }));

type Field = HTMLElement & { value: string; label: string };
const field = (label: string) => (Array.from(document.querySelectorAll('md-outlined-text-field')) as Field[]).find((f) => f.label === label) as Field;
const type = (label: string, value: string) => {
  const el = field(label);
  el.value = value;
  fireEvent.input(el);
};
const submit = () => fireEvent.submit(document.querySelector('form') as HTMLFormElement);

beforeEach(() => {
  createCustomerSupport.mockReset().mockResolvedValue({ data: {} });
});

const renderSupport = () =>
  render(
    <MemoryRouter>
      <Support />
      <SnackbarHost />
    </MemoryRouter>,
  );

describe('Support', () => {
  it('heads the page with one h1 and the request form as a named region; noindex', () => {
    renderSupport();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(t.title);
    expect(screen.getByRole('region', { name: t.formHeading })).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });

  it('asks for both fields and sends nothing when one is empty', () => {
    renderSupport();
    type(t.subject, 'Refund');
    submit();
    expect(screen.getByRole('alert').textContent).toBe(t.required);
    expect(createCustomerSupport).not.toHaveBeenCalled();
  });

  it('sends the trimmed subject and message, then confirms', async () => {
    renderSupport();
    type(t.subject, '  Refund  ');
    type(t.message, ' Where is my refund? ');
    submit();
    await waitFor(() => expect(createCustomerSupport).toHaveBeenCalledWith('test-token', { subject: 'Refund', message: 'Where is my refund?' }));
    expect(await screen.findByText(t.sent)).toBeTruthy();
  });
});
