import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    FilledButton,
    OutlinedIconButton,
    Icon,
    SkyInfoCardReact,
    SkyBadgeReact,
    SkyAccordionReact,
    SkyAccordionItemReact,
    Divider,
} from '@skylabs-monorepo/shared-ui/react';
import '@skylabs-monorepo/shared-ui/carousel';
import { useCart } from '../../../cart/cart-context';
import { useWishlist } from '../../../wishlist/wishlist-context';
import { products, getProductBySlug, } from '../../../data/products';
import { ProductCard } from '../../components/product-card';
import { Breadcrumb } from '../../components/breadcrumb';
import { formatINR } from '../../../utils/format';
import content from '../../../content.json';
import './product-detail.css';

export function ProductDetail() {
    const { slug = '' } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { addItem } = useCart();
    const { toggle, has } = useWishlist();
    const [activeImg, setActiveImg] = useState(0);
    const [addedToCart, setAddedToCart] = useState(false);
    const product = getProductBySlug(slug);
    const { productDetail } = content;
    if (!product) {
        return (
            <div className="product-detail product-detail--empty">
                <SkyInfoCardReact
                    icon="search_off"
                    heading="Product not found"
                    subheading="The requested product does not exist."
                />
                <FilledButton onClick={() => navigate('/products')}>   Back to Products </FilledButton>
            </div>
        );
    }
    const relatedProducts = products
        .filter(
            (p) =>
                p.category === product.category &&
                p.id !== product.id
        )
        .slice(0, 6);
    const discountPct = Math.round(
        ((product.originalPrice - product.price) /
            product.originalPrice) *
        100
    );

    function handleBuyNow() {
        addItem(product.id);
        setAddedToCart(true);
        setTimeout(() => { setAddedToCart(false); }, 2000);
    }
    return (
        <div className="product-detail">
            <title>{`${product.name} | MSD`}</title>
            <meta name="description" content={product.description} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'Product',
                        name: product.name,
                        brand: { '@type': 'Brand', name: product.brand, },
                        description: product.description,
                        image: product.image,
                        offers: {
                            '@type': 'Offer',
                            price: product.price,
                            priceCurrency: 'INR',
                            availability:
                                'https://schema.org/InStock',
                        },
                        aggregateRating: {
                            '@type': 'AggregateRating',
                            ratingValue: product.rating,
                            reviewCount: product.reviews,
                        },
                    }),
                }}
            />
            <Breadcrumb className="product-detail__breadcrumb"
                items={[
                    { label: 'Home', to: '/', },
                    { label: 'Products', to: '/products', },
                    { label: product.name, },
                ]}
            />
            <div className="product-detail__layout">
                {/* =========================  Gallery  ========================== */}
                <div className="product-detail__gallery">
                    <div className="product-detail__main-img-wrap">
                        <img
                            className="product-detail__main-img"
                            src={product.gallery?.[activeImg] ?? product.image}
                            alt={product.name}
                            width={800}
                            height={800}
                        />
                        <SkyBadgeReact
                            className="product-detail__badge"
                            variant="secondary"
                            size="small"
                        >
                            {product.category}
                        </SkyBadgeReact>
                    </div>
                    {product.gallery && product.gallery.length > 1 && (
                        <div className="product-detail__thumbs">
                            {product.gallery.map((img, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    className={`product-detail__thumb ${activeImg === index
                                        ? 'product-detail__thumb--active'
                                        : ''
                                        }`}
                                    onClick={() => setActiveImg(index)}
                                >
                                    <img
                                        src={img}
                                        alt={`${product.name} ${index + 1}`}
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* =========================  Product Information  ========================== */}
                <div className="product-detail__info">
                    <div className="product-detail__meta-row">
                        <span className="product-detail__brand"> {product.brand} </span>
                        <SkyBadgeReact variant="secondary" size="small" > {product.category} </SkyBadgeReact>
                    </div>
                    <h1 className="product-detail__title"> {product.name}  </h1>
                    <div className="product-detail__rating-row">
                        <span className="product-detail__rating">
                            <Icon>star</Icon>
                            <strong>{product.rating}</strong>
                            <span>  ({product.reviews} reviews)  </span>
                        </span>
                    </div>
                    <Divider />
                    <div className="product-detail__price-row">
                        <div>
                            <span className="product-detail__price">  {formatINR(product.price)}  </span>
                        </div>
                        <div className="product-detail__original">
                            <s>  {formatINR(product.originalPrice)} </s>
                            <SkyBadgeReact variant="error" size="small" >
                                {discountPct}% OFF
                            </SkyBadgeReact>
                        </div>
                    </div>
                    <p className="product-detail__short-desc">  {product.shortDescription}  </p>
                   <div className="product-detail__cta">
  <FilledButton
    className="product-detail__cart-btn"
    onClick={handleBuyNow}
  >
    <Icon slot="icon">
      {addedToCart ? "check" : "shopping_bag"}
    </Icon>

    {addedToCart ? "Added to Cart!" : "Add to Cart"}
  </FilledButton>

  <OutlinedIconButton
    toggle
    selected={has(product.id)}
    onClick={() => toggle(product.id)}
  >
    <Icon slot="selected">favorite</Icon>
    <Icon>favorite_border</Icon>
  </OutlinedIconButton>
</div>
                    <Divider />
                    <p className="product-detail__description"> {product.description} </p>
                    <SkyAccordionReact>
                        <SkyAccordionItemReact header={productDetail.benefits} open >
                            <ul className="product-detail__list">
                                {product.benefits.map((item) => (
                                    <li key={item} className="product-detail__list-item" >
                                        <Icon>check</Icon>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </SkyAccordionItemReact>
                        <SkyAccordionItemReact
                            header={productDetail.ingredients}
                        >
                            <ul className="product-detail__list">
                                {product.ingredients.map((item) => (
                                    <li
                                        key={item}
                                        className="product-detail__list-item"
                                    >
                                        <Icon>eco</Icon>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </SkyAccordionItemReact>
                        <SkyAccordionItemReact
                            header={productDetail.howToUse}
                        >
                            <ol className="product-detail__list">
                                {product.howToUse.map((step, index) => (
                                    <li
                                        key={index}
                                        className="product-detail__list-item"
                                    >
                                        <span className="product-detail__step"> {index + 1} </span>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                        </SkyAccordionItemReact>
                        <SkyAccordionItemReact
                            header={productDetail.shipping}
                        >
                            <p className="product-detail__shipping"> {productDetail.shippingText} </p>
                        </SkyAccordionItemReact>
                    </SkyAccordionReact>
                </div>
            </div>
            {relatedProducts.length > 0 && (
                <section className="product-detail__related">
                    <h2 className="product-detail__related-heading"> {productDetail.relatedProducts} </h2>
                    <div className="product-detail__related-carousel">
                        <swiper-container
                            slides-per-view="auto"
                            space-between={16}
                            free-mode="true"
                            grab-cursor="true"
                        >
                            {relatedProducts.map((item) => (
                                <swiper-slide
                                    key={item.id}
                                    style={{
                                        width: '260px',
                                        height: 'auto',
                                    }}
                                >
                                    <ProductCard product={item} />
                                </swiper-slide>
                            ))}
                        </swiper-container>
                    </div>
                </section>
            )}
        </div>
    );
}
export default ProductDetail;

