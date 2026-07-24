# Skill: mera-driver Stack

Angular 21 standalone app for the driver booking platform. Port 4400. Blue theme (#1175BC).

## Directory Layout
```
apps/mera-driver/src/
├── app/
│   ├── admin/            ← AdminLayout, sidebar, menu.ts
│   ├── core/
│   │   └── auth/         ← auth.service.ts, auth.guard.ts, role.guard.ts, auth.interceptor.ts
│   ├── models/           ← domain models (index.ts)
│   └── pages/            ← page components (each folder = one route)
├── assets/               ← images, icons, media
├── index.html            ← HTML entry point (GTM snippet goes here)
├── main.ts               ← bootstrap (registers shared-ui, applies theme)
└── styles.css            ← global styles (includes Tailwind directives)
```

## TypeScript Types (apps/mera-driver/src/app/models/index.ts)
```ts
export type UserRole = 'customer' | 'driver' | 'admin' | 'marketing' | 'sales';
export const ALL_ROLES: UserRole[] = ['customer', 'driver', 'admin', 'marketing', 'sales'];
export interface User { id: string; name: string; email: string; roles: UserRole[]; }
```

## Auth

### Storage keys (localStorage)
- `mera_auth_token` — Bearer JWT
- `mera_auth_roles` — `UserRole[]` serialised as JSON

### Auth service (`apps/mera-driver/src/app/core/auth/auth.service.ts`)
Angular signals-based. Provides `user`, `roles`, `login()`, `logout()`.

### Guards
```ts
// Any authenticated user:
canActivate: [authGuard]

// Role-gated:
canActivate: [roleGuard], data: { roles: ['admin'] }
```

### HTTP Interceptor
`apps/mera-driver/src/app/core/auth/auth.interceptor.ts` — automatically attaches `Authorization: Bearer <token>` to every outgoing request.

### Adding a new account/admin page
1. Create component: `apps/mera-driver/src/app/pages/account/<name>/<name>.component.ts`
2. Add route in `app.routes.ts` inside the admin layout children:
   ```ts
   {
     path: '<name>',
     component: MyComponent,
     canActivate: [roleGuard],
     data: { roles: ['admin'] },
     title: 'Page Title | Mera Driver',
   }
   ```
3. Add sidebar item in `apps/mera-driver/src/app/admin/menu.ts`:
   ```ts
   { label: 'My Page', icon: 'icon_name', to: '/account/<name>', roles: ['admin'] }
   ```

## Angular Component Template
Always use standalone components:
```ts
@Component({
  selector: 'app-my-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],   // required when using <md-*> or <sky-*> tags
  templateUrl: './my-page.component.html',
})
export class MyPageComponent {
  // use inject() for services — not constructor injection
  private authService = inject(AuthService);
}
```

## Angular Signals
Use signals for local reactive state:
```ts
count = signal(0);
doubled = computed(() => this.count() * 2);
// In template: {{ count() }} {{ doubled() }}
```

## API Client
Use Angular's `HttpClient`. Inject it in a service, never directly in a component.
```ts
// core/api/deals.service.ts
@Injectable({ providedIn: 'root' })
export class DealsService {
  private http = inject(HttpClient);
  getDeals() {
    return this.http.get<{ data: Deal[] }>(`${environment.apiUrl}/deals`);
  }
}
```

## Tailwind (mera-driver only)
- Utility classes for layout, spacing, and typography
- Never inline M3 token overrides — edit `styles.css` or the M3 theme file only
- Tailwind directives in `styles.css`: `@tailwind base; @tailwind components; @tailwind utilities;`

## Nx Commands
```bash
npx nx run mera-driver:serve       # dev server → http://localhost:4400
npx nx build mera-driver           # production build
npx nx run mera-driver:test        # Angular unit tests
npx nx run mera-driver:lint        # ESLint
```
