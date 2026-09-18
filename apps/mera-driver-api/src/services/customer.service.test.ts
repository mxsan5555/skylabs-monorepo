import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));

import {
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
      data: { name: 'Anita Sharma', email: undefined, phone: '9000000000' },
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
