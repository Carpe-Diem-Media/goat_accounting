import { describe, expect, test } from 'bun:test';
import { TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';
import { validateDraftUpdate } from './update-pricing-draft';

const draft = () => structuredClone({...TEST_PRICING_MODEL,state:'DRAFT' as const});
describe('draft updates', () => {
 test('accepts a validated commercial range change', () => {
  const before=draft(), after=draft();
  const rule=after.rules[0]; if(rule.type!=='FIXED_RANGE') throw new Error('fixture changed');
  rule.range={minCents:1,maxCents:3};
  expect(validateDraftUpdate(before,after).rules[0]).toEqual(rule);
 });
 test('rejects identity, executable condition and invalid range changes', () => {
  const before=draft(), identity=draft(), invalid=draft();
  identity.rules[0].code='other';
  expect(() => validateDraftUpdate(before,identity)).toThrow();
  const rule=invalid.rules[0]; if(rule.type!=='FIXED_RANGE') throw new Error('fixture changed');
  rule.range={minCents:3,maxCents:1};
  expect(() => validateDraftUpdate(before,invalid)).toThrow();
  const active={...before,state:'ACTIVE'};
  expect(() => validateDraftUpdate(active,invalid)).toThrow();
 });
 test('rejects changing conditions, input keys and option identities', () => {
  const before=draft(), after=draft();
  const band=after.rules.find(rule=>rule.type==='BAND_RANGE');
  if(!band || band.type!=='BAND_RANGE') throw new Error('fixture changed');
  band.bands[0].value='forged';
  expect(()=>validateDraftUpdate(before,after)).toThrow();
 });
});

test('rejects stale revisions without writing and saves a validated whole aggregate', async () => {
 const { updatePricingDraft } = await import('./update-pricing-draft');
 const model=draft(); const rules=model.rules.map((rule,index)=>({id:`rule-${index}`,enabled:true,rule}));
 let writes=0;
 const repo={ readDraft:async()=>({revision:3,model,rules}), saveDraft:async()=>{writes++;return 4;} };
 await expect(updatePricingDraft(repo,'model',2,model,rules.map(()=>true),'actor')).rejects.toThrow('changed');
 expect(writes).toBe(0);
 expect(await updatePricingDraft(repo,'model',3,model,rules.map(()=>true),'actor')).toBe(4);
 expect(writes).toBe(1);
});
