import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useConfirmDialog } from './confirm-dialog';

function Harness({ onResult }: { onResult: (v: boolean) => void }) {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const result = await confirm({ title: 'Delete row', message: 'Delete this row?', confirmLabel: 'Delete' });
          onResult(result);
        }}
      >
        Trigger
      </button>
      {ConfirmDialog}
    </div>
  );
}

describe('useConfirmDialog', () => {
  it('resolves true when the Confirm button is clicked', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    fireEvent.click(screen.getByText('Trigger'));
    expect(await screen.findByText('Delete row')).toBeTruthy();
    expect(screen.getByText('Delete this row?')).toBeTruthy();

    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });

  it('resolves false when Cancel is clicked', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    fireEvent.click(screen.getByText('Trigger'));
    await screen.findByText('Delete row');
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('can be triggered a second time after resolving once', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);

    fireEvent.click(screen.getByText('Trigger'));
    await screen.findByText('Delete row');
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));

    onResult.mockClear();
    fireEvent.click(screen.getByText('Trigger'));
    await screen.findByText('Delete row');
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
