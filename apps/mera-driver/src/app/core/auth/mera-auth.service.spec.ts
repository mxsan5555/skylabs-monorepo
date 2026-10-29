import { TestBed } from '@angular/core/testing';
import { vi, afterEach, expect, it } from 'vitest';
import { AuthService, provideSharedAuth } from '@skylabs-monorepo/shared-auth/angular';
import { MeraAuthService } from './mera-auth.service';

function token(sub: string) { return `e30.${btoa(JSON.stringify({sub,exp:Math.floor(Date.now()/1000)+3600})).replace(/=/g,'')}.signature`; }
function response(id:string,permissions:string[]) { return new Response(JSON.stringify({data:{user:{id,name:id,status:'active'},roles:[],permissions,menu:[],dashboardWidgets:[]},error:null}),{status:200,headers:{'Content-Type':'application/json'}}); }
afterEach(()=>{TestBed.resetTestingModule();localStorage.clear();vi.unstubAllGlobals();});
it('fences late bootstrap data from an account that logged out before a new sign-in',async()=>{
  let firstResolve!: (value:Response)=>void;
  const delayed=new Promise<Response>(resolve=>firstResolve=resolve);
  const fetchMock=vi.fn().mockReturnValueOnce(delayed).mockImplementation(()=>Promise.resolve(response('second',['customers:view'])));vi.stubGlobal('fetch',fetchMock);
  TestBed.configureTestingModule({providers:[provideSharedAuth({appPrefix:'rbac_isolation',apiBaseUrl:'http://localhost/api'}),{provide:AuthService,useClass:MeraAuthService}]});
  const auth=TestBed.inject(AuthService);
  const oldLogin=auth.signIn(token('first'));
  auth.signOut();await auth.signIn(token('second'));
  expect(auth.bootstrap()?.user.id).toBe('second');
  firstResolve(response('first',['rbac.roles:edit']));await oldLogin;
  expect(auth.bootstrap()?.user.id).not.toBe('first');expect(auth.can('rbac.roles','edit')).toBe(false);
  await auth.refreshBootstrap();expect(auth.bootstrap()?.user.id).toBe('second');expect(auth.can('customers','view')).toBe(true);
  auth.signOut();
});
it('restores the current account when an old token renewal completes after logout/login',async()=>{
  let rotateResolve!: (value:Response)=>void;
  const rotation=new Promise<Response>(resolve=>rotateResolve=resolve);
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    if(url.includes('/auth/refresh'))return rotation;
    if(url.includes('/auth/logout'))return Promise.resolve(new Response(JSON.stringify({data:{},error:null}),{status:200}));
    const bearer=(init?.headers as Record<string,string>)?.['Authorization']??'';
    const id=JSON.parse(atob(bearer.split('.')[1])).sub;
    return Promise.resolve(response(id,id==='first'?['rbac.roles:edit']:['customers:view']));
  }));
  TestBed.configureTestingModule({providers:[provideSharedAuth({appPrefix:'rbac_isolation',apiBaseUrl:'http://localhost/api'}),{provide:AuthService,useClass:MeraAuthService}]});
  const auth=TestBed.inject(AuthService);await auth.signIn(token('first'),'refresh-first');
  const pending=auth.ensureValidToken({force:true});auth.signOut();const second=token('second');await auth.signIn(second,'refresh-second');
  rotateResolve(new Response(JSON.stringify({data:{accessToken:token('first'),refreshToken:'rotated-first'},error:null}),{status:200}));
  expect(await pending).toBe(second);expect(auth.bootstrap()?.user.id).toBe('second');expect(auth.can('rbac.roles','edit')).toBe(false);
  expect(localStorage.getItem('rbac_isolation_auth_refresh_token')).toBe('refresh-second');auth.signOut();
});
