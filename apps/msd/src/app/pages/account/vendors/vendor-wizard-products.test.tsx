import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { VendorProductsStep } from './vendor-wizard-products';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderStep(props: Partial<{ vendorId: string; offersProduct: boolean; productCount: number }> = {}) {
  return render(
    <MemoryRouter>
      <VendorProductsStep vendorId="v1" offersProduct productCount={0} {...props} />
    </MemoryRouter>,
  );
}

/**
 * Feature: Onboarding wizard Step 5 is now a read-only recap, not a second place to create/edit
 * products (that's `ProductsListPage`/`ProductFormPage` now — see `vendor-wizard-branches.tsx`'s
 * own doc comment for the full rationale).
 */
describe('VendorProductsStep', () => {
  it('shows a "module not enabled" message and no Manage link when offersProduct is false', () => {
    renderStep({ offersProduct: false });
    expect(screen.getByText('This vendor has not enabled the Product business module in Step 2.')).toBeTruthy();
    expect(screen.queryByText('Manage products')).toBeNull();
  });

  it('offers a "Manage products" link out to the real Products page once the module is enabled', () => {
    renderStep({ offersProduct: true });
    const button = screen.getByText('Manage products');
    fireEvent.click(button);
    expect(navigateMock).toHaveBeenCalledWith('/account/vendors/v1/products');
  });

  it('shows the real product count', () => {
    renderStep({ offersProduct: true, productCount: 7 });
    expect(screen.getByText('7 products.')).toBeTruthy();
  });

  it('uses singular copy for exactly one product', () => {
    renderStep({ offersProduct: true, productCount: 1 });
    expect(screen.getByText('1 product.')).toBeTruthy();
  });
});
