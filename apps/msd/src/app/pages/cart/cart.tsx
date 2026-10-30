import { createElement, useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { getCart, updateCartItemQuantity, removeCartItem, clearCart, type Cart as CartData, type CartItem } from '../../../api/cart';
import { addToWishlist, addProductToWishlist } from '../../../api/wishlist';
import { ApiRequestError } from '../../../api/rbac/client';
import { fillTemplate, formatINR } from '../../../utils/format';
import { lineFromCartItem } from '../../../utils/cart-items';
import { PurchaseLineCard, PurchaseLineList, SelectAllLines } from '../../components/purchase-line-card/purchase-line-card';
import { PageSection } from '../../components/page-section/page-section';
import { SplitLayout } from '../../components/split-layout/split-layout';
import { SectionHead } from '../../components/section-head/section-head';
import { ListingToolbar } from '../../components/listing-toolbar/listing-toolbar';
import { QuantityStepper } from '../../components/quantity-stepper/quantity-stepper';
import { StatusPanel } from '../../components/status-panel/status-panel';
import { SummaryPanel } from '../../components/summary-panel/summary-panel';
import { showSnackbar } from '../../../snackbar/snackbar';
import content from '../../../content.json';
import { Seo } from '../../seo/seo';

const t = content.cart;
const errorText = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);
const itemCount = (count: number) => (count === 1 ? t.itemCountOne : fillTemplate(t.itemCountMany, { count: String(count) }));
const TITLE_ID = 'cart-title';
const SUMMARY_ID = 'cart-summary-title';

/**
 * Real, backend-driven cart. Deal/Product/Therapist are purchasable together in ONE cart, ONE
 * checkout, ONE order — there is no separate Deal Cart / Therapist Cart / Product Cart, and no
 * separate Booking flow (see CartItem's own "three shapes" schema doc comment in msd-api). Every
 * line — whichever kind — comes back from the same `GET /cart` call and renders as one
 * `PurchaseLineCard` with its member inside (item 2.1). Lines can be selected (one or all) and
 * removed together; deals and products can move to the wishlist (therapists have no wishlist).
 */
export function Cart() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getCart(token)
      .then(({ data }) => setCart(data))
      .catch((err) => setError(errorText(err, t.error.load)))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => {load(); }, [load]);
  const items = cart?.items ?? [];
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0);
  // Only ids still in the cart count, so a line removed elsewhere drops out of the selection.
  const selectedIds = items.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggle = (itemId: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  const toggleAll = (checked: boolean) => setSelected(new Set(checked ? items.map((item) => item.id) : []));

  const changeQty = async (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    setError('');
    try {
      const { data } = await updateCartItemQuantity(token, itemId, quantity);
      setCart(data);
    } catch (err) {
      setError(errorText(err, t.error.updateQuantity));
    }
  };
  const remove = async (itemId: string) => {
    setError('');
    try {
      const { data } = await removeCartItem(token, itemId);
      setCart(data);
    } catch (err) {
      setError(errorText(err, t.error.removeItem));
    }
  };
  const removeSelected = async () => {
    if (selectedIds.length === 0) return;
    setError('');
    setBusy(true);
    try {
      // One call when every line goes; otherwise line by line (there is no bulk delete).
      let latest: CartData | null = null;
      if (allSelected) latest = (await clearCart(token)).data;
      else for (const id of selectedIds) latest = (await removeCartItem(token, id)).data;
      if (latest) setCart(latest);
      setSelected(new Set());
      showSnackbar(fillTemplate(t.removedItems, { items: itemCount(selectedIds.length) }), { variant: 'success' });
    } catch (err) {
      setError(errorText(err, t.error.removeSelected));
      load();
    } finally {
      setBusy(false);
    }
  };
  const moveToWishlist = async (item: CartItem) => {
    setError('');
    try {
      if (item.productId) await addProductToWishlist(token, item.productId);
      else if (item.dealId) await addToWishlist(token, item.dealId);
      else return;
      const { data } = await removeCartItem(token, item.id);
      setCart(data);
      showSnackbar(t.movedToWishlist, { variant: 'success', actionLabel: t.viewWishlist, onAction: () => navigate('/wishlist') });
    } catch (err) {
      setError(errorText(err, t.error.moveToWishlist));
    }
  };
  const doCheckout = () => {
    // The real order-creation call happens on /checkout itself, so a page refresh mid-payment
    // retries against the same Order instead of silently creating another one here.
    navigate('/checkout');
  };
  const seo = <Seo title={content.meta.cart.title} description={content.meta.cart.description} path={content.meta.cart.path} noindex="follow" />;
  if (loading) return <p className="loading-state">{t.loading}</p>;
  const errorAlert = error && (
    <p className="error-state" role="alert">
      {error}
    </p>
  );

  if (items.length === 0) {
    return (
      <PageSection aria-labelledby={TITLE_ID}>
        {seo}
        <SplitLayout asideLabel={t.orderSummaryHeading}>
          {errorAlert}
          <StatusPanel
            id={TITLE_ID}
            icon="shopping_bag"
            tone="neutral"
            heading={t.emptyHeading}
            text={t.emptySubheading}
            actions={<FilledButton onClick={() => navigate('/deals')}>{t.emptyCtaLabel}</FilledButton>}
          />
        </SplitLayout>
      </PageSection>
    );
  }

  return (
    <PageSection aria-labelledby={TITLE_ID}>
      {seo}
      <SplitLayout
        asideLabel={t.orderSummaryHeading}
        aside={
          <SummaryPanel
            id={SUMMARY_ID}
            heading={t.orderSummaryHeading}
            rows={[{ label: `${t.subtotal} (${itemCount(totalItems)})`, value: formatINR(subtotal) }]}
            total={{ label: t.total, value: formatINR(subtotal) }}
            note={t.serverPriceNote}
            actions={
              <>
                <FilledButton onClick={doCheckout}>
                  {t.checkoutCta}
                  <Icon slot="trailing-icon" aria-hidden="true">
                    arrow_forward
                  </Icon>
                </FilledButton>
                <OutlinedButton onClick={() => navigate('/')}>{t.continueBrowsing}</OutlinedButton>
              </>
            }
          />
        }
      >
        <div>
          <SectionHead id={TITLE_ID} as="h1" titleClassName="headline-medium" heading={t.title} subheading={itemCount(totalItems)} />
          {errorAlert}
          <ListingToolbar
            ariaLabel={t.selectionLabel}
            start={
              <SelectAllLines
                checked={allSelected}
                indeterminate={selectedIds.length > 0 && !allSelected}
                label={fillTemplate(t.selectAll, { count: String(items.length) })}
                onChange={toggleAll}
              />
            }
            end={createElement(
              'md-text-button',
              { disabled: selectedIds.length === 0 || busy, onClick: removeSelected },
              <Icon slot="icon" aria-hidden="true">
                delete
              </Icon>,
              selectedIds.length > 0 ? fillTemplate(t.removeSelectedCount, { count: String(selectedIds.length) }) : t.removeSelected,
            )}
          />
        </div>
        <h2 className="sr-only">{t.itemsAriaLabel}</h2>
        <PurchaseLineList>
          {items.map((item) => {
            const line = lineFromCartItem(item);
            return (
              <PurchaseLineCard
                key={item.id}
                line={line}
                select={createElement('md-checkbox', {
                  checked: selected.has(item.id),
                  'touch-target': 'wrapper',
                  'aria-label': fillTemplate(t.selectItem, { title: line.title }),
                  onChange: (e: ChangeEvent<HTMLElement & { checked: boolean }>) => toggle(item.id, e.currentTarget.checked),
                })}
                quantity={
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(quantity) => changeQty(item.id, quantity)}
                    label={t.quantity}
                    groupLabel={`${t.quantityLabel} ${line.title}`}
                    decreaseLabel={t.decreaseQuantity}
                    increaseLabel={t.increaseQuantity}
                  />
                }
                actions={
                  <>
                    {!item.therapistId &&
                      createElement(
                        'md-text-button',
                        { 'aria-label': fillTemplate(t.moveToWishlistLabel, { title: line.title }), onClick: () => moveToWishlist(item) },
                        <Icon slot="icon" aria-hidden="true">
                          favorite
                        </Icon>,
                        t.moveToWishlist,
                      )}
                    {createElement(
                      'md-text-button',
                      { 'aria-label': `${t.removeItem} ${line.title} ${t.fromCart}`, onClick: () => remove(item.id) },
                      <Icon slot="icon" aria-hidden="true">
                        delete_outline
                      </Icon>,
                      t.removeItem,
                    )}
                  </>
                }
              />
            );
          })}
        </PurchaseLineList>
      </SplitLayout>
    </PageSection>
  );
}
export default Cart;
