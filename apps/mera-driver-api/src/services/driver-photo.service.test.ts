import {describe,it,expect} from 'vitest';
import {driverProfilePhoto} from './driver-photo.service';
describe('protected shared profile photo',()=>{
 const doc={type:'Profile Photo',fileName:'portrait.png',filePath:'drivers/own/portrait.png',archivedAt:null};
 it('resolves registered filenames and missing legacy references to a current owned photo',async()=>{expect(await driverProfilePhoto({id:'own',avatar:'portrait.png',documents:[doc]})).toBe('/uploads/drivers/own/portrait.png');expect(await driverProfilePhoto({id:'own',documents:[doc]})).toBe('/uploads/drivers/own/portrait.png');});
 it('does not expose another driver file or a previous photo as current',async()=>{expect(await driverProfilePhoto({id:'other',avatar:doc.filePath,documents:[doc]})).toBeNull();expect(await driverProfilePhoto({id:'own',documents:[{...doc,archivedAt:new Date()}]})).toBeNull();});
 it('missing legacy files do not break the details request',async()=>expect(await driverProfilePhoto({id:'own',avatar:'drivers/own/does-not-exist.png',documents:[]})).toBeNull());
});
