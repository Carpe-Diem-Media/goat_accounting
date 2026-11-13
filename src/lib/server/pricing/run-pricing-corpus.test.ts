import { describe, expect, test } from 'bun:test';
import { calculateEstimate } from '../../domain/estimator/estimate';
import type { CanonicalEstimatorAnswers } from '../../domain/estimator/answer-schema';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../domain/pricing/test-corpus';
import { fingerprintDraft, runPricingCorpus } from './run-pricing-corpus';

const draft=()=>({...structuredClone(TEST_PRICING_MODEL),state:'DRAFT' as const});
const scenario=CANONICAL_PRICING_TEST_CORPUS.find(item=>item.id==='simple-current-sole-proprietor')!;
if(scenario.answers.calculatorType!=='business') throw new Error('Expected business test fixture.');
type Expected={catchup:{minCents:number;maxCents:number};ongoing:{minCents:number;maxCents:number};ruleCodes:string[];confidence:'high'|'good'|'preliminary';manualReviewRequired:boolean;reviewFlagCodes:string[]};
type Scenario={id:string;answers:CanonicalEstimatorAnswers;expected:Expected};
const expected:Expected={catchup:{minCents:50,maxCents:100},ongoing:{minCents:40,maxCents:80},ruleCodes:['BIZ-BASE-CATCHUP','BIZ-ENTITY-TYPE','BIZ-RECORD-CONDITION','BIZ-TAX-POSITION','BIZ-TRANSACTION-VOLUME','BIZ-FINANCIAL-ACCOUNTS','BIZ-EMPLOYEE-COUNT','BIZ-ONGOING-SERVICE'],confidence:'high',manualReviewRequired:false,reviewFlagCodes:[]};
const personal=CANONICAL_PRICING_TEST_CORPUS.find(item=>item.id==='personal-salaried-taxpayer')!;
if(personal.answers.calculatorType!=='personal') throw new Error('Expected personal test fixture.');
const personalCodes=['PERSONAL-BASE-CATCHUP','PERSONAL-CURRENT-STATUS','PERSONAL-INCOME-SOURCE','PERSONAL-SARS-POSITION','PERSONAL-BASE-ONGOING','PERSONAL-ONGOING-SERVICE'];
const personalExpected:Expected={catchup:{minCents:10,maxCents:20},ongoing:{minCents:15,maxCents:30},ruleCodes:personalCodes,confidence:'high',manualReviewRequired:false,reviewFlagCodes:[]};
const highRisk=CANONICAL_PRICING_TEST_CORPUS.find(item=>item.id==='high-risk-sars-dispute')!;
if(highRisk.answers.calculatorType!=='personal') throw new Error('Expected personal risk fixture.');
const highRiskExpected:Expected={catchup:{minCents:220,maxCents:490},ongoing:{minCents:40,maxCents:90},ruleCodes:personalCodes,confidence:'preliminary',manualReviewRequired:true,reviewFlagCodes:['personal_high_risk_sars_position','urgent_deadline']};
const combinedAnswers={...scenario.answers,...personal.answers,calculatorType:'both' as const};
const examples:Scenario[]=[{id:scenario.id,answers:scenario.answers,expected},{id:personal.id,answers:personal.answers,expected:personalExpected},{id:'combined',answers:combinedAnswers,expected:{...expected,catchup:{minCents:60,maxCents:120},ongoing:{minCents:55,maxCents:110},ruleCodes:[...expected.ruleCodes,...personalCodes]}},{id:highRisk.id,answers:highRisk.answers,expected:highRiskExpected}];
const fullSyntheticCorpus:Scenario[]=CANONICAL_PRICING_TEST_CORPUS.map(item=>({
 id:item.id,answers:item.answers,expected:{
  catchup:{minCents:item.expected.catchup.minCents,maxCents:item.expected.catchup.maxCents},
  ongoing:{minCents:item.expected.ongoing.minCents,maxCents:item.expected.ongoing.maxCents},
  ruleCodes:[...new Set([...item.expected.catchup.lineItemCodes,...item.expected.ongoing.lineItemCodes].map(code=>code.split('.')[0]))],
  confidence:item.expected.confidence,manualReviewRequired:item.expected.manualReviewRequired,reviewFlagCodes:item.expected.reviewFlagCodes
 }
}));
describe('candidate acceptance',()=>{
 test('accepts the full independently expected corpus without changing the public guard',async()=>{
  const model=draft(); const fingerprint=await fingerprintDraft(model);
  const scenarios=[...fullSyntheticCorpus,examples.find(item=>item.id==='combined')!];
  const report=await runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'synthetic-1',scenarios});
  expect(report.passed).toBe(true); expect(report.fingerprint).toBe(fingerprint); expect(report.scenarios).toHaveLength(scenarios.length);
  expect(()=>calculateEstimate(scenario.answers,model as typeof TEST_PRICING_MODEL)).toThrow('active');
 });
 test('rejects manifests with only business, personal and combined branch coverage',async()=>{
  const model=draft(); const fingerprint=await fingerprintDraft(model);
  const undercovered={modelId:model.id,definitionFingerprint:fingerprint,revision:'synthetic-undercovered',scenarios:examples};
  await expect(runPricingCorpus(model,undercovered)).rejects.toThrow(/required scenario coverage/i);
 });
 test('rejects missing, stale and malformed manifests and reports mismatches',async()=>{
  const model=draft(); const fingerprint=await fingerprintDraft(model);
  await expect(runPricingCorpus(model,null)).rejects.toThrow();
  await expect(runPricingCorpus(model,{modelId:model.id,definitionFingerprint:'0'.repeat(64),revision:'test',scenarios:examples})).rejects.toThrow();
  await expect(runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'test',scenarios:[]})).rejects.toThrow();
  await expect(runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'test',scenarios:[...fullSyntheticCorpus.slice(0,1),examples.find(item=>item.id==='combined')!]})).rejects.toThrow();
  const scenarios=fullSyntheticCorpus.map(item=>item.id===scenario.id?{...item,expected:{...item.expected,confidence:'preliminary'}}:item);
  scenarios.push(examples.find(item=>item.id==='combined')!);
  const report=await runPricingCorpus(model,{modelId:model.id,definitionFingerprint:fingerprint,revision:'test',scenarios});
  expect(report.passed).toBe(false); expect(report.scenarios.find(item=>item.id===scenario.id)?.failures).toContain('confidence');
 });
 test('fingerprints disabled rules and enabled state', async()=>{
  const model=draft(); const flags=model.rules.map(()=>true); flags[0]=false;
  const first=await fingerprintDraft(model,flags);
  model.rules[0].label='Changed disabled rule';
  expect(await fingerprintDraft(model,flags)).not.toBe(first);
  expect(await fingerprintDraft(draft())).not.toBe(first);
 });
});
