import { describe,it,expect,beforeEach,vi } from 'vitest';
import {mockPrisma,resetPrismaMock} from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
import {updateRole,createRole,cloneRole,setRoleStatus,deleteRole,assertRoleDelegation,setRolePermissions} from './role.service';
beforeEach(()=>resetPrismaMock());
describe('atomic and delegated role editing',()=>{
  it('saves metadata and independent permission IDs in one transaction',async()=>{
    mockPrisma.role.findUnique.mockResolvedValue({id:'r',key:'ordinary',isSuperAdmin:false});mockPrisma.permission.count.mockResolvedValue(1);mockPrisma.permission.findMany.mockResolvedValue([{key:'drivers:edit'}]);mockPrisma.role.update.mockResolvedValue({id:'r',name:'Operator'});
    await updateRole('r',{name:'Operator',permissionIds:['edit']},['drivers:edit']);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();expect(mockPrisma.role.update).toHaveBeenCalledWith({where:{id:'r'},data:{name:'Operator'}});
    expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({data:[{roleId:'r',permissionId:'edit'}]});
  });
  it('rejects a grant beyond delegated authority before writing',async()=>{
    mockPrisma.role.findUnique.mockResolvedValue({id:'r',key:'ordinary'});mockPrisma.permission.count.mockResolvedValue(1);mockPrisma.permission.findMany.mockResolvedValue([{key:'drivers:delete'}]);
    await expect(updateRole('r',{permissionIds:['delete']},['drivers:view'])).rejects.toMatchObject({code:'DELEGATION_DENIED'});expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it('starts a new role without extra permissions',async()=>{
    mockPrisma.role.create.mockResolvedValue({id:'new'});await createRole({key:'ordinary',name:'Ordinary'},[]);expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
  });
  it('protects Super Admin from copying, disabling and matrix replacement',async()=>{
    mockPrisma.role.findUnique.mockResolvedValue({id:'owner',key:'owner',isSuperAdmin:true});
    await expect(cloneRole('owner','copy','Copy')).rejects.toMatchObject({code:'PROTECTED_ROLE'});
    await expect(setRoleStatus('owner',false)).rejects.toMatchObject({code:'PROTECTED_ROLE'});
    await expect(updateRole('owner',{permissionIds:[]})).rejects.toMatchObject({code:'PROTECTED_ROLE'});
    expect(mockPrisma.role.update).not.toHaveBeenCalled();
  });
  it('does not report success or invalidate the draft when a transaction fails',async()=>{
    mockPrisma.role.findUnique.mockResolvedValue({id:'r',key:'ordinary'});mockPrisma.role.update.mockRejectedValue(new Error('database failure'));
    await expect(updateRole('r',{name:'Draft'})).rejects.toThrow('database failure');expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled();
  });
  it('preserves roles with historical assignments instead of deleting user links',async()=>{
    mockPrisma.role.findUnique.mockResolvedValue({id:'r',key:'ordinary'});mockPrisma.userRole.count.mockResolvedValue(1);
    await expect(deleteRole('r')).rejects.toMatchObject({code:'ROLE_HISTORY_PROTECTED'});expect(mockPrisma.role.delete).not.toHaveBeenCalled();
  });
  it('cannot assign a Super Admin bypass with only staff role-assignment permission',async()=>{
    mockPrisma.role.findUnique.mockResolvedValue({id:'r',isSuperAdmin:true});mockPrisma.userRole.findMany.mockResolvedValue([]);
    await expect(assertRoleDelegation('r','staff',['rbac.users:assign'])).rejects.toMatchObject({code:'DELEGATION_DENIED'});
  });

});

it('rejects duplicate names or keys without writing a role',async()=>{
  mockPrisma.role.findFirst.mockResolvedValue({id:'exists',name:'Operations'});
  await expect(createRole({key:'operations',name:'Operations'})).rejects.toMatchObject({code:'DUPLICATE_ROLE',status:409});
  expect(mockPrisma.role.create).not.toHaveBeenCalled();
});
it('metadata-only editing preserves saved permissions and assignments',async()=>{
  mockPrisma.role.findUnique.mockResolvedValue({id:'r',key:'custom'});mockPrisma.role.update.mockResolvedValue({id:'r',key:'custom',name:'Updated'});
  await updateRole('r',{name:'Updated'});
  expect(mockPrisma.rolePermission.deleteMany).not.toHaveBeenCalled();expect(mockPrisma.userRole.deleteMany).not.toHaveBeenCalled();
  expect(mockPrisma.role.update).toHaveBeenCalledWith({where:{id:'r'},data:{name:'Updated'}});
});

it('keeps permission replacement and audit history in the same failure boundary',async()=>{
 mockPrisma.role.findUnique.mockResolvedValue({id:'r',key:'custom'});mockPrisma.permission.count.mockResolvedValue(1);mockPrisma.rolePermission.findMany.mockResolvedValue([{permissionId:'old'}]);
 mockPrisma.auditLog.create.mockRejectedValue(new Error('Audit unavailable'));
 await expect(setRolePermissions('r',['edit'],undefined,{actorUserId:'actor'})).rejects.toThrow('Audit unavailable');
 expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
 expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'role.permissions.set',before:{permissionIds:['old']},after:{permissionIds:['edit']}})}));
});
