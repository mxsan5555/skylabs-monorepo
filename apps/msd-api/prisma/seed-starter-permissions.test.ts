import { describe, it, expect } from 'vitest';
import { MASTERS_GRANTS, LOGS_OWN_SCOPE_ROLES } from './seed';

describe('seed: Masters grants (PLANNING.md §1.2 — regression for a 2026-10-26 fix)', () => {
  it('Admin: view, create, edit on every sub-resource, never delete', () => {
    for (const key of MASTERS_GRANTS.admin) {
      expect(key.endsWith(':delete')).toBe(false);
    }
    expect(MASTERS_GRANTS.admin).toContain('masters.tags:create');
    expect(MASTERS_GRANTS.admin).toContain('masters.tags:edit');
    expect(MASTERS_GRANTS.admin).toContain('masters.promotions:create');
    expect(MASTERS_GRANTS.admin).toContain('masters.home-hero:edit');
    expect(MASTERS_GRANTS.admin).toContain('masters.home-tag-sections:edit');
  });

  it('Marketing: view only on every sub-resource — never create, edit or delete', () => {
    for (const key of MASTERS_GRANTS.marketing) {
      expect(key.endsWith(':view') || key === 'masters:view').toBe(true);
    }
    expect(MASTERS_GRANTS.marketing).not.toContain('masters.categories:create');
    expect(MASTERS_GRANTS.marketing).not.toContain('masters.tags:create');
    expect(MASTERS_GRANTS.marketing).not.toContain('masters.tags:delete');
    expect(MASTERS_GRANTS.marketing).not.toContain('masters.promotions:edit');
  });

  it('both roles cover the same seven sub-resources (categories, sub-categories, tags, popular-treatments, promotions, home-hero, home-tag-sections)', () => {
    const subResources = ['categories', 'sub-categories', 'tags', 'popular-treatments', 'promotions', 'home-hero', 'home-tag-sections'];
    for (const sub of subResources) {
      expect(MASTERS_GRANTS.admin.some((k) => k.startsWith(`masters.${sub}:`))).toBe(true);
      expect(MASTERS_GRANTS.marketing.some((k) => k.startsWith(`masters.${sub}:`))).toBe(true);
    }
  });
});

describe('seed: Logs own-scope roles (PLANNING.md §1.2 — regression for a 2026-10-26 fix)', () => {
  it('grants rbac.audit-logs:view (OWN scope) to every staff role except Member', () => {
    expect([...LOGS_OWN_SCOPE_ROLES].sort()).toEqual(['admin', 'marketing', 'sales', 'support'].sort());
    expect(LOGS_OWN_SCOPE_ROLES).not.toContain('member');
    expect(LOGS_OWN_SCOPE_ROLES).not.toContain('super_admin');
    expect(LOGS_OWN_SCOPE_ROLES).not.toContain('customer');
  });
});
