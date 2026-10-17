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
  const el = Array.from(document.querySelectorAll<HTMLElement>('md-outlined-text-field')).find(
    (field) => (field as unknown as { label?: string }).label === label,
  );
  if (!el) throw new Error(`Field "${label}" not found`);
  return el as unknown as HTMLInputElement;
}

function type(label: string, value: string) {
  const field = fieldFor(label);
  field.value = value;
  fireEvent.input(field);
}

function clickCreate() {
  const button = Array.from(document.querySelectorAll('md-filled-button')).find(
    (el) => el.textContent?.includes('Create member') && !el.closest('md-dialog'),
  );
  if (!button) throw new Error('Create member button not found');
  fireEvent.click(button);
}

/** Answer the "Create this member?" dialog. */
async function answerDialog(label: 'Create member' | 'Discard') {
  const dialog = await waitFor(() => {
    const found = document.querySelector('md-dialog');
    if (!found) throw new Error('dialog not open');
    return found;
  });
  const button = Array.from(dialog.querySelectorAll('md-filled-button, md-text-button')).find((el) => el.textContent?.trim() === label);
  if (!button) throw new Error(`Dialog button "${label}" not found`);
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
        <Route path="/account/members" element={<p>list-page</p>} />
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
    await answerDialog('Create member');
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
    await answerDialog('Create member');
    expect(await screen.findByText(/email already belongs/i)).toBeTruthy();
  });

  it('submits the form on Enter (a native submit) and prevents the page reload', async () => {
    createMemberMock.mockResolvedValue({ data: { id: 'm1' } });
    renderPage();
    fillValid();
    const form = document.querySelector('form');
    if (!form) throw new Error('form not found');
    const notCancelled = fireEvent.submit(form);
    expect(notCancelled).toBe(false);
    await answerDialog('Create member');
    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('detail-page')).toBeTruthy());
  });

  it('submits when the user presses Enter in a field', async () => {
    createMemberMock.mockResolvedValue({ data: { id: 'm1' } });
    renderPage();
    fillValid();
    fireEvent.keyDown(fieldFor('Owner mobile number'), { key: 'Enter' });
    await answerDialog('Create member');
    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
  });

  it('asks before creating and does nothing until the dialog is answered', async () => {
    renderPage();
    fillValid();
    clickCreate();
    const dialog = await waitFor(() => {
      const found = document.querySelector('md-dialog');
      if (!found) throw new Error('dialog not open');
      return found;
    });
    expect(dialog.textContent).toContain('Create "Glow Studio" as a new member?');
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('Discard leaves the page without creating', async () => {
    renderPage();
    fillValid();
    clickCreate();
    await answerDialog('Discard');
    await waitFor(() => expect(screen.getByText('list-page')).toBeTruthy());
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('is one labelled form in a feature card with a Cancel button', () => {
    renderPage();
    const card = document.querySelector('form[aria-label="Member details"] sky-feature-card') as (HTMLElement & Record<string, string>) | null;
    if (!card) throw new Error('feature card not found');
    expect([card.color, card.variant, card.shape]).toEqual(['surface', 'filled', 'medium']);
    const headings = Array.from(document.querySelectorAll('section > h2')).map((h) => h.textContent);
    expect(headings).toEqual(['Business details', 'Owner details']);
    const cancel = Array.from(document.querySelectorAll('md-text-button')).find((el) => el.textContent === 'Cancel');
    expect((cancel as unknown as { type?: string })?.type).toBe('button');
  });

  it('ties each error message to its field', async () => {
    renderPage();
    clickCreate();
    const message = await screen.findByText(/enter the business name/i);
    const field = fieldFor('Business name');
    expect(message.id).toBeTruthy();
    expect(field.getAttribute('aria-describedby')).toBe(message.id);
    expect((field as unknown as { errorText?: string }).errorText).toBe('Enter the business name.');
    expect((field as unknown as { error?: boolean }).error).toBe(true);
    expect(fieldFor('Owner email').hasAttribute('aria-describedby')).toBe(true);
  });

  it('puts Zod field errors from a 422 on their fields', async () => {
    createMemberMock.mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 422, {
        fieldErrors: { ownerMobile: ['Mobile number is not valid.'], businessName: ['Name is taken.', 'second'] },
        formErrors: [],
      }),
    );
    renderPage();
    fillValid();
    clickCreate();
    await answerDialog('Create member');
    const mobile = await screen.findByText('Mobile number is not valid.');
    expect(fieldFor('Owner mobile number').getAttribute('aria-describedby')).toBe(mobile.id);
    expect(screen.getByText('Name is taken.')).toBeTruthy();
    expect(screen.queryByText('second')).toBeNull();
    expect(screen.queryByText('Invalid request body')).toBeNull();
  });

  it('shows Zod form errors from a 400 as the form message', async () => {
    createMemberMock.mockRejectedValue(
      new ApiRequestError('VALIDATION_ERROR', 'Invalid request body', 400, { fieldErrors: {}, formErrors: ['Send the owner email or mobile.'] }),
    );
    renderPage();
    fillValid();
    clickCreate();
    await answerDialog('Create member');
    expect(await screen.findByText('Send the owner email or mobile.')).toBeTruthy();
  });

  it('shows the server message when the error has no field details', async () => {
    createMemberMock.mockRejectedValue(new ApiRequestError('SERVER', 'Something broke on the server.', 500));
    renderPage();
    fillValid();
    clickCreate();
    await answerDialog('Create member');
    expect(await screen.findByText(/something broke/i)).toBeTruthy();
  });
});
