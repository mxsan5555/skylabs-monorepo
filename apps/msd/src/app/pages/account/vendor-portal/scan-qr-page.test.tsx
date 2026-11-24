import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { ScanQrPage } from './scan-qr-page';

/** Feature: Scan QR page shell — renders the panel and "Back to orders" navigates home. */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('./scan-qr-panel', () => ({ ScanQrPanel: () => <p>scan-qr-panel-stub</p> }));

describe('ScanQrPage', () => {
  it('renders the ScanQrPanel and "Back to orders" navigates to /account/vendor-orders', () => {
    render(
      <MemoryRouter>
        <ScanQrPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('scan-qr-panel-stub')).toBeTruthy();

    const backButton = Array.from(document.querySelectorAll('md-outlined-button')).find((el) => el.textContent?.includes('Back to orders'));
    fireEvent.click(backButton as HTMLElement);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendor-orders');
  });
});
