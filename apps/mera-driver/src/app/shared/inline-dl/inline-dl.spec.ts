import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineDl } from './inline-dl';
import { DlVerificationApi, DlState, dlInputError, dlPresentation } from '../../core/drivers/dl-verification-api.service';

// Restricted DTO fixtures exercise UI behavior only. They are not IDSPay responses.
const base:DlState={enabled:false,status:'Not checked',reason:'Verify the saved driving licence.',inputs:{dlNo:'UP5320260001705',dob:'2004-04-24'},checkedAt:null,providerCalled:false,validFrom:null,validTo:null,history:[]};
const confirmed:DlState={...base,enabled:true,identityMatch:true,status:'API verified',providerCalled:true,validFrom:'2026-01-01',validTo:'2099-01-01',checkedAt:'2026-10-05T00:00:00Z'};
describe('inline licence presentation (DTO fixtures, no live provider)',()=>{
  it('requires DOB and real calendar dates before any check',()=>{expect(dlInputError('UP5320260001705','')).toBe('Please complete Date of Birth in Personal Details');expect(dlInputError('UP5320260001705','2001-02-29')).toContain('valid Date');expect(dlInputError('UP53','2004-04-24')).toContain('complete');});
  it('shows a tick only with confirmed enabled identity and current valid expiry',()=>{expect(dlPresentation(confirmed).label).toBe('DL Verified');for(const change of [{enabled:false},{identityMatch:null},{validTo:null},{validTo:'2099-02-30'},{providerCalled:false}])expect(dlPresentation({...confirmed,...change}).label).not.toBe('DL Verified');});
  it('keeps expired, explicit no-record and mismatch separate from unavailable errors',()=>{expect(dlPresentation({...confirmed,validTo:'2000-01-01'}).label).toBe('Licence expired');expect(dlPresentation({...confirmed,status:'Invalid / no record found'}).label).toBe('No licence record found');expect(dlPresentation({...confirmed,status:'Mismatch/Invalid'}).label).toContain('mismatch');for(const status of ['Provider failed','Manual review required','Unknown'])expect(dlPresentation({...base,status}).label).toBe('Verification unavailable · Retry');});
});
describe('read-only saved licence status in onboarding',()=>{
 let api:{state:ReturnType<typeof vi.fn>;check:ReturnType<typeof vi.fn>};
 beforeEach(()=>{api={state:vi.fn(()=>of(confirmed)),check:vi.fn()};TestBed.configureTestingModule({imports:[InlineDl],providers:[{provide:DlVerificationApi,useValue:api}]});});
 function create(){const f=TestBed.createComponent(InlineDl);f.componentRef.setInput('driverId','driver-a');f.componentRef.setInput('dlNo',base.inputs.dlNo);f.componentRef.setInput('dob',base.inputs.dob);f.detectChanges();TestBed.tick();return f;}
 it('renders saved status without a check or consent button and never verifies changed input',()=>{const f=create();expect(f.componentInstance.presentation().label).toBe('DL Verified');f.componentRef.setInput('dlNo','UP5320260001706');f.detectChanges();TestBed.tick();expect(f.componentInstance.presentation().label).toBe('Not checked');expect(api.check).not.toHaveBeenCalled();expect(f.nativeElement.querySelector('md-text-button,md-outlined-button')).toBeNull();});
 it('invalidates the tick on DOB changes without writing data',()=>{const f=create();f.componentRef.setInput('dob','2004-04-25');f.detectChanges();TestBed.tick();expect(f.componentInstance.currentState()).toBeNull();expect(api.check).not.toHaveBeenCalled();});
 it('ignores delayed state from a previously opened driver',()=>{const delayed=new Subject<DlState>();api.state.mockReturnValueOnce(delayed);const f=create();f.componentRef.setInput('driverId','driver-b');api.state.mockReturnValue(of({...base}));f.detectChanges();TestBed.tick();delayed.next(confirmed);expect(f.componentInstance.presentation().label).toBe('Not checked');});
 it('has no consent or OTP controls for an owner even when never checked',()=>{api.state.mockReturnValue(of(base));const f=create();f.componentRef.setInput('own',true);f.detectChanges();TestBed.tick();expect(f.nativeElement.querySelector('input[type=checkbox],md-outlined-button')).toBeNull();expect(f.nativeElement.textContent).not.toContain('Driver consent required');expect(api.check).not.toHaveBeenCalled();f.destroy();});
});
