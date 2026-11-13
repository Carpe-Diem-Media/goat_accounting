import { validatePricingModel, type PricingModel } from '../../domain/pricing/model';

const editableFields: Record<string, readonly string[]> = {
 FIXED_RANGE: ['range'], BAND_RANGE: ['bands'], PER_UNIT_RANGE: ['unitRange', 'unknownRange'],
 PER_PERIOD_RANGE: ['unitRange', 'unknownRange'], SERVICE_ADDON_RANGE: ['addOns'],
 COMPLEXITY_SCORE: ['pointsByValue'], CONFIDENCE_WEIGHT: ['pointsByValue', 'missingPoints'], REVIEW_TRIGGER: ['condition']
};
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Validate an entire draft and reject changes to rule identity and decision logic. */
export function validateDraftUpdate(currentInput: unknown, proposedInput: unknown): PricingModel {
 const current=validatePricingModel(currentInput);
 const proposed=validatePricingModel(proposedInput);
 if(current.state !== 'DRAFT' || proposed.state !== 'DRAFT') throw new Error('Only draft pricing models can be edited.');
 if(!equal([current.id,current.version,current.engineVersion,current.currency], [proposed.id,proposed.version,proposed.engineVersion,proposed.currency]) || current.rules.length !== proposed.rules.length) throw new Error('Pricing model identity cannot change.');
 for(let i=0;i<current.rules.length;i++) {
  const before=current.rules[i] as unknown as Record<string, unknown>;
  const after=proposed.rules[i] as unknown as Record<string, unknown>;
  if(before.type !== after.type || typeof before.type !== 'string') throw new Error('Pricing rule type cannot change.');
  const allowed = new Set(['label',...editableFields[before.type]]);
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
   if(!allowed.has(key) && !equal(before[key],after[key])) throw new Error(`Pricing rule ${key} cannot change.`);
  }
  for(const key of ['bands','addOns','pointsByValue']) {
   if(!allowed.has(key)) continue;
   const a=before[key] as Array<{value:string}> | undefined, b=after[key] as Array<{value:string}> | undefined;
   if(!Array.isArray(a) || !Array.isArray(b) || !equal(a.map(x=>x.value),b.map(x=>x.value))) throw new Error('Pricing options cannot change.');
  }
  if(before.type==='REVIEW_TRIGGER') {
   const previous=before.condition as Record<string,unknown>, next=after.condition as Record<string,unknown>;
   if(previous.type==='NUMERIC_AT_LEAST' && next.type==='NUMERIC_AT_LEAST') {
    if(previous.inputKey!==next.inputKey) throw new Error('Review input cannot change.');
   } else if(!equal(previous,next)) throw new Error('Review condition cannot change.');
  }
 }
 return proposed;
}

type DraftRule = { id: string; enabled: boolean; rule: PricingModel['rules'][number] };
type DraftRepository = {
 readDraft(id: string): Promise<{revision: number; model: PricingModel; rules: DraftRule[]} | null>;
 saveDraft(input: {modelId:string; actorId:string; revision:number; high:number; good:number; rules:{id:string; label:string; enabled:boolean; parameters:Record<string, unknown>; conditions:Record<string, unknown>}[]}): Promise<number>;
};

/** The caller must verify active admin access and current AAL2 before creating the repository. */
export async function updatePricingDraft(repo: DraftRepository, id: string, revision: number, proposed: unknown, enabled: unknown, actor: string): Promise<number> {
 if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid draft revision.');
 const current = await repo.readDraft(id);
 if (!current || current.model.state !== 'DRAFT') throw new Error('Draft unavailable.');
 if (current.revision !== revision) throw new Error('Pricing draft changed.');
 const model = validateDraftUpdate(current.model, proposed);
 if (!Array.isArray(enabled) || enabled.length !== current.rules.length || !enabled.every(value => typeof value === 'boolean')) throw new Error('Invalid rule selection.');
 validatePricingModel({ ...model, rules: model.rules.filter((_rule,index) => enabled[index]) });
 const rules = model.rules.map((rule,index) => {
  const fields = rule as unknown as Record<string, unknown>;
  const parameters = Object.fromEntries(Object.entries(fields).filter(([key]) => !['type','scope','category','code','label','explanation','inputKey','when','condition'].includes(key)));
  const conditions=fields.when ? {when:fields.when} : fields.condition ? {condition:fields.condition} : {};
  return { id: current.rules[index].id, label: rule.label, enabled: enabled[index] as boolean, parameters, conditions };
 });
 return repo.saveDraft({modelId:id,actorId:actor,revision,high:model.confidenceThresholds.highMaxPoints,good:model.confidenceThresholds.goodMaxPoints,rules});
}
