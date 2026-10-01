import { test } from 'node:test';
import assert from 'node:assert/strict';
import { management, validateSettings } from '../src-tauri/src/cf/management.mjs';
const account='a'.repeat(32), zone='b'.repeat(32);
const request={product:'Worker',resource:'app',section:'domains',action:'attach',values:{hostname:'app.example.com',zoneId:zone,target:'app-staging'}};
function workerApi({wrongAccount=false,existing=null}={}) {
 const writes=[];
 const api=async(path,method='GET',body)=>{
  if(method!=='GET'){writes.push({path,method,body});return {success:true,result:{}};}
  if(path.includes('/workers/domains'))return {result:existing?[existing]:[]};
  if(path===`/zones/${zone}`)return {result:{id:zone,name:'example.com',account:{id:wrongAccount?'c'.repeat(32):account}}};
  if(path.endsWith('/workers/scripts'))return {result:[{id:'app'},{id:'app-staging'}]};
  throw Error(path);
 };return {api,writes};
}
test('prepare is read-only; apply uses the reviewed target',async()=>{
 const {api,writes}=workerApi();const plan=await management(api,account,request,'prepare');assert.equal(writes.length,0);
 await management(api,account,request,'apply',plan.fingerprint);
 assert.equal(writes.length,1);assert.equal(writes[0].body.service,'app-staging');
});
test('blocks cross-account zones, unrelated hostnames, missing Workers, and changed reviews',async()=>{
 await assert.rejects(()=>management(workerApi({wrongAccount:true}).api,account,request,'prepare'),/selected account/);
 await assert.rejects(()=>management(workerApi().api,account,{...request,values:{...request.values,hostname:'other.com'}},'prepare'),/selected account/);
 await assert.rejects(()=>management(workerApi().api,account,{...request,values:{...request.values,target:'missing'}},'prepare'),/does not exist/);
 const {api,writes}=workerApi();await assert.rejects(()=>management(api,account,request,'apply','wrong'),/changed since review/);assert.equal(writes.length,0);
});
test('restricts supported settings and creates a multipart patch without unrelated fields',async()=>{
 assert.throws(()=>validateSettings('Worker',{bindings:[]}));
 assert.throws(()=>validateSettings('Worker',{limits:{cpu_ms:0}}));
 const writes=[]; const api=async(path,method='GET',body,multipart)=>{if(method!=='GET')writes.push({body,multipart});return {result:{compatibility_date:'2026-01-01',bindings:[{type:'secret_text',name:'SECRET'}]}};};
 const req={product:'Worker',resource:'app',section:'settings',action:'settings',values:{compatibility_date:'2026-02-01'}};
 const plan=await management(api,account,req,'prepare');assert.ok(!JSON.stringify(plan).includes('SECRET'));
 await management(api,account,req,'apply',plan.fingerprint);assert.deepEqual(writes,[{body:{compatibility_date:'2026-02-01'},multipart:true}]);
});
function pagesApi({active=true,conflict=false,failDns=false}={}){
 const writes=[];
 const api=async(path,method='GET',body)=>{
  if(method!=='GET'){if(failDns && path.includes('/dns_records'))throw Error('DNS failed');writes.push({path,method,body});return {result:{}};}
  if(path.includes('/domains'))return {result:active?[{name:'app.example.com',status:'active'}]:[]};
  if(path.includes('/deployments'))return {result:[{id:'d',environment:'preview',latest_stage:{status:'success'},aliases:['https://staging.app.pages.dev']}]};
  if(path.includes('/dns_records'))return {result:conflict?[{id:'dns',type:'A'}]:[]};
  if(path===`/zones/${zone}`)return {result:{id:zone,name:'example.com',account:{id:account}}};
  return {result:{subdomain:'app.pages.dev',production_branch:'main'}};
 };return {api,writes};
}
const pageRequest={...request,product:'Pages',values:{...request.values,target:'staging.app.pages.dev'}};
test('Pages preview uses a verified alias and proxied CNAME; rejects unactivated and conflicting domains',async()=>{
 const {api,writes}=pagesApi();const plan=await management(api,account,pageRequest,'prepare');await management(api,account,pageRequest,'apply',plan.fingerprint);
 assert.equal(writes.length,1);assert.equal(writes[0].body.content,'staging.app.pages.dev');assert.equal(writes[0].body.proxied,true);
 await assert.rejects(()=>management(pagesApi({active:false}).api,account,pageRequest,'prepare'),/activate/);
 await assert.rejects(()=>management(pagesApi({conflict:true}).api,account,pageRequest,'prepare'),/Conflicting/);
});
test('Pages partial failure is explicit after domain attachment succeeds',async()=>{
 const {api,writes}=pagesApi({active:false,failDns:true}); const req={...pageRequest,values:{...pageRequest.values,target:'app.pages.dev'}};
 const plan=await management(api,account,req,'prepare');await assert.rejects(()=>management(api,account,req,'apply',plan.fingerprint),/1 step\(s\) applied/);assert.equal(writes.length,1);
});

test('maps supported Pages and DNS endpoints to actual cf flag conventions',async()=>{
 const {cliArguments} = await import('../src-tauri/src/cf/management.mjs');
 const root=`/accounts/${account}/pages/projects/app`;
 assert.deepEqual(cliArguments(`${root}/domains`,'POST',{name:'app.example.com'},account).args,['pages','domains','create','app','--body','{"name":"app.example.com"}']);
 assert.deepEqual(cliArguments(`${root}/domains`,'GET',undefined,account).args,['pages','domains','list','--project-name','app']);
 assert.deepEqual(cliArguments(`${root}/domains/app.example.com`,'DELETE',undefined,account).args,['pages','domains','delete','app.example.com','--project-name','app','--force']);
 assert.deepEqual(cliArguments(`${root}/deployments?page=2&per_page=50`,'GET',undefined,account).args,['pages','deployments','list','--project-name','app','--page','2','--per-page','50']);
 assert.deepEqual(cliArguments(`/zones/${zone}/dns_records/record`,'PATCH',{content:'staging.app.pages.dev'},account).args,['dns','records','edit','record','--zone',zone,'--body','{"content":"staging.app.pages.dev"}']);
 assert.equal(cliArguments(`/accounts/${account}/workers/domains`,'PUT',{},account).args,undefined);
});
