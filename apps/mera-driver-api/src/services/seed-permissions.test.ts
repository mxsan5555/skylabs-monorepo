import { it, expect, vi } from 'vitest';
import { seedNewRolePermissions } from '../../prisma/role-permission-seed';
import type { PrismaClient } from '../generated/prisma-client';

it('initialises new roles while preserving revoked actions and empty existing roles',async()=>{
  const grants=new Map<string,string[]>([['existing-sales',['view']],['existing-support',[]]]);
  const client={permission:{findMany:vi.fn(async()=>[{id:'view'},{id:'edit'}])},rolePermission:{createMany:vi.fn(async({data}:{data:{roleId:string;permissionId:string}[]})=>{
    for(const row of data)grants.set(row.roleId,[...(grants.get(row.roleId)??[]),row.permissionId]);return {count:data.length};
  })}};
  const defaults={sales:[{menuKey:'customers',actions:['view','edit'] as const}],support:[{menuKey:'customers',actions:['view'] as const}],admin:[{menuKey:'customers',actions:['view','edit'] as const}]};
  await seedNewRolePermissions(client as unknown as PrismaClient,new Map([['admin',{id:'new-admin'}]]),defaults as never);
  expect(grants.get('existing-sales')).toEqual(['view']);expect(grants.get('existing-support')).toEqual([]);expect(grants.get('new-admin')).toEqual(['view','edit']);
  await seedNewRolePermissions(client as unknown as PrismaClient,new Map(),defaults as never);
  expect(grants.get('existing-sales')).toEqual(['view']);expect(grants.get('existing-support')).toEqual([]);expect(client.rolePermission.createMany).toHaveBeenCalledOnce();
});
