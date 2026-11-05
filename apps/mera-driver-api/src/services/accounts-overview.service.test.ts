import {beforeEach,describe,expect,it,vi} from 'vitest';
import {mockPrisma,resetPrismaMock} from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
import {accountsOverviewMetrics,commissionEarnedAtSql} from './accounts-overview.service';
beforeEach(()=>resetPrismaMock());
describe('Accounts Overview metrics',()=>{
  it('uses ledger posted dates for collections, fee receipts and refunds, and recognition dates for earnings',async()=>{
    mockPrisma.$queryRaw.mockResolvedValueOnce([{amount:12000}]).mockResolvedValueOnce([{amount:4000}]).mockResolvedValueOnce([{commission:8000,payoutDue:2000,commissionReceivable:1000}]);
    const metrics=await accountsOverviewMetrics({from:'2026-10-01',to:'2026-10-08',city:'Pune',service:'Hourly'},{mode:'own',ownerUserId:'staff'},'staff');
    expect(metrics).toMatchObject({platformCollections:12000,registrationFeesReceived:4000,earnedCommission:8000,driverPayoutDue:2000,commissionReceivable:1000});
    const sql=mockPrisma.$queryRaw.mock.calls.map(([query])=>query.sql);
    expect(sql[0]).toContain('booking_payment');expect(sql[0]).toContain('createdAt');expect(sql[1]).toContain('registration_refund');expect(sql[1]).toContain('createdByUserId');expect(sql[2]).toContain('completedAt');expect(sql[2]).toContain('commissionReceivable');
    expect(commissionEarnedAtSql().sql).toContain('[0-9]{4}');
  });
});
