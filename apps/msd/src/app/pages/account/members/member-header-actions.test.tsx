import type { ComponentProps } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemberHeaderActions } from './member-header-actions';
import { REMIND_NOW_LABEL } from './member-status';

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
  return Array.from(document.querySelectorAll<HTMLElement>('md-filled-button, md-filled-tonal-button, md-outlined-button, md-text-button'));
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
  it('shows Make inactive, and Suspend disabled with its reason, for an Active member (item 6)', () => {
    renderActions();
    expect(mustButton('Make inactive').disabled).toBe(false);
    const suspend = mustButton('Suspend');
    expect(suspend.disabled).toBe(true);
    const hint = document.getElementById(suspend.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('Make the member inactive first.');
    expect(button('Delete')).toBeUndefined();
  });

  it('draws only the open action as filled, so the highlight matches the panel', () => {
    renderActions({ status: 'INACTIVE' });
    expect(mustButton('Reactivate').tagName).toBe('MD-OUTLINED-BUTTON');
    expect(mustButton('Suspend').tagName).toBe('MD-OUTLINED-BUTTON');
    fireEvent.click(mustButton('Suspend'));
    expect(mustButton('Suspend').tagName).toBe('MD-FILLED-TONAL-BUTTON');
    expect(mustButton('Suspend').getAttribute('aria-expanded')).toBe('true');
    expect(mustButton('Reactivate').tagName).toBe('MD-OUTLINED-BUTTON');
  });

  it('restores an Archived member to Inactive', async () => {
    const { onChange } = renderActions({ status: 'ARCHIVED' });
    fireEvent.click(mustButton('Restore'));
    typeReason('Owner asked to come back');
    fireEvent.click(mustButton('Confirm restore'));
    expect(onChange).toHaveBeenCalledWith('INACTIVE', 'Owner asked to come back');
    await waitFor(() => expect(reasonField()).toBeNull());
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
    const { onChange } = renderActions({ status: 'INACTIVE' });
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
    renderActions({ status: 'INACTIVE', reasonPrefill: 'Documents not completed' });
    fireEvent.click(mustButton('Suspend'));
    expect(reasonField().value).toBe('Documents not completed');
  });

  it('does not prefill other actions', () => {
    renderActions({ reasonPrefill: 'Documents not completed' });
    fireEvent.click(mustButton('Make inactive'));
    expect(reasonField().value).toBe('');
  });

  it('moves focus to the reason field on open and back to the trigger on cancel', async () => {
    renderActions({ status: 'INACTIVE' });
    fireEvent.click(mustButton('Suspend'));
    await waitFor(() => expect(document.activeElement).toBe(reasonField()));
    fireEvent.click(mustButton('Cancel'));
    expect(reasonField()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button('Suspend')));
  });

  it('labels the confirm panel as a group named by an h2, with no h3 or feature card inside', () => {
    renderActions({ status: 'INACTIVE' });
    fireEvent.click(mustButton('Suspend'));
    const group = screen.getByRole('group', { name: 'Suspend this member' });
    expect(group.querySelector('h2')?.textContent).toBe('Suspend this member');
    expect(group.querySelector('h3, sky-feature-card')).toBeNull();
    expect(group.textContent).toMatch(/cannot log in/);
    expect(group.contains(reasonField())).toBe(true);
  });

  it('closes on Escape', () => {
    renderActions({ status: 'INACTIVE' });
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

describe('MemberHeaderActions Remind now', () => {
  // The button also holds its md-icon ligature text, so match on the label it contains.
  const remindButton = () => buttons().find((el) => el.textContent?.includes(REMIND_NOW_LABEL)) as (HTMLElement & { disabled: boolean }) | undefined;

  it('is absent when the page passes no onRemind', () => {
    renderActions();
    expect(remindButton()).toBeUndefined();
  });

  it('calls onRemind and stays disabled until it settles', async () => {
    let settle: () => void = vi.fn();
    const onRemind = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
    renderActions({ onRemind });
    fireEvent.click(remindButton() as HTMLElement);
    expect(onRemind).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(remindButton()?.disabled).toBe(true));
    settle();
    await waitFor(() => expect(remindButton()?.disabled).toBe(false));
  });
});
