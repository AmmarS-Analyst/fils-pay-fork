// Local synthetic sandbox checkout load. Never points at a remote database.
const {Pool}=require('pg');
const {randomUUID,createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const origin=process.env.AUDIT_API_ORIGIN||'http://127.0.0.1:3000';
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(origin)||!process.env.DATABASE_URL?.includes('filspay_load')) throw Error('Requires dedicated local filspay_load database');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const merchant=(await pool.query("INSERT INTO merchants(display_name,onboarding_status,status,test_mode) VALUES($1,'approved','active',true) RETURNING id",[`Local load ${randomUUID()}`])).rows[0].id;
 const actor=(await pool.query("INSERT INTO admin_users(email,password_hash,display_name,role) VALUES($1,'unused','load','super_admin') RETURNING id",[`${randomUUID()}@load.test`])).rows[0].id;
 const key=randomUUID();
 await pool.query("INSERT INTO api_keys(merchant_id,key_prefix,key_hash,created_by_admin_user_id) VALUES($1,'local-load',$2,$3)",[merchant,createHash('sha256').update(key).digest('hex'),actor]);
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${key}`};
 const results=[];
 const durations=Number(process.env.AUDIT_STAGE_SECONDS||8)*1000;
 const counts=(process.env.AUDIT_CONCURRENCY||'1,4,8,16').split(',').map(Number);
 async function call(path,init){let r=await fetch(origin+path,{...init,signal:AbortSignal.timeout(15000)});let body=await r.json();if(!r.ok)throw Object.assign(Error(body.error||'request failed'),{status:r.status});return body;}
 try{
 for(const concurrency of counts){
  const start=performance.now(),latencies=[],errors={};let completed=0;
  const deadline=start+durations;
  await Promise.all(Array.from({length:concurrency},async()=>{
   while(performance.now()<deadline){const at=performance.now();try{
    const link=await call(`/v1/merchants/${merchant}/payment-links`,{method:'POST',headers,body:JSON.stringify({amountFils:1000,expiresAt:new Date(Date.now()+3600000).toISOString(),reference:'local-load'})});
    await call(`/v1/payment-links/${link.token}`);
    await call(`/v1/payment-links/${link.token}/pay`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({card:{pan:'4111111111111111',expiryMonth:12,expiryYear:2099,cvv:'123'}})});
    completed++;latencies.push(performance.now()-at);
   }catch(e){let name=e.status||e.name;errors[name]=(errors[name]||0)+1;}}
  }));
  latencies.sort((a,b)=>a-b);const elapsedMs=performance.now()-start;
  const result={concurrency,completed,elapsedMs:Math.round(elapsedMs),checkoutsPerSecond:completed/(elapsedMs/1000),p50Ms:latencies[Math.floor(latencies.length*.5)]||null,p95Ms:latencies[Math.floor(latencies.length*.95)]||null,errors};results.push(result);console.log(JSON.stringify(result));
 }
 const integrity=(await pool.query(`SELECT
 (SELECT count(*) FROM payment_links WHERE merchant_id=$1 AND status='paid') AS paid_links,
 (SELECT count(*) FROM transactions WHERE merchant_id=$1 AND status='captured') AS captured_transactions,
 (SELECT count(*) FROM (SELECT entry_group_id FROM ledger_entries WHERE merchant_id=$1 GROUP BY entry_group_id HAVING SUM(CASE WHEN direction='debit' THEN amount_fils ELSE -amount_fils END)<>0) bad) AS unbalanced_groups,
 (SELECT cached_payable_fils FROM merchant_balances WHERE merchant_id=$1) AS cached_payable,
 (SELECT SUM(CASE WHEN direction='credit' THEN amount_fils ELSE -amount_fils END) FROM ledger_entries WHERE merchant_id=$1 AND account_id='merchant_payable') AS ledger_payable`,[merchant])).rows[0];
 if(integrity.paid_links!==integrity.captured_transactions||integrity.unbalanced_groups!=='0'||integrity.cached_payable!==integrity.ledger_payable)throw Error('money integrity check failed '+JSON.stringify(integrity));
 const report={scenario:'Create link, GET checkout, pay simulated card',limits:process.env.AUDIT_RESOURCE_LIMITS||'not constrained',stages:results,integrity};
 await fs.writeFile(process.env.AUDIT_LOAD_OUTPUT||'docs/verification/evidence/load-results.json',JSON.stringify(report,null,2)+'\n');
 }finally{await pool.end();}
})().catch(e=>{console.error(e);process.exitCode=1});
