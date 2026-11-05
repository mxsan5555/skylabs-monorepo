import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma,resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
import { addDriverDocument,deleteDriverDocument } from './driver.service';
import { pillItems } from './driver-pill.service';
beforeEach(()=>{resetPrismaMock();mockPrisma.driver.findUnique.mockResolvedValue({id:'d',documents:[]});mockPrisma.masterListItem.findMany.mockResolvedValue([]);mockPrisma.driverDocument.findMany.mockResolvedValue([]);});
describe('document replacement history',()=>{
 it('links the current protected profile-photo version to Driver.avatar in the existing upload transaction',async()=>{mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'old',type:'Profile Photo',version:1,archivedAt:null}]);mockPrisma.driverDocument.create.mockResolvedValue({id:'photo',version:2,filePath:'drivers/d/new-photo.png'});await addDriverDocument({driverId:'d',category:'personal',type:'Profile Photo',filePath:'drivers/d/new-photo.png',mimeType:'image/png'});expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'d'},data:{status:'Non-Verified',avatar:'drivers/d/new-photo.png'}});expect(mockPrisma.driverDocument.update).toHaveBeenCalled();expect(mockPrisma.driverDocument.delete).not.toHaveBeenCalled();});
 it.each([{filePath:'drivers/d/photo.pdf',mimeType:'application/pdf'},{filePath:'drivers/other/photo.png',mimeType:'image/png'}])('rejects invalid profile-photo metadata without modifying avatar: %j',async input=>{await expect(addDriverDocument({driverId:'d',category:'personal',type:'Profile Photo',...input})).rejects.toMatchObject({code:'PROFILE_PHOTO_INVALID'});expect(mockPrisma.driver.update).not.toHaveBeenCalled();});
 it('archives previous uploads, creates the next version and revokes approval without deleting decisions',async()=>{mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'old',type:'Licence',version:2,archivedAt:null}]);mockPrisma.driverDocument.create.mockResolvedValue({id:'new',version:3});await addDriverDocument({driverId:'d',category:'personal',type:'Licence',fileName:'new.pdf',replaceDocumentId:'old'});expect(mockPrisma.driverDocument.update).toHaveBeenCalledWith({where:{id:'old'},data:{archivedAt:expect.any(Date)}});expect(mockPrisma.driverDocument.create).toHaveBeenCalledWith({data:expect.objectContaining({version:3,fileName:'new.pdf'})});expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'d'},data:{status:'Non-Verified'}});expect(mockPrisma.driverDocument.delete).not.toHaveBeenCalled();expect(mockPrisma.driverKycDecision.deleteMany).not.toHaveBeenCalled();});
 it('retains archived versions in storage but checks only the current submission',()=>{const previous={id:'old',type:'Licence',category:'personal',filePath:'old.pdf',fileName:'old.pdf',regNo:null,archivedAt:new Date()};const next={...previous,id:'new',filePath:'new.pdf',archivedAt:null};const items=pillItems({documents:[previous,next]}).flatMap(p=>p.items).filter(i=>i.key.startsWith('document:'));expect(items.map(i=>i.key)).toEqual(['document:new']);});
 it('cannot withdraw another driver’s document',async()=>{mockPrisma.driverDocument.findFirst.mockResolvedValue(null);await expect(deleteDriverDocument('d','other')).rejects.toMatchObject({status:404});expect(mockPrisma.driverDocument.update).not.toHaveBeenCalled();});
});

describe('active document duplicate protection',()=>{
 it.each(['personal','health','education','police'])('rejects duplicate creates in %s with a field error',async category=>{
  mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'saved',type:'Certificate',version:1,archivedAt:null}]);
  await expect(addDriverDocument({driverId:'d',category:category as any,type:'Certificate'})).rejects.toMatchObject({status:422,code:'DOCUMENT_TYPE_DUPLICATE',details:{fieldErrors:{type:expect.any(Array)}}});
  expect(mockPrisma.$queryRaw).toHaveBeenCalled();expect(mockPrisma.driverDocument.create).not.toHaveBeenCalled();expect(mockPrisma.driverDocument.update).not.toHaveBeenCalled();
 });
 it('uses the master ID to resolve canonical labels and rejects aliases of a saved type',async()=>{
  mockPrisma.masterListItem.findMany.mockResolvedValue([{id:'master-id',name:'Medical Certificate',status:'Active'}]);
  mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'saved',type:'Medical Certificate',version:1,archivedAt:null}]);
  await expect(addDriverDocument({driverId:'d',category:'health',type:'master-id',typeKey:'master-id'})).rejects.toMatchObject({code:'DOCUMENT_TYPE_DUPLICATE'});
 });
 it('does not count archived versions and appends history after withdrawal',async()=>{
  mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'old',type:'Certificate',version:4,archivedAt:new Date()}]);
  await addDriverDocument({driverId:'d',category:'education',type:'Certificate'});
  expect(mockPrisma.driverDocument.create).toHaveBeenCalledWith({data:expect.objectContaining({version:5})});expect(mockPrisma.driverDocument.update).not.toHaveBeenCalled();
 });
 it('replaces only the chosen legacy duplicate and preserves all other active files',async()=>{
  mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'old',type:'Certificate',version:1,archivedAt:null},{id:'other',type:'Certificate',version:2,archivedAt:null}]);
  await addDriverDocument({driverId:'d',category:'education',type:'Certificate',replaceDocumentId:'old'});
  expect(mockPrisma.driverDocument.update).toHaveBeenCalledTimes(1);expect(mockPrisma.driverDocument.update.mock.calls[0][0].where).toEqual({id:'old'});expect(mockPrisma.driverDocument.deleteMany).not.toHaveBeenCalled();
 });
 it('rejects stale, foreign and different-type replacements',async()=>{
  mockPrisma.driverDocument.findMany.mockResolvedValue([{id:'old',type:'Certificate',version:1,archivedAt:new Date()}]);
  for(const id of ['old','foreign'])await expect(addDriverDocument({driverId:'d',category:'education',type:'Certificate',replaceDocumentId:id})).rejects.toMatchObject({code:'DOCUMENT_REPLACEMENT_STALE'});
  expect(mockPrisma.driverDocument.create).not.toHaveBeenCalled();
 });
});

it('rejects deletion of a stale replaced version after acquiring the driver lock',async()=>{mockPrisma.driverDocument.findFirst.mockResolvedValue({id:'old',driverId:'d',type:'Certificate',archivedAt:new Date()});await expect(deleteDriverDocument('d','old')).rejects.toMatchObject({status:409,code:'DOCUMENT_ALREADY_ARCHIVED'});expect(mockPrisma.$queryRaw).toHaveBeenCalled();expect(mockPrisma.driverDocument.update).not.toHaveBeenCalled();expect(mockPrisma.driver.update).not.toHaveBeenCalled();});

it('audits upload and withdrawal within their mutation transactions',async()=>{mockPrisma.driverDocument.create.mockResolvedValue({id:'new',type:'Certificate'});await addDriverDocument({driverId:'d',category:'education',type:'Certificate'},{actorUserId:'actor',action:'driver.document.upload'});expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({actorUserId:'actor',targetId:'d',after:{id:'new',type:'Certificate'}})});mockPrisma.driverDocument.findFirst.mockResolvedValue({id:'new',type:'Certificate',archivedAt:null});await deleteDriverDocument('d','new',{actorUserId:'actor',action:'driver.document.delete'});expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);});
it('does not use a submitted receipt label to avoid review reset for a canonical KYC type',async()=>{mockPrisma.masterListItem.findMany.mockResolvedValue([{id:'master',name:'Aadhaar',status:'Active'}]);mockPrisma.driverDocument.create.mockResolvedValue({id:'new'});await addDriverDocument({driverId:'d',category:'personal',type:'Registration Fee Receipt',typeKey:'master'});expect(mockPrisma.driver.update).toHaveBeenCalledWith({where:{id:'d'},data:{status:'Non-Verified'}});});
