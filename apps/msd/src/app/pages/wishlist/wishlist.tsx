import { useNavigate } from 'react-router-dom';
import { FilledButton, Icon, } from '@skylabs-monorepo/shared-ui/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCart } from '../../../cart/cart-context';
import { getDealById } from '../../../data/deals';
import { getProductById } from '../../../data/products';
import { DealCard } from '../../components/deal-card';
import { ProductCard } from '../../components/product-card';
import { pluralize } from '../../../utils/format';
import content from '../../../content.json';
import './wishlist.css';
const { wishlist: wishlistContent } = content;
export function Wishlist() {
  const { ids, remove } = useWishlist();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const wishlistItems = [...ids]
    .map((id) => ({
      id,
      deal: getDealById(id),
      product: getProductById(id),
    }))
    .filter((item) => item.deal || item.product);
  return (
    <div className="wishlist-page">
      <title>{content.meta.wishlist.title}</title>
      <meta name="description" content={content.meta.wishlist.description} />
      <meta name="robots" content="noindex" />
      <div className="wishlist-page__inner">
        <h1 className="wishlist-page__title">
          {wishlistContent.title}
          {wishlistItems.length > 0 && (
            <span className="wishlist-page__count">
              ({wishlistItems.length} {pluralize(wishlistItems.length, 'deal')})
            </span>
          )}
        </h1>
        {wishlistItems.length === 0 ? (
          <div className="wishlist-page__empty">
            <sky-info-card
              icon="favorite_border"
              heading={wishlistContent.emptyHeading}
              subheading={wishlistContent.emptySubheading}
            />
            <FilledButton onClick={() => navigate('/explore')}>
              <Icon slot="icon" aria-hidden="true">explore</Icon>
              {wishlistContent.emptyCtaLabel}
            </FilledButton>
          </div>
        ) : (
          <ul className="wishlist-grid" aria-label="Saved deals">
            {wishlistItems.map((item) => {
              const deal = item.deal;
              const product = item.product;
              return (
                <li key={item.id} className="wishlist-grid__item">
                  {deal && (
                    <>
                      <DealCard
                        deal={deal}
                        favoriteActive
                        onFavorite={() => remove(deal.id)}
                      />
                      <FilledButton
                        className="wishlist-grid__add-btn"
                        onClick={() => {
                          addItem(deal.id, 'deal');
                          navigate('/cart');
                        }}
                      >
                        <Icon slot="icon">shopping_bag</Icon>
                        {wishlistContent.addToCartLabel}
                      </FilledButton>
                    </>
                  )}
                  {product && (
                    <>
                     <ProductCard
  product={product}
  favoriteActive
  onFavorite={() => remove(product.id)}
/>
                      <FilledButton
                        className="wishlist-grid__add-btn"
                        onClick={() => {
                          addItem(product.id, 'product');
                          navigate('/cart');
                        }}
                      >
                        <Icon slot="icon">shopping_bag</Icon>
                        {wishlistContent.addToCartLabel}
                      </FilledButton>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
export default Wishlist;
