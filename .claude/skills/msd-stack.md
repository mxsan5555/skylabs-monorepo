# Skill: msd Stack

React 19 + Vite app for the massage deals platform. Port 4200. Green theme (#007C2B).

## Directory Layout
```
apps/msd/src/
├── account/              ← account management pages
├── api/                  ← fetch-based API client (add api calls here)
├── app/                  ← app shell, routes, layouts, components, pages
│   ├── admin/            ← AdminLayout, sidebar, menu.ts
│   └── pages/            ← page components (each folder = one route)
├── auth/                 ← AuthProvider, RequireAuth, RequireRole, auth-storage.ts
├── blog/                 ← blog pages and components
├── cart/                 ← CartContext and cart pages
├── data/                 ← static data (deals.ts, categories.ts)
├── hooks/                ← custom React hooks
├── types/                ← domain models (index.ts)
├── utils/                ← utility functions
├── wishlist/             ← WishlistContext and wishlist pages
├── content.json          ← all consumer-facing UI copy
├── main.tsx              ← bootstrap (registers shared-ui, applies theme, mounts router)
└── styles.css            ← global styles
```

## TypeScript Types (apps/msd/src/types/index.ts)
```ts
export type UserRole = 'user' | 'admin' | 'marketing' | 'sales';
export const ALL_ROLES: UserRole[] = ['user', 'admin', 'marketing', 'sales'];
export interface User { id: string; name: string; email: string; roles: UserRole[]; }
```

## Auth

### Storage keys (localStorage)
- `msd_auth_token` — Bearer JWT
- `msd_auth_roles` — `UserRole[]` serialised as JSON

### Auth context (`apps/msd/src/auth/auth-context.tsx`)
Provides `user`, `roles`, `login()`, `logout()`. Wrap the app at the root level in `main.tsx` or `app.tsx`.

### Guards
```tsx
import { RequireAuth } from '../auth/require-auth';
import { RequireRole } from '../auth/require-role';

// Any authenticated user:
<RequireAuth><AccountPage /></RequireAuth>

// Specific role:
<RequireRole roles={['admin']}><DealsAdminPage /></RequireRole>
```

### Adding a new account/admin page
1. Create page component: `apps/msd/src/app/pages/account/<name>/index.tsx`
2. Add route inside `AdminLayout` in `routes.tsx`:
   ```tsx
   { path: '/account/<name>', element: <RequireRole roles={['admin']}><MyPage /></RequireRole> }
   ```
3. Add sidebar item in `apps/msd/src/app/admin/menu.ts`:
   ```ts
   { label: 'My Page', icon: 'icon_name', to: '/account/<name>', roles: ['admin'] }
   ```

## Admin Page Pattern
Wrap page content in `AdminPage` component (provides centered title + subtitle):
```tsx
<AdminPage title="Deals Management" subtitle="Manage all active deals">
  {/* content */}
</AdminPage>
```

## API Client
All API calls go through `apps/msd/src/api/`. Never `fetch()` directly in a component.
```ts
// api/deals.ts
export async function getDeals(): Promise<Deal[]> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/deals`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Failed to fetch deals');
  return res.json().then(r => r.data);
}
```

## Nx Commands
```bash
npx nx serve msd                   # dev server → http://localhost:4200
npx nx build msd                   # production build
npx nx run msd:test                # Vitest unit tests
npx nx run msd:lint                # ESLint
```

## Vitest Config
Test files: `*.test.tsx` or `*.test.ts` co-located with the component.
```ts
// vite.config.ts (test section)
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test-setup.ts'],
}
```
