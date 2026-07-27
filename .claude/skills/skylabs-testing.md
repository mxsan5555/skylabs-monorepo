# Skill: Skylabs Testing

Test strategy and config for the skylabs-monorepo.

## Test Runners Per App
| App | Runner | Config |
|-----|--------|--------|
| msd | Vitest + React Testing Library | `apps/msd/vite.config.ts` (test section) |
| shared-ui | Vitest | `packages/shared-ui/vite.config.ts` |
| mera-driver | `@angular/build:unit-test` | `apps/mera-driver/project.json` |
| E2E (both) | Playwright | `playwright.config.ts` at repo root |
| API | Vitest + Supertest | per-API vite.config.ts |

## Run Commands
```bash
npx nx run msd:test                        # msd unit tests
npx nx run shared-ui:test                  # shared-ui unit tests
npx nx run mera-driver:test               # mera-driver unit tests
npx nx run-many -t test --projects=shared-ui,msd,mera-driver   # all at once
npx playwright test                        # all e2e tests
npx playwright test --project=msd         # e2e msd only
npx playwright test --project=mera-driver  # e2e mera-driver only
```

## msd — Vitest Unit Tests

### File naming
`ComponentName.test.tsx` or `hook-name.test.ts` co-located with the file under test.

### Setup
```ts
// apps/msd/src/test-setup.ts
import '@testing-library/jest-dom';
```

### Template
```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders with required props', () => {
    render(<MyComponent title="Test" />);
    expect(screen.getByRole('heading', { name: 'Test' })).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', async () => {
    const onClick = vi.fn();
    render(<MyComponent onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

## shared-ui — Vitest Unit Tests

### JSDOM polyfill (required — always first line)
```ts
import { installMaterialJsdomPolyfills } from '@skylabs-monorepo/shared-ui/testing';
installMaterialJsdomPolyfills(); // must be the very first import

// then your test:
import './sky-badge';
```

### File naming
`component-name.test.ts` in `packages/shared-ui/src/components/<name>/`

## mera-driver — Angular Unit Tests

### File naming
`<name>.component.spec.ts` or `<name>.service.spec.ts` co-located with the file under test.

### Template
```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { MyComponent } from './my.component';

describe('MyComponent', () => {
  let fixture: ComponentFixture<MyComponent>;
  let component: MyComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();
    fixture = TestBed.createComponent(MyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => expect(component).toBeTruthy());

  it('renders the heading', () => {
    const h1 = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toContain('Expected text');
  });
});
```

## Playwright E2E

### Config (create at repo root if missing)
```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  projects: [
    { name: 'msd', use: { baseURL: 'http://localhost:4200', viewport: { width: 1280, height: 720 } } },
    { name: 'mera-driver', use: { baseURL: 'http://localhost:4400', viewport: { width: 1280, height: 720 } } },
  ],
});
```

### File naming
`e2e/<app>/<feature>.spec.ts`

### Template
```ts
import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('mobile layout does not overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(375);
  });
});
```

## API Tests (Supertest)
```ts
// apps/msd-api/src/routes/deals.test.ts
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../main';

describe('GET /deals', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/deals');
    expect(res.status).toBe(401);
  });
});
```

## Test Coverage Targets
- Unit tests: all components with props logic, all hooks, all services
- E2E: happy path for every user-facing flow (home, search, deal detail, cart, checkout)
- API: every endpoint — success + 401 + validation error cases
