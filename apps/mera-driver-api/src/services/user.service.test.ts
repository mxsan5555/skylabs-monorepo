import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';

vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('./token.service', () => ({ revokeAllSessionsForUser: vi.fn() }));

import { setUserStatus, softDeleteUser, removeRoleFromUser, listUsers, createUser, assignRoleToUser, updateAdminUser } from './user.service';

beforeEach(() => {
  resetPrismaMock();
  mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', deletedAt: null });
  mockPrisma.user.update.mockResolvedValue({});
});

describe('customer accounts belong to customer management', () => {
  it('rejects customer-role creation through staff management', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    await expect(createUser({ name: 'Customer', email:'customer@example.invalid', roleIds: ['role-customer'] })).rejects.toMatchObject({ code: 'CUSTOMER_ROLE_NOT_ASSIGNABLE_HERE' });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });
  it('rejects customer role assignment through staff management', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-customer', key: 'customer' });
    await expect(assignRoleToUser('user-1', 'role-customer')).rejects.toMatchObject({ code: 'CUSTOMER_ROLE_NOT_ASSIGNABLE_HERE' });
    expect(mockPrisma.userRole.upsert).not.toHaveBeenCalled();
  });
});

describe('self-lockout protection', () => {
  it('blocks deactivating the last active Super Admin', async () => {
    mockPrisma.userRole.count.mockResolvedValue(1); // target holds an isSuperAdmin role
    mockPrisma.user.count.mockResolvedValue(0); // no other active Super Admin exists

    await expect(setUserStatus('user-1', 'inactive')).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('allows deactivating a Super Admin when another active one exists', async () => {
    mockPrisma.userRole.count.mockResolvedValue(1);
    mockPrisma.user.count.mockResolvedValue(1); // one other active Super Admin

    await expect(setUserStatus('user-1', 'inactive')).resolves.toBeDefined();
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('allows deactivating a non-Super-Admin user regardless of Super Admin headcount', async () => {
    mockPrisma.userRole.count.mockResolvedValue(0); // target holds no isSuperAdmin role

    await expect(setUserStatus('user-1', 'inactive')).resolves.toBeDefined();
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
  });

  it('allows re-activating a user without the lockout check (only deactivation/blocking is guarded)', async () => {
    await setUserStatus('user-1', 'active');
    expect(mockPrisma.userRole.count).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('blocks soft-deleting the last active Super Admin', async () => {
    mockPrisma.userRole.count.mockResolvedValue(1);
    mockPrisma.user.count.mockResolvedValue(0);

    await expect(softDeleteUser('user-1')).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
  });

  it('blocks removing a user\'s only Super Admin role when they are the last one', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-1', isSuperAdmin: true });
    mockPrisma.userRole.count
      .mockResolvedValueOnce(0) // no other isSuperAdmin role on this user besides the one being removed
      .mockResolvedValueOnce(1); // isSuperAdminUser() check inside the guard
    mockPrisma.user.count.mockResolvedValue(0);

    await expect(removeRoleFromUser('user-1', 'role-1')).rejects.toMatchObject({ code: 'LAST_SUPER_ADMIN' });
    expect(mockPrisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('allows removing a non-SuperAdmin role with no lockout check', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-2', isSuperAdmin: false });
    mockPrisma.userRole.deleteMany.mockResolvedValue({ count: 1 });

    await removeRoleFromUser('user-1', 'role-2');
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
    expect(mockPrisma.userRole.deleteMany).toHaveBeenCalled();
  });
});

describe('driver and customer users are excluded from User Management', () => {
  it('listUsers() includes staff relationships while excluding portal-only accounts', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.$transaction.mockImplementationOnce(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : arg,
    );

    await listUsers();

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{roles:{some:{role:{key:{notIn:['driver','customer']}}}}},{roles:{none:{}}}] }),
      }),
    );
    expect(mockPrisma.user.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{roles:{some:{role:{key:{notIn:['driver','customer']}}}}},{roles:{none:{}}}] }) }),
    );
  });

  it('createUser() rejects a roleIds list containing the driver role', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-driver', key: 'driver' });

    await expect(createUser({ name: 'X', email:'staff@example.invalid', roleIds: ['role-driver'] })).rejects.toMatchObject({
      code: 'DRIVER_ROLE_NOT_ASSIGNABLE_HERE',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('createUser() allows any non-driver role', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-admin', key: 'admin' });
    mockPrisma.user.create.mockResolvedValue({ id: 'user-9' });
    mockPrisma.userRole.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-9', deletedAt: null });

    await expect(createUser({ name: 'X', email:'staff@example.invalid', roleIds: ['role-admin'] })).resolves.toBeDefined();
  });

  it('assignRoleToUser() rejects assigning the driver role', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-driver', key: 'driver' });

    await expect(assignRoleToUser('user-1', 'role-driver')).rejects.toMatchObject({
      code: 'DRIVER_ROLE_NOT_ASSIGNABLE_HERE',
    });
    expect(mockPrisma.userRole.upsert).not.toHaveBeenCalled();
  });
});

describe('immutable creator and explicit multi-role drafts',()=>{
  it('preserves saved roles when profile editing supplies no role replacement',async()=>{
    mockPrisma.user.findFirst.mockResolvedValue({id:'u',roles:[{role:{id:'a'}},{role:{id:'b'}}]});
    await updateAdminUser('u',{name:'Edited'});expect(mockPrisma.userRole.deleteMany).not.toHaveBeenCalled();expect(mockPrisma.userRole.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).toHaveBeenCalledWith({where:{id:'u'},data:{name:'Edited'}});
  });
  it('returns Not recorded provenance when no authenticated creation audit exists',async()=>{
    mockPrisma.user.findMany.mockResolvedValue([{id:'legacy',roles:[]}]);mockPrisma.user.count.mockResolvedValue(1);mockPrisma.auditLog.findMany.mockResolvedValue([]);
    expect((await listUsers()).rows[0].createdBy).toBeNull();
  });
  it('uses the original creation actor, never the most recent editor',async()=>{
    mockPrisma.user.findMany.mockResolvedValue([{id:'u',roles:[]}]);mockPrisma.user.count.mockResolvedValue(1);mockPrisma.auditLog.findMany.mockResolvedValue([{targetId:'u',actor:{name:'Original creator'}},{targetId:'u',actor:{name:'Later actor'}}]);
    expect((await listUsers()).rows[0].createdBy).toBe('Original creator');
  });
});

describe('single-staff-role guard', () => {
  it('createUser() rejects more than one roleId', async () => {
    await expect(createUser({ name: 'X', email: 'x@example.invalid', roleIds: ['role-a', 'role-b'] })).rejects.toMatchObject({ code: 'SINGLE_ROLE_ONLY' });
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('createUser() allows exactly one roleId', async () => {
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-a', key: 'admin' });
    mockPrisma.user.create.mockResolvedValue({ id: 'user-9' });
    mockPrisma.userRole.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-9', deletedAt: null });
    await expect(createUser({ name: 'X', email: 'x@example.invalid', roleIds: ['role-a'] })).resolves.toBeDefined();
  });

  it('updateAdminUser() rejects replacing a user\'s roles with more than one', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u', roles: [{ role: { id: 'a', key: 'admin', isSuperAdmin: false } }] });
    await expect(updateAdminUser('u', { roleIds: ['role-a', 'role-b'] })).rejects.toMatchObject({ code: 'SINGLE_ROLE_ONLY' });
    expect(mockPrisma.userRole.createMany).not.toHaveBeenCalled();
  });

  it('updateAdminUser() allows reconciling a legacy multi-role user down to exactly one', async () => {
    mockPrisma.user.findFirst
      .mockResolvedValueOnce({ id: 'u', roles: [{ role: { id: 'a', key: 'vendor', isSuperAdmin: false } }, { role: { id: 'b', key: 'sales', isSuperAdmin: false } }] })
      .mockResolvedValueOnce({ id: 'u', roles: [{ role: { id: 'a', key: 'vendor', isSuperAdmin: false } }] });
    mockPrisma.role.findMany.mockResolvedValue([{ id: 'a', isActive: true, isSuperAdmin: false }]);
    await expect(updateAdminUser('u', { roleIds: ['a'] })).resolves.toBeDefined();
    expect(mockPrisma.userRole.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [{ userId: 'u', roleId: 'a' }] }));
  });

  it('assignRoleToUser() rejects adding a second staff role on top of an existing one', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', roles: [{ role: { id: 'role-existing', key: 'vendor' } }] });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-new', key: 'sales' });
    await expect(assignRoleToUser('user-1', 'role-new')).rejects.toMatchObject({ code: 'SINGLE_ROLE_ONLY' });
    expect(mockPrisma.userRole.upsert).not.toHaveBeenCalled();
  });

  it('assignRoleToUser() allows re-assigning the same role the user already holds (idempotent)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', roles: [{ role: { id: 'role-existing', key: 'vendor' } }] });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-existing', key: 'vendor' });
    mockPrisma.userRole.upsert.mockResolvedValue({});
    await expect(assignRoleToUser('user-1', 'role-existing')).resolves.toBeDefined();
    expect(mockPrisma.userRole.upsert).toHaveBeenCalled();
  });

  it('assignRoleToUser() allows the first role for a role-less user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', roles: [] });
    mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-new', key: 'sales' });
    mockPrisma.userRole.upsert.mockResolvedValue({});
    await expect(assignRoleToUser('user-1', 'role-new')).resolves.toBeDefined();
  });
});

it('replaces staff-role links while preserving unrelated portal relationships',async()=>{
  mockPrisma.user.findFirst.mockResolvedValue({id:'mixed',roles:[{role:{id:'old',key:'sales'}},{role:{id:'portal',key:'customer'}}]});
  mockPrisma.role.findUnique.mockResolvedValue({id:'new',key:'custom',isActive:true});mockPrisma.role.findMany.mockResolvedValue([{id:'new',key:'custom',isActive:true}]);
  await updateAdminUser('mixed',{roleIds:['new']});
  expect(mockPrisma.userRole.deleteMany).toHaveBeenCalledWith({where:{userId:'mixed',roleId:{notIn:['new']},role:{key:{notIn:['driver','customer']}}}});
  expect(mockPrisma.userRole.createMany).toHaveBeenCalledWith({data:[{userId:'mixed',roleId:'new'}],skipDuplicates:true});
});

it('records the previous staff assignment inside the user-update transaction',async()=>{
 mockPrisma.user.findFirst.mockResolvedValue({id:'u',name:'Before',status:'active',roles:[{role:{id:'old',key:'sales'}}]});mockPrisma.role.findUnique.mockResolvedValue({id:'new',key:'custom',isActive:true});mockPrisma.role.findMany.mockResolvedValue([{id:'new',key:'custom',isActive:true}]);
 await updateAdminUser('u',{roleIds:['new']},{actorUserId:'actor'});
 expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
 expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'user.update',before:expect.objectContaining({roleIds:['old']}),after:expect.objectContaining({roleIds:['new']})})}));
});
