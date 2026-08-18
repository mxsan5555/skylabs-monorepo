import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SkyDataTableParamsDetail } from '@skylabs-monorepo/shared-ui';
import { listVendorBookings, type Booking, type BookingStatus } from '../../../../api/rbac/bookings';
import { ApiRequestError } from '../../../../api/rbac/client';
import { formatBookingSchedule, bookingDisplayName } from '../../../../utils/format';

const BOOKING_COLUMNS = JSON.stringify([
  { key: 'Booking ID', label: 'Booking ID', width: '120px' },
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

const BOOKING_ACTIONS = JSON.stringify([{ icon: 'visibility', label: 'View', event: '__view_detail__' }]);

/** Flat row for <sky-data-table> — same shape as the Vendor Detail "Bookings" tab, minus the
 *  now-redundant "Customer" column (every row on this tab already belongs to the one selected
 *  customer) and with "Vendor" restored (a customer can book from many vendors). */
function toBookingRow(booking: Booking): Record<string, string | number> {
  return {
    'Booking ID': booking.id,
    Vendor: booking.vendor.businessName ?? '—',
    Branch: booking.branch.name,
    Service: bookingDisplayName(booking),
    'Booking Date/Time': formatBookingSchedule(booking.bookingDate, booking.timeSlot),
    Status: booking.status,
    'Created At': new Date(booking.createdAt).toLocaleString(),
    'Branch Address': [booking.branch.address, booking.branch.city].filter(Boolean).join(', ') || '—',
    Deal: booking.deal?.title ?? '—',
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

/** SuperAdmin "Bookings" tab on the Customer Detail page — this one customer's booking history,
 *  reusing the existing admin/vendor Bookings API client (`listVendorBookings`) with its
 *  admin-only `customerId` filter. Read-only — full booking management already lives on
 *  `/account/bookings`. */
export function CustomerDetailBookings({ token, customerId }: { token: string | null; customerId: string }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [params, setParams] = useState<TableParams>(DEFAULT_PARAMS);

  const tableRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, meta } = await listVendorBookings(token, {
        page: params.page,
        pageSize: params.pageSize,
        status: (params.filter || undefined) as BookingStatus | undefined,
        customerId,
      });
      setBookings(data);
      setTotal(meta?.total ?? data.length);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load bookings for this customer.');
    } finally {
      setLoading(false);
    }
  }, [token, customerId, params]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => JSON.stringify(bookings.map(toBookingRow)), [bookings]);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const onParamsChange = (e: Event) => {
      const detail = (e as CustomEvent<SkyDataTableParamsDetail>).detail;
      setParams({ page: detail.page, pageSize: detail.pageSize, filter: detail.filter });
    };

    el.addEventListener('sky-dt-params-change', onParamsChange);
    return () => el.removeEventListener('sky-dt-params-change', onParamsChange);
  }, []);

  return (
    <>
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
        actions={BOOKING_ACTIONS}
      />
    </>
  );
}

export default CustomerDetailBookings;
