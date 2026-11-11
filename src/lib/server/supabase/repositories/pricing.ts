import { z } from 'zod';
import { validatePricingModel } from '../../../domain/pricing/model';
import type { Database, Json } from '../database.types';
import type { EstimatorServiceClient } from '../repository.server';

export class PricingVersionConflictError extends Error {}
export class PricingDraftConflictError extends Error {}

type ModelRow = Database['estimator']['Tables']['pricing_models']['Row'];
type RuleRow = Database['estimator']['Tables']['pricing_rules']['Row'];
function fields(value: Json): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid persisted pricing rule.');
 return value as Record<string, unknown>;
}

export function createPricingRepository(client: EstimatorServiceClient) {
 return {
  async readDraft(id: string) {
   const { data, error } = await client.from('pricing_models').select('*, pricing_rules(*)').eq('id',id).maybeSingle();
   if (error) throw new Error('Unable to load pricing model.');
   if (!data) return null;
   const row = data as unknown as ModelRow & { pricing_rules: RuleRow[] };
   const ordered = [...row.pricing_rules].sort((a,b) => a.sort_order - b.sort_order);
   const rawRules = ordered.map(rule => {
    const result: Record<string, unknown> = {type:rule.rule_type, scope:rule.scope, category:rule.category, code:rule.code, label:rule.label, explanation:rule.explanation};
    if (rule.input_key !== null) result.inputKey = rule.input_key;
    for (const part of [fields(rule.conditions),fields(rule.parameters)]) for (const [key,value] of Object.entries(part)) {
     if (Object.hasOwn(result,key)) throw new Error('Duplicate persisted pricing field.');
     result[key]=value;
    }
    return result;
   });
   const model=validatePricingModel({id:row.id,version:row.version,engineVersion:row.engine_contract_version,currency:row.currency,state:row.state,confidenceThresholds:{highMaxPoints:row.confidence_high_max_points,goodMaxPoints:row.confidence_good_max_points},rules:rawRules});
   return {revision:row.draft_revision,model,createdAt:row.created_at,activatedAt:row.activated_at,retiredAt:row.retired_at,checksum:row.checksum,rules:ordered.map((rule,index)=>({id:rule.id,enabled:rule.enabled,rule:model.rules[index]}))};
  },
  async saveDraft(input: {modelId:string; actorId:string; revision:number; high:number; good:number; rules:{id:string; label:string; enabled:boolean; parameters:Record<string, unknown>; conditions:Record<string, unknown>}[]}) {
   const {data,error}=await client.rpc('save_pricing_draft',{p_model_id:input.modelId,p_actor_user_id:input.actorId,p_expected_revision:input.revision,p_high_max_points:input.high,p_good_max_points:input.good,p_rules:input.rules as Json});
   if (error?.code === '40001') throw new PricingDraftConflictError();
   if (error) throw new Error('Unable to save pricing draft.');
   return z.number().int().safe().nonnegative().parse(data);
  },
  /** Call only after the server has verified active admin access and AAL2. */
  async clone(source: string, version: string, actor: string): Promise<string> {
   const { data, error } = await client.rpc('clone_pricing_model', {
    p_source_id: source, p_version: version, p_actor_user_id: actor
   });
   if (error?.code === '23505') throw new PricingVersionConflictError();
   if (error) throw new Error('Unable to clone pricing model.');
   return z.uuid().parse(data);
  }
 };
}
