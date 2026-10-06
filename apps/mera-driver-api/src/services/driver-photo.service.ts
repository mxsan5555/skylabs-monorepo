import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_ROOT } from '../lib/upload';

/** One existing protected-photo flow for Details and assigned review headers. */
export async function driverProfilePhoto(driver:{id:string;avatar?:string|null;documents:{type:string;fileName:string|null;filePath:string|null;archivedAt?:Date|null}[]}){
  const avatar=driver.avatar??'';
  if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar))return avatar;
  const own=(file:string)=>file.startsWith(`drivers/${driver.id}/`)&&/^drivers\/[^/]+\/[^/]+$/.test(file)&&!file.includes('..');
  const current=driver.documents.filter(d=>!d.archivedAt&&d.filePath&&own(d.filePath));
  const doc=current.find(d=>d.filePath===avatar||d.type==='Profile Photo'&&d.fileName===avatar)??current.find(d=>d.type==='Profile Photo');
  if(doc?.filePath)return `/uploads/${doc.filePath.split('/').map(encodeURIComponent).join('/')}`;
  if(own(avatar)){
    const resolved=path.resolve(UPLOAD_ROOT,avatar);
    if(resolved.startsWith(path.resolve(UPLOAD_ROOT)+path.sep)&&/\.(png|jpe?g|webp)$/i.test(resolved))try{
      const bytes=await readFile(resolved);
      if(bytes.length<=10*1024*1024)return `data:image/${/\.png$/i.test(resolved)?'png':/\.webp$/i.test(resolved)?'webp':'jpeg'};base64,${bytes.toString('base64')}`;
    }catch{/* Missing or damaged photo does not block the record. */}
  }
  return null;
}
