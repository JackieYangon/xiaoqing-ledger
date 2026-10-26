const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const core = require('../cloudfunctions/ledger/core.cjs')
const modules = new Map(), storage = new Map(), interceptors = {}, hooks = []
let route = 'pages/login/index', user = 'a'.repeat(64), failure = false, nextRead = null, resets = 0
const uni = {
  getStorageSync: k => storage.get(k) || '', setStorageSync: (k,v) => storage.set(k,v), removeStorageSync: k => storage.delete(k),
  reLaunch: o => { route = o.url.slice(1); o.complete?.() }, addInterceptor: (api, h) => { interceptors[api] = h },
}
const transport = { cloudEnabled: true, async callLedger(event) {
  if (failure) throw new Error('network unavailable')
  if (event.action === 'login') return {ok:true, accountId:user, token:user, expiresAt:Date.now()+60000}
  if (event.action === 'logout') return {ok:true}
  if (event.token !== user) return {ok:false,code:'AUTH'}
  if (event.action === 'session') return {ok:true,accountId:user,expiresAt:Date.now()+60000}
  if (event.action === 'read' && nextRead) { const hold=nextRead;nextRead=null;return hold }
  if (event.action === 'read') return {ok:true, accountId:user, revision:0, count:0, settings:core.emptyState()}
  if (event.action === 'page') return {ok:true,accountId:user,revision:0,entries:[],next:''}
  throw new Error('Unexpected network write')
}}
function load(name) {
  if(modules.has(name)) return modules.get(name)
  const exports={};modules.set(name,exports)
  const resolve = request => {
    if(request === 'vue') return require('vue')
    if(request === '@dcloudio/uni-app') return {onLoad:fn=>hooks.push(fn),onShow:fn=>hooks.push(fn)}
    if(request.endsWith('cloud-transport')) return transport
    if(request === '@/core/ledger' || (name==='src/core/cloud-client.ts' && request==='./ledger')) return core
    if(request.endsWith('/auth')) return load('src/services/auth.ts')
    if(request.endsWith('/cloud-client')) return load('src/core/cloud-client.ts')
    if(request.endsWith('/cloud')) return {CLOUD_ENV:'test'}
    throw new Error('Unknown import '+request)
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:resolve,uni,getCurrentPages:()=>[{route}],Error,Date,Math,JSON,console})
  return exports
}
;(async()=>{
 const auth=load('src/services/auth.ts'), ledger=load('src/services/ledger.ts')
 auth.onSessionReset(()=>resets++)
 auth.installAuthGuards()
 assert.equal(auth.authenticated.value,false)
 assert.throws(()=>ledger.repository.read())
 assert.throws(()=>ledger.localRepository.exportBackup())
 assert.equal(await ledger.refresh(),false)
 await assert.rejects(ledger.repository.setHidden(true))
 for(const api of Object.keys(interceptors)) {
   route='pages/home/index'
   assert.equal(interceptors[api].invoke({url:'/pages/backup/index'}),false)
   assert.equal(route,'pages/login/index')
 }
 failure=true;assert.equal(await auth.login(),false);assert.equal(auth.currentUser.value,null)
 failure=false;assert.equal(await auth.login(),true)
 assert.equal(auth.currentUser.value.accountId,user)
 assert.equal(await ledger.refresh(),true)
 assert.equal(ledger.accountId.value,user)
 // Logout must reject a delayed response from the old account, even after B logs in.
 let release
 nextRead=new Promise(r=>{release=r})
 const oldRead=ledger.refresh(); await new Promise(r=>setImmediate(r))
 await auth.logout()
 assert.equal(ledger.accountId.value,'');assert.equal(ledger.entries.value.length,0)
 assert.equal(auth.authenticated.value,false)
 user='b'.repeat(64);assert.equal(await auth.login(),true);await ledger.refresh()
 release({ok:true,accountId:'a'.repeat(64),revision:0,count:0,settings:core.emptyState()})
 assert.equal(await oldRead,false);assert.equal(ledger.accountId.value,user)
 assert.equal(ledger.loadError.value,'')
 // Identity changes during foreground verification close every protected page.
 user='c'.repeat(64);await auth.resumeSession()
 assert.equal(auth.authenticated.value,false);assert.equal(ledger.accountId.value,'');assert.equal(route,'pages/login/index')
 transport.cloudEnabled=false
 assert.equal(await auth.login(),false);assert.equal(auth.authenticated.value,false)
 assert.ok(resets>=4)
 console.log('PASS auth: login gate, protected services/routes, failed login, account-bound state, logout clearing, stale-response race, foreground identity change, H5 login restriction')
})().catch(e=>{console.error(e);process.exitCode=1})
