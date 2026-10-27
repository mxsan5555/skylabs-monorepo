
import { useEffect, useState, type CSSProperties } from 'react';
import type { Order } from '../../../api/orders';
import { getCatalogDeal, getCatalogProduct, } from '../../../api/catalog';
import { resolveDealMedia, resolveProductMedia, } from '../../../utils/media';
import { formatINR } from '../../../utils/format';
import { ProductCardGallery } from '../../components/product-card-gallery';
import './orders.css';
interface CustomerOrderCardProps { order: Order; }
type OrderBadgeColor = 'error' | 'tertiary' | 'primary';
function formatDate(date: string): string {
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) { return 'Date unavailable'; }
  return parsedDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) =>
    char.toUpperCase(),
  );
}
function getBadgeColor(status: Order['status']): OrderBadgeColor {
  switch (status) {
    case 'CANCELLED': return 'error';
    case 'PENDING_PAYMENT': return 'tertiary';
    default: return 'primary';
  }
}
function getPaymentStatus(order: Order): string {
  const payments = order.payments ?? [];
  if (payments.some((payment) => payment.status === 'PAID')) { return 'PAID'; }
  const latestPayment = payments[0];
  return latestPayment?.status ?? 'PAYMENT PENDING';
}
function getItemSummary(order: Order): string {
  const items = order.items ?? [];
  const totalQuantity = items.reduce((total, item) => total + Math.max(0, Number(item.quantity) || 0), 0,);
  if (totalQuantity === 0) { return 'No items'; }
  return `${totalQuantity} ${totalQuantity === 1 ? 'item' : 'items'}`;
}
export function CustomerOrderCard({ order }: CustomerOrderCardProps) {
  const items = order.items ?? [];
  const [images, setImages] = useState<string[]>(() => [...new Set(
    items.map((item) => item.image).filter((image): image is string => Boolean(image)),
  ),
  ]);
  useEffect(() => {
    let cancelled = false;
    async function loadGalleryImages() {
      const results = await Promise.all(
        items.map(async (item): Promise<string[]> => {
          try {
            if (item.dealId) {
              const result = await getCatalogDeal(item.dealId);
              const gallery = resolveDealMedia(result.data).images;
              return gallery.length > 0
                ? gallery : item.image ? [item.image] : [];
            }
            if (item.productId) {
              const result = await getCatalogProduct(item.productId);
              const gallery = resolveProductMedia(result.data).images;
              return gallery.length > 0
                ? gallery : item.image ? [item.image] : [];
            }
            if (item.productId) {
              const result = await getCatalogProduct(item.productId);
              const gallery = resolveProductMedia(result.data).images;
              return gallery.length > 0
                ? gallery : item.image ? [item.image] : [];
            }
          } catch { }
          return item.image ? [item.image] : [];
        }),
      );
      const uniqueImages = [...new Set(results.flat().filter(Boolean))];
      if (!cancelled) { setImages(uniqueImages); }
    }
    void loadGalleryImages();
    return () => {
      cancelled = true;
    };
  }, [order.id, order.items]);
  const firstItem = items[0];
  const imageItem = items.find((item) => item.image) ?? firstItem;
  const paymentStatus = getPaymentStatus(order);
  const itemSummary = getItemSummary(order);
  const heading = firstItem?.itemName || `Order #${order.id}`;
  const orderType = order.type === 'PRODUCT' ? 'Product' : 'Deal';
  return (
    <sky-product-card
      className="customer-order-card"
      layout="horizontal"
      variant="outlined"
      align="left"
      style={{ '--_align': 'stretch' } as CSSProperties}
      {...(images.length === 1
        ? { image: images[0], imageAlt: imageItem?.itemName || 'Order item', } : {})}
      heading={heading}
      eyebrow={order.vendorNameSnapshot || 'Vendor'}
      badge={formatStatus(order.status)}
      badgeColor={getBadgeColor(order.status)}
      price={formatINR(Number(order.total))}
      href={`/orders/${order.id}`}
    >
      {images.length > 1 && (
        <ProductCardGallery
          slot="media"
          images={images}
          alt={imageItem?.itemName || 'Order item'}
          layout="horizontal"
          fill
        />
      )}
      <div className="customer-order-card-details">
        <div className="customer-order-card-details__summary">
          <span className="customer-order-card-details__type">{orderType}</span>
          <span className="customer-order-card-details__quantity">{itemSummary}</span>
        </div>
        <div className="customer-order-card-details__metadata">
          <div className="customer-order-card-details__field">
            <span className="customer-order-card-details__label">Order ID</span>
            <span className="customer-order-card-details__value customer-order-card-details__order-number">#{order.id}</span>
          </div>
          <div className="customer-order-card-details__field">
            <span className="customer-order-card-details__label">Placed on</span>
            <span className="customer-order-card-details__value">{formatDate(order.createdAt)}</span>
          </div>
          <div className="customer-order-card-details__field customer-order-card-details__payment">
            <span className="customer-order-card-details__label">Payment</span>
            <span className="customer-order-card-details__value">{formatStatus(paymentStatus)}</span>
          </div>
        </div>
      </div>
    </sky-product-card>
  );
}
export default CustomerOrderCard;
