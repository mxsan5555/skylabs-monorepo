import { httpErrorMessage } from './http-error';
describe('binary HTTP errors',()=>{
  it('shows the actual route error returned as a Blob',async()=>expect(await httpErrorMessage({status:404,error:new Blob([JSON.stringify({error:{message:'No route for GET /drivers/d/profile.pdf'}})])})).toBe('HTTP 404: No route for GET /drivers/d/profile.pdf'));
  it('preserves forbidden and provider errors instead of guessing permissions',async()=>{expect(await httpErrorMessage({status:403,error:{error:{message:'Forbidden'}}})).toBe('HTTP 403: Forbidden');expect(await httpErrorMessage({status:503,error:{error:{message:'PDF renderer unavailable'}}})).toBe('HTTP 503: PDF renderer unavailable');});
});
