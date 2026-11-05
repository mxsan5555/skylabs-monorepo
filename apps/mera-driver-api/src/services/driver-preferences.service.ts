import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/errorHandler';
import cities from '../../../mera-driver/public/data/cities.json';

export const preferenceCategories = ['statuses','job-types','job-choices','states','driver-account-statuses','driver-types','source-types','education','eye-visions','personal-docs','health-docs','police-docs','languages'];
export const splitChoices = (value: unknown): string[] => Array.isArray(value) ? value.filter(v=>typeof v==='string') : typeof value==='string'?value.split(',').map(v=>v.trim()).filter(Boolean):[];
const equal=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
export function cityState(city: string | null | undefined) {const state=cities.cities.find(item=>equal(item.name,city??''))?.state;return state && !/[,&]/.test(state)?state:undefined;}
export async function onboardingOptions() {
  const [items, vehicles]=await Promise.all([prisma.masterListItem.findMany({where:{category:{in:preferenceCategories}},orderBy:[{name:'asc'},{id:'asc'}],take:2000}),prisma.vehicleType.findMany({orderBy:{name:'asc'},take:500})]);
  return {...Object.fromEntries(preferenceCategories.map(category=>[category,items.filter(item=>item.category===category).map(({id,name,status})=>({id,name,status}))])), 'vehicle-types':vehicles.map(({id,name,code,status})=>({id,name,code,status}))};
}
/** Existing name-based master fields stay compatible; submitted IDs are resolved server-side.
 * Old, unchanged or retained values remain readable, but cannot be added to another record. */
export async function validateDriverPreferences(input:Record<string,unknown>,existing:Record<string,unknown>={}) {
  const fields:Record<string,string>={jobType:'job-types',jobChoices:'job-choices',workStates:'states',sourceType:'source-types',driverType:'driver-types',education:'education',eyeVision:'eye-visions',language:'languages'};
  for(const [field,category] of Object.entries(fields)) {
    if(input[field]===undefined||JSON.stringify(input[field])===JSON.stringify(existing[field]))continue;
    const prior=splitChoices(existing[field]),selected=splitChoices(input[field]);
    if(!selected.length)continue;
    const options=await prisma.masterListItem.findMany({where:{category}});
    const resolved=selected.map(value=>{
      if(prior.some(old=>equal(old,value)))return value;
      const option=options.find(item=>item.status==='Active'&&(item.id===value||equal(item.name,value)));
      if(!option)throw new HttpError(422,'MASTER_OPTION_INVALID',`Choose an active configured ${category} option; retained historical values are allowed`);
      return option.name;
    });
    const unique=resolved.filter((value,index)=>resolved.findIndex(other=>equal(value,other))===index);
    input[field]=Array.isArray(input[field])?unique:unique.join(', ');
  }
  if(input.vehicleType!==undefined&&input.vehicleType!==existing.vehicleType){
    const prior=splitChoices(existing.vehicleType),options=await prisma.vehicleType.findMany({});
    input.vehicleType=splitChoices(input.vehicleType).map(value=>{
      if(prior.some(old=>equal(old,value)))return value;
      const option=options.find(item=>item.status==='Active'&&(item.id===value||equal(item.name,value)||equal(item.code,value)));
      if(!option)throw new HttpError(422,'MASTER_OPTION_INVALID','Choose an active configured vehicle type');
      return option.name;
    }).join(', ');
  }
  const location=input.workLocation??existing.workLocation,states=input.workStates??existing.workStates;
  if(location==='Other States'&&!splitChoices(states).length)throw new HttpError(422,'WORK_STATES_REQUIRED','Select at least one other work state');
  if(location==='Same State'&&!String(input.state??existing.state??'').trim())throw new HttpError(422,'ADDRESS_STATE_REQUIRED','Save the address state before choosing Same State');
  // Retain other-state selections when switching scope; only the selected scope is applied.
}
