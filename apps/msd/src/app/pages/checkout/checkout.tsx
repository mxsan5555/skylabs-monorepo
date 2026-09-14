import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FilledButton, OutlinedButton, Icon, Divider, OutlinedTextField, Radio,} from '@skylabs-monorepo/shared-ui/react';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';

import {
  checkout,
  getMyOrder,
  pay,
  payCod,
  verifyPayment,
  type Order,
  type OrderContactDetails,
  type PaymentIntent,
} from '../../../api/orders';

import { ApiRequestError } from '../../../api/rbac/client';
import { loadRazorpayScript } from '../../../utils/razorpay';
import { formatINR } from '../../../utils/format';
import { groupOrderItemsByVendor } from '../../../utils/order-items';
import content from '../../../content.json';
import './checkout.css';
const { checkout: checkoutContent } = content;
interface CheckoutLocationState {
  /**
   * Retry payment for an existing order.
   * Used from Order Detail → Pay Now.
   */
  orderId?: string;
}
type Step = 'details' | 'payment';
type PaymentMethod = 'online' | 'cod';
type FieldErrors = Partial<Record<keyof OrderContactDetails, string>>;
export function Checkout() {
  const { token, bootstrap } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as CheckoutLocationState;
  const isRetryPayment = !!state.orderId;
  const [step, setStep] = useState<Step>(
    isRetryPayment ? 'payment' : 'details',
  );

  // Deal + Product + Therapist together: ONE checkout action, ONE payment, ONE Order — every
  // cart line (whichever kind) becomes an OrderItem on this same Order (see msd-api's
  // order.service.ts#createOrderFromCart doc comment; there is no separate Booking flow).
  const [order, setOrder] = useState<Order | null>(null);
  const [paymentIntent, setPaymentIntent] =
    useState<PaymentIntent | null>(null);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('online');

  const [loading, setLoading] = useState(isRetryPayment);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const initRef = useRef(false);
  const prefilledRef = useRef(false);
  // Re-entrancy guards for submitDetails/openRazorpay/placeCodOrder — a `disabled` state prop
  // alone can't stop a second click/tap that fires before React commits the disabling re-render
  // (same gap fixed for TherapistFormDialog/PackageFormDialog elsewhere in this app). Checked
  // and set synchronously, before any `await`, so a fast double-click can't start two checkout
  // requests in the same tick.
  const submittingDetailsRef = useRef(false);
  const payingRef = useRef(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPincode, setShippingPincode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);
  useEffect(() => {
    if (prefilledRef.current || !bootstrap?.user) {
      return;
    }
    prefilledRef.current = true;
    setContactName(bootstrap.user.name ?? '');
    setContactPhone( (bootstrap.user.phone ?? '').replace(/^\+91/, ''),);
    setContactEmail(bootstrap.user.email ?? '');
  }, [bootstrap]);
  useEffect(() => {
    if (initRef.current) {
      return;
    }
    initRef.current = true;
    const { orderId } = state;
    if (!orderId) {
      return;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const currentOrder =
          (await getMyOrder(token, orderId)).data;

        setOrder(currentOrder);
      } catch (err) {
        setError( err instanceof ApiRequestError ? err.message : 'Could not start checkout.', );
      } finally { setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (
      !order ||
      order.status !== 'PENDING_PAYMENT' ||
      paymentMethod !== 'online' ||
      paymentIntent
    ) {
      return;
    }
    (async () => {
      setError('');
      try {
        const intent =
          (await pay(token, order.id)).data;

        setPaymentIntent(intent);
      } catch (err) {
        setError( err instanceof ApiRequestError ? err.message : 'Could not prepare payment.',  );
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, paymentMethod]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validateDetails(): boolean {
    const errors: FieldErrors = {};
    if (!contactName.trim()) {  errors.contactName = 'Name is required.'; }
    if (!/^[6-9]\d{9}$/.test(contactPhone.trim())) {
      errors.contactPhone = 'Enter a valid 10-digit mobile number.';
    }
    if (  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        contactEmail.trim(),
      )
    ) {
      errors.contactEmail = 'Enter a valid email address.';
    }
    if (!shippingAddress.trim()) {
      errors.shippingAddress ='Address is required.';
    }
    if (!shippingCity.trim()) {
      errors.shippingCity = 'City is required.';
    }
    if (!shippingState.trim()) {
      errors.shippingState = 'State is required.';
    }
    if (!/^\d{6}$/.test(shippingPincode.trim())) {
      errors.shippingPincode = 'Enter a valid 6-digit pincode.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }
  const submitDetails = async () => {
    if (submittingDetailsRef.current) return;
    if (!validateDetails()) {
      return;
    }
    submittingDetailsRef.current = true;
    setDetailsSubmitting(true);
    setError('');
    const contactDetails: OrderContactDetails = {
      contactName: contactName.trim(),
      contactPhone: contactPhone.trim(),
      contactEmail: contactEmail.trim(),
      shippingAddress: shippingAddress.trim(),
      shippingCity: shippingCity.trim(),
      shippingState: shippingState.trim(),
      shippingPincode: shippingPincode.trim(),
    };

    try {
      // The cart may hold Deal, Product, and Therapist lines together — checkout always
      // produces exactly ONE Order from it (see order.service.ts#createOrderFromCart).
      const newOrder = (await checkout(token, contactDetails)).data;

      setOrder(newOrder);
      setStep('payment');
    } catch (err) {
      setError(  err instanceof ApiRequestError  ? err.message : 'Could not start checkout.', );
    } finally {
      submittingDetailsRef.current = false;
      setDetailsSubmitting(false);
    }
  };
const openRazorpay = async () => {
    if (payingRef.current) return;
    if (!order || !paymentIntent) {
      return;
    }
    payingRef.current = true;
    setError('');
    setPaying(true);
    try {
      await loadRazorpayScript();
      if (!window.Razorpay) {
        throw new Error( 'Payment gateway unavailable.',
        );
      }

      const rzp = new window.Razorpay({
        key: paymentIntent.keyId,

        order_id:
          paymentIntent.providerOrderId,

        amount:
          Math.round(
            Number(paymentIntent.amount) * 100,
          ),

        currency: paymentIntent.currency,

        name: 'MSD',

        description: order.items
          .map((item) => item.itemName)
          .join(', '),
        theme: {
          color: '#007C2B',
        },
        modal: {
          ondismiss: () => {
            payingRef.current = false;
            setPaying(false);
          },
        },
        handler: (response) => {
          verifyPayment(
            token,
            order.id,
            response,
          )
            .then(({ data }) => {
              navigate(`/orders/${data.id}`);
            })
            .catch((err) => {
              setError(
                err instanceof ApiRequestError
                  ? err.message
                  : checkoutContent.errors.verificationFailed,
              );
              payingRef.current = false;
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
      payingRef.current = false;
      setPaying(false);
    }
  };
 const placeCodOrder = async () => {
    if (payingRef.current) return;
    if (!order) {
      return;
    }
    payingRef.current = true;
    setError('');
    setPaying(true);
    try {
      const { data } =
        await payCod(token, order.id);

      navigate(`/orders/${data.id}`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : 'Could not place your order. Please try again.',
      );

      payingRef.current = false;
      setPaying(false);
    }
  };

  // Multi-vendor: purely a display grouping across the Order's already-flat items[] — see
  // utils/order-items.ts. A single checkout may still span several vendors (Deal from one,
  // Product from another, Therapist from a third) — all under this one Order.
  const vendorGroups = groupOrderItemsByVendor(order?.items ?? []);
  const combinedTotal = Number(order?.total ?? 0);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title> {content.meta.checkout.title}</title>
        <div className="checkout-empty-state">
          <div className="checkout-empty-state__icon">
            <Icon>shopping_bag</Icon>
          </div>
          <h1>Preparing your checkout</h1>
          <p className="loading-state"> Please wait while we prepare your order…
          </p>
        </div>
      </div>
    );
  }
  if (error && !order) {
    return (
      <div className="checkout-page checkout-page--empty">
        <title>  {content.meta.checkout.title} </title>
        <div className="checkout-empty-state">
          <div className="checkout-empty-state__icon checkout-empty-state__icon--error">
            <Icon>error_outline</Icon>
          </div>
          <h1>Checkout unavailable</h1>
          <p className="error-state" role="alert"> {error} </p>
          <FilledButton onClick={() => navigate('/categories')} > Back to Categories</FilledButton>
        </div>
      </div>
    );
  }
  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  return (
    <div className="checkout-page">
      <title> {content.meta.checkout.title} </title>
      <meta name="description" content={content.meta.checkout.description }/>
      <meta name="robots" content="noindex"/>
      <div className="checkout-page__inner">
        <header className="checkout-header">
          <div className="checkout-header__top">
            <div>
              <p className="checkout-header__eyebrow"> MSD CHECKOUT </p>
              <h1 className="checkout-header__title"> {checkoutContent.title} </h1>
            </div>
            <div className="checkout-header__secure">
              <Icon aria-hidden="true"> lock </Icon>
              <span> Secure Checkout </span>
            </div>
          </div>
          {!isRetryPayment && (
            <ol  className="checkout-steps"  aria-label="Checkout steps" >
              <li className={`checkout-steps__step${ step === 'payment' ? ' checkout-steps__step--done'  : '' }`} >
                <span className="checkout-steps__num" aria-hidden="true">
                  {step === 'payment' ? (
                    <Icon>check</Icon>
                  ) : ( 1 )}
                </span>
                <span className="checkout-steps__label">{checkoutContent.steps[0]} </span>
              </li>
              <li className={`checkout-steps__step${ step === 'payment' ? ' checkout-steps__step--active' : '' }`}>
                <span className="checkout-steps__num" aria-hidden="true" > 2</span>
                <span className="checkout-steps__label"> {checkoutContent.steps[2]} </span>
              </li>
            </ol>
          )}
        </header>
        {step === 'details' ? (
          <div className="checkout-page__layout">
            <main className="checkout-page__form">
              <section aria-labelledby="step-details-heading" className="checkout-form-section" >
                <div className="checkout-form-section__header">
                  <div className="checkout-form-section__icon">
                    <Icon> person </Icon>
                  </div>
                  <div>
                    <h2 id="step-details-heading" className="checkout-form__heading"> {checkoutContent.stepHeadings[0]} </h2>
                    <p className="checkout-form__subheading">
                      Enter your contact and delivery
                      information to continue.
                    </p>
                  </div>
                </div>
                <div className="checkout-form__fields">
                  <div className="checkout-form__fields checkout-form__fields--row">
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label={checkoutContent.fields.name}
                        value={contactName}
                        required
                        autocomplete="name"
                        onInput={(e) =>
                          setContactName(
                            (
                              e.target as unknown as {  value: string;  }
                            ).value,
                          )
                        }
                      />
                      {fieldErrors.contactName && (
                        <p className="checkout-form__error" role="alert"> {fieldErrors.contactName} </p>
                      )}
                    </div>
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label={checkoutContent.fields.phone}
                        type="tel"
                        inputMode="numeric"
                        autocomplete="tel"
                        maxLength={10}
                        required
                        value={contactPhone}
                        onInput={(e) =>
                          setContactPhone(
                            (
                              e.target as unknown as { value: string; }
                            ).value
                              .replace(/\D/g, '')
                              .slice(0, 10),
                          )
                        }
                      />
                      {fieldErrors.contactPhone && (
                        <p  className="checkout-form__error" role="alert" > {fieldErrors.contactPhone} </p>
                      )}
                    </div>
                  </div>
                  <div className="checkout-form__field-wrapper">
                    <OutlinedTextField
                      label={checkoutContent.fields.email}
                      type="email"
                      autocomplete="email"
                      required
                      value={contactEmail}
                      onInput={(e) =>
                        setContactEmail(
                          (
                            e.target as unknown as { value: string; }
                          ).value,
                        )
                      }
                    />
                    {fieldErrors.contactEmail && (
                      <p className="checkout-form__error" role="alert"> {fieldErrors.contactEmail} </p>
                    )}
                  </div>
                  <div className="checkout-form__field-wrapper">
                    <OutlinedTextField
                      label="Address"
                      autocomplete="street-address"
                      required
                      value={shippingAddress}
                      onInput={(e) =>
                        setShippingAddress(
                          (
                            e.target as unknown as { value: string; }
                          ).value,
                        )
                      }
                    />
                    {fieldErrors.shippingAddress && (
                      <p className="checkout-form__error" role="alert"> {fieldErrors.shippingAddress} </p>
                    )}
                  </div>
                  <div className="checkout-form__fields checkout-form__fields--row">
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="City"
                        autocomplete="address-level2"
                        required
                        value={shippingCity}
                        onInput={(e) =>
                          setShippingCity(
                            (
                              e.target as unknown as {  value: string;}
                            ).value,
                          )
                        }
                      />
                      {fieldErrors.shippingCity && (
                        <p className="checkout-form__error" role="alert">{fieldErrors.shippingCity} </p>
                      )}
                    </div>
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label="State"
                        autocomplete="address-level1"
                        required
                        value={shippingState}
                        onInput={(e) =>
                          setShippingState(
                            (
                              e.target as unknown as { value: string;}
                            ).value,
                          )
                        }
                      />
                      {fieldErrors.shippingState && (
                        <p className="checkout-form__error" role="alert">{fieldErrors.shippingState}</p>
                      )}
                    </div>
                    <div className="checkout-form__field-wrapper">
                      <OutlinedTextField
                        label={checkoutContent.fields.pincode}
                         type="text"
                        inputMode="numeric"
                          pattern="[0-9]*"
                        autocomplete="postal-code"
                        maxLength={6}
                        required
                        value={shippingPincode}
                        onInput={(e) =>
                          setShippingPincode(
                            (
                              e.target as unknown as { value: string;}
                            ).value
                              .replace(/\D/g, '')
                              .slice(0, 6),
                          )
                        }
                      />
                      {fieldErrors.shippingPincode && (
                        <p  className="checkout-form__error" role="alert" > {fieldErrors.shippingPincode} </p>
                      )}
                    </div>
                  </div>
                </div>
                {error && (
                  <p className="error-state" role="alert" > {error} </p>
                )}
                <div className="checkout-form__nav">
                  <FilledButton
                    className="checkout-form__next-btn"
                    onClick={submitDetails}
                    disabled={detailsSubmitting}
                  >
                    {detailsSubmitting ? 'Please wait…' : checkoutContent.nextLabel}
                    <Icon slot="trailing-icon" aria-hidden="true" >  arrow_forward </Icon>
                  </FilledButton>
                </div>
              </section>
            </main>
            <aside className="checkout-page__summary" aria-label="Order summary" >
              <div className="checkout-summary-card">
                <div className="checkout-summary">
                  <div className="checkout-summary__header">
                    <div>
                      <p className="checkout-summary__eyebrow"> YOUR ORDER </p>
                      <h2 className="checkout-summary__heading"> {checkoutContent.orderSummaryHeading} </h2>
                    </div>
                    <div className="checkout-summary__bag">
                      <Icon> shopping_bag </Icon>
                    </div>
                  </div>
                  <div className="checkout-summary__empty">
                    <Icon> shopping_cart </Icon>
                    <p> Your order summary will appear
                      after checkout.
                    </p>
                  </div>
                  <Divider />
                  <div className="checkout-summary__secure">
                    <Icon> verified_user </Icon>
                    <div>
                      <strong> Safe & Secure</strong>
                      <span> Your information is protected. </span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : !order ? null : (
  <div className="checkout-page__layout">
            <main className="checkout-page__form">
              <section
                aria-labelledby="step-pay-heading"
                className="checkout-form-section"
              >
                <div className="checkout-form-section__header">
                  <div className="checkout-form-section__icon">
                    <Icon> credit_card </Icon>
                  </div>
                  <div>
                    <h2  id="step-pay-heading" className="checkout-form__heading" > {checkoutContent.stepHeadings[2]} </h2>
                    <p className="checkout-form__subheading">
                      Choose your preferred payment
                      method to complete your order.
                    </p>
                  </div>
                </div>
                {order.status !== 'PENDING_PAYMENT' ? (
                  <div className="checkout-payment-status">
                    <div className="checkout-payment-status__icon">
                      <Icon> check_circle </Icon>
                    </div>
                    <p className="field-hint"> This order is already{' '} {order.status.toLowerCase()}. </p>
                  </div>
                ) : (
                  <>
                <div className="checkout-form__group">
                      <p className="checkout-form__group-label"> Payment Method </p>
                      <div
                        role="radiogroup"
                        aria-label="Payment method"
                        className="checkout-payment-methods"
                      >
                        <label
                          className={`checkout-payment-methods__opt${
                            paymentMethod === 'online' ? ' checkout-payment-methods__opt--selected' : ''}`}
                        >
                          <Radio
                            name="payment-method"
                            checked={ paymentMethod ==='online' }
                            onChange={() =>
                              setPaymentMethod( 'online',
                              )
                            }
                          />
                          <span className="checkout-payment-methods__content">
                            <span className="checkout-payment-methods__icon">
                              <Icon> account_balance_wallet </Icon>
                            </span>
                            <span>
                              <strong> Online Payment </strong>
                              <small> Razorpay · UPI · Card · Net Banking</small>
                            </span>
                          </span>
                        </label>
                        <label
                          className={`checkout-payment-methods__opt${
                            paymentMethod === 'cod'
                              ? ' checkout-payment-methods__opt--selected'
                              : ''
                          }`}
                        >

                          <Radio
                            name="payment-method"
                            checked={
                              paymentMethod ===
                              'cod'
                            }
                            onChange={() =>
                              setPaymentMethod(
                                'cod',
                              )
                            }
                          />

                          <span className="checkout-payment-methods__content">

                            <span className="checkout-payment-methods__icon">
                              <Icon>
                                payments
                              </Icon>
                            </span>

                            <span>
                              <strong>
                                Cash on Delivery
                              </strong>

                              <small>
                                Pay when your order arrives
                              </small>
                            </span>

                          </span>

                        </label>

                      </div>

                    </div>

                    {/* Amount Information */}

                    <div className="checkout-payment-total">

                      <div>
                        <span>
                          Amount payable
                        </span>

                        <strong>
                          {formatINR(
                            combinedTotal,
                          )}
                        </strong>
                      </div>

                      <p>
                        You're paying{' '}
                        <strong>
                          {formatINR(combinedTotal,)}
                        </strong>{' '}
                        {vendorGroups.length <= 1 ? (
                          <>
                            to{' '}
                            <strong>{order.vendorNameSnapshot}</strong>
                            {' '}({order.branchNameSnapshot}).
                          </>
                        ) : (
                          `across ${vendorGroups.length} vendors in one payment.`
                          )}
                      </p>
                    </div>
                    {paymentMethod ===
                    'online' ? (
                      <div className="checkout-payment-action">
                        <FilledButton
                          className="checkout-form__next-btn"
                          onClick={openRazorpay}
                          disabled={paying ||!paymentIntent}
                        >
                          {paying? 'Opening payment…': `Pay ${formatINR(combinedTotal,)}`}
                          <Icon slot="trailing-icon" aria-hidden="true"
                          > arrow_forward</Icon>
                        </FilledButton>
                        <p className="checkout-form__secure">
                          <Icon aria-hidden="true"> lock </Icon>
                          Payments are handled
                          securely by Razorpay.
                          Card/UPI/netbanking
                          details never touch
                          MSD's servers.
                        </p>
                      </div>
                    ) : (
                      <div className="checkout-payment-action">
                        <FilledButton
                          className="checkout-form__next-btn"
                          onClick={ placeCodOrder }
                          disabled={paying}
                        >
                          {paying ? 'Placing order…' : checkoutContent.placeOrderLabel}
                          <Icon slot="trailing-icon" aria-hidden="true"> check </Icon>
                        </FilledButton>
                      </div>
                    )}
                  </>
                )}
                {error && (
                  <p className="error-state"  role="alert" >  {error} </p>
                )}
              </section>
            </main>
<aside className="checkout-page__summary"  aria-label="Order summary">
              <div className="checkout-summary-card">
                <div className="checkout-summary">
                  <div className="checkout-summary__header">
                    <div>
                      <p className="checkout-summary__eyebrow"> ORDER REVIEW </p>
                      <h2 className="checkout-summary__heading"> {checkoutContent.orderSummaryHeading}</h2>
                    </div>
                    <div className="checkout-summary__bag">
                      <Icon> shopping_bag </Icon>
                    </div>
                  </div>
                  {vendorGroups.map((group) => (
                    <div key={group.vendorId} className="checkout-summary__vendor-group">
                      {vendorGroups.length > 1 && (
                        <p className="checkout-summary__vendor-heading">
                          <Icon aria-hidden="true">storefront</Icon>
                          {group.vendorName}
                        </p>
                      )}
                      <ul className="checkout-summary__items">
                        {group.items.map(
                          (item) => (
                            <li key={item.id}  className="checkout-summary__item">
                              <div className="checkout-summary__item-main">
                                <p className="checkout-summary__item-title">{item.itemName} </p>
                                <p className="checkout-summary__item-qty">  × {item.quantity} {item.durationMinutes && ` · ${item.durationMinutes} min`} </p>
                              </div>
                              <p className="checkout-summary__item-price">{formatINR( Number( item.lineTotal, ), )} </p>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  ))}
                  <Divider />
                  <div className="checkout-summary__total">
                    <span> {content.cart.total} </span>
                    <strong>{formatINR( combinedTotal, )} </strong>
                  </div>
                  {order.shippingAddress && (
                    <>
                      <Divider />
                      <div className="checkout-summary__delivery">
                        <div className="checkout-summary__delivery-icon">
                          <Icon> location_on </Icon>
                        </div>
                        <div>
                          <strong> Delivery Details </strong>
                          <p>
                            {order.contactName}
                            {' · '}
                            {order.shippingAddress}
                            {', '}
                            {order.shippingCity}
                            {' '}
                            {order.shippingPincode}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="checkout-summary__secure">
                    <Icon> verified_user </Icon>
                    <div>
                      <strong> Secure Checkout </strong>
                      <span>
                        Your payment and personal
                        information are protected.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              {!isRetryPayment && (
                <OutlinedButton className="checkout-summary__back" onClick={() => setStep('details')} >
                  <Icon slot="icon"  aria-hidden="true"> arrow_back </Icon>
                  {checkoutContent.backLabel}
                </OutlinedButton>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
export default Checkout;