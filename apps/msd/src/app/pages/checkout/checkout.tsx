import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, Icon, Divider } from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import {
  checkout,
  createOrderFromBooking,
  getMyOrder,
  pay,
  verifyPayment,
  type Order,
  type PaymentIntent,
} from '../../../api/orders';
import { ApiRequestError } from '../../../api/rbac/client';
import { loadRazorpayScript } from '../../../utils/razorpay';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './checkout.css';
const { checkout: checkoutContent } = content;

interface CheckoutLocationState {
  /** Retry payment for an Order that already exists (from the order-detail page's "Pay now"). */
  orderId?: string;
  /** Create a SERVICE order from an existing Booking ("Create order" on My Bookings). */
  bookingId?: string;
  /** Neither set = the default PRODUCT path: create an order from the caller's current Cart. */
}

/**
 * The one real checkout — Phase 8's Order creation (Cart or Booking) followed by Phase 9's
 * Razorpay payment, replacing this page's previous mock localStorage-cart / raw-card-fields
 * flow (see the Phase 9 architecture plan for why: the old flow could never reach a real Order
 * regardless of what payment UI sat in front of it). The multi-step "Your Details"/"Date & Time"
 * steps are dropped — the caller is already authenticated (no need to re-collect contact info)
 * and a Service order's date/time was already captured at Booking-creation time (Phase 7); a
 * Product order never had one. The payment step itself, and every class name below, are reused
 * from the existing file — only the raw card-number/expiry/cvv fields are replaced with
 * Razorpay's own hosted widget, which is the *real* PCI-compliant integration (per the design
 * doc: "the current checkout page's card fields become the provider widget at integration").
 */
export function Checkout() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as CheckoutLocationState;

  const [order, setOrder] = useState<Order | null>(null);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return; // guards against a duplicate call under React StrictMode's double-invoke
    initRef.current = true;

    (async () => {
      setLoading(true);
      setError('');
      try {
        let currentOrder: Order;
        if (state.orderId) {
          currentOrder = (await getMyOrder(token, state.orderId)).data;
        } else if (state.bookingId) {
          currentOrder = (await createOrderFromBooking(token, state.bookingId))
            .data;
        } else {
          currentOrder = (await checkout(token)).data;
        }
        setOrder(currentOrder);

        if (currentOrder.status === 'PENDING_PAYMENT') {
          const intent = (await pay(token, currentOrder.id)).data;
          setPaymentIntent(intent);
        }
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : 'Could not start checkout.',
        );
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRazorpay = async () => {
    if (!order || !paymentIntent) return;
    setError('');
    setPaying(true);
    try {
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment gateway unavailable.');
      const rzp = new window.Razorpay({
        key: paymentIntent.keyId,
        order_id: paymentIntent.providerOrderId,
        amount: Math.round(Number(paymentIntent.amount) * 100),
        currency: paymentIntent.currency,
        name: 'MSD',
        description: order.items.map((i) => i.itemName).join(', '),
        theme: { color: '#007C2B' },
        modal: { ondismiss: () => setPaying(false) },
        handler: (response) => {
          verifyPayment(token, order.id, response)
            .then(({ data }) => navigate(`/orders/${data.id}`))
            .catch((err) => {
              setError(
                err instanceof ApiRequestError
                  ? err.message
                  : 'Payment verification failed — if an amount was deducted, contact support with your order id.',
              );
              setPaying(false);
            });
        },
      });
      rzp.open();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open the payment gateway.',
      );
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title>{content.meta.checkout.title}</title>
        <p className="loading-state">Preparing your order…</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title>{content.meta.checkout.title}</title>
        <p className="error-state" role="alert">{error}</p>
        <FilledButton onClick={() => navigate('/categories')}>Back to Categories</FilledButton>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="checkout-page">
      <title>{content.meta.checkout.title}</title>
      <meta name="description" content={content.meta.checkout.description} />
      <meta name="robots" content="noindex" />

      <div className="checkout-page__inner">
        <header className="checkout-header">
          <h1 className="checkout-header__title">{checkoutContent.title}</h1>
        </header>

        <div className="checkout-page__layout">
          <main className="checkout-page__form">
            <section aria-labelledby="step-pay-heading">
              <h2 id="step-pay-heading" className="checkout-form__heading">
                Payment Details
              </h2>

              {order.status !== 'PENDING_PAYMENT' ? (
                <p className="field-hint">
                  This order is already {order.status.toLowerCase()}.
                </p>
              ) : (
                <>
                  <p className="field-hint">
                    You're paying {formatINR(Number(order.total))} to{' '}
                    {order.vendorNameSnapshot} ({order.branchNameSnapshot}).
                  </p>
                  <FilledButton
                    className="checkout-form__next-btn"
                    onClick={openRazorpay}
                    disabled={paying || !paymentIntent}
                  >
                    {paying
                      ? 'Opening payment…'
                      : `Pay ${formatINR(Number(order.total))}`}
                    <Icon slot="trailing-icon" aria-hidden="true">
                      arrow_forward
                    </Icon>
                  </FilledButton>
                  <p className="checkout-form__secure">
                    <Icon aria-hidden="true">lock</Icon>
                    Payments are handled securely by Razorpay —
                    card/UPI/netbanking details never touch MSD's servers.
                  </p>
                </>
              )}

              {error && <p className="error-state" role="alert">{error}</p>}
            </section>
          </main>

          <aside className="checkout-page__summary" aria-label="Order summary">
            <sky-card variant="outlined">
              <div className="checkout-summary">
                <h2 className="checkout-summary__heading">
                  {checkoutContent.orderSummaryHeading}
                </h2>
                <ul className="checkout-summary__items">
                  {order.items.map((item) => (
                    <li key={item.id} className="checkout-summary__item">
                      <div>
                        <p className="checkout-summary__item-title">
                          {item.itemName}
                        </p>
                        <p className="checkout-summary__item-qty">
                          × {item.quantity}
                          {item.durationMinutes &&
                            ` · ${item.durationMinutes} min`}
                        </p>
                      </div>
                      <p className="checkout-summary__item-price">
                        {formatINR(Number(item.lineTotal))}
                      </p>
                    </li>
                  ))}
                </ul>
                <Divider />
                <div className="checkout-summary__total">
                  <strong>{content.cart.total}</strong>
                  <strong>{formatINR(Number(order.total))}</strong>
                </div>
              </div>
            </sky-card>
          </aside>
        </div>
      </div>
    </div>
  );
}
export default Checkout;
