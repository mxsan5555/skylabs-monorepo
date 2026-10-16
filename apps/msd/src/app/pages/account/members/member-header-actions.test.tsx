import type { ComponentProps } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemberHeaderActions } from './member-header-actions';

function renderActions(props: Partial<ComponentProps<typeof MemberHeaderActions>> = {}) {
  const onChange = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(
    <MemberHeaderActions
      status="ACTIVE"
      canStatusChange
      canDelete
      reasonPrefill=""
      onChangeStatus={onChange}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onChange, onDelete };
}

// M3 buttons keep their native <button> in shadow DOM, so getByRole cannot see them under jsdom.
function buttons(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('md-filled-button, md-outlined-button, md-text-button'));
}

function button(text: string): HTMLElement | undefined {
  return buttons().find((el) => el.textContent?.trim() === text);
}

function mustButton(text: string): HTMLElement & { disabled: boolean } {
  const el = button(text);
  if (!el) throw new Error(`Button "${text}" not found`);
  return el as HTMLElement & { disabled: boolean };
}

function reasonField(): HTMLTextAreaElement {
  return document.querySelector('[data-testid="status-reason"]') as HTMLTextAreaElement;
}

function typeReason(value: string) {
  const field = reasonField();
  field.value = value;
  fireEvent.input(field);
}

describe('MemberHeaderActions', () => {
  it('shows Make inactive and Suspend for an Active member', () => {
    renderActions();
    expect(button('Make inactive')).toBeTruthy();
    expect(button('Suspend')).toBeTruthy();
    expect(button('Delete')).toBeUndefined();
  });

  it('shows Reactivate and Delete for a Suspended member when the viewer may delete', () => {
    renderActions({ status: 'SUSPENDED' });
    expect(button('Reactivate')).toBeTruthy();
    expect(button('Delete')).toBeTruthy();
    expect(button('Suspend')).toBeUndefined();
  });

  it('hides Delete for a Suspended member when the viewer may not delete', () => {
    renderActions({ status: 'SUSPENDED', canDelete: false });
    expect(button('Reactivate')).toBeTruthy();
    expect(button('Delete')).toBeUndefined();
  });

  it('shows nothing for a viewer without status permission', () => {
    renderActions({ canStatusChange: false, canDelete: false });
    expect(buttons()).toHaveLength(0);
  });

  it('keeps Confirm disabled until the reason has 10 characters', async () => {
    const { onChange } = renderActions();
    fireEvent.click(mustButton('Suspend'));
    expect(mustButton('Confirm suspend').disabled).toBe(true);
    typeReason('Too short');
    expect(mustButton('Confirm suspend').disabled).toBe(true);
    typeReason('Documents not completed');
    await waitFor(() => expect(mustButton('Confirm suspend').disabled).toBe(false));
    fireEvent.click(mustButton('Confirm suspend'));
    expect(onChange).toHaveBeenCalledWith('SUSPENDED', 'Documents not completed');
    await waitFor(() => expect(reasonField()).toBeNull());
  });

  it('maps each action to the right status', async () => {
    const { onChange } = renderActions({ status: 'INACTIVE' });
    fireEvent.click(mustButton('Reactivate'));
    typeReason('Owner sent the papers');
    fireEvent.click(mustButton('Confirm reactivate'));
    expect(onChange).toHaveBeenCalledWith('ACTIVE', 'Owner sent the papers');
    await waitFor(() => expect(reasonField()).toBeNull());
  });

  it('calls onDelete with the reason', async () => {
    const { onDelete, onChange } = renderActions({ status: 'SUSPENDED' });
    fireEvent.click(mustButton('Delete'));
    typeReason('Closed the business for good');
    fireEvent.click(mustButton('Confirm delete'));
    expect(onDelete).toHaveBeenCalledWith('Closed the business for good');
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(reasonField()).toBeNull());
  });

  it('prefills the suspend reason when the review flag is set', () => {
    renderActions({ reasonPrefill: 'Documents not completed' });
    fireEvent.click(mustButton('Suspend'));
    expect(reasonField().value).toBe('Documents not completed');
  });

  it('does not prefill other actions', () => {
    renderActions({ reasonPrefill: 'Documents not completed' });
    fireEvent.click(mustButton('Make inactive'));
    expect(reasonField().value).toBe('');
  });

  it('moves focus to the reason field on open and back to the trigger on cancel', async () => {
    renderActions();
    fireEvent.click(mustButton('Suspend'));
    await waitFor(() => expect(document.activeElement).toBe(reasonField()));
    fireEvent.click(mustButton('Cancel'));
    expect(reasonField()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button('Suspend')));
  });

  it('closes on Escape', () => {
    renderActions();
    fireEvent.click(mustButton('Suspend'));
    fireEvent.keyDown(reasonField(), { key: 'Escape' });
    expect(reasonField()).toBeNull();
  });

  it('shows the error as an alert and keeps the form open when the change fails', async () => {
    const onChangeStatus = vi.fn().mockRejectedValue(new Error('A suspended member cannot be made inactive.'));
    renderActions({ onChangeStatus });
    fireEvent.click(mustButton('Make inactive'));
    typeReason('Owner asked for a pause');
    fireEvent.click(mustButton('Confirm make inactive'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be made inactive/i);
    expect(reasonField()).toBeTruthy();
  });
});
