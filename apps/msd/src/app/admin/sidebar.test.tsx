import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MenuNode } from '@skylabs-monorepo/shared-types';
import { Sidebar } from './sidebar';
import { activeMenuLeafId } from './sidebar-active';
const menu: MenuNode[] = [{ id: 'cms', title: 'CMS', icon: 'folder', permissionKey: 'cms', order: 1, children: [
  { id: 'blog', title: 'Blog', icon: 'article', permissionKey: 'cms.blog.group', order: 1, children: [
    { id: 'pages', title: 'Pages', icon: 'description', route: '/account/cms/blog', permissionKey: 'cms.blog.pages', order: 1 },
    { id: 'articles', title: 'Articles', icon: 'article', route: '/account/cms/blog/articles', permissionKey: 'cms.blog.articles', order: 2 },
    { id: 'categories', title: 'Categories', icon: 'category', route: '/account/cms/blog-categories', permissionKey: 'cms.blog-category', order: 3 },
  ] },
] }];
vi.mock('@skylabs-monorepo/shared-auth/react', () => ({ useAuth: () => ({ bootstrap: { user: { name: 'Test' }, roles: [], menu }, signOut: vi.fn() }) }));
describe('Sidebar leaf matching', () => {
  it.each([
    ['/account/cms/blog', 'Pages'],
    ['/account/cms/blog/uuid', 'Pages'],
    ['/account/cms/blog/articles', 'Articles'],
    ['/account/cms/blog/articles/uuid', 'Articles'],
    ['/account/cms/blog-categories', 'Categories'],
  ])('selects only %s and expands nested parent groups', (pathname, title) => {
    render(<MemoryRouter initialEntries={[pathname]}><Sidebar mobileOpen={false} onClose={() => undefined} /></MemoryRouter>);
    const selected = document.querySelectorAll('a.admin-nav-item.active');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(title);
    expect(selected[0].getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: title })).toBeTruthy();
    expect(document.querySelectorAll('.admin-nav-group.open')).toHaveLength(2);
  });
  it('does not match a partial segment', () => {
    expect(activeMenuLeafId(menu, '/account/cms/blogging')).toBeUndefined();
  });
});
