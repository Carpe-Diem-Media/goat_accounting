import { describe, expect, test } from 'bun:test';
import { createHmac, randomBytes } from 'node:crypto';
import { chromium, expect as browserExpect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { CANONICAL_PRICING_TEST_CORPUS, TEST_PRICING_MODEL } from '../../src/lib/domain/pricing/test-corpus';
import { task12Local } from './task12-local';

const enabled=Bun.env.GOAT_TASK12_BROWSER_TESTS==='1';
function totp(secret:string) {
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits='';
 for(const char of secret.replace(/=+$/,'').toUpperCase()) {const n=alphabet.indexOf(char);if(n<0) throw Error('Invalid test OTP secret.');bits+=n.toString(2).padStart(5,'0');}
 const bytes=Buffer.from((bits.match(/.{8}/g)??[]).map(x=>parseInt(x,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hmac=createHmac('sha1',bytes).update(counter).digest();const offset=hmac[hmac.length-1]&15;return String((hmac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
describe.skipIf(!enabled)('pricing administration browser acceptance',()=>{
 test('admin AAL2 clones and saves a draft, while AAL1 is denied',async()=>{
  const config=await task12Local();const api=new URL(config.API_URL);
  if(api.hostname!=='127.0.0.1'||api.port!=='58321')throw Error('Unexpected test API target.');
  const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const password=randomBytes(24).toString('base64url'), email=`task12-${crypto.randomUUID()}@example.invalid`;
  const created=await service.auth.admin.createUser({email,password,email_confirm:true});if(created.error||!created.data.user)throw Error('Could not create synthetic test user.');
  const actor=created.data.user.id, modelId=crypto.randomUUID(), version=`910000.0.0+${crypto.randomUUID().replaceAll('-','')}`;
  const quote=(v:unknown)=>`'${String(v).replaceAll("'","''")}'`;
  const sql=async(statement:string)=>{const p=Bun.spawn(['psql',config.DB_URL,'-X','-At','-q','-v','ON_ERROR_STOP=1','-c',statement],{stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(`Local fixture SQL failed: ${err}`);return out;};
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try {
   const inserts=TEST_PRICING_MODEL.rules.map((rule,index)=>{const {type,scope,category,code,label,explanation,...rest}=rule;const {inputKey,when,condition,...params}=rest as Record<string,unknown>;const conditions=when?{when}:condition?{condition}:{};return `INSERT INTO estimator.pricing_rules(pricing_model_id,code,label,scope,category,rule_type,input_key,explanation,conditions,parameters,enabled,sort_order) VALUES ('${modelId}',${quote(code.toLowerCase().replaceAll('-','_'))},${quote(label)},${quote(scope)},${quote(category)},${quote(type)},${inputKey?quote(inputKey):'NULL'},${quote(explanation)},${quote(JSON.stringify(conditions))}::jsonb,${quote(JSON.stringify(params))}::jsonb,true,${index});`;}).join('\n');
   await sql(`BEGIN; INSERT INTO estimator.staff_users(user_id,role,state) VALUES ('${actor}','admin','ACTIVE'); INSERT INTO estimator.pricing_models(id,version,name,engine_contract_version,confidence_high_max_points,confidence_good_max_points,created_by) VALUES ('${modelId}',${quote(version)},'Synthetic browser fixture','1.0.0',0,1,'${actor}'); ${inserts} SELECT estimator.activate_pricing_model('${modelId}','${actor}',estimator.pricing_model_activation_projection('${modelId}')); COMMIT;`);
   const cookies=new Map<string,string>();
   const session=createServerClient(config.API_URL,config.PUBLISHABLE_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:(values)=>{for(const {name,value} of values)cookies.set(name,value);}}});
   const login=await session.auth.signInWithPassword({email,password});if(login.error)throw Error(`Synthetic login failed (${login.error.status ?? 'unknown'} ${login.error.code ?? 'unknown'}).`);
   browser=await chromium.launch({headless:true,args:['--no-sandbox']});
   const anonymous=await browser.newContext();
   const anonPost=await anonymous.request.post('http://127.0.0.1:58987/admin/pricing?/clone',{form:{sourceId:modelId,version:'910004.0.0'},headers:{origin:'http://127.0.0.1:58987'},maxRedirects:0});
   const anonResult=await anonPost.json();expect(anonResult.type).toBe('redirect');expect(anonResult.location).toBe('/admin/login');
   expect((await sql("SELECT count(*) FROM estimator.pricing_models WHERE version='910004.0.0';")).trim()).toBe('0');await anonymous.close();
   const low=await browser.newContext();await low.addCookies([...cookies].map(([name,value])=>({name,value,url:'http://127.0.0.1:58987'})));
   const lowPage=await low.newPage();const lowNavigation=await lowPage.goto('http://127.0.0.1:58987/admin/pricing');
   if(!lowPage.url().includes('/admin/login/mfa')) {
    const claims=await session.auth.getClaims();const assurance=await session.auth.mfa.getAuthenticatorAssuranceLevel();const staff=await session.schema('estimator').from('staff_users').select('state').eq('user_id',actor).maybeSingle();
    throw Error(`Unexpected AAL1 navigation HTTP ${lowNavigation?.status()}; claims error ${claims.error?.code??'none'}, assurance error ${assurance.error?.code??'none'}, staff error ${staff.error?.code??'none'}`);
   }
   const lowPost=await low.request.post('http://127.0.0.1:58987/admin/pricing?/clone',{form:{sourceId:modelId,version:'910002.0.0'},headers:{origin:'http://127.0.0.1:58987'},maxRedirects:0});
   const denied=await lowPost.json();expect(denied.type).toBe('redirect');expect(denied.status).toBe(303);expect(denied.location).toContain('/admin/login/mfa');
   expect((await sql("SELECT count(*) FROM estimator.pricing_models WHERE version='910002.0.0';")).trim()).toBe('0');await low.close();
   const enrolled=await session.auth.mfa.enroll({factorType:'totp'});if(enrolled.error||!enrolled.data.totp)throw Error('Synthetic MFA enrollment failed.');
   const verified=await session.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)});if(verified.error)throw Error('Synthetic MFA verification failed.');
   const context=await browser.newContext();await context.addCookies([...cookies].map(([name,value])=>({name,value,url:'http://127.0.0.1:58987'})));
   for(const role of ['viewer','advisor']) {
    await sql(`BEGIN; SET LOCAL session_replication_role=replica; UPDATE estimator.staff_users SET role='${role}' WHERE user_id='${actor}'; COMMIT;`);
    const deniedRole=await context.request.post('http://127.0.0.1:58987/admin/pricing?/clone',{form:{sourceId:modelId,version:'910005.0.0'},headers:{origin:'http://127.0.0.1:58987'},maxRedirects:0});
    expect(deniedRole.status()).toBe(403);expect((await sql("SELECT count(*) FROM estimator.pricing_models WHERE version='910005.0.0';")).trim()).toBe('0');
   }
   await sql(`BEGIN; SET LOCAL session_replication_role=replica; UPDATE estimator.staff_users SET role='admin' WHERE user_id='${actor}'; COMMIT;`);
   const page=await context.newPage();await page.goto('http://127.0.0.1:58987/admin/pricing');await browserExpect(page.getByRole('heading',{name:'Pricing models'})).toBeVisible();
   const snapshot=async(path:string)=>{const html=await page.evaluate(()=>{const css=[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(rule=>rule.cssText);}catch{return [];}}).join('\n');return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${document.querySelector('main')?.outerHTML??''}</body></html>`;});await Bun.write(path,html);};
   await snapshot('/tmp/goat-task12-pricing-list.html');
   const forged=await context.request.post('http://127.0.0.1:58987/admin/pricing?/clone',{form:{sourceId:modelId,version:'910003.0.0',actor:'00000000-0000-4000-8000-000000000000'},headers:{origin:'http://127.0.0.1:58987'},maxRedirects:0});const forgedResult=await forged.json();expect(forgedResult.type).toBe('redirect');expect(forgedResult.status).toBe(303);
   expect((await sql(`SELECT created_by = '${actor}' FROM estimator.pricing_models WHERE version='910003.0.0';`)).trim()).toBe('t');
   const row=page.getByRole('row').filter({hasText:version});await row.getByLabel('New version').fill('910001.0.0');await row.getByRole('button',{name:'Clone'}).click();
   await page.getByRole('link',{name:'910001.0.0'}).click();await browserExpect(page.getByText('State: DRAFT')).toBeVisible();
   await snapshot('/tmp/goat-task12-pricing-draft.html');
   await page.setViewportSize({width:320,height:800});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   await page.locator('details').first().locator('summary').click();
   await page.locator('input[name="field.2"]').focus();await browserExpect(page.locator('input[name="field.2"]')).toBeFocused();
   await page.emulateMedia({reducedMotion:'reduce'});
   expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
   const other=await context.newPage();await other.goto(page.url());await other.locator('details').first().locator('summary').click();await other.locator('input[name="field.2"]').fill('Stale browser edit');
   const first=page.locator('input[name="field.2"]');await first.fill('Synthetic edited rule');await page.getByRole('button',{name:'Save draft'}).click();
   const alert=page.locator('[role="alert"]'); if(await alert.count()) throw Error(`Save failed: ${(await alert.first().textContent())?.trim()}`);
   await browserExpect(page.locator('input[name="field.2"]')).toHaveValue('Synthetic edited rule');
   await other.getByRole('button',{name:'Save draft'}).click();await browserExpect(other.getByRole('alert')).toContainText('This draft changed');await other.close();
   const business=CANONICAL_PRICING_TEST_CORPUS[0], personal=CANONICAL_PRICING_TEST_CORPUS.find(item=>item.id==='personal-salaried-taxpayer')!;
   const fixtureExpected=(item:typeof business)=>({catchup:{minCents:item.expected.catchup.minCents,maxCents:item.expected.catchup.maxCents},ongoing:{minCents:item.expected.ongoing.minCents,maxCents:item.expected.ongoing.maxCents},ruleCodes:[...new Set([...item.expected.catchup.lineItemCodes,...item.expected.ongoing.lineItemCodes].map(code=>code.split('.')[0].toLowerCase().replaceAll('-','_')))],confidence:item.expected.confidence,manualReviewRequired:item.expected.manualReviewRequired,reviewFlagCodes:item.expected.reviewFlagCodes});
   const b=fixtureExpected(business), p=fixtureExpected(personal);
   const fingerprint=(await page.getByText('Draft fingerprint:',{exact:false}).textContent())?.split(': ')[1];
   const manifest={modelId:page.url().split('/').pop(),definitionFingerprint:fingerprint,revision:'synthetic-browser-1',scenarios:[{id:business.id,answers:business.answers,expected:b},{id:personal.id,answers:personal.answers,expected:p},{id:'combined',answers:{...business.answers,...personal.answers,calculatorType:'both'},expected:{catchup:{minCents:b.catchup.minCents+p.catchup.minCents,maxCents:b.catchup.maxCents+p.catchup.maxCents},ongoing:{minCents:b.ongoing.minCents+p.ongoing.minCents,maxCents:b.ongoing.maxCents+p.ongoing.maxCents},ruleCodes:[...b.ruleCodes,...p.ruleCodes],confidence:'high',manualReviewRequired:false,reviewFlagCodes:[]}}]};
   await page.getByLabel('Scenario manifest (JSON)').fill(JSON.stringify(manifest));await page.getByRole('button',{name:'Run scenarios'}).click();await browserExpect(page.getByRole('heading',{name:'All scenarios passed'})).toBeVisible();
   if(Bun.env.GOAT_TASK12_RENDER==='1') {
    // A GET-only loopback proxy supplies the synthetic session to the render checker.
    const proxy=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){
     if(request.method!=='GET') return new Response('Method not allowed',{status:405});
     const url=new URL(request.url);const upstream=new URL(url.pathname+url.search,'http://127.0.0.1:58987');
     const headers=new Headers(request.headers);headers.set('cookie',[...cookies].map(([name,value])=>`${name}=${value}`).join('; '));headers.delete('host');
     return fetch(upstream,{headers,redirect:'manual'});
    }});
    try {
     const lint=Bun.spawn(['bun','/home/jcschoeman96/.agents/skills/hallmark/scripts/sloplint.mjs','src/routes/admin/pricing','--scope','app','--render','--url',`http://127.0.0.1:${proxy.port}/admin/pricing`,'--url',`http://127.0.0.1:${proxy.port}${new URL(page.url()).pathname}`],{stdout:'pipe',stderr:'pipe'});
     const deadline=setTimeout(()=>lint.kill('SIGTERM'),90000);
     const [stdout,stderr,code]=await Promise.all([new Response(lint.stdout).text(),new Response(lint.stderr).text(),lint.exited]).finally(()=>clearTimeout(deadline));
     await Bun.write('/tmp/goat-task12-hallmark-authenticated.txt',stdout+stderr);
     if(code!==0 || !/render tier: \d+ screenshots/.test(stdout+stderr) || /render tier: failed|render tier not run/i.test(stdout+stderr)) throw Error(`Authenticated UI render check did not complete; see /tmp/goat-task12-hallmark-authenticated.txt (exit ${code}).`);
    } finally {proxy.stop(true);}
   }
   await browserExpect(page.getByText('Activation is unavailable until the independent approval workflow is complete.')).toBeVisible();await context.close();
  } finally {
   await browser?.close();
   await task12Local();
   await sql(`BEGIN; SET LOCAL session_replication_role=replica; DELETE FROM estimator.pricing_rules WHERE pricing_model_id IN (SELECT id FROM estimator.pricing_models WHERE created_by='${actor}'); DELETE FROM estimator.pricing_models WHERE created_by='${actor}'; DELETE FROM estimator.staff_users WHERE user_id='${actor}'; COMMIT;`);
   const deleted=await service.auth.admin.deleteUser(actor);if(deleted.error)throw Error('Could not clean up synthetic test user.');
  }
 },240000);
});
