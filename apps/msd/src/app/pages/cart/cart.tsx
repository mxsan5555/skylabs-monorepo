import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  IconButton,
  Icon,
  Divider,
  SkyInfoCardReact,
  SkyCardReact,
  OutlinedTextField,
} from '@skylabs-monorepo/shared-ui/react';
import { useCart } from '../../../cart/cart-context';
import { useCartDeals } from '../../../hooks/use-cart-deals';
import { useAuth } from '../../../auth/auth-context';
import { formatINR, pluralize } from '../../../utils/format';
import content from '../../../content.json';
import './cart.css';

const { cart: cartContent } = content;

export function Cart() {
  const { removeItem, updateQuantity, totalItems } = useCart();
  const { cartDeals, subtotal } = useCartDeals();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const totalOriginal = cartDeals.reduce(
    (sum, { item, deal }) => sum + (deal.originalPrice ?? deal.price) * item.quantity,
    0,
  );
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
              ({totalItems} {pluralize(totalItems, 'item')})
            </span>
          )}
        </h1>

        {cartDeals.length === 0 ? (
          <div className="cart-page__empty">
            <SkyInfoCardReact
              icon="shopping_bag"
              heading={cartContent.emptyHeading}
              subheading={cartContent.emptySubheading}
            />
            <FilledButton onClick={() => navigate('/explore')}>
              {cartContent.emptyCtaLabel}
            </FilledButton>
          </div>
        ) : (
          <div className="cart-page__layout">
            {/* Items column */}
            <section className="cart-page__items" aria-label="Cart items">
              <ul className="cart-list">
                {cartDeals.map(({ item, deal }) => (
                  <li key={deal.id} className="cart-item">
                    <img
                      className="cart-item__img"
                      src={deal.image}
                      alt={deal.imageAlt}
                      width={100}
                      height={100}
                      loading="lazy"
                    />
                    <div className="cart-item__body">
                      <div className="cart-item__top">
                        <div>
                          <h3 className="cart-item__title">{deal.title}</h3>
                          <p className="cart-item__provider">{deal.providerName}</p>
                          {item.selectedDate && (
                            <p className="cart-item__datetime">
                              <Icon aria-hidden="true">event</Icon>
                              {item.selectedDate}
                              {item.selectedTime && ` at ${item.selectedTime}`}
                            </p>
                          )}
                        </div>
                        <p className="cart-item__price">
                          {formatINR(deal.price * item.quantity)}
                        </p>
                      </div>

                      <div className="cart-item__actions">
                        <div className="cart-item__qty" role="group" aria-label={`Quantity for ${deal.title}`}>
                          <IconButton
                            aria-label="Decrease quantity"
                            disabled={item.quantity <= 1}
                            onClick={() => updateQuantity(deal.id, item.quantity - 1)}
                          >
                            <Icon aria-hidden="true">remove</Icon>
                          </IconButton>
                          <span className="cart-item__qty-val" aria-label={`${item.quantity} in cart`}>
                            {item.quantity}
                          </span>
                          <IconButton
                            aria-label="Increase quantity"
                            onClick={() => updateQuantity(deal.id, item.quantity + 1)}
                          >
                            <Icon aria-hidden="true">add</Icon>
                          </IconButton>
                        </div>
                        <IconButton
                          aria-label={`Remove ${deal.title} from cart`}
                          onClick={() => removeItem(deal.id)}
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
              <SkyCardReact variant="outlined" className="cart-summary-card">
                <div className="cart-summary">
                  <h2 className="cart-summary__heading">{cartContent.orderSummaryHeading}</h2>

                  <div className="cart-summary__row">
                    <span>{cartContent.subtotal} ({totalItems} {pluralize(totalItems, 'item')})</span>
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
                    <Icon slot="leading-icon" aria-hidden="true">card_giftcard</Icon>
                  </OutlinedTextField>

                  <FilledButton
                    className="cart-summary__checkout-btn"
                    onClick={handleCheckout}
                  >
                    {cartContent.checkoutCta}
                    <Icon slot="trailing-icon" aria-hidden="true">arrow_forward</Icon>
                  </FilledButton>

                  <OutlinedButton
                    className="cart-summary__continue-btn"
                    onClick={() => navigate('/explore')}
                  >
                    {cartContent.continueBrowsing}
                  </OutlinedButton>
                </div>
              </SkyCardReact>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

export default Cart;
