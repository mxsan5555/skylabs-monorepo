import {beforeEach,expect,it,vi} from 'vitest';
import {mockPrisma,resetPrismaMock} from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
import {accountsOverview} from './accounts.service';
beforeEach(()=>{resetPrismaMock();mockPrisma.moneyMovement.findMany.mockResolvedValue([]);});
it('returns one bounded fee page while calculating 100000-driver totals in SQL',async()=>{
 mockPrisma.$queryRaw.mockResolvedValueOnce([{bookings:0,collected:0,commission:0}]).mockResolvedValueOnce([{total:0}]).mockResolvedValueOnce([{status:'Unpaid',count:100000,amountPaise:5000000000}]).mockResolvedValueOnce([{id:'last-page-driver',firstName:'Saved',feeStatus:'Unpaid',registrationFeePaise:50000}]).mockResolvedValueOnce([{paid:50000,refunded:0}]);
 const result=await accountsOverview({section:'Registration Fees',page:4000,pageSize:25,city:'Pune'});
 expect(result.meta).toEqual({total:100000,page:4000,pageSize:25});expect(result.drivers).toHaveLength(1);expect(result.registrationSummary.Unpaid.amountPaise).toBe(5000000000);
 const page=mockPrisma.$queryRaw.mock.calls[3][0];expect(page.sql).toContain('LIMIT ? OFFSET ?');expect(page.values.slice(-2)).toEqual([25,99975]);expect(mockPrisma.driver.findMany).not.toHaveBeenCalled();
});
it('does not return driver records, financial forms data or all bookings on Overview',async()=>{
 mockPrisma.$queryRaw.mockResolvedValueOnce([{bookings:1,collected:0,commission:15000,commissionReceivable:15000}]).mockResolvedValueOnce([{total:1}]).mockResolvedValueOnce([]).mockResolvedValueOnce([{paid:50000,refunded:0}]).mockResolvedValueOnce([]);
 const result=await accountsOverview();expect(mockPrisma.$queryRaw.mock.calls[4][0].sql).toContain('"commissionReceivable">0');expect(result.drivers).toEqual([]);expect(result.bookings).toEqual([]);expect(result.totals.platformIncome).toBe(65000);expect(result.totals.collected).toBe(0);expect(result.totals.commissionReceivable).toBe(15000);expect(mockPrisma.moneyMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({take:5}));
});
it('rejects malformed date boundaries before reading a financial ledger',async()=>{await expect(accountsOverview({from:'not-a-date'})).rejects.toMatchObject({code:'DATE_INVALID'});expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();});
