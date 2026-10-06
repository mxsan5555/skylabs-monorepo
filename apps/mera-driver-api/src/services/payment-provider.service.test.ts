import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma',()=>({prisma:mockPrisma}));
vi.mock('./accounts.service',()=>({recordMovement:vi.fn().mockResolvedValue({id:'movement'})}));
import { createPayment, verifyWebhook, receiveWebhook, settleCapturedPayment, confirmPayment } from './payment-provider.service';
import { recordMovement } from './accounts.service';
beforeEach(()=>{resetPrismaMock();vi.stubEnv('RAZORPAY_KEY_ID','');vi.stubEnv('RAZORPAY_KEY_SECRET','');vi.stubEnv('RAZORPAY_WEBHOOK_SECRET','fixture-webhook-secret');vi.mocked(recordMovement).mockClear();});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const captured={id:'pay_fixture',order_id:'order_fixture',amount:100000,currency:'INR',status:'captured',captured:true,method:'upi'};
describe('trusted payment confirmation',()=>{
 it('fails clearly without gateway config before making a request',async()=>{const fetch=vi.fn();vi.stubGlobal('fetch',fetch);await expect(createPayment('u',{customerId:'c'},'b')).rejects.toMatchObject({code:'PAYMENT_UNCONFIGURED'});expect(fetch).not.toHaveBeenCalled();});
 it('verifies exact raw bytes and rejects altered bodies or absent signatures',()=>{const body=Buffer.from('{"event":"payment.captured"}');const signature=createHmac('sha256','fixture-webhook-secret').update(body).digest('hex');expect(()=>verifyWebhook(body,signature)).not.toThrow();expect(()=>verifyWebhook(Buffer.from('{}'),signature)).toThrow('Invalid webhook signature');expect(()=>verifyWebhook(body,'')).toThrow('Invalid webhook signature');});
 it.each([{...captured,status:'authorized',captured:false},{...captured,currency:'USD'},{...captured,status:'unknown'}])('never settles an unconfirmed payment %j',async data=>{await expect(settleCapturedPayment(data)).rejects.toMatchObject({code:'PAYMENT_UNCONFIRMED'});expect(recordMovement).not.toHaveBeenCalled();});
 it('requires the saved order amount to match',async()=>{mockPrisma.paymentIntent.findUnique.mockResolvedValue({amountPaise:1});await expect(settleCapturedPayment(captured)).rejects.toMatchObject({code:'PAYMENT_ORDER_MISMATCH'});});
 it('passes a captured matching payment to the idempotent ledger using provider payment ID',async()=>{mockPrisma.paymentIntent.findUnique.mockResolvedValue({id:'intent',userId:'u',bookingId:'b',driverId:null,amountPaise:100000,kind:'booking_payment'});await settleCapturedPayment(captured);expect(recordMovement).toHaveBeenCalledWith('u',expect.objectContaining({reference:'razorpay:pay_fixture',bookingId:'b',amountPaise:100000,kind:'booking_payment'}),true);expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({where:{id:'intent'},data:{status:'paid',failureReason:null}});});
 it('ignores signed unrelated events',async()=>{const body=Buffer.from('{"event":"payment.authorized"}');await receiveWebhook(body,createHmac('sha256','fixture-webhook-secret').update(body).digest('hex'));expect(recordMovement).not.toHaveBeenCalled();});
 it('cannot confirm another user’s provider payment',async()=>{vi.stubEnv('RAZORPAY_KEY_ID','fixture');vi.stubEnv('RAZORPAY_KEY_SECRET','fixture');vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>captured}));mockPrisma.paymentIntent.findFirst.mockResolvedValue(null);await expect(confirmPayment('different-user','pay_fixture','order_fixture','0'.repeat(64))).rejects.toMatchObject({status:404});expect(recordMovement).not.toHaveBeenCalled();});
});

it('rejects a forged checkout callback before any provider call',async()=>{
 vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_fixture');vi.stubEnv('RAZORPAY_KEY_SECRET','fixture-secret');
 mockPrisma.paymentIntent.findFirst.mockResolvedValue({providerOrderId:'order_fixture',userId:'u'});
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(confirmPayment('u','pay_fixture','order_fixture','0'.repeat(64))).rejects.toMatchObject({code:'PAYMENT_SIGNATURE_INVALID'});expect(fetch).not.toHaveBeenCalled();expect(recordMovement).not.toHaveBeenCalled();
});
it('validates callback signature against the owned saved order and then requires captured funds',async()=>{
 vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_fixture');vi.stubEnv('RAZORPAY_KEY_SECRET','fixture-secret');
 const intent={id:'intent',providerOrderId:'order_fixture',userId:'u',bookingId:'b',driverId:null,amountPaise:100000,kind:'booking_payment'};
 mockPrisma.paymentIntent.findFirst.mockResolvedValue(intent);mockPrisma.paymentIntent.findUnique.mockResolvedValue(intent);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>captured}));
 const signature=createHmac('sha256','fixture-secret').update('order_fixture|pay_fixture').digest('hex');
 await confirmPayment('u','pay_fixture','order_fixture',signature);expect(recordMovement).toHaveBeenCalledTimes(1);
});
it('a valid callback for authorized but uncaptured funds does not collect money',async()=>{
 vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_fixture');vi.stubEnv('RAZORPAY_KEY_SECRET','fixture-secret');mockPrisma.paymentIntent.findFirst.mockResolvedValue({providerOrderId:'order_fixture'});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({...captured,status:'authorized',captured:false})}));
 const signature=createHmac('sha256','fixture-secret').update('order_fixture|pay_fixture').digest('hex');
 await expect(confirmPayment('u','pay_fixture','order_fixture',signature)).rejects.toMatchObject({code:'PAYMENT_UNCONFIRMED'});expect(recordMovement).not.toHaveBeenCalled();
});
it('duplicate signed captured webhooks use the same idempotent ledger reference',async()=>{
 mockPrisma.paymentIntent.findUnique.mockResolvedValue({id:'i',userId:'u',bookingId:'b',amountPaise:100000,kind:'booking_payment'});
 const body=Buffer.from(JSON.stringify({event:'payment.captured',payload:{payment:{entity:captured}}}));const sig=createHmac('sha256','fixture-webhook-secret').update(body).digest('hex');
 await receiveWebhook(body,sig);await receiveWebhook(body,sig);expect(recordMovement).toHaveBeenCalledTimes(2);expect(vi.mocked(recordMovement).mock.calls.every(c=>c[1].reference==='razorpay:pay_fixture')).toBe(true);
});
it('failed events cannot downgrade paid intents and delayed capture can reconcile failed intents',async()=>{
 const body=Buffer.from(JSON.stringify({event:'payment.failed',payload:{payment:{entity:{order_id:'order_fixture',status:'failed'}}}}));await receiveWebhook(body,createHmac('sha256','fixture-webhook-secret').update(body).digest('hex'));
 expect(mockPrisma.paymentIntent.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{providerOrderId:'order_fixture',status:'pending'}}));expect(recordMovement).not.toHaveBeenCalled();
 mockPrisma.paymentIntent.findUnique.mockResolvedValue({id:'i',status:'failed',userId:'u',bookingId:'b',amountPaise:100000,kind:'booking_payment'});await settleCapturedPayment(captured);expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({where:{id:'i'},data:{status:'paid',failureReason:null}});
});

it('a definite rejected test order is failed without recording money; amount comes from saved booking',async()=>{
 vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_fixture');vi.stubEnv('RAZORPAY_KEY_SECRET','fixture-secret');mockPrisma.booking.findFirst.mockResolvedValue({farePaise:100000,status:'requested'});mockPrisma.moneyMovement.findMany.mockResolvedValue([]);mockPrisma.paymentIntent.findFirst.mockResolvedValue(null);mockPrisma.paymentIntent.create.mockResolvedValue({id:'i',amountPaise:100000});const fetch=vi.fn().mockResolvedValue({ok:false,status:401});vi.stubGlobal('fetch',fetch);
 await expect(createPayment('u',{customerId:'c'},'b')).rejects.toMatchObject({code:'PAYMENT_PROVIDER_REJECTED'});expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({amount:100000,currency:'INR',receipt:'i'});expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({where:{id:'i'},data:{status:'failed',failureReason:'PAYMENT_PROVIDER_REJECTED'}});expect(recordMovement).not.toHaveBeenCalled();
});
it('uncertain order timeout remains processing and prevents an automatic duplicate order',async()=>{
 vi.stubEnv('RAZORPAY_KEY_ID','rzp_test_fixture');vi.stubEnv('RAZORPAY_KEY_SECRET','fixture-secret');mockPrisma.booking.findFirst.mockResolvedValue({farePaise:100000,status:'requested'});mockPrisma.moneyMovement.findMany.mockResolvedValue([]);mockPrisma.paymentIntent.findFirst.mockResolvedValue(null);mockPrisma.paymentIntent.create.mockResolvedValue({id:'i',amountPaise:100000});const fetch=vi.fn().mockRejectedValue(new Error('timeout'));vi.stubGlobal('fetch',fetch);await expect(createPayment('u',{customerId:'c'},'b')).rejects.toMatchObject({code:'PAYMENT_PROVIDER_UNAVAILABLE'});expect(mockPrisma.paymentIntent.update).toHaveBeenCalledWith({where:{id:'i'},data:{failureReason:'PAYMENT_PROVIDER_UNAVAILABLE'}});mockPrisma.paymentIntent.findFirst.mockResolvedValue({id:'i',amountPaise:100000,status:'processing',providerOrderId:null});await expect(createPayment('u',{customerId:'c'},'b')).rejects.toMatchObject({code:'PAYMENT_RECONCILIATION_REQUIRED'});expect(fetch).toHaveBeenCalledTimes(1);expect(recordMovement).not.toHaveBeenCalled();
});
