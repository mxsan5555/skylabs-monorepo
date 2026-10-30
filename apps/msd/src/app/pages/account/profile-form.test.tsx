import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../api/rbac/client';
import { SnackbarHost } from '../../../snackbar/snackbar';
import content from '../../../content.json';
import { ProfileForm } from './profile-form';

const { getMyProfileMock, saveMyAddressMock, listMyOrdersMock } = vi.hoisted(() => ({
  getMyProfileMock: vi.fn(),
  saveMyAddressMock: vi.fn(),
  listMyOrdersMock: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/rbac/me', () => ({
  getMyProfile: (...a: unknown[]) => getMyProfileMock(...a),
  updateMyProfile: vi.fn(),
  saveMyAddress: (...a: unknown[]) => saveMyAddressMock(...a),
}));
vi.mock('../../../api/orders', () => ({ listMyOrders: (...a: unknown[]) => listMyOrdersMock(...a) }));

const t = content.profileSettings.address;
const fields = content.checkout.fields;

const NEERAJ = {
  id: 'u1',
  name: 'Neeraj Singh',
  email: 'neeraj@test.com',
  phone: '+919177889991',
  address: '1457, D Block, Pacchim Vihar',
  state: 'Delhi',
  city: 'New Delhi',
  pincode: '110063',
};

type Field = HTMLElement & { value: string; label: string; disabled: boolean };
const field = (tag: string, label: string) =>
  (Array.from(document.querySelectorAll(tag)) as Field[]).find((el) => el.label === label) as Field;
const textField = (label: string) => field('md-outlined-text-field', label);
const select = (label: string) => field('md-outlined-select', label);
const type = (el: Field, value: string) => {
  el.value = value;
  fireEvent.input(el);
};
const saveButton = () =>
  Array.from(document.querySelectorAll('md-filled-button')).find((el) => el.textContent?.trim() === t.save) as HTMLElement;

function renderForm() {
  render(
    <StrictMode>
      <ProfileForm />
      <SnackbarHost />
    </StrictMode>,
  );
}

beforeEach(() => {
  getMyProfileMock.mockReset().mockResolvedValue({ data: NEERAJ });
  saveMyAddressMock.mockReset().mockResolvedValue({ data: NEERAJ });
  listMyOrdersMock.mockReset().mockResolvedValue({ data: [] });
});

/** The saved delivery address (D37) is the one checkout pre-fills: load it and save it through the API. */
describe('ProfileForm delivery address', () => {
  it('fills the address from the saved account, not from an order', async () => {
    renderForm();
    await waitFor(() => expect(textField(fields.address).value).toBe(NEERAJ.address));
    expect(textField(fields.pincode).value).toBe('110063');
    // The saved state unlocks City (md-select's own value lags under jsdom; the save test checks both).
    expect(select(fields.city).disabled).toBeFalsy();
    expect(listMyOrdersMock).not.toHaveBeenCalled();
  });

  it('offers only the chosen state’s cities and clears the city when the state changes', async () => {
    renderForm();
    await waitFor(() => expect(select(fields.city).disabled).toBeFalsy());
    const cities = () => Array.from(select(fields.city).querySelectorAll('md-select-option')).map((o) => (o as unknown as Field).value);
    expect(cities()).toContain('New Delhi');
    const state = select(fields.state);
    state.value = 'Goa';
    fireEvent.change(state);
    await waitFor(() => expect(cities()).not.toContain('New Delhi'));
    // The old city is gone, so a save asks for one instead of sending Goa + New Delhi.
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe(t.incomplete);
    expect(saveMyAddressMock).not.toHaveBeenCalled();
  });

  it('saves the changed address through the API, then confirms', async () => {
    renderForm();
    await waitFor(() => expect(textField(fields.pincode).value).toBe('110063'));
    type(textField(fields.pincode), '110011');
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(saveMyAddressMock).toHaveBeenCalledWith('test-token', {
        address: NEERAJ.address,
        state: 'Delhi',
        city: 'New Delhi',
        pincode: '110011',
      }),
    );
    expect(await screen.findByText(t.saved)).toBeTruthy();
  });

  it('shows the API’s refusal and no success message when the save fails', async () => {
    saveMyAddressMock.mockRejectedValue(new ApiRequestError('VALIDATION_ERROR', 'Pick the city from the list for the chosen state.', 422));
    renderForm();
    await waitFor(() => expect(textField(fields.pincode).value).toBe('110063'));
    type(textField(fields.pincode), '110011');
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toContain('Pick the city from the list');
    expect(screen.queryByText(t.saved)).toBeNull();
  });

  it('names the missing fields and does not call the API when the address is incomplete', async () => {
    getMyProfileMock.mockResolvedValue({ data: { ...NEERAJ, address: null, state: null, city: null, pincode: null } });
    renderForm();
    await waitFor(() => expect(getMyProfileMock).toHaveBeenCalled());
    await waitFor(() => expect(textField(fields.address)).toBeTruthy());
    type(textField(fields.address), 'Flat 2');
    fireEvent.click(saveButton());
    expect((await screen.findByRole('alert')).textContent).toBe(t.incomplete);
    expect(saveMyAddressMock).not.toHaveBeenCalled();
  });
});
