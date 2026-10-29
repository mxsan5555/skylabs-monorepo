import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { driverReportHtml } from './driver-report.service';
beforeEach(() => { resetPrismaMock(); mockPrisma.driverKycCheck.findMany.mockResolvedValue([]); mockPrisma.driverKycDecision.findMany.mockResolvedValue([]); });
describe('backend profile report', () => {
  it('embeds a saved photo once and describes its field/history without printing binary payloads as text',async()=>{
    const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4V8AAAAASUVORK5CYII=';
    mockPrisma.driver.findUnique.mockResolvedValue({id:'driver',firstName:'Ravi',avatar:photo,completedSubSteps:[],documents:[]});
    mockPrisma.driverKycDecision.findMany.mockResolvedValue([{itemKey:'field:avatar',status:'Pass',submittedValue:photo,reviewerId:'reviewer'}]);
    const html=await driverReportHtml('driver');expect(html.split(photo)).toHaveLength(2);expect(html).toContain('Embedded photo (image/png, 68 bytes)');expect(html).toContain('Saved driver photo embedded.');
  });
  it.each([{ completedSubSteps: [] }, { completedSubSteps: [10,11,12,13,20,21,30,31,32,40,41] }])('includes every pill for partial/full driver %j', async ({ completedSubSteps }) => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver', firstName: 'Ravi', lastName: null, completedSubSteps, completionPercentage: completedSubSteps.length ? 100 : 0, education: 'Graduate', bloodGroup: 'O+', dlNo: 'DL1420110012345', bankName: 'Bank', passportNumber: 'Legacy passport', documents: [{ id: 'doc', type: 'PAN', category: 'personal', fileName: 'pan.pdf', createdAt: new Date('2026-09-01'), mimeType: 'application/pdf', sizeBytes: 1200 }] });
    const report = await driverReportHtml('driver', new Date('2026-09-30'));
    for (const heading of ['Personal &amp; Identity Details', 'Contact &amp; Address Info', 'Physical &amp; Demographics', 'Account &amp; Lead Info', 'Education &amp; Training Profile', 'Health &amp; Medical Specifications', 'Driving License Details', 'Police Verification &amp; Employment', 'Personal &amp; Category Docs', 'Account Details', 'Registration Fees']) expect(report).toContain(heading);
    for (const value of ['Graduate', 'O+', 'DL1420110012345', 'Legacy passport', 'pan.pdf', '2026-09-01', '2026-09-30']) expect(report).toContain(value);
    expect(report).not.toContain('undefined'); expect(report).toContain('Not provided');
    expect(report).toContain('Documents are not embedded');
  });
  it('escapes submitted HTML and decision reasons', async () => {
    mockPrisma.driver.findUnique.mockResolvedValue({ id: 'driver', firstName: '<script>alert(1)</script>', completedSubSteps: [], documents: [] });
    mockPrisma.driverKycDecision.findMany.mockResolvedValue([{ itemKey: 'field:firstName', status: 'Issue', reason: '<img onerror=alert(1)>', reviewerId: 'reviewer', submittedValue: 'old' }]);
    const report = await driverReportHtml('driver');
    expect(report).not.toContain('<script>'); expect(report).not.toContain('<img onerror');
    expect(report).toContain('&lt;script&gt;');
  });
});
