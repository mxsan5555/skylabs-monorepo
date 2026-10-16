import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../../api/rbac/client';
import { MemberNewPage, validateMember } from './member-new-page';

const createMemberMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../../../api/rbac/members', () => ({ createMember: (...a: unknown[]) => createMemberMock(...a) }));

function fieldFor(label: string): HTMLInputElement {
  // `label` is a declared property on the Material Web element, so it is set as a property, not an attribute.
  const el = Array.from(document.querySelectorAll('md-outlined-text-field')).find(
    (field) => (field as unknown as { label?: string }).label === label,
  );
  if (!el) throw new Error(`Field "${label}" not found`);
  return el as HTMLInputElement;
}

function type(label: string, value: string) {
  const field = fieldFor(label);
  field.value = value;
  fireEvent.input(field);
}

function clickCreate() {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.includes('Create member'));
  if (!button) throw new Error('Create member button not found');
  fireEvent.click(button);
}

function fillValid() {
  type('Business name', 'Glow Studio');
  type('Owner first name', 'Asha');
  type('Owner last name', 'Rao');
  type('Owner email', 'asha@glow.test');
  type('Owner mobile number', '9876543210');
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/account/members/new']}>
      <Routes>
        <Route path="/account/members/new" element={<MemberNewPage />} />
        <Route path="/account/members/:id" element={<p>detail-page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthMock.mockReturnValue({ token: 't', can: () => true });
});

describe('validateMember', () => {
  const valid = { businessName: 'Glow', ownerFirstName: 'A', ownerLastName: 'R', ownerEmail: 'a@glow.test', ownerMobile: '9876543210' };

  it('accepts a valid input', () => {
    expect(validateMember(valid)).toEqual({});
  });

  it('rejects what the server schema rejects', () => {
    expect(validateMember({ ...valid, ownerMobile: '5876543210' }).ownerMobile).toBeTruthy();
    expect(validateMember({ ...valid, ownerMobile: '98765' }).ownerMobile).toBeTruthy();
    expect(validateMember({ ...valid, ownerEmail: 'a..b@glow.test' }).ownerEmail).toBeTruthy();
    expect(validateMember({ ...valid, ownerEmail: 'a@glow' }).ownerEmail).toBeTruthy();
    expect(validateMember({ ...valid, businessName: 'x'.repeat(201) }).businessName).toBeTruthy();
    expect(validateMember({ ...valid, ownerFirstName: 'x'.repeat(76) }).ownerFirstName).toBeTruthy();
    expect(validateMember({ ...valid, ownerLastName: 'x'.repeat(76) }).ownerLastName).toBeTruthy();
  });
});

describe('MemberNewPage', () => {
  it('shows an access message without members:create', () => {
    useAuthMock.mockReturnValue({ token: 't', can: () => false });
    renderPage();
    expect(screen.getByText(/do not have access/i)).toBeTruthy();
  });

  it('shows field errors and does not call the API when the form is empty', async () => {
    renderPage();
    clickCreate();
    expect(await screen.findByText(/enter the business name/i)).toBeTruthy();
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('moves focus to the first invalid field after a failed submit', async () => {
    renderPage();
    type('Business name', 'Glow Studio');
    clickCreate();
    await screen.findByText(/enter the owner first name/i);
    await waitFor(() => expect(document.activeElement).toBe(fieldFor('Owner first name')));
  });

  it('creates the member then opens the detail page', async () => {
    createMemberMock.mockResolvedValue({ data: { id: 'm1' } });
    renderPage();
    fillValid();
    clickCreate();
    await waitFor(() => expect(screen.getByText('detail-page')).toBeTruthy());
    expect(createMemberMock).toHaveBeenCalledWith('t', {
      businessName: 'Glow Studio',
      ownerFirstName: 'Asha',
      ownerLastName: 'Rao',
      ownerEmail: 'asha@glow.test',
      ownerMobile: '9876543210',
    });
  });

  it('puts a duplicate email error on the email field', async () => {
    createMemberMock.mockRejectedValue(
      new ApiRequestError('CONFLICT', 'exists', 409, { fields: { ownerEmail: 'This email already belongs to another account.' } }),
    );
    renderPage();
    fillValid();
    clickCreate();
    expect(await screen.findByText(/email already belongs/i)).toBeTruthy();
  });

  it('shows the server message when the error has no field details', async () => {
    createMemberMock.mockRejectedValue(new ApiRequestError('SERVER', 'Something broke on the server.', 500));
    renderPage();
    fillValid();
    clickCreate();
    expect(await screen.findByText(/something broke/i)).toBeTruthy();
  });
});
