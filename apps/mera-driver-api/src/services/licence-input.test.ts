import { describe,it,expect } from 'vitest';
import { validateLicenceInput } from './licence-input';
describe('Licence input validation',()=>{
  it.each(['up3220210123456','UP-32 2021 0123456',' up32\t20210123456 '])('normalizes formatting without modifying digits: %s',value=>{
    const input={dlNo:value};validateLicenceInput(input);expect(input.dlNo).toBe('UP3220210123456');
  });
  it.each(['UP322021012345','UP32202101234567','UP32202101234A6','123220210123456','UP-12'])('rejects incomplete/invalid new values: %s',value=>expect(()=>validateLicenceInput({dlNo:value})).toThrow());
  it('permits an empty optional draft',()=>{const input={dlNo:' '};validateLicenceInput(input);expect(input.dlNo).toBe('');});
  it('preserves unchanged legacy data, including normalized representations',()=>{
    for(const value of ['DL-12345','dl 12345']){const input={dlNo:value};validateLicenceInput(input,'DL-12345');expect(input.dlNo).toBe('DL-12345');}
    expect(()=>validateLicenceInput({dlNo:'DL-12346'},'DL-12345')).toThrow();
  });
});
