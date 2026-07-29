import { useNavigate } from 'react-router-dom';
import {
  FilledButton,
  Icon,
} from '@skylabs-monorepo/shared-ui/react';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { useCart } from '../../../cart/cart-context';
import { getDealById } from '../../../data/deals';
import { DealCard } from '../../components/deal-card';
import { pluralize } from '../../../utils/format';
import content from '../../../content.json';
import './wishlist.css';

const { wishlist: wishlistContent } = content;

export function Wishlist() {
  const { ids, remove } = useWishlist();
  const { addItem } = useCart();
  const navigate = useNavigate();

  const savedDeals = [...ids]
    .map((id) => getDealById(id))
    .filter((d): d is NonNullable<typeof d> => !!d);

  return (
    <div className="wishlist-page">
      <title>{content.meta.wishlist.title}</title>
      <meta name="description" content={content.meta.wishlist.description} />
      <meta name="robots" content="noindex" />

      <div className="wishlist-page__inner">
        <h1 className="wishlist-page__title">
          {wishlistContent.title}
          {savedDeals.length > 0 && (
            <span className="wishlist-page__count">
              ({savedDeals.length} {pluralize(savedDeals.length, 'deal')})
            </span>
          )}
        </h1>

        {savedDeals.length === 0 ? (
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
            {savedDeals.map((deal) => (
              <li key={deal.id} className="wishlist-grid__item">
                <DealCard
                  deal={deal}
                  favoriteActive={true}
                  onFavorite={() => remove(deal.id)}
                />
                <FilledButton
                  className="wishlist-grid__add-btn"
                  onClick={() => { addItem(deal.id); navigate('/cart'); }}
                >
                  <Icon slot="icon" aria-hidden="true">shopping_bag</Icon>
                  {wishlistContent.addToCartLabel}
                </FilledButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default Wishlist;
