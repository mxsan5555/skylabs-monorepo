import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPrisma, resetPrismaMock } from '../test-utils/prisma-mock';
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
import { cityState, validateDriverPreferences } from './driver-preferences.service';
beforeEach(()=>{resetPrismaMock();mockPrisma.masterListItem.findMany.mockResolvedValue([{id:'full',name:'Full Time',status:'Active'},{id:'part',name:'Part Time',status:'Active'},{id:'old',name:'Retired option',status:'Inactive'}]);mockPrisma.vehicleType.findMany.mockResolvedValue([{id:'sedan',name:'Sedan',code:'SEDAN',status:'Active'}]);});
describe('existing Master-backed driver preferences',()=>{
  it('normalizes IDs and multiple names without duplicate values',async()=>{const input={jobType:'full, Part Time, Full Time',vehicleType:'SEDAN'};await validateDriverPreferences(input);expect(input).toEqual({jobType:'Full Time, Part Time',vehicleType:'Sedan'});});
  it('preserves retained inactive and unknown historical values',async()=>{const input={jobType:'Legacy job, Retired option, full'};await validateDriverPreferences(input,{jobType:'Legacy job, Retired option'});expect(input.jobType).toBe('Legacy job, Retired option, Full Time');});
  it.each(['Retired option','Unknown'])('refuses a new inactive or unknown choice: %s',async jobType=>{await expect(validateDriverPreferences({jobType})).rejects.toMatchObject({code:'MASTER_OPTION_INVALID'});});
  it('requires the actual address state for Same State',async()=>{await expect(validateDriverPreferences({workLocation:'Same State'})).rejects.toMatchObject({code:'ADDRESS_STATE_REQUIRED'});await expect(validateDriverPreferences({workLocation:'Same State',state:'Maharashtra'})).resolves.toBeUndefined();});
  it('requires states for Other States without erasing saved preferences on scope change',async()=>{await expect(validateDriverPreferences({workLocation:'Other States',workStates:[]})).rejects.toMatchObject({code:'WORK_STATES_REQUIRED'});const input={workLocation:'Same State',state:'Maharashtra'};await validateDriverPreferences(input,{workStates:['Delhi']});expect(input).not.toHaveProperty('workStates');});
  it('uses the existing geographic data and leaves unknown cities unresolved',()=>{expect(cityState('Pune')).toBe('Maharashtra');expect(cityState('Unknown city')).toBeUndefined();expect(cityState('Delhi NCR')).toBeUndefined();});
});
