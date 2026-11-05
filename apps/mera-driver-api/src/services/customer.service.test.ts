import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import {
  updateCustomer,
  searchCustomers,
  assertCustomerAccountActive,
  updateOwnCustomer,
  listOwnBookings,
  linkCustomerToUser,
  unlinkCustomerFromUser,
  createAndLinkCustomerUser,
} from './customer.service';

const USER_2_ID = '22222222-2222-2222-8222-222222222222';

beforeEach(() => {
  resetPrismaMock();
  mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', documents: [] });
});

describe('customer account status (login gate)', () => {
  it('assertCustomerAccountActive throws CUSTOMER_DEACTIVATED for a linked, deactivated customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ accountStatus: 'Inactive' });
    await expect(assertCustomerAccountActive('user-1')).rejects.toMatchObject({ status: 403, code: 'CUSTOMER_DEACTIVATED' });
  });

  it('assertCustomerAccountActive is a no-op for an active customer', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ accountStatus: 'Active' });
    await expect(assertCustomerAccountActive('user-1')).resolves.toBeUndefined();
  });
  it('blocked customers cannot log in',async()=>{mockPrisma.customer.findUnique.mockResolvedValue({accountStatus:'Blocked'});await expect(assertCustomerAccountActive('user-1')).rejects.toMatchObject({status:403,code:'CUSTOMER_DEACTIVATED'});});

  it('assertCustomerAccountActive is a no-op for a User with no linked Customer record', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    await expect(assertCustomerAccountActive('user-1')).resolves.toBeUndefined();
  });
});

describe('updateOwnCustomer / listOwnBookings', () => {
  it('updateOwnCustomer writes only to the given customerId', async () => {
    mockPrisma.customer.update.mockResolvedValue({});
    await updateOwnCustomer('customer-1', { firstName: 'Anita' });
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { firstName: 'Anita' } });
  });

  it('listOwnBookings scopes strictly by customerId', async () => {
    mockPrisma.booking.findMany.mockResolvedValue([]);
    await listOwnBookings('customer-1');
    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'customer-1' } }),
    );
  });
});

describe('Customer <-> User linkage', () => {
  it('linkCustomerToUser sets userId, assigns the customer role, and re-fetches', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: USER_2_ID, deletedAt: null });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    mockPrisma.userRole.upsert.mockResolvedValue({});
    mockPrisma.customer.update.mockResolvedValue({});

    await linkCustomerToUser('customer-1', USER_2_ID);

    expect(mockPrisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_roleId: { userId: USER_2_ID, roleId: 'role-customer' } } }),
    );
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { userId: USER_2_ID } });
  });

  it('linkCustomerToUser 404s when the target user does not exist', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(linkCustomerToUser('customer-1', USER_2_ID)).rejects.toMatchObject({ status: 404 });
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it('unlinkCustomerFromUser clears userId', async () => {
    mockPrisma.customer.update.mockResolvedValue({});
    await unlinkCustomerFromUser('customer-1');
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { userId: null } });
  });

  it('createAndLinkCustomerUser creates a User, assigns the customer role, and links it', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      userId: null,
      firstName: 'Anita',
      lastName: 'Sharma',
      mobileNumber: '9000000000',
      email: null,
    });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    mockPrisma.user.create.mockResolvedValue({ id: USER_2_ID });
    mockPrisma.userRole.create.mockResolvedValue({});
    mockPrisma.customer.update.mockResolvedValue({});

    await createAndLinkCustomerUser('customer-1');

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Anita Sharma', email: undefined, phone: '+919000000000' },
    });
    expect(mockPrisma.userRole.create).toHaveBeenCalledWith({ data: { userId: USER_2_ID, roleId: 'role-customer' } });
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({ where: { id: 'customer-1' }, data: { userId: USER_2_ID } });
  });

  it('createAndLinkCustomerUser returns 409 without creating anything when already linked', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', userId: USER_2_ID });
    await expect(createAndLinkCustomerUser('customer-1')).rejects.toMatchObject({ status: 409 });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('createAndLinkCustomerUser returns 422 when the customer has neither phone nor email', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', userId: null, mobileNumber: null, email: null });
    await expect(createAndLinkCustomerUser('customer-1')).rejects.toMatchObject({ status: 422 });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
});


describe('audited customer status transitions',()=>{
  it('requires a reason and active-trip acknowledgement before disabling',async()=>{
    mockPrisma.customer.findUnique.mockResolvedValue({id:'customer-1',accountStatus:'Active'});mockPrisma.booking.count.mockResolvedValue(2);
    await expect(updateCustomer('customer-1',{accountStatus:'Inactive'})).rejects.toMatchObject({code:'REASON_REQUIRED'});
    await expect(updateCustomer('customer-1',{accountStatus:'Inactive',statusReason:'Customer requested'})).rejects.toMatchObject({code:'ACTIVE_BOOKINGS_ACK_REQUIRED'});
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    await updateCustomer('customer-1',{accountStatus:'Inactive',statusReason:'Customer requested',acknowledgeActiveBookings:true});
    expect(mockPrisma.customer.update).toHaveBeenCalledWith({where:{id:'customer-1'},data:{accountStatus:'Inactive'}});expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });
  it('ordinary edits carrying unchanged status do not require a transition reason',async()=>{mockPrisma.customer.findUnique.mockResolvedValue({id:'customer-1',accountStatus:'Active'});await updateCustomer('customer-1',{accountStatus:'Active',firstName:'Edited'});expect(mockPrisma.booking.count).not.toHaveBeenCalled();});
  it('combines database search/status and bounded pagination with status counts',async()=>{mockPrisma.customer.findMany.mockResolvedValue([]);mockPrisma.customer.count.mockResolvedValue(4);const result=await searchCustomers({page:2,pageSize:25,search:'Ravi',status:'Inactive'});expect(result.meta).toMatchObject({total:4,counts:{Active:4,Inactive:4,Blocked:4}});expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({skip:25,take:25,where:expect.objectContaining({accountStatus:'Inactive',OR:expect.any(Array)})}));});
});
