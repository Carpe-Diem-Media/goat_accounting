import { describe, expect, test } from 'bun:test';
import { calculateEstimate } from '../../domain/estimator/estimate';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';
import { fingerprintDraft, runPricingCorpus } from './run-pricing-corpus';

const draft=()=>({...structuredClone(TEST_PRICING_MODEL),state:'DRAFT' as const});
const scenario=CANONICAL_PRICING_TEST_CORPUS[0];
const expected={catchup:{minCents:50,maxCents:100},ongoing:{minCents:40,maxCents:80},ruleCodes:['BIZ-BASE-CATCHUP','BIZ-ENTITY-TYPE','BIZ-RECORD-CONDITION','BIZ-TAX-POSITION','BIZ-TRANSACTION-VOLUME','BIZ-FINANCIAL-ACCOUNTS','BIZ-EMPLOYEE-COUNT','BIZ-ONGOING-SERVICE'],confidence:'high',manualReviewRequired:false,reviewFlagCodes:[]};
const personal=CANONICAL_PRICING_TEST_CORPUS.find(item=>item.id==='personal-salaried-taxpayer')!;
const personalCodes=['PERSONAL-BASE-CATCHUP','PERSONAL-CURRENT-STATUS','PERSONAL-INCOME-SOURCE','PERSONAL-SARS-POSITION','PERSONAL-BASE-ONGOING','PERSONAL-ONGOING-SERVICE'];
const personalExpected={catchup:{minCents:10,maxCents:20},ongoing:{minCents:15,maxCents:30},ruleCodes:personalCodes,confidence:'high',manualReviewRequired:false,reviewFlagCodes:[]};
const highRisk=CANONICAL_PRICING_TEST_CORPUS.find(item=>item.id==='high-risk-sars-dispute')!;
const highRiskExpected={catchup:{minCents:220,maxCents:490},ongoing:{minCents:40,maxCents:90},ruleCodes:personalCodes,confidence:'preliminary',manualReviewRequired:true,reviewFlagCodes:['personal_high_risk_sars_position','urgent_deadline']};
const combinedAnswers={...scenario.answers,...personal.answers,calculatorType:'both'};
const examples=[{id:scenario.id,answers:scenario.answers,expected},{id:personal.id,answers:personal.answers,expected:personalExpected},{id:'combined',answers:combinedAnswers,expected:{...expected,catchup:{minCents:60,maxCents:120},ongoing:{minCents:55,maxCents:110},ruleCodes:[...expected.ruleCodes,...personalCodes]}},{id:highRisk.id,answers:highRisk.answers,expected:highRiskExpected}];
describe('candidate acceptance',()=>{
 test('accepts independently supplied synthetic expectations without changing the public guard',async()=>{
  const model=draft(); const fingerprint=await fingerprintDraft(model);
  const report=await runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'synthetic-1',scenarios:examples});
  expect(report.passed).toBe(true); expect(report.fingerprint).toBe(fingerprint);
  expect(()=>calculateEstimate(scenario.answers,model as typeof TEST_PRICING_MODEL)).toThrow('active');
 });
 test('rejects missing, stale and malformed manifests and reports mismatches',async()=>{
  const model=draft(); const fingerprint=await fingerprintDraft(model);
  await expect(runPricingCorpus(model,null)).rejects.toThrow();
  await expect(runPricingCorpus(model,{modelId:model.id,definitionFingerprint:'0'.repeat(64),revision:'test',scenarios:examples})).rejects.toThrow();
  await expect(runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'test',scenarios:[]})).rejects.toThrow();
  await expect(runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'test',scenarios:[examples[0]]})).rejects.toThrow();
  const report=await runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'test',scenarios:[{...examples[0],expected:{...expected,confidence:'preliminary'}},...examples.slice(1)]});
  expect(report.passed).toBe(false); expect(report.scenarios[0].failures).toContain('confidence');
 });
 test('fingerprints disabled rules and enabled state', async()=>{
  const model=draft(); const flags=model.rules.map(()=>true); flags[0]=false;
  const first=await fingerprintDraft(model,flags);
  model.rules[0].label='Changed disabled rule';
  expect(await fingerprintDraft(model,flags)).not.toBe(first);
  expect(await fingerprintDraft(draft())).not.toBe(first);
 });
});
