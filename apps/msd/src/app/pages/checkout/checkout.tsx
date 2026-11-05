import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FilledButton,
  OutlinedButton,
  Icon,
  OutlinedTextField,
  TextButton,
} from '@skylabs-monorepo/shared-ui/react';
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
import { getMyProfile } from '../../../api/rbac/me';
import { getCart } from '../../../api/cart';
import {
  lineFromCartItem,
  lineFromOrderItem,
  type PurchaseLine,
} from '../../../utils/cart-items';
import {
  PurchaseLineCard,
  PurchaseLineList,
} from '../../components/purchase-line-card/purchase-line-card';
import { STATES, citiesForState } from '@skylabs-monorepo/shared-utils';
import {
  FormField,
  asOptions,
  renderSelect,
} from '../../components/form-controls/form-controls';
import { PageSection } from '../../components/page-section/page-section';
import { SplitLayout } from '../../components/split-layout/split-layout';
import { SectionHead } from '../../components/section-head/section-head';
import {
  FormPanel,
  FormPanelSection,
} from '../../components/form-panel/form-panel';
import { StepIndicator } from '../../components/step-indicator/step-indicator';
import { RadioCardGroup } from '../../components/radio-card-group/radio-card-group';
import { StatusPanel } from '../../components/status-panel/status-panel';
import { SummaryPanel } from '../../components/summary-panel/summary-panel';
import { Seo } from '../../seo/seo';
import {
  loadRazorpayScript,
  RAZORPAY_THEME_COLOR,
} from '../../../utils/razorpay';
import { fillTemplate, formatINR } from '../../../utils/format';
import { groupOrderItemsByVendor } from '../../../utils/order-items';
import content from '../../../content.json';
const { checkout: checkoutContent } = content;
const TITLE_ID = 'checkout-title';
const STEP_ID = 'checkout-step-title';
const SUMMARY_ID = 'checkout-summary-title';
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
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(
    null,
  );

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');

  const [loading, setLoading] = useState(isRetryPayment);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const initRef = useRef(false);
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
  // Item 2.3: the cart lines shown as cards in the summary before the order exists.
  const [cartLines, setCartLines] = useState<PurchaseLine[]>([]);
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);
  // Item 2.2 (D37): the signed-in customer's saved details fill the form; checkout saves them
  // again, so the next order starts filled. Session details stand in if the profile fails to load.
  // No run-once guard: StrictMode runs this twice in dev and the first run's cleanup drops its
  // response, so every run fetches; the `v ||` setters keep whatever the customer already typed.
  useEffect(() => {
    if (!token) {
      return;
    }
    let live = true;
    const fill = (who: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    }) => {
      setContactName((v) => v || (who.name ?? ''));
      setContactPhone((v) => v || (who.phone ?? '').replace(/^\+91/, ''));
      setContactEmail((v) => v || (who.email ?? ''));
    };
    getMyProfile(token)
      .then(({ data }) => {
        if (!live) return;
        fill(data);
        setShippingAddress((v) => v || (data.address ?? ''));
        setShippingState((v) => v || (data.state ?? ''));
        setShippingCity((v) => v || (data.city ?? ''));
        setShippingPincode((v) => v || (data.pincode ?? ''));
      })
      .catch(() => {
        if (live && bootstrap?.user) fill(bootstrap.user);
      });
    return () => {
      live = false;
    };
  }, [token, bootstrap]);

  useEffect(() => {
    if (isRetryPayment || !token) return;
    let live = true;
    getCart(token)
      .then(({ data }) => {
        if (live) setCartLines(data.items.map(lineFromCartItem));
      })
      .catch(() => {
        // The summary stays empty; checkout itself still works from the server's cart.
      });
    return () => {
      live = false;
    };
  }, [isRetryPayment, token]);

  /** A new state clears the city, which belonged to the old one. */
  const chooseState = (value: string) => {
    setShippingState(value);
    if (value !== shippingState) setShippingCity('');
  };
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
        const currentOrder = (await getMyOrder(token, orderId)).data;

        setOrder(currentOrder);
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : checkoutContent.errors.startCheckout,
        );
      } finally {
        setLoading(false);
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
        const intent = (await pay(token, order.id)).data;

        setPaymentIntent(intent);
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : checkoutContent.errors.preparePayment,
        );
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, paymentMethod]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validateDetails(): boolean {
    const errors: FieldErrors = {};
    if (!contactName.trim()) {
      errors.contactName = checkoutContent.validation.emptyName;
    }
    if (!/^[6-9]\d{9}$/.test(contactPhone.trim())) {
      errors.contactPhone = checkoutContent.validation.invalidPhone;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      errors.contactEmail = checkoutContent.validation.invalidEmail;
    }
    if (!shippingAddress.trim()) {
      errors.shippingAddress = checkoutContent.validation.emptyAddress;
    }
    if (!shippingCity.trim()) {
      errors.shippingCity = checkoutContent.validation.emptyCity;
    }
    if (!shippingState.trim()) {
      errors.shippingState = checkoutContent.validation.emptyState;
    }
    if (!/^\d{6}$/.test(shippingPincode.trim())) {
      errors.shippingPincode = checkoutContent.validation.invalidPincode;
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
      setError(
        err instanceof ApiRequestError
          ? err.message
          : checkoutContent.errors.startCheckout,
      );
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
        throw new Error(checkoutContent.errors.gatewayUnavailable);
      }

      let paymentFailed = false;
      const rzp = new window.Razorpay({
        key: paymentIntent.keyId,

        order_id: paymentIntent.providerOrderId,

        amount: Math.round(Number(paymentIntent.amount) * 100),

        currency: paymentIntent.currency,

        name: 'MSD',

        description: order.items.map((item) => item.itemName).join(', '),
        theme: {
          color: RAZORPAY_THEME_COLOR,
        },
        modal: {
          ondismiss: () => {
            payingRef.current = false;
            setPaying(false);
            // Closed after a failed attempt: show the payment-failed page (item 3).
            if (paymentFailed)
              navigate(`/orders/${order.id}/confirmation?payment=failed`);
          },
        },
        handler: (response) => {
          verifyPayment(token, order.id, response)
            .then(({ data }) => {
              navigate(`/orders/${data.id}/confirmation`);
            })
            .catch(() => {
              // The result page reads the order's real state (failed, or confirmed by the webhook).
              navigate(`/orders/${order.id}/confirmation`);
            });
        },
      });
      rzp.on('payment.failed', () => {
        paymentFailed = true;
      });
      rzp.open();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : checkoutContent.errors.openGateway,
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
      const { data } = await payCod(token, order.id);

      navigate(`/orders/${data.id}/confirmation`);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : checkoutContent.errors.placeOrder,
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

  const seo = (
    <Seo
      title={content.meta.checkout.title}
      description={content.meta.checkout.description}
      path={content.meta.checkout.path}
      noindex
    />
  );
  const errorAlert = error && (
    <p className="form-field__error body-medium" role="alert">
      {error}
    </p>
  );

  if (loading) {
    return (
      <PageSection>
        {seo}
        <p className="loading-state" role="status">
          {checkoutContent.loadingOrder}
        </p>
      </PageSection>
    );
  }
  if (error && !order && isRetryPayment) {
    return (
      <PageSection aria-labelledby={TITLE_ID}>
        {seo}
        <SplitLayout asideLabel={checkoutContent.orderSummaryHeading}>
          <StatusPanel
            id={TITLE_ID}
            icon="error"
            tone="error"
            heading={checkoutContent.unavailableHeading}
            text={error}
            actions={
              <FilledButton onClick={() => navigate('/categories')}>
                {checkoutContent.backToCategories}
              </FilledButton>
            }
          />
        </SplitLayout>
      </PageSection>
    );
  }

  const onPayment = step === 'payment' && order;
  const lines = onPayment ? order.items.map(lineFromOrderItem) : cartLines;
  const total = onPayment
    ? combinedTotal
    : cartLines.reduce((sum, line) => sum + line.total, 0);
  const field =
    (setter: (value: string) => void, clean?: (value: string) => string) =>
    (e: Event) => {
      const raw = (e.target as HTMLInputElement).value;
      setter(clean ? clean(raw) : raw);
    };
  const digits = (max: number) => (value: string) =>
    value.replace(/\D/g, '').slice(0, max);
  const payingText =
    vendorGroups.length > 1
      ? fillTemplate(checkoutContent.payingAcross, {
          amount: formatINR(combinedTotal),
          count: String(vendorGroups.length),
        })
      : fillTemplate(checkoutContent.payingTo, {
          amount: formatINR(combinedTotal),
          member: order?.vendorNameSnapshot ?? '',
        });

  return (
    <PageSection aria-labelledby={TITLE_ID}>
      {seo}
      <SplitLayout
        asideLabel={checkoutContent.orderSummaryHeading}
        aside={
          <SummaryPanel
            id={SUMMARY_ID}
            heading={checkoutContent.orderSummaryHeading}
            total={{ label: content.cart.total, value: formatINR(total) }}
            note={checkoutContent.summaryNote}
          >
            <PurchaseLineList variant="receipt">
              {lines.map((line) => (
                <PurchaseLineCard key={line.id} line={line} />
              ))}
            </PurchaseLineList>
          </SummaryPanel>
        }
      >
        <div>
          <SectionHead
            id={TITLE_ID}
            as="h1"
            titleClassName="headline-medium"
            heading={checkoutContent.title}
          />
          {!isRetryPayment && (
            <StepIndicator
              label={checkoutContent.stepsLabel}
              steps={[checkoutContent.steps[0], checkoutContent.steps[2]]}
              current={step === 'payment' ? 1 : 0}
              doneLabel={checkoutContent.stepDone}
            />
          )}
        </div>

        {step === 'details' ? (
          <FormPanel
            id={STEP_ID}
            heading={checkoutContent.stepHeadings[0]}
            intro={checkoutContent.detailsIntro}
            footerLead={errorAlert}
            actions={
              <>
                <OutlinedButton onClick={() => navigate('/cart')}>
                  <Icon slot="icon" aria-hidden="true">
                    arrow_back
                  </Icon>
                  {checkoutContent.backToCart}
                </OutlinedButton>
                <FilledButton
                  onClick={submitDetails}
                  disabled={detailsSubmitting}
                >
                  {detailsSubmitting
                    ? checkoutContent.pleaseWait
                    : checkoutContent.nextLabel}
                  <Icon slot="trailing-icon" aria-hidden="true">
                    arrow_forward
                  </Icon>
                </FilledButton>
              </>
            }
          >
            <FormPanelSection>
              <div className="form-grid">
                <FormField error={fieldErrors.contactName}>
                  <OutlinedTextField
                    label={checkoutContent.fields.name}
                    value={contactName}
                    required
                    autocomplete="name"
                    onInput={field(setContactName)}
                  />
                </FormField>
                <FormField error={fieldErrors.contactPhone}>
                  <OutlinedTextField
                    label={checkoutContent.fields.phone}
                    type="tel"
                    inputMode="numeric"
                    autocomplete="tel"
                    maxLength={10}
                    required
                    value={contactPhone}
                    onInput={field(setContactPhone, digits(10))}
                  />
                </FormField>
                <FormField error={fieldErrors.contactEmail} wide>
                  <OutlinedTextField
                    label={checkoutContent.fields.email}
                    type="email"
                    autocomplete="email"
                    required
                    value={contactEmail}
                    onInput={field(setContactEmail)}
                  />
                </FormField>
                <FormField error={fieldErrors.shippingAddress} wide>
                  <OutlinedTextField
                    label={checkoutContent.fields.address}
                    autocomplete="street-address"
                    required
                    value={shippingAddress}
                    onInput={field(setShippingAddress)}
                  />
                </FormField>
                {/* State first, then its cities: the shared India list, as on branches (D33). */}
                <FormField error={fieldErrors.shippingState}>
                  {renderSelect({
                    label: checkoutContent.fields.state,
                    value: shippingState,
                    required: true,
                    placeholder: checkoutContent.fields.selectState,
                    options: asOptions(STATES),
                    onChange: chooseState,
                  })}
                </FormField>
                {/* Keyed by state: md-select only shows a value that matches an option it already has. */}
                <FormField key={shippingState} error={fieldErrors.shippingCity}>
                  {renderSelect({
                    label: checkoutContent.fields.city,
                    value: shippingCity,
                    required: true,
                    disabled: !shippingState,
                    placeholder: shippingState
                      ? checkoutContent.fields.selectCity
                      : checkoutContent.fields.selectStateFirst,
                    options: asOptions(citiesForState(shippingState)),
                    onChange: setShippingCity,
                  })}
                </FormField>
                <FormField error={fieldErrors.shippingPincode}>
                  <OutlinedTextField
                    label={checkoutContent.fields.pincode}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autocomplete="postal-code"
                    maxLength={6}
                    required
                    value={shippingPincode}
                    onInput={field(setShippingPincode, digits(6))}
                  />
                </FormField>
              </div>
            </FormPanelSection>
          </FormPanel>
        ) : order ? (
          <FormPanel
            id={STEP_ID}
            heading={checkoutContent.stepHeadings[2]}
            intro={checkoutContent.paymentIntro}
            footerLead={
              <>
                {order.status === 'PENDING_PAYMENT' && (
                  <p className="body-large">{payingText}</p>
                )}
                {errorAlert}
              </>
            }
            actions={
              order.status === 'PENDING_PAYMENT' && (
                <>
                  {!isRetryPayment && (
                    <OutlinedButton onClick={() => setStep('details')}>
                      <Icon slot="icon" aria-hidden="true">
                        arrow_back
                      </Icon>
                      {checkoutContent.backLabel}
                    </OutlinedButton>
                  )}
                  {paymentMethod === 'online' ? (
                    <FilledButton
                      onClick={openRazorpay}
                      disabled={paying || !paymentIntent}
                    >
                      {paying
                        ? checkoutContent.openingPayment
                        : fillTemplate(checkoutContent.payLabel, {
                            amount: formatINR(combinedTotal),
                          })}
                      <Icon slot="trailing-icon" aria-hidden="true">
                        arrow_forward
                      </Icon>
                    </FilledButton>
                  ) : (
                    <FilledButton onClick={placeCodOrder} disabled={paying}>
                      {paying
                        ? checkoutContent.placingOrder
                        : checkoutContent.placeOrderLabel}
                      <Icon slot="trailing-icon" aria-hidden="true">
                        check
                      </Icon>
                    </FilledButton>
                  )}
                </>
              )
            }
            note={
              order.status === 'PENDING_PAYMENT' && paymentMethod === 'online'
                ? checkoutContent.securePaymentNote
                : undefined
            }
          >
            {order.shippingAddress && (
              <FormPanelSection
                title={checkoutContent.deliveringTo}
                icon="location_on"
                action={
                  !isRetryPayment && (
                    <TextButton onClick={() => setStep('details')}>
                      {checkoutContent.editDetails}
                    </TextButton>
                  )
                }
              >
                <p className="body-medium">
                  {[
                    order.contactName,
                    order.shippingAddress,
                    order.shippingCity,
                    order.shippingPincode,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </FormPanelSection>
            )}
            <FormPanelSection>
              {order.status !== 'PENDING_PAYMENT' ? (
                <p className="body-large">
                  {checkoutContent.orderStatusPrefix}{' '}
                  {order.status.toLowerCase()}.
                </p>
              ) : (
                <RadioCardGroup
                  legend={checkoutContent.paymentMethod}
                  name="payment-method"
                  value={paymentMethod}
                  options={[
                    {
                      value: 'online',
                      icon: 'account_balance_wallet',
                      ...checkoutContent.methods.online,
                    },
                    {
                      value: 'cod',
                      icon: 'payments',
                      ...checkoutContent.methods.cod,
                    },
                  ]}
                  onChange={(method) =>
                    setPaymentMethod(method as PaymentMethod)
                  }
                />
              )}
            </FormPanelSection>
          </FormPanel>
        ) : null}
      </SplitLayout>
    </PageSection>
  );
}

export default Checkout;
