import education from './document-taxonomy.json';
export type DocumentSection = 'personal'|'health'|'education'|'police';
export interface DocumentRow { id?:string; type:string; regNo:string; file:string; savedFile?:string; }
export interface DocumentChoice { id:string; name:string; status:string; }
export function documentChoices(section:DocumentSection, masters:Record<string,DocumentChoice[]>):DocumentChoice[] {
  return section==='education'?education:masters[section+'-docs']??[];
}
export function documentKey(type:string, choices:DocumentChoice[]):string {
  if(!type || type==='Select Document Type')return '';
  return choices.find(choice=>choice.id===type||choice.name.trim().toLowerCase()===type.trim().toLowerCase())?.id ?? 'legacy:'+type.trim().toLowerCase();
}
export function availableDocumentChoices(choices:DocumentChoice[],rows:DocumentRow[],index=-1):DocumentChoice[]{
  const current=rows[index], currentKey=current?documentKey(current.type,choices):'';
  const used=new Set(rows.filter((_,i)=>i!==index).map(row=>documentKey(row.type,choices)).filter(Boolean));
  const available=choices.filter(choice=>(choice.status==='Active'&&!used.has(choice.id))||choice.id===currentKey);
  if(currentKey&&!available.some(choice=>choice.id===currentKey))available.push({id:currentKey,name:current.type,status:'Historical'});
  return available;
}
export function duplicateDocumentRow(choices:DocumentChoice[],rows:DocumentRow[],index:number):boolean {
 const key=documentKey(rows[index]?.type??'',choices);return !!key&&rows.some((row,i)=>i!==index&&documentKey(row.type,choices)===key);
}
