import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../../../../api/rbac/client';
import { DOCUMENT_MAX_BYTES } from '@skylabs-monorepo/shared-utils';
import { MemberDocumentsTab } from './member-documents-tab';

const listMock = vi.fn();
const uploadMock = vi.fn();
const deleteMock = vi.fn();
const reviewMock = vi.fn();
vi.mock('../../../../api/rbac/members', () => ({
  listMemberDocuments: (...a: unknown[]) => listMock(...a),
  uploadMemberDocument: (...a: unknown[]) => uploadMock(...a),
  deleteMemberDocument: (...a: unknown[]) => deleteMock(...a),
  reviewMemberDocument: (...a: unknown[]) => reviewMock(...a),
}));

const ROWS = [
  { id: 'd1', documentType: 'PAN', status: 'SUBMITTED', numberMasked: 'ABXXXXX34F', rejectionReason: null, uploadedOnBehalf: true, uploadedByName: 'Priya', originalFilename: 'pan.pdf' },
  { id: 'd2', documentType: 'GST', status: 'REJECTED', numberMasked: '27ABCDE1234F1Z5', rejectionReason: 'Scan is blurry', uploadedOnBehalf: false },
];

// Support (members:view only) gets type and status: the API leaves out the number and file fields.
const SUPPORT_ROWS = [{ id: 'd1', documentType: 'PAN', status: 'SUBMITTED', rejectionReason: null, uploadedOnBehalf: false }];

// Matches by accessible name (aria-label) first, then by visible text.
function button(name: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('md-filled-button, md-outlined-button, md-text-button')).find(
    (el) => el.getAttribute('aria-label') === name || (!el.hasAttribute('aria-label') && el.textContent?.trim() === name),
  );
}

function mustButton(text: string): HTMLElement & { disabled: boolean } {
  const el = button(text);
  if (!el) throw new Error(`Button "${text}" not found`);
  return el as HTMLElement & { disabled: boolean };
}

function field(label: string): HTMLInputElement {
  const el = Array.from(document.querySelectorAll<HTMLElement>('md-outlined-text-field')).find((f) => (f as unknown as { label?: string }).label === label);
  if (!el) throw new Error(`Field "${label}" not found`);
  return el as HTMLInputElement;
}

function type(label: string, value: string) {
  const el = field(label);
  el.value = value;
  fireEvent.input(el);
}

function renderTab(props: { canEdit?: boolean; canApprove?: boolean; canReject?: boolean } = {}) {
  const onChanged = vi.fn();
  render(
    <MemberDocumentsTab
      token="t"
      memberId="m1"
      canEdit={props.canEdit ?? true}
      canApprove={props.canApprove ?? true}
      canReject={props.canReject ?? true}
      onChanged={onChanged}
    />,
  );
  return { onChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ data: ROWS });
  uploadMock.mockResolvedValue({ data: { id: 'd3', documentType: 'AADHAAR', status: 'SUBMITTED' } });
  deleteMock.mockResolvedValue({ data: { deleted: true } });
  reviewMock.mockResolvedValue({ data: { id: 'd1', status: 'APPROVED' } });
});

describe('MemberDocumentsTab', () => {
  it('shows a loading state first', () => {
    listMock.mockReturnValue(new Promise(vi.fn()));
    renderTab();
    expect(screen.getByText(/loading documents/i)).toBeTruthy();
  });

  it('says "staff" when the uploader name is not known (P5-15)', async () => {
    listMock.mockResolvedValue({ data: [{ ...ROWS[0], uploadedByName: null }] });
    renderTab();
    expect(await screen.findByText('Uploaded by staff for the member')).toBeTruthy();
  });

  it('shows a row per required document with status, masked number and who uploaded', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    expect(screen.getByText('Aadhaar card')).toBeTruthy();
    expect(screen.getByText('GST registration')).toBeTruthy();
    expect(screen.getByText('ABXXXXX34F')).toBeTruthy();
    // P5-15: the staff member's name when the API has it.
    expect(screen.getByText('Uploaded by Priya for the member')).toBeTruthy();
    expect(screen.getByText(/scan is blurry/i)).toBeTruthy();
    expect(screen.getByText('pan.pdf')).toBeTruthy();
    const badges = Array.from(document.querySelectorAll('sky-badge')).map((b) => b.textContent);
    expect(badges).toEqual(['Missing', 'Submitted', 'Rejected']);
  });

  it('read only viewers see type and status only, with no upload or review controls', async () => {
    listMock.mockResolvedValue({ data: SUPPORT_ROWS });
    renderTab({ canEdit: false, canApprove: false, canReject: false });
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('md-outlined-text-field')).toBeNull();
    expect(button('Approve PAN card')).toBeUndefined();
    expect(button('Reject PAN card')).toBeUndefined();
    expect(button('Remove PAN card')).toBeUndefined();
    expect(screen.queryByText('pan.pdf')).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/undefined|null|\(\s*\)/);
  });

  it('names every action after its document so screen reader users know which row it acts on', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    expect(button('Approve PAN card')).toBeTruthy();
    expect(button('Reject PAN card')).toBeTruthy();
    expect(button('Remove PAN card')).toBeTruthy();
    expect(button('Remove GST registration')).toBeTruthy();
    expect(screen.getByLabelText('Replace PAN card file')).toBeTruthy();
    expect(screen.getByLabelText('Upload Aadhaar card file')).toBeTruthy();
  });

  it('offers review only on submitted documents', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    expect(document.querySelectorAll('md-filled-button')).toHaveLength(1);
    expect(button('Approve PAN card')).toBeTruthy();
  });

  it('approves a document, reloads and tells the parent', async () => {
    const { onChanged } = renderTab();
    await waitFor(() => expect(button('Approve PAN card')).toBeTruthy());
    fireEvent.click(mustButton('Approve PAN card'));
    expect(await screen.findByText('Document approved.')).toBeTruthy();
    expect(reviewMock).toHaveBeenCalledWith('t', 'm1', 'PAN', { decision: 'APPROVED' });
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalled();
  });

  it('rejects a document only with a 10 character reason', async () => {
    renderTab();
    await waitFor(() => expect(button('Reject PAN card')).toBeTruthy());
    fireEvent.click(mustButton('Reject PAN card'));
    const reason = field('Rejection reason (10 to 500 characters)');
    await waitFor(() => expect(document.activeElement).toBe(reason));
    expect(mustButton('Confirm reject').disabled).toBe(true);
    type('Rejection reason (10 to 500 characters)', 'Photo is cut off');
    await waitFor(() => expect(mustButton('Confirm reject').disabled).toBe(false));
    fireEvent.click(mustButton('Confirm reject'));
    expect(await screen.findByText('Document rejected.')).toBeTruthy();
    expect(reviewMock).toHaveBeenCalledWith('t', 'm1', 'PAN', { decision: 'REJECTED', reason: 'Photo is cut off' });
    expect(button('Confirm reject')).toBeUndefined();
  });

  it('uploads a file for the member with the typed number', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('Aadhaar card')).toBeTruthy());
    type('Aadhaar number', '234567890123');
    const file = new File(['x'], 'aadhaar.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Upload Aadhaar card file'), { target: { files: [file] } });
    expect(await screen.findByText('Document uploaded for the member.')).toBeTruthy();
    expect(uploadMock).toHaveBeenCalledWith('t', 'm1', 'AADHAAR', file, 'aadhaar.pdf', '234567890123');
  });

  // P10-37: the upload input, the size check before upload, safe file names and safe links.
  it('accepts only PDF, JPEG and PNG on the file input', async () => {
    renderTab();
    const input = (await screen.findByLabelText('Upload Aadhaar card file')) as HTMLInputElement;
    expect(input.getAttribute('accept')).toBe('.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');
  });

  it('refuses a file over 5 MB before uploading, with a message', async () => {
    renderTab();
    const input = await screen.findByLabelText('Upload Aadhaar card file');
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: DOCUMENT_MAX_BYTES + 1 });
    fireEvent.change(input, { target: { files: [big] } });
    expect((await screen.findByRole('alert')).textContent).toBe('That file is larger than 5 MB. Choose a smaller file.');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('shows a file name as plain text, never as markup', async () => {
    listMock.mockResolvedValue({ data: [{ ...ROWS[0], originalFilename: '<img src=x onerror=alert(1)>.pdf' }] });
    renderTab();
    expect(await screen.findByText('<img src=x onerror=alert(1)>.pdf')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('opens a document in a new tab with noopener and noreferrer, and says so', async () => {
    listMock.mockResolvedValue({ data: [{ ...ROWS[0], fileUrl: 'https://files.example/signed/pan.pdf' }] });
    renderTab();
    const link = await screen.findByRole('link', { name: 'View PAN card file (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('https://files.example/signed/pan.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows no file link to viewers who get no file URL', async () => {
    listMock.mockResolvedValue({ data: SUPPORT_ROWS });
    renderTab({ canEdit: false, canApprove: false, canReject: false });
    await screen.findByText('PAN card');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('removes a document that is not approved', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText('PAN card')).toBeTruthy());
    fireEvent.click(mustButton('Remove PAN card'));
    expect(await screen.findByText('Document removed.')).toBeTruthy();
    expect(deleteMock).toHaveBeenCalledWith('t', 'm1', 'PAN');
  });

  it('shows the server message as an alert when an action fails', async () => {
    reviewMock.mockRejectedValue(new ApiRequestError('FORBIDDEN', 'You cannot review this document.', 403));
    renderTab();
    await waitFor(() => expect(button('Approve PAN card')).toBeTruthy());
    fireEvent.click(mustButton('Approve PAN card'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot review/i);
  });

  it('shows an alert when the list fails to load', async () => {
    listMock.mockRejectedValue(new ApiRequestError('SERVER', 'Documents are not available.', 500));
    renderTab();
    expect((await screen.findByRole('alert')).textContent).toMatch(/not available/i);
  });
});
