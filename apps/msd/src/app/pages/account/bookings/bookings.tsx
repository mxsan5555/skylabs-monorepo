import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MdDialog } from '@material/web/dialog/dialog.js';
import { Dialog, FilledButton, OutlinedSelect, SelectOption, TextButton } from '@skylabs-monorepo/shared-ui/react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { useAuth } from '@skylabs-monorepo/shared-auth/react';
import { listVendorBookings, setVendorBookingStatus, type Booking, type BookingStatus } from '../../../../api/rbac/bookings';
import { ApiRequestError } from '../../../../api/rbac/client';

const ALLOWED_NEXT: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const BOOKING_COLUMNS = JSON.stringify([
  { key: 'Booking ID', label: 'Booking ID', width: '120px' },
  { key: 'Customer', label: 'Customer' },
  { key: 'Vendor', label: 'Vendor' },
  { key: 'Branch', label: 'Branch' },
  { key: 'Service', label: 'Service' },
  { key: 'Booking Date/Time', label: 'Booking Date/Time' },
  {
    key: 'Status',
    label: 'Status',
    type: 'status',
    statusMap: { PENDING: 'warning', CONFIRMED: 'info', COMPLETED: 'success', CANCELLED: 'error' },
  },
  { key: 'Created At', label: 'Created At' },
]);

const BOOKING_FILTERS = JSON.stringify([
  { label: 'Pending', value: 'PENDING' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]);

/** Flat row for <sky-data-table> — every key here is human-readable because the component's
 *  built-in detail drawer renders Object.entries(row) verbatim (raw key as label, no
 *  formatting), so extra (non-column) keys double as the "Booking Detail" view. */
function toBookingRow(booking: Booking): Record<string, string | number> {
  return {
    'Booking ID': booking.id,
    Customer: booking.customer.name,
    Vendor: booking.vendor.businessName ?? '—',
    Branch: booking.branch.name,
    Service: booking.deal.service?.name ?? booking.deal.title,
    'Booking Date/Time': `${new Date(booking.bookingDate).toLocaleDateString()} · ${booking.timeSlot}`,
    Status: booking.status,
    'Created At': new Date(booking.createdAt).toLocaleString(),
    'Customer Phone': booking.customer.phone ?? '—',
    'Customer Email': booking.customer.email ?? '—',
    'Branch Address': [booking.branch.address, booking.branch.city].filter(Boolean).join(', ') || '—',
    Deal: booking.deal.title,
    Quantity: booking.quantity,
    Price: `₹${booking.priceSnapshot}`,
    'Duration Minutes': booking.durationMinutesSnapshot ?? '—',
    'Cancellation Reason': booking.cancellationReason ?? '—',
  };
}

interface TableParams {
  page: number;
  pageSize: number;
  filter: string;
}

const DEFAULT_PARAMS: TableParams = { page: 1, pageSize: 10, filter: '' };

/** Admin/vendor console for the Bookings behind SERVICE orders — mirrors OrderManagement's
 *  <sky-data-table> pattern exactly. Reuses the existing `orders` permission key (there is no
 *  separate `bookings` permission — see packages/shared-menu/src/msd-menu.json). A vendor
 *  caller is force-scoped server-side to its own vendor (booking.service.ts#listVendorBookings). */
export function BookingManagement() {
  const { token, can } = useAuth();
  const canChangeStatus = can('orders', 'status_change');

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const [statusBooking, setStatusBooking] = useState<Booking | null>(null);
  const [statusValue, setStatusValue] = useState<BookingStatus | ''>('');
  const [statusError, setStatusError] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const statusDialogRef = useRef<MdDialog>(null);

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listVendorBookings(token, {
        page: params.page,
        pageSize: params.pageSize,
        status: (params.filter || undefined) as BookingStatus | undefined,
      });
      setBookings(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load bookings.');
    } finally {
      setLoading(false);
    }
  }, [token, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(bookings.map(toBookingRow)), [bookings]);

  const actions = useMemo(
    () =>
      JSON.stringify([
        { icon: 'visibility', label: 'View', event: '__view_detail__' },
        ...(canChangeStatus ? [{ icon: 'sync_alt', label: 'Change status', event: 'change-status' }] : []),
      ]),
    [canChangeStatus],
  );

  const openStatusDialog = useCallback((booking: Booking) => {
    setStatusBooking(booking);
    setStatusValue('');
    setStatusError('');
    statusDialogRef.current?.show();
  }, []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    // Bookings list has no server-side `search` param (BookingListQuerySchema only
    // supports page/pageSize/status/vendorId) — `searchable` is intentionally omitted below.
    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, filter: detail.filter });
    };
    const onRowAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string; row: Record<string, unknown> }>).detail;
      if (detail.action !== 'change-status') return;
      const booking = bookings.find((b) => b.id === detail.row['Booking ID']);
      if (booking) openStatusDialog(booking);
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    el.addEventListener('sky-dt-row-action', onRowAction);
    return () => {
      el.removeEventListener('sky-dt-params-change', onParamsChange);
      el.removeEventListener('sky-dt-row-action', onRowAction);
    };
  }, [bookings, openStatusDialog]);

  const closeStatusDialog = () => {
    statusDialogRef.current?.close();
  };

  const submitStatusChange = async () => {
    if (!statusBooking || !statusValue) return;
    setStatusSubmitting(true);
    setStatusError('');
    try {
      const { data } = await setVendorBookingStatus(token, statusBooking.id, statusValue);
      setBookings((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      closeStatusDialog();
    } catch (err) {
      setStatusError(err instanceof ApiRequestError ? err.message : 'Could not change booking status.');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const allowedNext = statusBooking ? ALLOWED_NEXT[statusBooking.status] : [];

  return (
    <div className="admin-page admin-page--wide">
      <title>Bookings · MSD</title>
      <header className="page-head">
        <div>
          <h1>Bookings</h1>
          <p>Every service booking behind a SERVICE order, across all vendors and branches.</p>
        </div>
      </header>

      {error && <p className="error-state" role="alert">{error}</p>}

      <sky-data-table
        ref={tableRef as RefObject<HTMLElement>}
        caption="Bookings"
        columns={BOOKING_COLUMNS}
        rows={rows}
        total={total}
        page={params.page}
        page-size={params.pageSize}
        loading={loading}
        filter-label="Booking Status"
        filter-options={BOOKING_FILTERS}
        actions={actions}
      />

      <Dialog ref={statusDialogRef} onClose={() => setStatusBooking(null)}>
        <div slot="headline">Change booking status</div>
        <div slot="content" className="form-grid">
          {statusBooking && (
            <>
              <p className="field-hint">
                Booking {statusBooking.id} · currently {statusBooking.status}
              </p>
              {allowedNext.length === 0 ? (
                <p className="empty-state">No further status changes available.</p>
              ) : (
                <OutlinedSelect
                  label="New status"
                  value={statusValue}
                  onChange={(e: Event) => setStatusValue((e.target as HTMLSelectElement).value as BookingStatus)}
                >
                  <SelectOption value="">
                    <div slot="headline">Select…</div>
                  </SelectOption>
                  {allowedNext.map((s) => (
                    <SelectOption key={s} value={s}>
                      <div slot="headline">{s}</div>
                    </SelectOption>
                  ))}
                </OutlinedSelect>
              )}
              {statusBooking.cancellationReason && <p className="error-state">Cancelled: {statusBooking.cancellationReason}</p>}
              {statusError && <p className="error-state" role="alert">{statusError}</p>}
            </>
          )}
        </div>
        <div slot="actions">
          <TextButton onClick={closeStatusDialog}>{allowedNext.length === 0 ? 'Close' : 'Cancel'}</TextButton>
          {allowedNext.length > 0 && (
            <FilledButton onClick={submitStatusChange} disabled={!statusValue || statusSubmitting}>
              {statusSubmitting ? 'Saving…' : 'Save'}
            </FilledButton>
          )}
        </div>
      </Dialog>
    </div>
  );
}

export default BookingManagement;
