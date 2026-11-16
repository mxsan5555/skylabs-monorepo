import {beforeEach,it,expect,vi} from 'vitest';
import {mockPrisma,resetPrismaMock} from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
import {listBookings,createBooking,searchBookings} from './booking.service';
beforeEach(resetPrismaMock);
it('pages a large booking cohort without downloading records to count or exposing ledger aggregates',async()=>{
 mockPrisma.$queryRaw.mockResolvedValueOnce([{total:100000}]).mockResolvedValueOnce([{id:'owned',paymentStatus:'paid'}]);mockPrisma.booking.findMany.mockResolvedValue([{id:'owned',bookingCode:'B',paymentStatus:'unpaid'}]);
 const result=await searchBookings(false,{mode:'own',ownerUserId:'company'}, {},2000,25,'bookingCode','asc');expect(result.meta.total).toBe(100000);expect(result.rows[0].paymentStatus).toBe('paid');expect(result.rows[0]).not.toHaveProperty('collected');expect(mockPrisma.$queryRaw.mock.calls[1][0].values.slice(-2)).toEqual([25,49975]);expect(mockPrisma.booking.findMany.mock.calls[0][0].where.AND[0]).toEqual({createdByUserId:'company'});
});
it.each(['company-1','company-2'])('keeps dashboard drill-downs inside %s ownership',async ownerUserId=>{
 mockPrisma.$queryRaw.mockResolvedValue([]);await listBookings(false,{mode:'own',ownerUserId},{assignment:'unassigned',timing:'today',payment:'unpaid'});
 const sql=mockPrisma.$queryRaw.mock.calls[0][0];expect(sql.values).toContain(ownerUserId);expect(sql.sql).toContain('"driverId" IS NULL');expect(sql.sql).toContain("AT TIME ZONE 'Asia/Kolkata'");expect(sql.sql).toContain('"computedPaymentStatus"');
});

it('reuses the booking list with database filtering for current/legacy trip states',async()=>{mockPrisma.booking.findMany.mockResolvedValue([]);await listBookings(true);expect(mockPrisma.booking.findMany).toHaveBeenCalledWith({where:{status:{in:['confirmed','on_the_way','arrived','in_progress','completed','accepted','driver_arrived','ongoing']}},orderBy:{createdAt:'desc'},take:1000});await listBookings();expect(mockPrisma.booking.findMany).toHaveBeenLastCalledWith({where:{},orderBy:{createdAt:'desc'},take:1000});});

it('scopes the list to a Company/Sales caller\'s own createdByUserId',async()=>{mockPrisma.booking.findMany.mockResolvedValue([]);await listBookings(false,{mode:'own',ownerUserId:'company-1'});expect(mockPrisma.booking.findMany).toHaveBeenLastCalledWith({where:{createdByUserId:'company-1'},orderBy:{createdAt:'desc'},take:1000});});

it('scopes a Vendor caller transitively through their own owned drivers',async()=>{mockPrisma.booking.findMany.mockResolvedValue([]);await listBookings(false,{mode:'via-owned-drivers',ownerUserId:'vendor-1'});expect(mockPrisma.booking.findMany).toHaveBeenLastCalledWith({where:{driver:{createdByUserId:'vendor-1'}},orderBy:{createdAt:'desc'},take:1000});});

it('never trusts a client-supplied createdByUserId — always overwrites it from the server-derived owner',async()=>{
  mockPrisma.booking.create.mockResolvedValue({});
  await createBooking({bookingCode:'B1',customerName:'X',createdByUserId:'attacker-id'},'real-owner-id');
  expect(mockPrisma.booking.create).toHaveBeenCalledWith({data:{bookingCode:'B1',customerName:'X',createdByUserId:'real-owner-id'}});
});
