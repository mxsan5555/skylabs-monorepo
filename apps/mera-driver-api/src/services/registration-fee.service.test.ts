import {describe,expect,it} from 'vitest';
import {registrationFeeBalance} from './registration-fee.service';

const movement=(kind:string,amountPaise:number)=>({kind,amountPaise}) as never;
describe('registration fee balance',()=>{
  it('uses confirmed movements for partial, refunded and settled amounts',()=>{
    expect(registrationFeeBalance({registrationFeePaise:50000},[movement('registration_payment',20000)])).toMatchObject({fee:'Partial',netReceivedPaise:20000,remainingPaise:30000});
    expect(registrationFeeBalance({registrationFeePaise:50000},[movement('registration_payment',50000),movement('registration_refund',10000)])).toMatchObject({fee:'Partial',netReceivedPaise:40000,remainingPaise:10000});
    expect(registrationFeeBalance({registrationFeePaise:50000},[movement('registration_payment',50000)])).toMatchObject({fee:'Paid',remainingPaise:0});
  });
  it('distinguishes a full waiver, a partial waiver and a zero fee without inventing a receipt',()=>{
    expect(registrationFeeBalance({registrationFeePaise:50000},[movement('registration_waiver',50000)])).toMatchObject({fee:'Waived',receivedPaise:0,remainingPaise:0});
    expect(registrationFeeBalance({registrationFeePaise:50000},[movement('registration_payment',10000),movement('registration_waiver',20000)])).toMatchObject({fee:'Partial',receivedPaise:10000,remainingPaise:20000});
    expect(registrationFeeBalance({registrationFeePaise:0},[])).toMatchObject({fee:'No fee required',receivedPaise:0,remainingPaise:0});
  });
});
