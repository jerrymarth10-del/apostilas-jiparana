const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const card = fs.readFileSync(path.join(root,'card-payment.js'),'utf8');
const infinite = fs.readFileSync(path.join(root,'infinitepay-payment.js'),'utf8');
const kind = card.includes('jr_semusa_card') ? 'semusa' : 'sesau';
const flush = async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function run(scenario) {
 const events={}, elements={}, storage=new Map(), timers=new Map();
 let calls=0, starts=0, submitted=0, destination='', timeId=0;
 function element(tag) {return {tag,style:{},children:[],listeners:{},hidden:true,append(...items){this.children.push(...items);},appendChild(x){this.append(x);},prepend(x){elements[x.id]=x;this.children.unshift(x);},replaceChildren(){this.children=[];},setAttribute(){},scrollIntoView(){},addEventListener(n,f){this.listeners[n]=f;},submit(){submitted++;assert.equal(this.method,'POST');assert.equal(this.action,'https://sesau-certo.vercel.app/api/purchase-entry');}};}
 elements.checkoutCard=element('div');elements.checkoutError=element('div');
 const document={readyState:'complete',visibilityState:'visible',getElementById:id=>elements[id]||null,createElement:element,body:element('body'),addEventListener:(n,f)=>{events['doc:'+n]=f;}};
 const location={href:'https://checkout.test/'+(scenario==='explicit'?'?t=test-card&payment_id=123456789':scenario==='forged'?'?status=rejected':''),assign:u=>{destination=u;}};
 const context={document,location,URL,console,Date,Uint8Array,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},history:{replaceState(_a,_b,url){location.href=new URL(url,location.href).href;}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(f,ms)=>{const id=++timeId;timers.set(id,{f,ms});return id;},clearTimeout:id=>timers.delete(id)};
 context.window=context;context.addEventListener=(n,f)=>{(events[n] ||= []).push(f);};context.dispatchEvent=e=>(events[e.type]||[]).forEach(f=>f(e));
 context.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url==='/api/payment-status') {calls++;return {ok:true,json:async()=>({status:scenario==='pending'?'pending':scenario==='approved'?'approved':'rejected',approved:scenario==='approved',fallbackAvailable:!['pending','approved','unavailable'].includes(scenario),paymentId:'123456789',accessToken:'access',platformUrl:'https://sesau-certo.vercel.app'})};}
  if(url==='/api/infinitepay-checkout') {starts++;assert.equal(body.checkoutToken,'test-card');return {ok:true,json:async()=>({checkoutToken:'test-infinite',checkoutUrl:'https://checkout.infinitepay.io/test-order'})};}
  if(url==='/api/infinitepay-status')return {ok:true,json:async()=>({approved:false,status:'pending'})};
  throw Error('Unexpected request '+url);
 };
 function saveCard(){storage.set('jr_'+kind+'_card_return_v2',JSON.stringify({checkoutToken:'test-card',createdAt:Date.now()}));}
 if(!['bfcache','focus','visible','forged'].includes(scenario))saveCard();
 if(scenario==='infinite-pending')storage.set('jr_'+kind+'_infinitepay_v1',JSON.stringify({checkoutToken:'test-infinite',createdAt:Date.now()}));
 vm.createContext(context);vm.runInContext(infinite,context);vm.runInContext(card,context);await flush();
 if(['bfcache','focus','visible'].includes(scenario)){saveCard();if(scenario==='visible')events['doc:visibilitychange']();else context.dispatchEvent({type:scenario==='bfcache'?'pageshow':'focus',persisted:true});await flush();}
 if(['back','explicit','bfcache','focus','visible'].includes(scenario)) {
  const box=elements.infinitePayAlternative;assert.ok(box,'fallback must appear');
  const button=box.children.find(x=>x.tag==='button');assert.equal(button.textContent,'TENTAR PAGAR COM INFINITEPAY');await button.listeners.click();
  assert.equal(destination,'https://checkout.infinitepay.io/test-order');assert.equal(starts,1);assert.equal(submitted,0);
  assert.equal(JSON.parse(storage.get('jr_'+kind+'_infinitepay_v1')).checkoutToken,'test-infinite');
 } else if(scenario==='approved'){assert.equal(submitted,1);assert.equal(storage.has('jr_'+kind+'_card_return_v2'),false);}
 else {assert.equal(starts,0);assert.equal(submitted,0);if(scenario!=='infinite-pending')assert.equal(elements.infinitePayAlternative,undefined);}
 if(['forged','infinite-pending'].includes(scenario))assert.equal(calls,0);
 if(scenario==='pending'){for(let i=0;i<10;i++){const entry=[...timers.entries()].find(([,v])=>v.ms===5000);if(!entry)break;timers.delete(entry[0]);await entry[1].f();await flush();}assert.equal(calls,7,'polling is bounded');}
 console.log(kind+': '+scenario+' PASS');
}
(async()=>{for(const s of ['back','explicit','bfcache','focus','visible','pending','approved','forged','unavailable','infinite-pending'])await run(s);})().catch(e=>{console.error(e);process.exit(1);});
