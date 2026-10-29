import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SnackbarHost } from '../../../snackbar/snackbar';
import { Cart } from './cart';

const m = vi.hoisted(() => ({
  getCart: vi.fn(),
  removeCartItem: vi.fn(),
  clearCart: vi.fn(),
  updateCartItemQuantity: vi.fn(),
  addToWishlist: vi.fn(),
  addProductToWishlist: vi.fn(),
}));

vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ token: 'test-token', isAuthenticated: true }) }));
vi.mock('../../../api/cart', () => ({
  getCart: (...a: unknown[]) => m.getCart(...a),
  removeCartItem: (...a: unknown[]) => m.removeCartItem(...a),
  clearCart: (...a: unknown[]) => m.clearCart(...a),
  updateCartItemQuantity: (...a: unknown[]) => m.updateCartItemQuantity(...a),
}));
vi.mock('../../../api/wishlist', () => ({
  addToWishlist: (...a: unknown[]) => m.addToWishlist(...a),
  addProductToWishlist: (...a: unknown[]) => m.addProductToWishlist(...a),
}));

const DEAL = {
  id: 'ci1', cartId: 'c1', dealId: 'd1', dealPackageId: 'p1', therapistId: null, therapistPackageId: null, productId: null,
  quantity: 1, unitPrice: '3080.00',
  deal: { id: 'd1', title: 'Repair Hair Treatment', slug: 'repair-hair', salePrice: '3080', originalPrice: '4000', durationMinutes: 90, images: null, vendorId: 'm1', branchId: 'b1', vendor: { id: 'm1', businessName: 'UrbanGlow Beauty & Care' }, branch: { id: 'b1', name: 'Andheri' } },
  dealPackage: { id: 'p1', durationMinutes: 90, sellingPrice: '3080' }, therapist: null, therapistPackage: null, product: null,
};
const PRODUCT = {
  id: 'ci2', cartId: 'c1', dealId: null, dealPackageId: null, therapistId: null, therapistPackageId: null, productId: 'pr1',
  quantity: 2, unitPrice: '699.00', deal: null, dealPackage: null, therapist: null, therapistPackage: null,
  product: { id: 'pr1', name: 'Daily Hair Care Shampoo', image: null, imageAlt: null, price: '699', originalPrice: null, vendorId: 'm2', vendor: { id: 'm2', businessName: 'Vitality Wellness & Beauty' } },
};
const THERAPIST = {
  id: 'ci3', cartId: 'c1', dealId: null, dealPackageId: null, therapistId: 't1', therapistPackageId: 'tp1', productId: null,
  quantity: 1, unitPrice: '1500.00', deal: null, dealPackage: null, product: null,
  therapist: { id: 't1', therapistType: 'Massage Therapist', personName: 'Asha', photoUrl: null, vendorId: 'm1', branchId: 'b1', vendor: { id: 'm1', businessName: 'UrbanGlow Beauty & Care' }, branch: { id: 'b1', name: 'Andheri' } },
  therapistPackage: { id: 'tp1', durationMinutes: 60, sellingPrice: '1500' },
};
const cartOf = (...items: unknown[]) => ({ data: { id: 'c1', customerId: 'u1', items } });

type Box = HTMLElement & { checked: boolean };
const checkboxes = () => Array.from(document.querySelectorAll('md-checkbox')) as Box[];
const textButton = (text: string) =>
  Array.from(document.querySelectorAll('md-text-button')).find((el) => el.textContent?.includes(text)) as HTMLElement & { disabled?: boolean };
const check = (box: Box, checked = true) => {
  box.checked = checked;
  fireEvent.change(box);
};

async function renderCart() {
  render(
    <MemoryRouter>
      <Cart />
      <SnackbarHost />
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelectorAll('li.purchase-line')).toHaveLength(3));
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.getCart.mockResolvedValue(cartOf(DEAL, PRODUCT, THERAPIST));
  m.removeCartItem.mockImplementation((_t: string, id: string) => Promise.resolve(cartOf(...[DEAL, PRODUCT, THERAPIST].filter((i) => i.id !== id))));
  m.clearCart.mockResolvedValue(cartOf());
  m.addToWishlist.mockResolvedValue({ data: {} });
  m.addProductToWishlist.mockResolvedValue({ data: {} });
});

/** Item 2.1: one card per line with its member inside, detail links, selection and wishlist. */
describe('Cart', () => {
  it('shows each line as a card with its member inside and a new-tab link to its detail page', async () => {
    await renderCart();
    const cards = Array.from(document.querySelectorAll('li.purchase-line'));
    expect(cards[0].textContent).toContain('UrbanGlow Beauty & Care');
    expect(cards[1].textContent).toContain('Vitality Wellness & Beauty');
    const title = screen.getByRole('link', { name: /Daily Hair Care Shampoo/ });
    expect(title.getAttribute('href')).toBe('/products/pr1');
    expect(title.getAttribute('target')).toBe('_blank');
    expect(document.querySelector('.cart-vendor-group')).toBeNull();
  });

  it('offers Move to wishlist for deals and products, not for therapists', async () => {
    await renderCart();
    expect(document.querySelector('[aria-label="Move Repair Hair Treatment to your wishlist"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Move Daily Hair Care Shampoo to your wishlist"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Move Massage Therapist — Asha to your wishlist"]')).toBeNull();
  });

  it('moves a product to the wishlist, then takes it out of the cart', async () => {
    await renderCart();
    fireEvent.click(document.querySelector('[aria-label="Move Daily Hair Care Shampoo to your wishlist"]') as HTMLElement);
    await waitFor(() => expect(m.removeCartItem).toHaveBeenCalledWith('test-token', 'ci2'));
    expect(m.addProductToWishlist).toHaveBeenCalledWith('test-token', 'pr1');
    expect(m.addToWishlist).not.toHaveBeenCalled();
    await waitFor(() => expect(document.querySelectorAll('li.purchase-line')).toHaveLength(2));
  });

  it('keeps the line in the cart when the wishlist refuses it', async () => {
    m.addToWishlist.mockRejectedValue(new Error('down'));
    await renderCart();
    fireEvent.click(document.querySelector('[aria-label="Move Repair Hair Treatment to your wishlist"]') as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not move this item to your wishlist.');
    expect(m.removeCartItem).not.toHaveBeenCalled();
  });

  it('disables Remove selected until a line is selected, then removes only the selected lines', async () => {
    await renderCart();
    const removeSelected = textButton('Remove selected');
    expect(removeSelected.disabled === true || removeSelected.hasAttribute('disabled')).toBe(true);
    const [, first, second] = checkboxes();
    expect(first.getAttribute('aria-label')).toBe('Select Repair Hair Treatment');
    check(first);
    check(second);
    await waitFor(() => expect(textButton('Remove selected (2)')).toBeTruthy());
    fireEvent.click(textButton('Remove selected (2)'));
    await waitFor(() => expect(m.removeCartItem).toHaveBeenCalledTimes(2));
    expect(m.removeCartItem).toHaveBeenNthCalledWith(1, 'test-token', 'ci1');
    expect(m.removeCartItem).toHaveBeenNthCalledWith(2, 'test-token', 'ci2');
    expect(m.clearCart).not.toHaveBeenCalled();
  });

  it('selects every line with Select all and clears the cart in one call', async () => {
    await renderCart();
    const [all] = checkboxes();
    expect(all.closest('label')?.textContent).toContain('Select all (3)');
    check(all);
    await waitFor(() => expect(textButton('Remove selected (3)')).toBeTruthy());
    fireEvent.click(textButton('Remove selected (3)'));
    await waitFor(() => expect(m.clearCart).toHaveBeenCalledWith('test-token'));
    expect(m.removeCartItem).not.toHaveBeenCalled();
  });
});
