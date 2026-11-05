import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-level wiring tests: permission gates (incl. the view/export split and the reused
// system-settings node for Finance Settings) + audit wiring. Aggregation arithmetic is
// exhaustively covered by settlement.service.test.ts — mock the service module directly here.
vi.mock('../lib/prisma', async () => {
  const { createPrismaMock } = await import('../test-utils/prisma-mock');
  return { prisma: createPrismaMock() };
});

vi.mock('../services/permission-resolver.service', () => ({
  resolveGrantedPermissionKeys: vi.fn(),
  isSuperAdminRoleSet: vi.fn(),
}));

const getAccountsOverviewMock = vi.fn();
const listCustomerPaymentsMock = vi.fn();
const listCustomerPaymentsForExportMock = vi.fn();
const getFinanceSettingsMock = vi.fn();
const updateFinanceSettingsMock = vi.fn();
vi.mock('../services/settlement.service', () => ({
  getAccountsOverview: (...args: unknown[]) => getAccountsOverviewMock(...args),
  listCustomerPayments: (...args: unknown[]) => listCustomerPaymentsMock(...args),
  listCustomerPaymentsForExport: (...args: unknown[]) => listCustomerPaymentsForExportMock(...args),
  getFinanceSettings: (...args: unknown[]) => getFinanceSettingsMock(...args),
  updateFinanceSettings: (...args: unknown[]) => updateFinanceSettingsMock(...args),
}));

const getDisputeAttentionSummaryMock = vi.fn();
vi.mock('../services/dispute.service', () => ({
  getDisputeAttentionSummary: (...args: unknown[]) => getDisputeAttentionSummaryMock(...args),
}));

import app from '../app';
import { resolveGrantedPermissionKeys } from '../services/permission-resolver.service';
import { bearerFor } from '../test-utils/auth-test-utils';

const resolveMock = vi.mocked(resolveGrantedPermissionKeys);

const ADMIN_ID = '60000000-0000-4000-8000-000000000001';
const CUSTOMER_ID = '60000000-0000-4000-8000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  getFinanceSettingsMock.mockResolvedValue({ id: 'fs-1', defaultCommissionRatePercent: '20.00' });
  getDisputeAttentionSummaryMock.mockResolvedValue({ openCount: 0, blockedAmount: '0.00' });
});

describe('GET /api/v1/accounts/overview', () => {
  it('401s with no token', async () => {
    const res = await request(app).get('/api/v1/accounts/overview');
    expect(res.status).toBe(401);
  });

  it('403s without accounts.overview:view', async () => {
    resolveMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/accounts/overview')
      .set('Authorization', bearerFor({ sub: CUSTOMER_ID, roles: ['customer'] }));
    expect(res.status).toBe(403);
    expect(getAccountsOverviewMock).not.toHaveBeenCalled();
    expect(getDisputeAttentionSummaryMock).not.toHaveBeenCalled();
  });

  it('200s with accounts.overview:view', async () => {
    resolveMock.mockResolvedValue(['accounts.overview:view']);
    getAccountsOverviewMock.mockResolvedValue({ customerCollections: '3000.00', msdCommission: '600.00' });
    const res = await request(app)
      .get('/api/v1/accounts/overview')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.customerCollections).toBe('3000.00');
  });

  it('merges the disputes attention summary (open count + blocked amount) onto the same response, additive to the existing fields', async () => {
    resolveMock.mockResolvedValue(['accounts.overview:view']);
    getAccountsOverviewMock.mockResolvedValue({ customerCollections: '3000.00', msdCommission: '600.00' });
    getDisputeAttentionSummaryMock.mockResolvedValue({ openCount: 2, blockedAmount: '450.00' });
    const res = await request(app)
      .get('/api/v1/accounts/overview')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.body.data.customerCollections).toBe('3000.00'); // existing fields untouched
    expect(res.body.data.disputeAttention).toEqual({ openCount: 2, blockedAmount: '450.00' });
  });
});

describe('GET /api/v1/accounts/customer-payments — view vs export are separate grants', () => {
  it('403s a caller holding only :export on the paginated list endpoint', async () => {
    resolveMock.mockResolvedValue(['accounts.customer-payments:export']);
    const res = await request(app)
      .get('/api/v1/accounts/customer-payments')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('200s with :view', async () => {
    resolveMock.mockResolvedValue(['accounts.customer-payments:view']);
    listCustomerPaymentsMock.mockResolvedValue({ items: [], total: 0 });
    const res = await request(app)
      .get('/api/v1/accounts/customer-payments')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/accounts/customer-payments/export — requires :export, not :view', () => {
  it('403s a caller holding only :view', async () => {
    resolveMock.mockResolvedValue(['accounts.customer-payments:view']);
    const res = await request(app)
      .get('/api/v1/accounts/customer-payments/export')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
    expect(listCustomerPaymentsForExportMock).not.toHaveBeenCalled();
  });

  it('200s a CSV body with :export', async () => {
    resolveMock.mockResolvedValue(['accounts.customer-payments:export']);
    listCustomerPaymentsForExportMock.mockResolvedValue([]);
    const res = await request(app)
      .get('/api/v1/accounts/customer-payments/export')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });
});

describe('Finance Settings — reuses the system-settings node, not a new accounts.* key', () => {
  it('GET 403s without system-settings:view', async () => {
    resolveMock.mockResolvedValue(['accounts.overview:view']);
    const res = await request(app)
      .get('/api/v1/accounts/finance-settings')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(403);
  });

  it('GET 200s with system-settings:view', async () => {
    resolveMock.mockResolvedValue(['system-settings:view']);
    const res = await request(app)
      .get('/api/v1/accounts/finance-settings')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }));
    expect(res.status).toBe(200);
  });

  it('PUT 403s a caller holding only system-settings:view (missing :edit)', async () => {
    resolveMock.mockResolvedValue(['system-settings:view']);
    const res = await request(app)
      .put('/api/v1/accounts/finance-settings')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ defaultCommissionRatePercent: 15 });
    expect(res.status).toBe(403);
    expect(updateFinanceSettingsMock).not.toHaveBeenCalled();
  });

  it('PUT 200s and audit-logs with system-settings:edit, capturing the before/after snapshot', async () => {
    resolveMock.mockResolvedValue(['system-settings:edit']);
    updateFinanceSettingsMock.mockResolvedValue({ id: 'fs-1', defaultCommissionRatePercent: '15.00' });

    const res = await request(app)
      .put('/api/v1/accounts/finance-settings')
      .set('Authorization', bearerFor({ sub: ADMIN_ID, roles: ['admin'] }))
      .send({ defaultCommissionRatePercent: 15 });

    expect(res.status).toBe(200);
    expect(updateFinanceSettingsMock).toHaveBeenCalledWith(ADMIN_ID, expect.objectContaining({ defaultCommissionRatePercent: 15 }));
  });
});
