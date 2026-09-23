import { Link } from 'react-router-dom';
import { Dialog, IconButton, Icon } from '@skylabs-monorepo/shared-ui/react';
import { useCatalogShell } from '../../../catalog/catalog-shell';
import content from '../../../content.json';

/**
 * Full-screen category tree for phones, opened from the tab bar's Categories button.
 * Unmounts on close (`open` gates the render) so `md-dialog` cannot restore focus itself —
 * the caller (`MobileTabBar`) is responsible for returning focus to the trigger.
 */
export function CategorySheet({
  id,
  open,
  onClose,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
}) {
  const { categories } = useCatalogShell();
  if (!open) return null;

  return (
    <Dialog id={id} open className="category-sheet" onClose={onClose}>
      <span slot="headline" className="category-sheet__headline">
        {content.tabBar.sheetTitle}
        <IconButton aria-label={content.header.closeNavigation} onClick={onClose}>
          <Icon aria-hidden="true">close</Icon>
        </IconButton>
      </span>
      <div slot="content">
        <sky-accordion single>
          {categories.map((cat) => (
            <sky-accordion-item key={cat.id} header={cat.name}>
              <ul className="category-sheet__list">
                <li>
                  <Link
                    to={`/category/${cat.slug}`}
                    className="category-sheet__link title-small"
                    onClick={onClose}
                  >
                    {content.tabBar.viewAll.replace('{category}', cat.name)}
                  </Link>
                </li>
                {cat.children.map((sub) => (
                  <li key={sub.id}>
                    <Link
                      to={`/category/${cat.slug}?sub=${sub.slug}`}
                      className="category-sheet__link body-large"
                      onClick={onClose}
                    >
                      {sub.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </sky-accordion-item>
          ))}
        </sky-accordion>
      </div>
    </Dialog>
  );
}
