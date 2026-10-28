const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript')
const core = require('../cloudfunctions/ledger/core.cjs')
const modules = new Map(), storage = new Map(), interceptors = {}, hooks = []
const calls = { storage: [], cloud: [], routes: [] }
let route = 'pages/home/index', user = 'a'.repeat(64), failure = false, nextRead = null, resets = 0
let clockOffset = 0, sessionExpiresAt = 0
class TestDate extends Date {
  static now() { return Date.now() + clockOffset }
}
const uni = {
  getStorageSync: k => { calls.storage.push(['read', k]); return storage.get(k) || '' },
  setStorageSync: (k,v) => { calls.storage.push(['write', k]); storage.set(k,v) },
  removeStorageSync: k => { calls.storage.push(['remove', k]); storage.delete(k) },
  reLaunch: o => { route = o.url.slice(1); calls.routes.push(route); o.complete?.() },
  switchTab: o => { route = o.url.slice(1); calls.routes.push(route); o.complete?.() },
  addInterceptor: (api, h) => { interceptors[api] = h },
}
const transport = { cloudEnabled: true, async callLedger(event) {
  calls.cloud.push(event)
  if (failure) throw new Error('network unavailable')
  if (event.action === 'login') {
    sessionExpiresAt=TestDate.now()+60000
    return {ok:true, accountId:user, token:user, expiresAt:sessionExpiresAt}
  }
  if (event.action === 'logout') return {ok:true}
  if (event.token !== user) return {ok:false,code:'AUTH'}
  if (event.action === 'session') return sessionExpiresAt>TestDate.now()
    ? {ok:true,accountId:user,expiresAt:sessionExpiresAt} : {ok:false,code:'AUTH'}
  if (event.action === 'read' && nextRead) { const hold=nextRead;nextRead=null;return hold }
  if (event.action === 'read') return {
    ok:true, accountId:user, revision:0, count:0, settings:core.emptyState(),
    ...(event.bookId ? {bookName:'共同账本'} : {}),
  }
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
    if(request.endsWith('/guest-ledger')) return load('src/services/guest-ledger.ts')
    if(request.endsWith('/cloud-client')) return load('src/core/cloud-client.ts')
    if(request.endsWith('/cloud')) return {CLOUD_ENV:'test'}
    throw new Error('Unknown import '+request)
  }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:resolve,uni,getCurrentPages:()=>[{route}],Error,Date:TestDate,Math,JSON,console})
  return exports
}
;(async()=>{
 const auth=load('src/services/auth.ts'), ledger=load('src/services/ledger.ts')
 auth.onSessionReset(()=>resets++)
 auth.installAuthGuards()
 const originalLocal = JSON.stringify({ private: 'existing local bills must never be read or overwritten' })
 storage.set('xiaoqing.ledger.v1', originalLocal)
 assert.equal(JSON.parse(fs.readFileSync('src/pages.json','utf8')).pages[0].path,'pages/home/index')
 assert.equal(auth.authenticated.value,false)
 assert.equal(auth.guestMode.value,true)
 assert.equal(auth.browseReady.value,true)
 assert.equal(auth.hasSession(),false)
 await auth.resumeSession()
 assert.equal(await ledger.refresh(),true)
 const initialGuest = ledger.repository.read()
 assert.ok(initialGuest.entries.length > 0, 'first launch provides sample bills for real browsing')
 assert.equal(route,'pages/home/index')
 for(const api of Object.keys(interceptors)) {
   for(const page of ['home','records','stats','about','entry','budget','categories','login']) {
     assert.notEqual(interceptors[api].invoke({url:`/pages/${page}/index?preview=1`}),false,
       `${api} allows the public ${page} page`)
     assert.equal(route,'pages/home/index', 'public navigation never forces a login page')
   }
 }
 assert.equal(calls.cloud.length,0,'opening and browsing must not request an identity or cloud data')
 assert.equal(calls.storage.length,0,'browsing must not inspect existing local bills or account caches')
 assert.equal(calls.routes.length,0,'first launch stays on the home page')

 // Trial edits use the same validation and calculations, isolated from every persisted account.
 const sampleDate=core.today(), sampleMonth=sampleDate.slice(0,7)
 const beforeExpense=core.summarize(ledger.entries.value).expense
 await ledger.repository.addCategory('expense','体验分类')
 const trial=await ledger.repository.save({kind:'expense',cents:1234,category:'体验分类',date:sampleDate,note:'体验记录'})
 assert.equal(core.summarize(ledger.entries.value).expense,beforeExpense+1234)
 assert.ok(ledger.repository.list().some(entry=>entry.id===trial.id))
 assert.ok(core.inMonth(ledger.entries.value,sampleMonth).some(entry=>entry.id===trial.id))
 const edited=await ledger.repository.save({...trial,cents:2345},trial.id,trial.version)
 assert.equal(core.summarize(ledger.entries.value).expense,beforeExpense+2345)
 const unchanged=JSON.stringify(ledger.repository.read())
 await assert.rejects(ledger.repository.save({...edited,cents:-1},edited.id,edited.version))
 await assert.rejects(ledger.repository.remove(edited.id,edited.version-1))
 assert.equal(JSON.stringify(ledger.repository.read()),unchanged,'invalid trial edits preserve the current ledger')
 await ledger.repository.setBudget(sampleMonth,{total:90000,categories:{体验分类:5000}})
 assert.equal(ledger.state.value.budgets[sampleMonth].total,90000)
 await ledger.repository.setHidden(true)
 assert.equal(ledger.state.value.hideAmounts,true)
 await ledger.repository.renameCategory('expense','体验分类','新的体验分类')
 assert.ok(core.categoryOptions(ledger.state.value,'expense').includes('新的体验分类'))
 assert.equal(ledger.entries.value.find(entry=>entry.id===edited.id).category,'体验分类',
   'renaming a trial category preserves historical bill names')
 await ledger.repository.removeCategory('expense','新的体验分类')
 await ledger.repository.remove(edited.id,edited.version)
 assert.equal(core.summarize(ledger.entries.value).expense,beforeExpense)
 assert.equal(await ledger.refresh(),true)
 assert.equal(ledger.state.value.hideAmounts,true,'switching pages retains edits during this visit')
 const guestBeforeLogin=JSON.stringify(ledger.repository.read())
 assert.equal(calls.cloud.length,0,'trial editing never calls the cloud')
 assert.equal(calls.storage.length,0,'trial editing never reads or writes persistent storage')
 assert.equal(storage.get('xiaoqing.ledger.v1'),originalLocal)

 assert.throws(()=>ledger.localRepository.exportBackup())
 assert.throws(()=>ledger.repository.exportBackup())
 assert.throws(()=>ledger.repository.previewImport('{}'))
 await assert.rejects(ledger.workspaceAction('workspace'))
 assert.equal(calls.cloud.length,0,'protected services reject guests before any cloud request')
 for(const api of Object.keys(interceptors)) {
   route='pages/home/index'
   assert.equal(interceptors[api].invoke({url:'/pages/backup/index'}),false)
   assert.equal(route,'pages/login/index')
 }
 failure=true;assert.equal(await auth.login(),false);assert.equal(auth.currentUser.value,null)
 assert.equal(await ledger.refresh(),true)
 assert.equal(JSON.stringify(ledger.repository.read()),guestBeforeLogin,'failed login retains the trial ledger')
 failure=false;assert.equal(await auth.login(),true)
 assert.equal(auth.currentUser.value.accountId,user)
 assert.equal(ledger.entries.value.length,0,'a successful login hides the samples before the first cloud refresh')
 assert.equal(await ledger.refresh(),true)
 assert.equal(ledger.accountId.value,user)
 assert.equal(auth.guestMode.value,false)
 assert.equal(ledger.entries.value.length,0,'sample bills are never merged into the real account')
 assert.equal(ledger.state.value.hideAmounts,false,'trial settings never replace account settings')
 assert.equal(storage.get('xiaoqing.ledger.v1'),originalLocal)
 // A same-turn foreground check cancels an old refresh without leaving its task stuck.
 const interruptedRefresh=ledger.refresh(), foregroundCheck=auth.resumeSession()
 assert.equal(await interruptedRefresh,false)
 assert.equal(await foregroundCheck,true)
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(await ledger.refresh(),true)
 assert.equal(ledger.accountId.value,user)
 // A restored group session retains its selected book name even if the subsequent data load fails.
 ledger.groups.value=[{id:'group-a',name:'共同账本',creator:user,size:2}]
 await ledger.switchBook('group-a')
 let failGroupRefresh
 nextRead=new Promise((_,reject)=>{failGroupRefresh=reject})
 assert.equal(await auth.resumeSession(),true)
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(ledger.currentBookId.value,'group-a')
 assert.equal(ledger.currentBookName.value,'共同账本')
 failGroupRefresh(new Error('group refresh unavailable'))
 assert.equal(await ledger.refresh(),false)
 assert.equal(ledger.currentBookName.value,'共同账本','a failed refresh cannot relabel group data as a personal book')
 await ledger.switchBook('')
 // A foreground refresh must not let an old budget draft use a newer cloud revision.
 const budgetMonth='2026-10', budgetBaseline={total:10000,categories:{餐饮:5000}}
 ledger.state.value.budgets[budgetMonth]=budgetBaseline
 let finishBudgetRefresh
 nextRead=new Promise(resolve=>{finishBudgetRefresh=resolve})
 const budgetRefresh=ledger.refresh(); await new Promise(resolve=>setImmediate(resolve))
 const staleBudgetSave=ledger.repository.setBudget(budgetMonth,{total:20000,categories:{}},budgetBaseline)
 const staleBudgetRejected=assert.rejects(staleBudgetSave,/预算已在其他设备或页面更新/)
 const refreshedSettings=core.emptyState()
 refreshedSettings.budgets[budgetMonth]={total:30000,categories:{餐饮:8000}}
 finishBudgetRefresh({ok:true,accountId:user,revision:1,count:0,settings:refreshedSettings})
 assert.equal(await budgetRefresh,true)
 await staleBudgetRejected
 assert.equal(ledger.state.value.budgets[budgetMonth].total,30000)
 // Logout must reject a delayed response from the old account, even after B logs in.
 let release
 nextRead=new Promise(r=>{release=r})
 const oldRead=ledger.refresh(); await new Promise(r=>setImmediate(r))
 await auth.logout()
 assert.equal(ledger.accountId.value,'')
 assert.equal(auth.authenticated.value,false)
 assert.equal(route,'pages/home/index','logout returns to voluntary browsing')
 assert.equal(await ledger.refresh(),true)
 assert.equal(JSON.stringify(ledger.repository.read()),guestBeforeLogin,'logout restores only the isolated trial ledger')
 user='b'.repeat(64);assert.equal(await auth.login(),true);await ledger.refresh()
 release({ok:true,accountId:'a'.repeat(64),revision:0,count:0,settings:core.emptyState()})
 assert.equal(await oldRead,false);assert.equal(ledger.accountId.value,user)
 assert.equal(ledger.loadError.value,'')
 // Identity changes clear account data and return to browsing without forced authorization.
 user='c'.repeat(64);await auth.resumeSession()
 assert.equal(auth.authenticated.value,false);assert.equal(ledger.accountId.value,'');assert.equal(route,'pages/home/index')
 assert.equal(await ledger.refresh(),true)
 assert.equal(JSON.stringify(ledger.repository.read()),guestBeforeLogin)

 // Passive expiry renews an already chosen login without returning to authorization or samples.
 assert.equal(await auth.login(),true)
 await ledger.refresh()
 route='pages/stats/index'
 const beforeExpiredCalls=calls.cloud.length, beforeExpiredRoutes=calls.routes.length
 clockOffset=120000
 assert.equal(auth.hasSession(),false)
 assert.equal(await ledger.refresh(),true)
 assert.equal(auth.guestMode.value,false)
 assert.equal(ledger.accountId.value,user)
 assert.ok(calls.cloud.slice(beforeExpiredCalls).some(event=>event.action==='login'))
 assert.equal(calls.routes.length,beforeExpiredRoutes)
 assert.equal(route,'pages/stats/index')
 assert.equal(ledger.entries.value.length,0)
 // A scheduled refresh cannot reopen login after logout in the same event turn.
 await new Promise(resolve=>setImmediate(resolve))
 const beforeLogoutRoutes=calls.routes.length
 const abandonedRefresh=ledger.refresh()
 await auth.logout()
 assert.equal(await abandonedRefresh,false)
 assert.equal(route,'pages/home/index')
 assert.deepEqual(calls.routes.slice(beforeLogoutRoutes),['pages/home/index'])
 assert.equal(auth.guestMode.value,true)
 assert.equal(await ledger.refresh(),true)
 assert.equal(JSON.stringify(ledger.repository.read()),guestBeforeLogin)
 transport.cloudEnabled=false
 assert.equal(await auth.login(),false);assert.equal(auth.authenticated.value,false)
 assert.equal(await ledger.refresh(),true,'web visitors can also continue browsing')
 assert.equal(storage.get('xiaoqing.ledger.v1'),originalLocal)
 assert.ok(resets>=4)
 console.log('PASS auth: guest browsing and isolated trial edits, protected services, account transitions, stale-response and refresh races, automatic expiry renewal, voluntary browsing after logout, H5 preview')
})().catch(e=>{console.error(e);process.exitCode=1})
