import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  IconButton,
  Icon,
  Divider,
  OutlinedTextField,
} from '@skylabs-monorepo/shared-ui/react';
import { useCart } from '../../../cart/cart-context';
import { useCartItems } from '../../../hooks/use-cart-items';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { formatINR, pluralize } from '../../../utils/format';
import content from '../../../content.json';
import './cart.css';

const { cart: cartContent } = content;
export function Cart() {
  const { removeItem, updateQuantity, totalItems } = useCart();
  const { cartItems, subtotal } = useCartItems();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const totalOriginal = cartItems.reduce((sum, entry) => {
    const originalPrice =
      entry.type === 'deal'
        ? (entry.deal!.originalPrice ?? entry.deal!.price)
        : (entry.product!.originalPrice ?? entry.product!.price);
    return sum + originalPrice * entry.item.quantity;
  }, 0);
  const savings = totalOriginal - subtotal;
  function handleCheckout() {
    if (!isAuthenticated) {
      navigate('/sign-in?next=/checkout');
    } else {
      navigate('/checkout');
    }
  }
  return (
    <div className="cart-page">
      <title>{content.meta.cart.title}</title>
      <meta name="description" content={content.meta.cart.description} />
      <meta name="robots" content="noindex" />

      <div className="cart-page__inner">
        <h1 className="cart-page__title">
          {cartContent.title}
          {totalItems > 0 && (
            <span className="cart-page__count">
              {' '}
              ({totalItems} {pluralize(totalItems, 'item')})
            </span>
          )}
        </h1>
        {cartItems.length === 0 ? (
          <div className="cart-page__empty">
            <sky-info-card
              icon="shopping_bag"
              heading={cartContent.emptyHeading}
              subheading={cartContent.emptySubheading}
            />
            <FilledButton onClick={() => navigate('/explore')}>
              {' '}
              {cartContent.emptyCtaLabel}
            </FilledButton>
          </div>
        ) : (
          <div className="cart-page__layout">
            {/* Items column */}
            <section className="cart-page__items" aria-label="Cart items">
              <ul className="cart-list">
                {cartItems.map((entry) => (
                  <li
                    key={
                      entry.type === 'deal' ? entry.deal!.id : entry.product!.id
                    }
                    className="cart-item"
                  >
                    <img
                      className="cart-item__img"
                      src={
                        entry.type === 'deal'
                          ? entry.deal!.image
                          : entry.product!.image
                      }
                      alt={
                        entry.type === 'deal'
                          ? entry.deal!.imageAlt
                          : entry.product!.name
                      }
                      width={100}
                      height={100}
                      loading="lazy"
                    />
                    <div className="cart-item__body">
                      <div className="cart-item__top">
                        <div>
                          <h3 className="cart-item__title">
                            {entry.type === 'deal'
                              ? entry.deal!.title
                              : entry.product!.name}
                          </h3>
                          <p className="cart-item__provider">
                            {entry.type === 'deal'
                              ? entry.deal!.providerName
                              : entry.product!.brand}
                          </p>
                          {entry.item.selectedDate && (
                            <p className="cart-item__datetime">
                              <Icon aria-hidden="true">event</Icon>
                              {entry.item.selectedDate}
                              {entry.item.selectedTime &&
                                ` at ${entry.item.selectedTime}`}
                            </p>
                          )}
                        </div>
                        <p className="cart-item__price">
                          {formatINR(
                            entry.type === 'deal'
                              ? entry.deal!.price
                              : entry.product!.price * entry.item.quantity,
                          )}
                        </p>
                      </div>
                      <div className="cart-item__actions">
                        <div
                          className="cart-item__qty"
                          role="group"
                          aria-label={`Quantity for ${entry.type === 'deal' ? entry.deal!.title : entry.product!.name}`}
                        >
                          <IconButton
                            aria-label="Decrease quantity"
                            disabled={entry.item.quantity <= 1}
                            onClick={() =>
                              updateQuantity(
                                entry.type === 'deal'
                                  ? entry.deal!.id
                                  : entry.product!.id,
                                entry.type,
                                entry.item.quantity - 1,
                              )
                            }
                          >
                            <Icon aria-hidden="true">remove</Icon>
                          </IconButton>
                          <span
                            className="cart-item__qty-val"
                            aria-label={`${entry.item.quantity} in cart`}
                          >
                            {entry.item.quantity}
                          </span>
                          <IconButton
                            aria-label="Increase quantity"
                            onClick={() =>
                              updateQuantity(
                                entry.type === 'deal'
                                  ? entry.deal!.id
                                  : entry.product!.id,
                                entry.type,
                                entry.item.quantity + 1,
                              )
                            }
                          >
                            <Icon aria-hidden="true">add</Icon>
                          </IconButton>
                        </div>
                        <IconButton
                          aria-label={`Remove ${entry.type === 'deal' ? entry.deal!.title : entry.product!.name} from cart`}
                          onClick={() =>
                            removeItem(
                              entry.type === 'deal'
                                ? entry.deal!.id
                                : entry.product!.id,
                              entry.type,
                            )
                          }
                        >
                          <Icon aria-hidden="true">delete_outline</Icon>
                        </IconButton>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            {/* Summary column */}
            <aside className="cart-page__summary" aria-label="Order summary">
              <sky-card variant="outlined" className="cart-summary-card">
                <div className="cart-summary">
                  <h2 className="cart-summary__heading">
                    {cartContent.orderSummaryHeading}
                  </h2>
                  <div className="cart-summary__row">
                    <span>
                      {cartContent.subtotal} ({totalItems}{' '}
                      {pluralize(totalItems, 'item')})
                    </span>
                    <span>{formatINR(subtotal)}</span>
                  </div>
                  {savings > 0 && (
                    <div className="cart-summary__row cart-summary__row--saving">
                      <span>{cartContent.discount}</span>
                      <span>−{formatINR(savings)}</span>
                    </div>
                  )}
                  <Divider />
                  <div className="cart-summary__row cart-summary__row--total">
                    <strong>{cartContent.total}</strong>
                    <strong>{formatINR(subtotal)}</strong>
                  </div>
                  <OutlinedTextField
                    label={cartContent.giftCardPlaceholder}
                    className="cart-summary__gift"
                  >
                    <Icon slot="leading-icon" aria-hidden="true">
                      card_giftcard
                    </Icon>
                  </OutlinedTextField>
                  <FilledButton
                    className="cart-summary__checkout-btn"
                    onClick={handleCheckout}
                  >
                    {cartContent.checkoutCta}
                    <Icon slot="trailing-icon" aria-hidden="true">
                      arrow_forward
                    </Icon>
                  </FilledButton>
                  <OutlinedButton
                    className="cart-summary__continue-btn"
                    onClick={() => navigate('/explore')}
                  >
                    {cartContent.continueBrowsing}
                  </OutlinedButton>
                </div>
              </sky-card>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
export default Cart;
