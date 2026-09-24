import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCustomEvent } from '../../../hooks/use-custom-event';
import { useHideOnScroll } from '../../../hooks/use-hide-on-scroll';
import { CategoryStrip } from './category-strip';
import { CityChip } from './city-chip';
import { HeaderActions } from './header-actions';
import content from '../../../content.json';
import logo from '../../../assets/logo.jpg';
import './site-header.css';

/**
 * Site header. Desktop (>= 840px): row 1 brand, city, search, actions; row 2 category strip
 * that slides away on scroll down. Phones: brand + city, then full-width search; actions live
 * in MobileTabBar. Search submits to /explore, the search results route.
 */
export function SiteHeader() {
  const navigate = useNavigate();
  const compact = useHideOnScroll();
  const fieldRef = useRef<HTMLElement>(null);

  useCustomEvent<{ value: string }>(fieldRef, 'sky-submit', (e) => {
    const q = e.detail.value;
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  });

  return (
    <>
      <a className="site-skip label-large" href="#main-content">
        {content.header.skipToContent}
      </a>
      <header className={`site-header${compact ? ' site-header--compact' : ''}`}>
        <div className="site-header__top">
          <Link to="/" className="site-header__brand">
            <img src={logo} alt={content.site.fullName} width={402} height={171} className="site-header__logo" />
          </Link>
          <CityChip />
          <sky-action-field
            ref={fieldRef}
            className="site-header__search"
            role="search"
            dense
            type="search"
            enterkeyhint="search"
            icon="search"
            label={content.header.searchLabel}
            placeholder={content.header.searchPlaceholder}
            action-label={content.header.searchAction}
          />
          <HeaderActions />
        </div>
        <CategoryStrip />
      </header>
    </>
  );
}
