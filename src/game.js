/* ================= GAME & INTERFACE ================= */
const $=s=>document.querySelector(s);
const fmt=n=>Math.round(n).toLocaleString('en-GB');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mmss=t=>{ t=Math.max(0,Math.floor(t)); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); };

/* ---------- progress ---------- */
const SAVE_KEY='massive-armies-v1';
function defaultProg(){ return {gold:150,roster:{sword:60,archer:30},tech:{sword:true,archer:true},upg:{},level:1,won:{},layout:null,layoutSurv:null,saves:[],best:{endless:0,survival:0}}; }
let PROG=defaultProg();
function loadProg(data){ let p=data&&data.prog; if(!p){ try{ const s=localStorage.getItem(SAVE_KEY); if(s) p=JSON.parse(s); }catch(e){} } if(p&&typeof p==='object') PROG=Object.assign(defaultProg(),p); PROG.level=clamp(PROG.level|0||1,1,CAMPAIGN_LEN); normalizeRoster(); }
function saveProg(){ PROG.t=Date.now(); try{ localStorage.setItem(SAVE_KEY,JSON.stringify(PROG)); }catch(e){} cloudQueue(); }

/* ---------- cloud save: core progress follows a signed-in player across devices ---------- */
const CLOUD={ref:null,on:false,timer:0,busy:false,dirty:false};
const CORE_KEYS=['gold','roster','tech','upg','level','won','best','t'];
const coreOf=p=>{ const o={}; for(const k of CORE_KEYS) o[k]=p[k]; return o; };
function cloudQueue(){ if(!CLOUD.on) return; CLOUD.dirty=true; clearTimeout(CLOUD.timer); CLOUD.timer=setTimeout(cloudFlush,1500); }
async function cloudFlush(){
  if(!CLOUD.on||CLOUD.busy||!CLOUD.dirty) return;
  CLOUD.busy=true; CLOUD.dirty=false;
  try{ await CLOUD.ref.set({core:JSON.stringify(coreOf(PROG))}); }
  catch(e){ const c=e&&e.code; if(c==='unavailable'){ CLOUD.dirty=true; setTimeout(cloudFlush,2000+Math.random()*2000); } else CLOUD.on=false; }
  CLOUD.busy=false; if(CLOUD.dirty) cloudQueue();
}
async function initCloud(){
  try{
    if(!window.claude||typeof window.claude.use!=='function') return;
    const [db,user]=await Promise.all([window.claude.use('db'),window.claude.use('user')]);
    if(!db||!user) return;
    const id=await user.id(); if(!id) return;
    const ref=db.doc('data/users/'+id+'/save');
    const snap=await Promise.race([ref.get(),new Promise(r=>setTimeout(()=>r(null),10000))]);
    if(!snap) return;
    CLOUD.ref=ref; CLOUD.on=true;
    let remote=null; if(snap.exists){ try{ remote=JSON.parse(snap.data().core); }catch(e){} }
    if(remote && (remote.t||0)>(PROG.t||0)){
      Object.assign(PROG,remote); normalizeRoster(); try{ localStorage.setItem(SAVE_KEY,JSON.stringify(PROG)); }catch(e){}
      afterProgressChange(); if(!$('#modal').hidden && $('#sheet').querySelector('.welcome-mark')) showWelcome();
      toast('Progress restored from your account');
    } else if(PROG.t){ cloudQueue(); }
  }catch(e){ CLOUD.on=false; }
}
const capOf=()=>{ let c=BASE_CAP; for(const t of TECH) if(t.cap&&PROG.tech[t.id]) c=Math.max(c,t.cap); return c; };
const upgLv=(c,s)=>PROG.upg[c+'_'+s]||0;
const owned=id=>!!PROG.tech[id];
// upgrade lines: a type is retired once the next tier of its line has been researched
const superseded=id=>!!(NEXT_TIER[id]&&PROG.tech[NEXT_TIER[id]]);
const currentTier=id=>{ while(NEXT_TIER[id]&&PROG.tech[NEXT_TIER[id]]) id=NEXT_TIER[id]; return id; };
const fieldable=id=>owned(id)&&!superseded(id);
// move soldiers of retired tiers into the newest tier of their line (also upgrades older saves)
function normalizeRoster(){ for(const line of LINES){ let top=null; for(const id of line) if(PROG.tech[id]) top=id; if(!top) continue;
  for(const id of line){ if(id===top) break; const n=PROG.roster[id]||0; if(n){ PROG.roster[top]=(PROG.roster[top]||0)+n; PROG.roster[id]=0; } } } }
const rosterTotal=()=>UNITS.reduce((a,u)=>a+(PROG.roster[u.id]||0),0);
function enemyAbilities(lv){ const a={}; if(lv>=1) a.firearrows=1; if(lv>=2) a.shieldwall=1; if(lv>=3) a.thunder=1; if(lv>=4){a.hymn=1;a.surgery=1;} if(lv>=5) a.shells=1; return a; }
const playerStats=()=>GAME.limited?computeStats(upgLv,PROG.tech):computeStats(lvZero,{});
const enemyStats=lv=>computeStats(()=>lv,enemyAbilities(lv));

/* ---------- game state ---------- */
const GAME={mode:'demo',phase:'battle',level:0,mapId:'hills',seed:1,mapOpt:{},speed:1,lastSpeed:1,gold:0,ended:false,winner:-1,endTimer:-1,settled:null,
  wave:0,waveTimer:-1,survT:0,spawnT:4,limited:false,editTeams:[0,1],rules:{morale:true,rain:false},zones:[null,null],enemyUlv:0,title:'',
  demoCycle:0,terrainDirty:false,terrainT:0,terBackup:null,
  custom:{map:'grassland',blue:1500,red:1500,bs:'balanced',rs:'balanced',dist:'normal',morale:true,rain:false}};
let RENDER='gpu';
const D={selObj:new Set(),fo:[{form:0,order:null,cav:'wings'},{form:0,order:null,cav:'wings'}],comp:[null,null],form:0,order:null,groups:[],nextId:1,tool:'brush',type:0,size:5,density:1,ranks:4,rot:0,team:0,sel:-1,stroke:null,undo:[],terrain:false,ttool:'raise',collapsed:false};

/* ---------- unit + tool icons ---------- */
const ICON_PATHS={
 sword:'<rect x="8" y="9" width="8" height="12" rx="1"/><rect x="9.5" y="3.5" width="5" height="5"/><rect x="17.5" y="5" width="1.6" height="12" opacity=".6"/>',
 spear:'<rect x="8.5" y="10" width="7" height="11" rx="1"/><rect x="10" y="5" width="4" height="4"/><rect x="17.3" y="3" width="1.4" height="19" opacity=".7"/><path d="M18 .5l2 3.5h-4z"/>',
 shield:'<rect x="9" y="3" width="5" height="5" opacity=".7"/><rect x="4.5" y="8" width="15" height="14" rx="1.5"/>',
 heavy:'<rect x="6" y="9" width="12" height="13" rx="1"/><rect x="8.5" y="2.5" width="7" height="6.5"/>',
 bers:'<path d="M12 3l7 9-7 9-7-9z"/>',
 archer:'<path d="M12 5l7 16H5z"/><path d="M4 4q-3 8 0 16" fill="none" stroke="currentColor" stroke-width="1.4"/>',
 xbow:'<path d="M8 8h8l3 13H5z"/><rect x="5" y="5" width="14" height="1.6"/>',
 musket:'<path d="M12 4l7 4v8l-7 4-7-4V8z"/><rect x="18" y="1" width="1.5" height="10" opacity=".7"/>',
 lcav:'<rect x="3" y="11" width="15" height="5" rx="1"/><rect x="16" y="7" width="4" height="5"/><rect x="8" y="5" width="4" height="6"/><rect x="4" y="16" width="1.6" height="5"/><rect x="15" y="16" width="1.6" height="5"/>',
 hcav:'<rect x="2" y="10" width="16" height="7" rx="1"/><rect x="16" y="6" width="5" height="6"/><rect x="7" y="3" width="5" height="7"/><rect x="3" y="17" width="2" height="5"/><rect x="15" y="17" width="2" height="5"/>',
 lancer:'<rect x="3" y="11" width="14" height="5" rx="1"/><rect x="7" y="5" width="4" height="6"/><rect x="9" y="7" width="15" height="1.5"/><rect x="4" y="16" width="1.6" height="5"/><rect x="14" y="16" width="1.6" height="5"/>',
 cata:'<rect x="3" y="15" width="18" height="4"/><rect x="11" y="4" width="2" height="12" transform="rotate(-35 12 15)"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="20" r="2"/>',
 ballista:'<rect x="9" y="12" width="6" height="9"/><rect x="2" y="9" width="20" height="2"/><rect x="11" y="4" width="2" height="9"/>',
 cannon:'<rect x="4" y="8" width="16" height="5" rx="2.5" transform="rotate(-12 12 11)"/><circle cx="9" cy="17" r="4"/>',
 mortar:'<rect x="4" y="15" width="16" height="6"/><rect x="8" y="5" width="8" height="11" rx="1" transform="rotate(25 12 12)"/>',
 cmdr:'<rect x="9" y="11" width="7" height="11"/><rect x="10" y="6" width="5" height="5"/><rect x="5" y="2" width="1.5" height="20"/><path d="M6.5 2h7l-2 3 2 3h-7z"/>',
 medic:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
 eng:'<rect x="7" y="9" width="9" height="13"/><rect x="9" y="4" width="5" height="5"/><rect x="18" y="6" width="1.6" height="14"/><rect x="16" y="5" width="6" height="3"/>',
 elite:'<path d="M12 2l2.6 6.6 7 .4-5.4 4.5 1.8 6.9L12 16.6 6 20.4l1.8-6.9L2.4 9l7-.4z"/>',
};
const unitIcon=ty=>`<svg class="uicon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON_PATHS[UNITS[ty].id]}</svg>`;
const TOOL_ICONS={
 brush:'<circle cx="12" cy="12" r="8.5" stroke-dasharray="2 2.6"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="9" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="14" r="1"/>',
 line:'<path d="M4 17h16M4 13h16" /><circle cx="4" cy="17" r="1.4"/><circle cx="20" cy="17" r="1.4"/>',
 rect:'<rect x="4" y="6" width="16" height="12" rx="1"/>',
 square:'<rect x="3.5" y="3.5" width="17" height="17"/><rect x="8" y="8" width="8" height="8"/>',
 column:'<rect x="9" y="3" width="6" height="18"/><path d="M12 1v1.5"/>',
 wedge:'<path d="M12 3l9 17H3z"/>',
 select:'<path d="M6 3l12 8-5.5 1.5L10 18z"/>',
 erase:'<path d="M5 15l7-7 6 6-5 5H8z"/><path d="M13 19h7"/>',
 pan:'<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
 opts:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
};
const toolIcon=id=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOOL_ICONS[id]}</svg>`;
const TOOLS=[['brush','Brush'],['line','Line'],['rect','Block'],['square','Square'],['column','Column'],['wedge','Wedge'],['select','Select'],['erase','Erase'],['pan','Camera']];
const TOOL_HELP={brush:'Paint soldiers on a grid. A stroke that starts on a regiment of the same type adds to it; anywhere else it starts a new regiment. With none in reserve, painting moves soldiers from your other regiments of that type.',line:'Drag a front line. Ranks stack behind it, facing the enemy.',rect:'Drag a block filled with soldiers.',square:'Drag out a hollow square. Every side faces outward.',column:'Drag a marching column in the direction it should face.',wedge:'Drag from the rear to the tip of a wedge.',select:'Tap a regiment to select it. Shift-tap adds more, or drag a box over several. Drag any selected regiment to move them all.',erase:'Drag to remove soldiers.',pan:'Drag to move the camera. Tap a regiment to select it.'};
const SHAPE_TOOLS=new Set(['line','rect','square','column','wedge']);
const TERRAIN_TOOLS=[['raise','Raise','#8a9a6a'],['lower','Lower','#4d5a3c'],['flatten','Flatten','#6f7f55'],['grass','Grass','#668c48'],['forest','Forest','#3b5c30'],['water','River','#2a5a6c'],['ford','Ford','#5d7c80'],['rock','Cliff','#7d7a74'],['sand','Sand','#d2b47a'],['wall','Wall','#9a958a'],['road','Road','#9c8b68']];
const ORDER_HELP=['March on the enemy and engage.','Stay in place and fight anything that comes close.','Swing wide around the enemy line and strike a flank.','Run straight in at full speed, ignoring formation.'];

/* ---------- small UI helpers ---------- */
let toastT=0;
function toast(msg,ms){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,ms||2200); }
let bannerT=0;
function banner(text,color,ms){ const b=$('#banner'); b.textContent=text; b.style.color=color||'var(--fg)'; b.hidden=false; clearTimeout(bannerT); bannerT=setTimeout(()=>b.hidden=true,ms||1600); }
function openModal(html,onMount){ const m=$('#modal'), s=$('#sheet'); $('#toast').hidden=true; s.innerHTML=html; m.hidden=false; s.scrollTop=0; if(onMount) onMount(s); }
function closeModal(){ $('#modal').hidden=true; }
function closePops(){ $('#brushPop').hidden=true; $('#soundPop').hidden=true; }
function hideCards(){ $('#inspect').hidden=true; $('#groupPanel').hidden=true; $('#statsPanel').hidden=true; closePops(); VIEW.hlUnit=-1; }
$('#modal').addEventListener('pointerdown',e=>{ if(e.target.id==='modal') closeModal(); });
function showDock(which){
  $('#deployDock').hidden=which!=='deploy'; $('#battleDock').hidden=which!=='battle'; $('#resultDock').hidden=which!=='result';
  requestAnimationFrame(measureDock);
}
function measureDock(){ document.documentElement.style.setProperty('--top-h',$('.topbar').offsetHeight+'px'); const d=['#deployDock','#battleDock','#resultDock'].map(q=>$(q)).find(e=>!e.hidden)||null; document.documentElement.style.setProperty('--dock-h',(d?d.offsetHeight:0)+'px'); }
new ResizeObserver(measureDock).observe($('#deployDock'));
new ResizeObserver(measureDock).observe($('#battleDock'));
new ResizeObserver(measureDock).observe($('#resultDock'));
new ResizeObserver(measureDock).observe($('.topbar'));

/* ---------- terrain refresh ---------- */
const MINI={base:null,buf:null,ctx:null,w:300,h:180};
function onTerrainChanged(){
  if(RENDER==='gpu'){ gpuSetTerrain(TER); gpuSetStakes(TER); }
  r2dSetTerrain(TER);
  const c=$('#minimap'); MINI.ctx=c.getContext('2d'); MINI.w=c.width; MINI.h=c.height;
  MINI.ctx.imageSmoothingEnabled=true; MINI.ctx.drawImage(R2D.img,0,0,MINI.w,MINI.h);
  MINI.base=MINI.ctx.getImageData(0,0,MINI.w,MINI.h); MINI.buf=MINI.ctx.createImageData(MINI.w,MINI.h);
  GAME.terrainDirty=false;
}
function markTerrainDirty(){ GAME.terrainDirty=true; }

/* ---------- modes ---------- */
function availableTypes(){ return UNITS.map((u,i)=>i).filter(i=>!GAME.limited||fieldable(UNITS[i].id)); }
function serializeGroups(gs){ return gs.map(g=>({type:UNITS[g.type].id,order:g.order,cx:+g.cx.toFixed(2),cz:+g.cz.toFixed(2),a:+g.a.toFixed(3),sp:+(g.sp||UNITS[g.type].sp).toFixed(3),slots:g.slots.map(v=>+v.toFixed(2))})); }
function deserializeGroups(arr,team){ const out=[]; for(const g of (arr||[])){ const ty=UID[GAME.limited&&UID[g.type]!==undefined?currentTier(g.type):g.type]; if(ty===undefined||!Array.isArray(g.slots)) continue; out.push({team,type:ty,order:ORDER_IDS.includes(g.order)?g.order:defaultOrder(ty),cx:+g.cx||0,cz:+g.cz||0,a:+g.a||0,sp:+g.sp||UNITS[ty].sp,slots:g.slots.map(Number)}); } return out; }
function inZone(x,z,team){ const zn=GAME.zones[team]; if(!zn) return x>X0+2&&x<X1-2&&z>Z0+2&&z<Z1-2; return x>=zn[0]&&x<=zn[1]&&z>Z0+2&&z<Z1-2; }
function validateGroups(gs,T){ for(const g of gs){ const keep=[]; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if(passAtT(T,wx,wz)&&inZone(wx,wz,g.team)) keep.push(g.slots[k],g.slots[k+1],g.slots[k+2]); } g.slots=keep; } return gs.filter(g=>g.slots.length); }
function trimToRoster(gs){
  const left={}; UNITS.forEach(u=>left[u.id]=PROG.roster[u.id]||0); let cap=capOf();
  for(const g of gs){ const id=UNITS[g.type].id; if(!fieldable(id)){ g.slots=[]; continue; } const n=Math.min(g.slots.length/3,left[id],cap); g.slots.length=n*3; left[id]-=n; cap-=n; }
  return gs.filter(g=>g.slots.length);
}
// the soldiers who take the field. Over the army limit, commanders, medics and engineers all come,
// then the formation picks the rest. Each type gets a priority from how much the formation wants its role
// (squared, so a shield wall really does fill up with shields and spears first) times how good a soldier it
// is (by cost: champions, heavy cavalry and cannons before levies). High-priority types come in full;
// the rest share what room is left in proportion to their numbers and priority.
function unitQuality(i){ return Math.sqrt(clamp(UNITS[i].cost/12,0.6,4)); }
function autoCounts(formId){
  const counts=new Array(NT).fill(0), cap=capOf(), have=new Array(NT).fill(0); let tot=0;
  UNITS.forEach((u,i)=>{ if(fieldable(u.id)){ have[i]=PROG.roster[u.id]||0; tot+=have[i]; } });
  if(tot<=cap) return have;
  let room=cap; for(const id of ['cmdr','medic','eng']){ const i=UID[id]; counts[i]=Math.min(have[i],room); room-=counts[i]; }
  const want=(FORM_BY[formId||progForm()]||FORMATIONS[0]).want;
  const w=UNITS.map((u,i)=>{ const r=unitRole(i); if(r==='sup') return 0; const f=want[r]===undefined?1:want[r]; return f*f*unitQuality(i); });
  // find the share x so that sum(min(have, x*have*w)) fills the room
  const fill=x=>{ let s=0; for(let i=0;i<NT;i++) if(w[i]) s+=Math.min(have[i],x*have[i]*w[i]); return s; };
  let lo=0, hi=1; while(fill(hi)<room && hi<1e6) hi*=2; for(let k=0;k<40;k++){ const m=(lo+hi)/2; if(fill(m)<room) lo=m; else hi=m; }
  const exact=UNITS.map((u,i)=>w[i]?Math.min(have[i],lo*have[i]*w[i]):0);
  for(let i=0;i<NT;i++) if(w[i]) counts[i]=Math.floor(exact[i]);
  let left=cap-counts.reduce((a,b)=>a+b,0); const ord=exact.map((v,i)=>[v-Math.floor(v),i]).filter(p=>w[p[1]]&&counts[p[1]]<have[p[1]]).sort((a,b)=>b[0]-a[0]);
  for(let j=0;left>0&&j<ord.length;j++,left--) counts[ord[j][1]]++;
  return counts;
}
// the formation the player last chose (older saves stored a number)
function progForm(){ if(PROG.formId&&FORM_BY[PROG.formId]) return PROG.formId; const old=['ranks','line','blocks','wedge','column'][PROG.form|0]||'ranks'; PROG.formId=old; return old; }
// extra layout hints for the map: the fortress gates for an attacking army
function formOpt(team){ return GAME.mapId==='fortress'&&team===0&&GAME.mode!=='survival'?{gates:FORT_GATES.map(g=>g*MS)}:{}; }
function playerLayout(T,saved,opt){
  const id=progForm();
  return validateGroups(layoutFormation(0,autoCounts(id),T,id,null,Object.assign({cav:FORM_BY[id].cav},formOpt(0),opt||{})),T);
}
function enterDeploy(cfg){
  closeModal(); hideCards(); $('#banner').hidden=true;
  Object.assign(GAME,{mode:cfg.mode,phase:'deploy',level:cfg.level||0,limited:!!cfg.limited,editTeams:cfg.editTeams||[0],rules:Object.assign({morale:true,rain:false},cfg.rules||{}),
    zones:cfg.zones||[null,null],enemyUlv:cfg.ulv||0,title:cfg.title||'',ended:false,endTimer:-1,gold:0,coinPlayed:false,wave:0,waveTimer:-1,survT:0,spawnT:4,settled:null,winner:-1,base0:0,deadAt:[]});
  resetBattle();
  if(!cfg.keepTerrain){ GAME.mapId=cfg.mapId; GAME.seed=cfg.seed; GAME.mapOpt=cfg.mapOpt||{}; TER=genMap(cfg.mapId,cfg.seed,cfg.mapOpt||{}); }
  else if(GAME.terBackup){ TER.k.set(GAME.terBackup.k); TER.own.fill(-1); }
  onTerrainChanged();
  STT=[playerStats(),enemyStats(GAME.enemyUlv)];
  D.groups=[]; D.nextId=1; D.undo=[]; D.sel=-1; D.selObj.clear(); BSEL.clear(); D.team=GAME.editTeams[0]; D.terrain=false; D.stroke=null;
  D.fo=[{form:'ranks',order:null,cav:'wings'},{form:'ranks',order:null,cav:'wings'}];
  if(GAME.limited){ const id=progForm(); D.fo[0]={form:id,order:null,cav:FORM_BY[id].cav}; }
  const gs=cfg.groups || (cfg.makeGroups?cfg.makeGroups(TER):[]);
  addDeployGroups(gs);
  const av=availableTypes(); if(!av.includes(D.type)) D.type=av[0]||0;
  D.comp=[0,1].map(t=>Array.from(deployCounts(t).by));
  syncDeploy();
  VIEW.zones=GAME.zones.map(z=>z?[z[0],z[1]]:null);
  if(!GAME.limited && GAME.editTeams.length>1) VIEW.zones=[ZONES[0],ZONES[1]];
  camPreset('iso',!cfg.keepCamera);
  buildDeployDock(); showDock('deploy'); updateHud(true);
}
function addDeployGroup(g){ const n={id:D.nextId++,team:g.team,type:g.type,order:g.order||defaultOrder(g.type),cx:g.cx,cz:g.cz,a:g.a,slots:g.slots.slice(),sp:g.sp||UNITS[g.type].sp}; D.groups.push(n); return n; }
// add a layout's regiments, keeping commanders and medics linked to the regiment they stand inside
function addDeployGroups(gs){ const made=new Map(); for(const g of gs) made.set(g,addDeployGroup(g)); for(const g of gs) if(g.embedOf&&made.has(g.embedOf)) made.get(g).withId=made.get(g.embedOf).id; }
// a selection plus the officers and medics inside the selected regiments
function withLinked(list){ const ids=new Set(list.map(g=>g.id)); return list.concat(D.groups.filter(g=>g.withId&&ids.has(g.withId)&&!list.includes(g))); }
function syncDeploy(){
  N=0;
  for(let gi=0;gi<D.groups.length;gi++){ const g=D.groups[gi], ca=Math.cos(g.a), sa=Math.sin(g.a);
    for(let k=0;k<g.slots.length;k+=3){ if(N>=MAXU) break; const lx=g.slots[k], lz=g.slots[k+1];
      initUnit(N,g.team,g.type,g.cx+sa*lx+ca*lz,g.cz-ca*lx+sa*lz,g.a+g.slots[k+2],gi,lx,lz,g.slots[k+2]); N++; } }
  refreshHighlight();
}
const ENEMY_FORMS=['ranks','line','wedge','blocks','crescent','column','echelon','hammer'];
const campaignDone=()=>!!PROG.won[CAMPAIGN_LEN];
function openCampaign(L){
  L=clamp(L|0,1,CAMPAIGN_LEN);
  const cl=campaignLevel(L), mapOpt={fortSide:1};
  enterDeploy({mode:'campaign',level:L,mapId:cl.mapId,seed:cl.seed,mapOpt,limited:true,editTeams:[0],zones:[ZONES[0],null],ulv:cl.ulv,title:`Battle ${L} · ${cl.name}`,
    makeGroups:T=>{ const red=layoutFormation(1,armyCounts(cl.count,cl.pool,cl.style,mulberry32(cl.seed+5)),T,ENEMY_FORMS[L%ENEMY_FORMS.length],null,cl.mapId==='fortress'?{back:FORT_BACK}:{}); if(cl.mapId==='fortress'||cl.mapId==='pass'&&L%2===0) red.forEach(g=>{ if(UNITS[g.type].cls!=='cav') g.order='hold'; });
      return [...playerLayout(T,PROG.layout),...red]; }});
  if(cl.mapId==='fortress') setTimeout(()=>toast('Fortress: the walls cannot be broken. Try Storm the gates to line your columns up on the three gates.',4200),2800);
  toast(cl.final?`The last battle: ${fmt(cl.count)} enemy soldiers on ${MAPS.find(m=>m.id===cl.mapId).name}`:`${fmt(cl.count)} enemy soldiers on ${MAPS.find(m=>m.id===cl.mapId).name}`,2600);
}
function openEndless(mapId){
  enterDeploy({mode:'endless',mapId,seed:(Math.random()*1e6)|0,limited:true,editTeams:[0],zones:[ZONES[0],null],ulv:0,title:'Endless waves',makeGroups:T=>playerLayout(T,PROG.layout)});
}
function survivalLayout(T){
  let gs=trimToRoster(validateGroups(deserializeGroups(PROG.layoutSurv,0),T));
  const n=gs.reduce((a,g)=>a+g.slots.length/3,0);
  if(!PROG.layoutSurv || n<Math.min(rosterTotal(),capOf())*0.5) gs=validateGroups(layoutSurvival(autoCounts(),T),T);
  return gs;
}
function openSurvival(){
  const z=[X0+8,-FORT_WX-2.4];
  enterDeploy({mode:'survival',mapId:'fortress',seed:777,mapOpt:{fortSide:0},limited:true,editTeams:[0],zones:[z,null],ulv:0,title:'Survival · hold the wall',
    makeGroups:T=>survivalLayout(T)});
}
function openSandbox(mapId,withArmies){
  const ids=UNITS.map(u=>u.id);
  enterDeploy({mode:'sandbox',mapId,seed:(Math.random()*1e6)|0,mapOpt:{fortSide:1},limited:false,editTeams:[0,1],title:'Sandbox',
    makeGroups:T=>withArmies?[0,1].map(t=>layoutFormation(t,armyCounts(900,ids,'balanced',mulberry32(11+t*18)),T,'ranks',null)).flat():[]});
}
function openCustom(c){
  const ids=UNITS.map(u=>u.id), back={close:-12,normal:0,far:30}[c.dist]||0;
  enterDeploy({mode:'custom',mapId:c.map,seed:(Math.random()*1e6)|0,mapOpt:{fortSide:1},limited:false,editTeams:[0,1],rules:{morale:c.morale,rain:c.rain},title:'Custom battle',
    makeGroups:T=>[...layoutFormation(0,armyCounts(c.blue,ids,c.bs,mulberry32((Math.random()*1e9)|0)),T,'ranks',null,{back}),...layoutFormation(1,armyCounts(c.red,ids,c.rs,mulberry32((Math.random()*1e9)|0)),T,'ranks',null,{back:back+(c.map==='fortress'?FORT_BACK:0)})]});
}
function startDemo(){
  const maps=['hills','river','grassland','forest','desert','pass'];
  const mapId=maps[GAME.demoCycle%maps.length]; GAME.demoCycle++;
  const ids=UNITS.map(u=>u.id), n=Math.min(1300, 700+GAME.demoCycle*120);
  enterDeploy({mode:'demo',mapId,seed:4242+GAME.demoCycle,limited:false,editTeams:[0,1],title:'Demonstration · '+MAPS.find(m=>m.id===mapId).name,
    makeGroups:T=>[...genArmy(0,n,ids,STYLE_CYCLE[GAME.demoCycle%7],101+GAME.demoCycle,T),...genArmy(1,n,ids,STYLE_CYCLE[(GAME.demoCycle+3)%7],202+GAME.demoCycle,T)]});
  startBattle(true);
}
function startBattle(silent){
  if(GAME.phase!=='deploy') return;
  const blue=D.groups.filter(g=>g.team===0&&g.slots.length), red=D.groups.filter(g=>g.team===1&&g.slots.length);
  if(!blue.length){ toast('Place some of your soldiers first'); return; }
  if(!red.length && GAME.mode!=='endless' && GAME.mode!=='survival'){ toast('The red army is empty. Switch to Red and paint some enemies.'); return; }
  if(GAME.limited){ if(GAME.mode==='survival') PROG.layoutSurv=serializeGroups(blue); else PROG.layout=serializeGroups(blue); saveProg(); }
  GAME.lastDeploy=D.groups.map(g=>({...g,slots:g.slots.slice()}));
  GAME.terBackup={k:TER.k.slice()};
  STT=[playerStats(),enemyStats(GAME.enemyUlv)];
  setAbilities(0,GAME.limited?PROG.tech:{}); setAbilities(1,GAME.limited?enemyAbilities(GAME.enemyUlv):{});
  resetBattle(); seedRng(GAME.seed*31+7);
  B.rules=GAME.rules; B.onKill=onKill; B.onEscape=onEscape;
  addGroupsToSim(D.groups.filter(g=>g.slots.length));
  GAME.phase='battle'; GAME.ended=false; GAME.gold=0; GAME.endTimer=-1;
  if(GAME.mode==='endless'){ GAME.wave=1; GAME.deadAt=Array.from(B.deadT[0]); spawnEndlessWave(); }
  if(GAME.mode==='survival'){ GAME.survT=0; GAME.spawnT=1; B.noHunt=true; }
  VIEW.zones=[null,null]; D.sel=-1; D.selObj.clear(); BSEL.clear(); VIEW.hlMask=null; D.terrain=false;
  hideCards(); showDock('battle'); setSpeed(GAME.speed||1); updateHud(true);
  $('#btnEnd').textContent=GAME.limited?'Withdraw':'End';
  if(!silent){ banner('Advance!','var(--brass-hi)',1200); audBattleStart(); }
}
const killPay=()=>GAME.mode==='campaign'?0.6:0.45;
function onKill(t){ if(GAME.limited && TM[t]===1) GAME.gold+=UNITS[TY[t]].cost*killPay(); if(VIEW.hlUnit===t) setTimeout(updateInspect,0); }
function onEscape(i){ if(GAME.limited && TM[i]===1) GAME.gold+=UNITS[TY[i]].cost*killPay()*0.5; }
function spawnEndlessWave(){
  const w=GAME.wave; if(!GAME.base0) GAME.base0=B.start[0]; const base=Math.max(40,Math.round(GAME.base0*0.5));
  const count=Math.min(6000,Math.round(base*Math.pow(1.25,w-1)));
  const L=Math.min(20,Math.floor(1+w*1.6)), pool=poolAt(L);
  const lv=Math.min(5,Math.floor((w-1)/3)); STT[1]=enemyStats(lv); setAbilities(1,enemyAbilities(lv));
  const wg=validateGroupsAny(genArmy(1,count,pool,STYLE_CYCLE[w%7],GAME.seed+w*101,TER,{back:70})); GAME.waveN=wg.reduce((a,g)=>a+g.slots.length/3,0); B.broken[1]=false;
  addGroupsToSim(wg);
  B.phaseT=simTime; B.lastKill=simTime;
  banner('Wave '+w,'var(--red)',1500); if(w>1) audWave();
}
function spawnSurvivalBatch(){
  // spawn rate scales with the size of the defending army and climbs steadily over time
  const t=GAME.survT, s0=Math.max(150,B.start[0]), count=Math.max(12,Math.round(s0*(0.0035+t*0.00004)*8)), L=Math.min(20,Math.floor(1+t/30)), pool=poolAt(L);
  const lv=Math.min(5,Math.floor(t/100)); STT[1]=enemyStats(lv); setAbilities(1,enemyAbilities(lv));
  const gs=genArmy(1,count,pool,STYLE_CYCLE[(tick/7|0)%7],GAME.seed+tick,TER,{back:66});
  const dz=(rnd()-0.5)*90*MS; gs.forEach(g=>{ g.cz=clamp(g.cz+dz,-70*MS,70*MS); g.order='advance'; });
  addGroupsToSim(validateGroupsAny(gs));
}
function validateGroupsAny(gs){ for(const g of gs){ const keep=[]; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if(passAt(wx,wz)) keep.push(g.slots[k],g.slots[k+1],g.slots[k+2]); } g.slots=keep; } return gs.filter(g=>g.slots.length); }
// an army reduced to a tenth of its strength and heavily outnumbered breaks and flees for good
function checkBreak(t,start){ if(!B.rules.morale||B.broken[t]) return; const a=B.active[t]; if(a>0 && a<=Math.max(2,start*0.1) && a<B.active[t^1]*0.25) breakArmy(t); }
function afterTick(){
  if(stakesChanged){ stakesChanged=false; GAME.stakesDirty=true; }
  if(GAME.ended) return;
  if(GAME.mode==='endless'){
    checkBreak(0,B.start[0]); checkBreak(1,GAME.waveN||B.start[1]);
    if(B.active[0]===0){ endBattle(1); return; }
    if(B.active[1]===0 && GAME.waveTimer<0){ GAME.gold+=GAME.wave*40; GAME.waveTimer=5; GAME.wave++;
      for(let i=0;i<N;i++) if(TM[i]===0&&(SS[i]===1||SS[i]===2)){ const st=STT[0][TY[i]]; HP[i]=st.hp; MO[i]=st.morale; SS[i]=1; TG[i]=-1; RC[i]=0; }
      const counts=new Array(NT).fill(0); let nr=0;
      for(let t=0;t<NT;t++){ counts[t]=Math.floor((B.deadT[0][t]-(GAME.deadAt[t]||0))*0.35); nr+=counts[t]; }
      GAME.deadAt=Array.from(B.deadT[0]);
      if(nr>0){ const gs=validateGroupsAny(layoutArmy(0,counts,TER,{back:60})); addGroupsToSim(gs); }
      toast(`Wave ${GAME.wave-1} broken. Survivors healed`+(nr>0?` and ${fmt(nr)} reinforcements arrive.`:'.'),3000); }
    if(GAME.waveTimer>0){ GAME.waveTimer-=DT; if(GAME.waveTimer<=0){ GAME.waveTimer=-1; spawnEndlessWave(); } }
  } else if(GAME.mode==='survival'){
    GAME.survT+=DT; GAME.spawnT-=DT;
    if(GAME.spawnT<=0){ spawnSurvivalBatch(); GAME.spawnT=8; }
    checkBreak(0,B.start[0]);
    if(B.active[0]===0) endBattle(1);
  } else {
    checkBreak(0,B.start[0]); checkBreak(1,B.start[1]);
    if(B.active[0]===0||B.active[1]===0||simTime>420){
      let w=-1; if(B.active[0]>0&&B.active[1]===0) w=0; else if(B.active[1]>0&&B.active[0]===0) w=1;
      else if(simTime>420){ const v=t=>{ let s=0; for(let i=0;i<N;i++) if(TM[i]===t&&SS[i]===1) s+=UNITS[TY[i]].cost; return s; }; const a=v(0), b=v(1); w=a>b?0:b>a?1:-1; }
      endBattle(w);
    }
  }
}
function endBattle(winner){
  if(GAME.ended) return;
  BSELMODE=false; $('#btnBSel').classList.remove('on');
  GAME.ended=true; GAME.winner=winner; GAME.endTimer=2.6;
  if(GAME.mode!=='demo') audEnd(GAME.limited?winner===0:winner>=0);
  if(GAME.mode==='demo'){ banner(winner===0?'Blue wins':winner===1?'Red wins':'Stalemate',winner===0?'var(--blue)':winner===1?'var(--red)':'var(--fg)',2400); return; }
  if(GAME.mode==='endless') banner('Overrun','var(--red)',2200);
  else if(GAME.mode==='survival') banner('The wall falls','var(--red)',2200);
  else if(GAME.mode==='campaign'&&winner===0&&GAME.level===CAMPAIGN_LEN) banner('The war is won','var(--brass-hi)',2600);
  else banner(winner===0?'Victory':winner===1?'Defeat':'Stalemate',winner===0?'var(--brass-hi)':winner===1?'var(--red)':'var(--fg)',2200);
}
function settleRewards(){
  if(GAME.settled) return GAME.settled;
  const lines=[]; let total=0; const won=GAME.winner===0;
  const kg=Math.round(GAME.gold); if(GAME.limited){ lines.push([GAME.mode==='endless'?'Casualties, routs and wave bonuses':'Enemy casualties and routs',kg]); total+=kg; }
  if(GAME.mode==='campaign'){
    const L=GAME.level, cl=campaignLevel(L);
    if(won){
      const rep=!!PROG.won[L], bonus=Math.round(cl.reward*(rep?0.35:1)); lines.push([rep?'Victory (replayed battle)':'Victory',bonus]); total+=bonus;
      if(B.dead[0]/Math.max(1,B.start[0])<0.25){ const b=Math.round(bonus*0.25); lines.push(['Decisive: under 25% losses',b]); total+=b; }
      if(simTime<100){ const b=Math.round(bonus*0.15); lines.push(['Swift: won inside 100 seconds',b]); total+=b; }
      if(B.esc[0]===0){ const b=Math.round(bonus*0.1); lines.push(['Unbroken: no soldier routed off the field',b]); total+=b; }
      PROG.won[L]=true; if(PROG.level<=L) PROG.level=Math.min(L+1,CAMPAIGN_LEN);
    }
  } else if(GAME.mode==='endless'){ if(GAME.wave-1>PROG.best.endless) PROG.best.endless=GAME.wave-1; }
  else if(GAME.mode==='survival'){ const b=Math.floor(GAME.survT/10)*15; lines.push(['Time held',b]); total+=b; if(GAME.survT>PROG.best.survival) PROG.best.survival=Math.floor(GAME.survT); }
  // soldiers who fled off the field have deserted: they leave the roster for good
  let deserted=0;
  // (soldiers still running when the battle ends are rounded up; Endless and Survival never cost deserters)
  if(GAME.limited&&GAME.mode==='campaign'){ for(let ty=0;ty<NT;ty++){ const n=B.escT[0][ty]; if(!n) continue; const id=UNITS[ty].id; const had=PROG.roster[id]||0; const lost=Math.min(had,n); PROG.roster[id]=had-lost; deserted+=lost; } }
  PROG.gold+=total; saveProg();
  GAME.settled={lines,total,deserted}; return GAME.settled;
}

/* ---------- deploy tools ---------- */
const OW=(X1-X0)*2, OH=(Z1-Z0)*2, OCC=new Uint8Array(OW*OH); let OCCB=null;
function occBox(x,z,hs,set){
  const i0=Math.max(0,Math.floor((x-hs-X0)*2)), i1=Math.min(OW-1,Math.floor((x+hs-X0)*2)), j0=Math.max(0,Math.floor((z-hs-Z0)*2)), j1=Math.min(OH-1,Math.floor((z+hs-Z0)*2));
  for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){ if(set) OCC[j*OW+i]=1; else if(OCC[j*OW+i]) return false; }
  return true;
}
function rebuildOcc(skip){ OCC.fill(0); D.groups.forEach((g,gi)=>{ if(gi===skip) return; const hs=(g.sp||UNITS[g.type].sp)*0.45; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); occBox(wx,wz,hs,true); } }); }
function deployCounts(team){ const by=new Array(NT).fill(0); let total=0; for(const g of D.groups) if(g.team===team){ const n=g.slots.length/3; by[g.type]+=n; total+=n; } return {by,total}; }
function remainingFor(type,team){
  if(!GAME.limited || team!==0) return Math.max(0,MAXU-2000-D.groups.reduce((a,g)=>a+g.slots.length/3,0));
  const c=deployCounts(0); return Math.max(0,Math.min((PROG.roster[UNITS[type].id]||0)-c.by[type],capOf()-c.total));
}
function allowedAt(x,z,team){ return passAt(x,z) && inZone(x,z,team); }
const defaultFacing=team=>team===0?0:Math.PI;
function pushUndo(){ D.undo.push(JSON.stringify({g:D.groups,fo:D.fo,comp:D.comp})); if(D.undo.length>40) D.undo.shift(); }
// restore soldiers together with formation, ordering and composition
function popUndo(){ const u=JSON.parse(D.undo.pop()); if(Array.isArray(u)){ D.groups=u; return; } D.groups=u.g; D.fo=u.fo; D.comp=u.comp; }
function undo(){ if(GAME.phase!=='deploy'||!D.undo.length) return; popUndo(); D.sel=-1; D.selObj.clear(); syncDeploy(); buildDeployDock(); }
function toolBegin(W){
  pushUndo();
  if(D.tool==='erase'){ D.stroke={type:'erase'}; eraseAt(W); return; }
  const type=D.type, team=D.team, sp=UNITS[type].sp/D.density;
  // a brush stroke that starts on a regiment of the same type adds to that regiment
  let g=null, extend=false;
  if(D.tool==='brush'){ const i=pickUnit(W,Math.max(1.8,D.size*0.6),[team]); if(i>=0&&TY[i]===type&&D.groups[GR[i]]){ g=D.groups[GR[i]]; extend=true; } }
  if(!g){ g={id:D.nextId++,team,type,order:defaultOrder(type),cx:W[0],cz:W[1],a:defaultFacing(team)+D.rot,slots:[],sp}; D.groups.push(g); }
  const base=g.slots.length/3;
  const free=remainingFor(type,team);
  // with no soldiers of this type in reserve, painting moves them from your other regiments of the same type
  let donors=[], borrow=0;
  if(GAME.limited && team===0){ donors=D.groups.filter(x=>x!==g && x.team===0 && x.type===type && x.slots.length).map(x=>({g:x,slots:x.slots.slice()})); borrow=donors.reduce((a,x)=>a+x.slots.length/3,0); }
  const rem=free+borrow;
  if(rem<=0){ if(!extend) D.groups.pop(); D.undo.pop(); D.stroke=null; toast(noRoomReason(type,team),3200); return; }
  D.stroke={type:D.tool,g,A:W,last:W,rem,free,donors,base,extend,miss:{zone:0,terrain:0,occ:0},gi:extend?-1:D.groups.length-1};
  rebuildOcc(D.stroke.gi); OCCB=OCC.slice();
  if(D.tool==='brush') brushFill(D.stroke,W); else shapeUpdate(D.stroke,W);
  applyBorrow(D.stroke);
  if(g.slots.length>base*3) audPlace();
  syncDeploy();
}
function toolMove(W){
  const st=D.stroke; if(!st) return;
  if(st.type==='erase'){ eraseAt(W); return; }
  const before=st.g.slots.length;
  if(st.type==='brush'){
    const dx=W[0]-st.last[0], dz=W[1]-st.last[1], d=Math.hypot(dx,dz), step=Math.max(0.5,Math.min(D.size*0.5,st.g.sp));
    const n=Math.ceil(d/step); for(let k=1;k<=n;k++) brushFill(st,[st.last[0]+dx*k/n,st.last[1]+dz*k/n]);
    st.last=W;
  } else shapeUpdate(st,W);
  applyBorrow(st);
  if(st.g.slots.length!==before) audPlace();
  syncDeploy(); updateCapBox();
}
function toolEnd(){
  const st=D.stroke; D.stroke=null; if(!st) return;
  if(st.g){
    const g=st.g, placed=g.slots.length/3-(st.base||0), moved=Math.max(0,placed-st.free);
    if(!placed){ if(!st.extend) D.groups.splice(D.groups.indexOf(g),1); D.undo.pop(); const m=st.miss;
      toast(m.zone?'Place soldiers inside your deployment zone, the tinted area on your side of the field.':m.terrain?'Soldiers cannot stand on deep water, cliffs or walls.':m.occ?'That ground is already taken. Use Select to move a regiment, or Erase to clear space.':'Nothing was placed there.',3200); }
    else { if(st.type==='brush') recenter(g);
      if(moved>0){ const sel=D.groups[D.sel]; D.groups=D.groups.filter(x=>x.slots.length); D.sel=sel?D.groups.indexOf(sel):-1; for(const d of st.donors) if(d.g.slots.length) recenter(d.g);
        toast(`Moved ${fmt(moved)} ${UNITS[g.type].name.toLowerCase()} from your other regiments`,2200); } }
  }
  syncDeploy(); refreshDeployUi();
}
// take the soldiers a stroke has placed beyond the reserve out of the back ranks of other regiments of that type
function applyBorrow(st){
  if(!st.donors||!st.donors.length) return;
  let need=Math.max(0,st.g.slots.length/3-(st.base||0)-st.free);
  for(const d of st.donors) d.g.slots=d.slots.slice();
  const order=st.donors.slice().sort((a,b)=>b.slots.length-a.slots.length);
  for(const d of order){ if(need<=0) break; const take=Math.min(need,d.g.slots.length/3); d.g.slots.length-=take*3; need-=take; }
}
function noRoomReason(type,team){
  if(!GAME.limited||team!==0) return 'The battlefield is full. Remove some soldiers first.';
  const u=UNITS[type], own=PROG.roster[u.id]||0, cap=capOf();
  if(own<=0) return `You have no ${u.name.toLowerCase()}. Recruit them in the Council.`;
  if(deployCounts(0).by[type]>=own) return `All ${fmt(own)} of your ${u.name.toLowerCase()} are already on the field. Recruit more in the Council, or erase some to paint them somewhere else.`;
  return `Your army is at its limit of ${fmt(cap)} soldiers. Remove some, or research Logistics in the Council to field more.`;
}
function missReason(st,x,z,team){ if(!inZone(x,z,team)) st.miss.zone++; else if(!passAt(x,z)) st.miss.terrain++; else st.miss.occ++; }
function toolCancel(){ D.stroke=null; if(D.undo.length){ popUndo(); } syncDeploy(); refreshDeployUi(); }
function brushFill(st,W){
  const g=st.g, sp=g.sp, R=D.size, hs=sp*0.45;
  const gx0=Math.floor((W[0]-R)/sp), gx1=Math.ceil((W[0]+R)/sp), gz0=Math.floor((W[1]-R)/sp), gz1=Math.ceil((W[1]+R)/sp);
  for(let gz=gz0;gz<=gz1;gz++) for(let gx=gx0;gx<=gx1;gx++){
    if(st.rem<=0) return;
    const px=gx*sp, pz=gz*sp; if((px-W[0])**2+(pz-W[1])**2>R*R) continue;
    if(!allowedAt(px,pz,g.team) || !occBox(px,pz,hs,false)){ missReason(st,px,pz,g.team); continue; }
    occBox(px,pz,hs,true); const [lx,lz]=worldToLocal(g,px,pz); g.slots.push(lx,lz,0); st.rem--;
  }
}
function recenter(g){
  let sx=0,sz=0; const n=g.slots.length/3; const pts=[];
  for(let k=0;k<g.slots.length;k+=3){ const p=localToWorld(g,g.slots[k],g.slots[k+1]); pts.push(p); sx+=p[0]; sz+=p[1]; }
  g.cx=sx/n; g.cz=sz/n; for(let k=0;k<pts.length;k++){ const [lx,lz]=worldToLocal(g,pts[k][0],pts[k][1]); g.slots[k*3]=lx; g.slots[k*3+1]=lz; }
}
function shapeUpdate(st,W){
  OCC.set(OCCB);
  const g=st.g, sp=g.sp, A=st.A, team=g.team, ranks=Math.max(1,Math.round(D.ranks));
  let dx=W[0]-A[0], dz=W[1]-A[1], len=Math.hypot(dx,dz);
  let cand=[]; // local slots
  if(st.type==='line'){
    let ux=len>0.3?dx/len:0, uz=len>0.3?dz/len:1;
    let nx=uz, nz=-ux; const want=team===0?1:-1; if(nx*want<0||(Math.abs(nx)<1e-3&&nz*want<0)){ nx=-nx; nz=-nz; }
    g.a=Math.atan2(nz,nx); const cols=Math.floor(len/sp)+1;
    g.cx=(A[0]+W[0])/2-nx*(ranks-1)*sp/2; g.cz=(A[1]+W[1])/2-nz*(ranks-1)*sp/2;
    for(let r=0;r<ranks;r++) for(let c=0;c<cols;c++){ const wx=A[0]+ux*c*sp-nx*r*sp, wz=A[1]+uz*c*sp-nz*r*sp; const [lx,lz]=worldToLocal(g,wx,wz); cand.push(lx,lz,0); }
  } else if(st.type==='rect'){
    g.a=defaultFacing(team)+D.rot; g.cx=(A[0]+W[0])/2; g.cz=(A[1]+W[1])/2;
    const x0=Math.min(A[0],W[0]), x1=Math.max(A[0],W[0]), z0=Math.min(A[1],W[1]), z1=Math.max(A[1],W[1]);
    const front=team===0?x1:x0, dir=team===0?-1:1;
    const nxs=Math.floor((x1-x0)/sp)+1, nzs=Math.floor((z1-z0)/sp)+1;
    for(let a=0;a<nxs;a++) for(let b=0;b<nzs;b++){ const wx=front+dir*a*sp, wz=z0+b*sp; const [lx,lz]=worldToLocal(g,wx,wz); cand.push(lx,lz,0); }
  } else if(st.type==='square'){
    g.a=defaultFacing(team)+D.rot; g.cx=A[0]; g.cz=A[1];
    const n=Math.max(1,Math.round(Math.max(sp*1.5,len)/sp)), t=Math.min(ranks,n);
    for(let gz=-n;gz<=n;gz++) for(let gx=-n;gx<=n;gx++){ if(Math.max(Math.abs(gx),Math.abs(gz))<=n-t) continue;
      let la; if(Math.abs(gz)>=Math.abs(gx)) la=gz>0?0:Math.PI; else la=gx>0?-Math.PI/2:Math.PI/2;
      cand.push(gx*sp,gz*sp,la); }
  } else if(st.type==='column'){
    const ux=len>0.3?dx/len:Math.cos(defaultFacing(team)), uz=len>0.3?dz/len:Math.sin(defaultFacing(team));
    g.a=Math.atan2(uz,ux); g.cx=(A[0]+W[0])/2; g.cz=(A[1]+W[1])/2;
    const rows=Math.floor(len/sp)+1;
    for(let r=0;r<rows;r++) for(let f=0;f<ranks;f++) cand.push((f-(ranks-1)/2)*sp, len/2-r*sp, 0);
  } else if(st.type==='wedge'){
    const ux=len>0.3?dx/len:Math.cos(defaultFacing(team)), uz=len>0.3?dz/len:Math.sin(defaultFacing(team));
    g.a=Math.atan2(uz,ux); g.cx=(A[0]+W[0])/2; g.cz=(A[1]+W[1])/2;
    const rows=Math.floor(len/(sp*0.9))+1;
    for(let k=0;k<rows;k++) for(let j=-k;j<=k;j++) cand.push(j*sp*0.95, len/2-k*sp*0.9, 0);
  }
  g.slots=[]; let rem=st.rem; const hs=sp*0.45; st.miss={zone:0,terrain:0,occ:0};
  for(let k=0;k<cand.length&&rem>0;k+=3){ const [wx,wz]=localToWorld(g,cand[k],cand[k+1]); if(!allowedAt(wx,wz,team)||!occBox(wx,wz,hs,false)){ missReason(st,wx,wz,team); continue; } occBox(wx,wz,hs,true); g.slots.push(cand[k],cand[k+1],cand[k+2]); rem--; }
}
function eraseAt(W){
  const R=D.size, R2=R*R; let changed=false;
  for(const g of D.groups){ if(!GAME.editTeams.includes(g.team)) continue; if(GAME.editTeams.length>1 && g.team!==D.team) continue;
    const keep=[]; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if((wx-W[0])**2+(wz-W[1])**2<=R2){ changed=true; continue; } keep.push(g.slots[k],g.slots[k+1],g.slots[k+2]); } g.slots=keep; }
  if(changed){ audPlace(true); const sel=D.groups[D.sel]; D.groups=D.groups.filter(g=>g.slots.length); D.sel=sel?D.groups.indexOf(sel):-1; syncDeploy(); updateCapBox(); }
}
function pickUnit(W,radius,teams){
  let best=-1, bd=radius*radius;
  for(let i=0;i<N;i++){ const s=SS[i]; if(s!==1&&s!==2) continue; if(teams&&!teams.includes(TM[i])) continue; const dx=PX[i]-W[0], dz=PZ[i]-W[1], d2=dx*dx+dz*dz; if(d2<bd){ bd=d2; best=i; } }
  return best;
}
function pickGroup(W){ const i=pickUnit(W,1.8,GAME.editTeams); return i>=0?GR[i]:-1; }
// selection: a set of regiments in deployment (by object) or in battle (by regiment index)
const BSEL=new Set(); let BSELMODE=false;
const selGroups=()=>D.groups.filter(g=>D.selObj.has(g));
function refreshHighlight(){
  if(GAME.phase==='deploy'){ const m=new Uint8Array(D.groups.length+1); let any=0; D.groups.forEach((g,k)=>{ if(D.selObj.has(g)){ m[k]=1; any=1; } }); VIEW.hlMask=any?m:null; }
  else { if(!BSEL.size){ VIEW.hlMask=null; return; } const m=new Uint8Array(G.length+1); for(const gi of BSEL) if(gi<m.length) m[gi]=1; VIEW.hlMask=m; }
}
function setSel(list,add){
  if(!add) D.selObj.clear();
  for(const g of list){ if(add&&list.length===1&&D.selObj.has(g)) D.selObj.delete(g); else D.selObj.add(g); }
  const s=selGroups(); D.sel=s.length?D.groups.indexOf(s[0]):-1;
  if(s.length && GAME.editTeams.length>1 && s[0].team!==D.team){ D.team=s[0].team; buildDeployDock(); }
  refreshHighlight(); renderGroupPanel();
}
function selectGroup(gi,add){ setSel(gi>=0&&D.groups[gi]?[D.groups[gi]]:[],add); }
const battleTeams=()=>GAME.limited?[0]:[0,1];
function setBattleSel(list,add){ if(!add) BSEL.clear(); for(const gi of list){ if(add&&list.length===1&&BSEL.has(gi)) BSEL.delete(gi); else BSEL.add(gi); } refreshHighlight(); renderGroupPanel(); }
function setBattleOrder(gi,k){ const g=G[gi]; if(!g) return; g.order=k; const st=STT[g.team][g.type]; if(st.aura||st.heal){ if(k===O_ADV) attachEscort(g); else g.host=null; } if(k===O_FLANK){ g.phase=0; g.tmr=0; assignFlankSides(); } }
function selectAll(){ if(GAME.phase==='deploy') setSel(D.groups.filter(g=>g.team===D.team&&GAME.editTeams.includes(g.team)));
  else if(GAME.phase==='battle'){ const t=battleTeams(); setBattleSel(G.map((g,k)=>k).filter(k=>G[k].cnt>0&&t.includes(G[k].team))); } }
// world point to screen pixels (CSS px), or null when behind the camera
function projW(x,y,z){
  if(RENDER==='2d'){ const s=CAM.H/(CAM.dist*0.9+20), sy=Math.sin(CAM.yaw), cy=Math.cos(CAM.yaw); return [CAM.W/2+s*((x-CAM.tx)*sy-(z-CAM.tz)*cy), CAM.H/2+s*((x-CAM.tx)*cy+(z-CAM.tz)*sy)]; }
  const m=CAM.vp, cx=m[0]*x+m[4]*y+m[8]*z+m[12], cy=m[1]*x+m[5]*y+m[9]*z+m[13], cw=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(cw<=0.01) return null; return [(cx/cw*0.5+0.5)*CAM.W,(0.5-cy/cw*0.5)*CAM.H];
}
function boxSelect(a,b,add){
  const x0=Math.min(a[0],b[0]), x1=Math.max(a[0],b[0]), y0=Math.min(a[1],b[1]), y1=Math.max(a[1],b[1]);
  const inside=(x,y,z)=>{ const q=projW(x,y,z); return q&&q[0]>=x0&&q[0]<=x1&&q[1]>=y0&&q[1]<=y1; };
  if(GAME.phase==='deploy'){
    const hit=D.groups.filter(g=>{ if(g.team!==D.team||!GAME.editTeams.includes(g.team)) return false; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if(inside(wx,heightAt(wx,wz)+1,wz)) return true; } return false; });
    if(!add) D.selObj.clear(); setSel(hit.filter(g=>!D.selObj.has(g)),true);
  } else {
    const t=battleTeams(), hit=new Set(); for(let i=0;i<N;i++){ if(SS[i]!==1||!t.includes(TM[i])||hit.has(GR[i])) continue; if(inside(PX[i],PY[i]+1,PZ[i])) hit.add(GR[i]); }
    if(!add) BSEL.clear(); setBattleSel([...hit].filter(gi=>!BSEL.has(gi)),true);
  }
}
function groupBounds(g,dx,dz){ let ok=true; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if(!inZone(wx+dx,wz+dz,g.team)){ ok=false; break; } } return ok; }
// move every selected regiment together
function moveGroup(gi,dx,dz){
  const list=withLinked(selGroups()); if(!list.length) return;
  if(list.every(g=>groupBounds(g,dx,dz))) list.forEach(g=>{ g.cx+=dx; g.cz+=dz; });
  else if(list.every(g=>groupBounds(g,dx,0))) list.forEach(g=>{ g.cx+=dx; });
  else if(list.every(g=>groupBounds(g,0,dz))) list.forEach(g=>{ g.cz+=dz; });
  syncDeploy();
}
function moveEnd(gi){
  let lost=0; for(const g of withLinked(selGroups())){ const before=g.slots.length/3; validateGroups([g],TER); lost+=before-g.slots.length/3; }
  D.groups=D.groups.filter(g=>g.slots.length); if(lost>0) toast(`${lost} soldiers could not stand there and were removed`);
  syncDeploy(); refreshDeployUi();
}
function rotateSelected(da){
  const sel=selGroups(); if(!sel.length){ D.rot+=da; renderBrushPop(); return; }
  const list=withLinked(sel); pushUndo(); let blocked=0;
  for(const g of list){ g.a+=da; const before=g.slots.length/3, keep=g.slots.slice(); validateGroups([g],TER); if(g.slots.length/3<before){ g.slots=keep; g.a-=da; blocked++; } }
  if(blocked>=sel.length&&blocked===list.length){ D.undo.pop(); toast('There is no room to turn there'); } else if(blocked) toast(`${blocked} regiment${blocked>1?'s':''} had no room to turn`);
  syncDeploy(); renderGroupPanel();
}
function deleteSelected(){ if(GAME.phase!=='deploy') return; if(!selGroups().length) return; pushUndo(); D.groups=D.groups.filter(g=>!D.selObj.has(g)); D.selObj.clear(); D.sel=-1; syncDeploy(); refreshDeployUi(); }
/* ---------- formations, ordering and army composition ---------- */
const FORM_ICONS={
  ranks:'<rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="18" height="4" rx="1"/>',
  line:'<rect x="1" y="7" width="22" height="4.5" rx="1"/><rect x="1" y="14" width="22" height="3.5" rx="1" opacity=".55"/>',
  blocks:'<rect x="2" y="3" width="5.5" height="5.5"/><rect x="9.25" y="3" width="5.5" height="5.5"/><rect x="16.5" y="3" width="5.5" height="5.5"/><rect x="5.6" y="12" width="5.5" height="5.5"/><rect x="12.9" y="12" width="5.5" height="5.5"/>',
  wedge:'<rect x="9.5" y="2" width="5" height="3.4" rx="1"/><rect x="6.5" y="7.2" width="11" height="3.4" rx="1"/><rect x="3.5" y="12.4" width="17" height="3.4" rx="1"/><rect x="1" y="17.6" width="22" height="3.4" rx="1"/>',
  shieldwall:'<rect x="2" y="3" width="20" height="6.5" rx="1"/><rect x="2" y="12" width="20" height="3.5" rx="1" opacity=".7"/><rect x="2" y="18" width="20" height="3" rx="1" opacity=".45"/>',
  hammer:'<rect x="6" y="9" width="12" height="9" rx="1"/><path d="M1 12V4h4v4l2-1-3 5zM23 12V4h-4v4l-2-1 3 5z"/>',
  crescent:'<path d="M1.5 3.5Q12 17 22.5 3.5V9Q12 22.5 1.5 9Z"/><rect x="7" y="18.5" width="10" height="3" rx="1" opacity=".5"/>',
  echelon:'<rect x="1" y="3" width="7" height="4.5" rx="1"/><rect x="8.5" y="8.5" width="7" height="4.5" rx="1"/><rect x="16" y="14" width="7" height="4.5" rx="1"/><rect x="1" y="9.5" width="7" height="2.5" rx="1" opacity=".5"/><rect x="8.5" y="15" width="7" height="2.5" rx="1" opacity=".5"/>',
  square:'<path fill-rule="evenodd" d="M3 3h18v18H3zM7.5 7.5v9h9v-9z"/><rect x="10" y="10" width="4" height="4" rx=".5" opacity=".55"/>',
  screen:'<circle cx="3.5" cy="5" r="1.7"/><circle cx="8.5" cy="5" r="1.7"/><circle cx="13.5" cy="5" r="1.7"/><circle cx="18.5" cy="5" r="1.7"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="17" width="20" height="3.5" rx="1" opacity=".55"/>',
  assault:'<rect x="0.5" y="11" width="23" height="2" opacity=".45"/><rect x="2" y="15" width="5" height="7" rx="1"/><rect x="9.5" y="15" width="5" height="7" rx="1"/><rect x="17" y="15" width="5" height="7" rx="1"/><path d="M4.5 3l2.5 4h-5zM12 3l2.5 4h-5zM19.5 3l2.5 4h-5z"/>',
  column:'<rect x="8" y="1.5" width="8" height="4.2" rx="1"/><rect x="8" y="7.2" width="8" height="4.2" rx="1"/><rect x="8" y="12.9" width="8" height="4.2" rx="1"/><rect x="8" y="18.6" width="8" height="4.2" rx="1"/>',
};
const formIcon=id=>`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${FORM_ICONS[id]}</svg>`;
const editTeam=()=>GAME.limited?0:D.team;
const teamCounts=t=>GAME.limited&&t===0?autoCounts(D.fo[0].form):(D.comp[t]||new Array(NT).fill(0));
// the infantry and missile types present, in this side's front-to-back order
function bandTypes(t){ const c=teamCounts(t); const present=UNITS.map((u,k)=>k).filter(k=>c[k]>0&&(UNITS[k].cls==='inf'||UNITS[k].cls==='rng')).map(k=>UNITS[k].id);
  const o=(D.fo[t].order||formationOrder(D.fo[t].form)).filter(id=>present.includes(id)); for(const id of present) if(!o.includes(id)) o.splice(BAND_ORDER.includes(id)?Math.min(o.length,BAND_ORDER.indexOf(id)):o.length,0,id); return o; }
function relayout(t){
  D.selObj.clear(); D.sel=-1;
  let gs;
  if(GAME.limited&&GAME.mode==='survival'&&t===0) gs=layoutSurvival(autoCounts(),TER);
  else { const f=D.fo[t]; gs=layoutFormation(t,teamCounts(t),TER,f.form,bandTypes(t),Object.assign({cav:f.cav},formOpt(t))); }
  gs=validateGroups(gs,TER); D.groups=D.groups.filter(g=>g.team!==t); addDeployGroups(gs);
  if(GAME.limited&&t===0){ const f=D.fo[0]; PROG.formId=f.form; PROG.order=null; saveProg(); }
  syncDeploy(); buildDeployDock();
}
// choosing a formation brings its own unit order, horse position and orders
function setFormation(id){ const t=editTeam(), F=FORM_BY[id]; pushUndo(); Object.assign(D.fo[t],{form:id,order:null,cav:F.cav}); relayout(t); toast(`${F.name}: ${F.plan}`,1800); }
function setComp(t,ty,v){ pushUndo(); const c=D.comp[t]||(D.comp[t]=new Array(NT).fill(0)); const room=MAXU-2000-D.comp[t^1].reduce((a,b)=>a+b,0)-c.reduce((a,b,k)=>a+(k===ty?0:b),0); c[ty]=clamp(Math.round(v)||0,0,Math.max(0,Math.min(room,8000-c.reduce((a,b,k)=>a+(k===ty?0:b),0)))); relayout(t); }
function fillComp(t,style,total){ pushUndo(); D.comp[t]=armyCounts(clamp(total|0,0,8000),UNITS.map(u=>u.id),style,mulberry32((Math.random()*1e9)|0)); relayout(t); }
function clearTeam(){ if(!GAME.limited){ pushUndo(); D.comp[D.team]=new Array(NT).fill(0); relayout(D.team); toast('Army cleared. Undo brings it back.'); return; } pushUndo(); D.groups=D.groups.filter(g=>g.team!==D.team||!GAME.editTeams.includes(g.team)); D.sel=-1; syncDeploy(); refreshDeployUi(); toast('Cleared. Undo brings them back.'); }

/* ---------- map editor ---------- */
let terrainLast=0;
function terrainBegin(W){ pushUndo(); terrainPaint(W); }
function terrainPaint(W){
  const r=D.size, t=D.ttool, VW=TW+1;
  const hTools={raise:1,lower:1,flatten:1};
  if(hTools[t]){
    for(let j=0;j<=TH;j++) for(let i=0;i<=TW;i++){ const x=X0+i*TC, z=Z0+j*TC, d=Math.hypot(x-W[0],z-W[1]); if(d>r) continue; const f=0.5+0.5*Math.cos(Math.PI*d/r), o=j*VW+i;
      if(t==='raise') TER.h[o]=Math.min(18,TER.h[o]+0.45*f); else if(t==='lower') TER.h[o]=Math.max(-1.6,TER.h[o]-0.45*f); else TER.h[o]+=(0-TER.h[o])*0.25*f; }
  } else {
    const rr=t==='wall'?Math.max(1.1,r*0.3):r;
    const kind={grass:T_GRASS,forest:T_FOREST,water:T_WATER,ford:T_FORD,rock:T_ROCK,sand:T_SAND,wall:T_WALL,road:T_ROAD}[t];
    for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){ const x=X0+(i+.5)*TC, z=Z0+(j+.5)*TC; if(Math.hypot(x-W[0],z-W[1])>rr) continue; const c=j*TW+i; const prev=TER.k[c];
      TER.k[c]=kind; TER.bld[c]=0; TER.own[c]=-1;
      const corners=[j*VW+i,j*VW+i+1,(j+1)*VW+i,(j+1)*VW+i+1];
      if(kind===T_WATER) corners.forEach(o=>TER.h[o]=Math.min(TER.h[o],-1.6));
      else if(kind===T_FORD) corners.forEach(o=>TER.h[o]=-0.75);
      else if(kind===T_ROCK) corners.forEach(o=>TER.h[o]=Math.max(TER.h[o],6+hash2(i,j)*5));
      else if(prev===T_WATER||prev===T_FORD||prev===T_ROCK) corners.forEach(o=>TER.h[o]=0.1);
    }
  }
  TER.ver++;
  const now=performance.now(); if(now-terrainLast>130){ terrainLast=now; onTerrainChanged(); } else markTerrainDirty();
}
function terrainEnd(){ onTerrainChanged(); const before=D.groups.reduce((a,g)=>a+g.slots.length,0); for(const g of D.groups){ const keep=[]; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if(passAt(wx,wz)) keep.push(g.slots[k],g.slots[k+1],g.slots[k+2]); } g.slots=keep; } D.groups=D.groups.filter(g=>g.slots.length); syncDeploy(); if(D.groups.reduce((a,g)=>a+g.slots.length,0)<before) toast('Soldiers standing on blocked ground were removed'); refreshDeployUi(); }

/* ---------- deploy dock UI ---------- */
function buildDeployDock(){
  const sandbox=GAME.editTeams.length>1;
  $('#sideSeg').hidden=!sandbox; $('#btnTerrain').hidden=!(GAME.mode==='sandbox'||GAME.mode==='custom'); $('#btnResearch').hidden=!GAME.limited;
  const surv=GAME.limited&&GAME.mode==='survival';
  $('#btnClear').hidden=GAME.limited; $('#compRow').hidden=GAME.limited||D.terrain;
  $('#sideSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',+b.dataset.side===D.team));
  $('#btnTerrain').classList.toggle('on',D.terrain); $('#btnTerrain').textContent=D.terrain?'Back to troops':'Map editor';
  const av=availableTypes(); if(!av.includes(D.type)){ const up=UID[currentTier(UNITS[D.type].id)]; D.type=av.includes(up)?up:(av[0]||0); }
  const chips=$('#chips'); chips.innerHTML='';
  if(D.terrain){
    TERRAIN_TOOLS.forEach(([id,name,col])=>{ const b=document.createElement('button'); b.className='chip'+(D.ttool===id?' on':''); b.innerHTML=`<span class="swatch" style="background:${col}"></span><span class="nm">${name}</span>`; b.onclick=()=>{ D.ttool=id; buildDeployDock(); }; chips.appendChild(b); });
  } else {
    // front-to-back ordering strip: one tile per infantry or missile type
    const t=editTeam(), o=bandTypes(t), c=teamCounts(t), red=t===1?' red':'';
    if(surv){ chips.innerHTML='<div class="hint" style="align-self:center">Survival deploys to hold the wall: infantry block the three gates and missile troops line the wall. Select regiments to move them or change their orders.</div>'; }
    else if(!o.length){ chips.innerHTML=`<div class="hint" style="align-self:center">${GAME.limited?'Recruit infantry or missile troops in the Council to arrange your ranks.':'Add soldiers above to build this army.'}</div>`; }
    else { const F=FORM_BY[D.fo[t].form]||FORMATIONS[0];
      chips.insertAdjacentHTML('beforeend',`<div class="fplan wide" title="${esc(F.desc)}"><b>${F.name}</b><span>${esc(F.desc)}</span><span class="fo">Orders: ${F.plan} · Front to back: ${o.map(id=>UNITS[UID[id]].name).join(' → ')}</span>${GAME.limited&&t===0&&rosterTotal()>capOf()?`<span class="fo">Your roster is over the ${fmt(capOf())} limit, so the troops this formation suits best, and your strongest, go first.</span>`:''}</div>`); }
    // army builder for sandbox and custom battles
    if(!GAME.limited){ const comp=$('#comp'); comp.innerHTML='';
      const fill=document.createElement('div'); fill.className='fill';
      fill.innerHTML=`<select id="fillStyle" aria-label="Army style">${Object.entries(STYLES).map(([k,s])=>`<option value="${k}">${s.name}</option>`).join('')}</select><input type="number" id="fillN" min="0" max="8000" step="100" value="${Math.max(100,c.reduce((a,b)=>a+b,0)||900)}" aria-label="Army size"><button class="btn sm" id="fillGo">Fill</button>`;
      comp.appendChild(fill); comp.insertAdjacentHTML('beforeend','<span class="vsep"></span>');
      fill.querySelector('#fillGo').onclick=()=>fillComp(t,fill.querySelector('#fillStyle').value,+fill.querySelector('#fillN').value);
      UNITS.forEach((u,ty)=>{ const step=u.cls==='sie'||u.cls==='sup'||ty===UID.elite?1:10, el=document.createElement('div'); el.className='cchip'+red;
        el.innerHTML=`<span class="nm">${unitIcon(ty)}${u.name}</span><button aria-label="Fewer ${u.name}">−</button><input type="number" min="0" step="${step}" value="${c[ty]||0}" aria-label="${u.name}"><button aria-label="More ${u.name}">+</button>`;
        const [m,p]=el.querySelectorAll('button'), inp=el.querySelector('input');
        m.onclick=e=>setComp(t,ty,(c[ty]||0)-step*(e.shiftKey?10:1)); p.onclick=e=>setComp(t,ty,(c[ty]||0)+step*(e.shiftKey?10:1)); inp.onchange=()=>setComp(t,ty,+inp.value);
        comp.appendChild(el); }); }
  }
  const tools=$('#tools'); tools.innerHTML='';
  if(D.terrain){
    const sel=document.createElement('select'); sel.id='mapPreset'; sel.style.width='auto'; sel.innerHTML='<option value="">New map…</option>'+MAPS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
    sel.onchange=()=>{ if(!sel.value) return; pushUndo(); GAME.mapId=sel.value; TER=genMap(sel.value,(Math.random()*1e6)|0,{fortSide:1}); terrainEnd(); sel.value=''; };
    const sz=document.createElement('div'); sz.className='slider'; sz.style.flex='1'; sz.style.minWidth='200px';
    sz.innerHTML=`<span>Brush</span><input type="range" id="tSize" min="2" max="24" step="1" value="${D.size}"><output>${D.size} m</output>`;
    sz.querySelector('input').oninput=e=>{ D.size=+e.target.value; sz.querySelector('output').textContent=D.size+' m'; };
    tools.append(sel,sz);
  } else {
    const t=editTeam(), f=D.fo[t];
    if(surv){ const b=document.createElement('button'); b.className='btn sm'; b.textContent='Reset to the wall'; b.onclick=()=>{ pushUndo(); relayout(0); }; tools.appendChild(b); }
    else {
      FORMATIONS.forEach(fm=>{ const on=f.form===fm.id, b=document.createElement('button'); b.className='ftile'+(on?' on':''); b.innerHTML=formIcon(fm.id)+`<span>${fm.name}</span>`; b.title=`${fm.name} (front at the top). ${fm.desc} Orders: ${fm.plan}.`; b.setAttribute('aria-pressed',on); b.onclick=()=>setFormation(fm.id); tools.appendChild(b); });

    }
  }
  refreshDeployUi();
}
function refreshDeployUi(){ updateCapBox(); updateUnitInfo(); renderGroupPanel(); updateHud(true); $('#btnUndo').disabled=!D.undo.length; }
function updateUnitInfo(){
  const ui=$('#unitInfo');
  if(D.terrain){ ui.innerHTML=`<b>Map editor</b><span class="k">Drag to paint ${TERRAIN_TOOLS.find(t=>t[0]===D.ttool)[1].toLowerCase()}. Two fingers or right-drag to move the camera.</span>`; return; }
  const s=STT[D.team][D.type], u=UNITS[D.type];
  const rng=u.isR?`${Math.round(s.range)} m`:`${s.range.toFixed(1)} m`;
  ui.innerHTML=`<b>${u.name}</b><span class="k">${u.role}</span><span class="k">HP</span> ${Math.round(s.hp)}<span class="k">Armour</span> ${s.armor.toFixed(1).replace('.0','')}<span class="k">Damage</span> ${Math.round(s.dmg)}<span class="k">Range</span> ${rng}<span class="k">Speed</span> ${s.speed.toFixed(1)}<span class="k">Cost</span> ${u.cost}<span class="k">·</span> ${esc(u.desc)}`;
  ui.title=u.desc;
}
function updateCapBox(){
  const cb=$('#capBox');
  if(GAME.limited){ const c=deployCounts(0), cap=capOf(), full=c.total>=cap;
    cb.innerHTML=`Army <b>${fmt(c.total)}</b> / ${fmt(cap)}${full?' <span class="full">· limit reached</span>':''}<span class="bar"><i style="width:${Math.min(100,c.total/cap*100)}%"></i></span>`;
    document.querySelectorAll('[data-ct]').forEach(e=>{ const ty=+e.dataset.ct, own=PROG.roster[UNITS[ty].id]||0, placed=c.by[ty], left=Math.max(0,own-placed);
      e.textContent= own<=0?'none recruited' : left>0 ? (full?`${fmt(left)} in reserve`:`${fmt(left)} left`) : `all ${fmt(placed)} placed`;
      e.parentElement.classList.toggle('empty',own<=0); }); }
  else { const a=deployCounts(0).total, b=deployCounts(1).total; cb.innerHTML=`<span style="color:var(--blue)">Blue <b>${fmt(a)}</b></span> · <span style="color:var(--red)">Red <b>${fmt(b)}</b></span>`;
    const c=deployCounts(D.team); document.querySelectorAll('[data-ct]').forEach(e=>{ const ty=+e.dataset.ct; e.textContent=c.by[ty]?fmt(c.by[ty])+' placed':'—'; }); }
}
function renderGroupPanel(){
  const p=$('#groupPanel'), battle=GAME.phase==='battle';
  let items=[];
  if(GAME.phase==='deploy') items=selGroups().map(g=>({type:g.type,n:g.slots.length/3,team:g.team,o:Math.max(0,ORDER_IDS.indexOf(g.order))}));
  else if(battle){ for(const gi of [...BSEL]){ const g=G[gi]; if(!g||g.cnt<=0){ BSEL.delete(gi); continue; } items.push({type:g.type,n:g.cnt,team:g.team,o:g.order}); } }
  if(!items.length){ p.hidden=true; refreshHighlight(); return; }
  const total=items.reduce((a,x)=>a+x.n,0), same=items.every(x=>x.o===items[0].o), o=same?items[0].o:-1, one=items.length===1, it=items[0];
  const title=one?`<span style="color:${it.team?'var(--red)':'var(--blue)'}">${unitIcon(it.type)}</span>${UNITS[it.type].name} <span class="hudtext" style="color:var(--muted);font-weight:500">× ${fmt(it.n)}</span>`
    :`${fmt(items.length)} regiments <span class="hudtext" style="color:var(--muted);font-weight:500">· ${fmt(total)} soldiers</span>`;
  p.innerHTML=`<h4>${title}<button class="x" id="gpX" aria-label="Clear selection">×</button></h4>
  <div class="seg" role="group" aria-label="Orders">${ORDER_NAMES.map((n,k)=>`<button class="btn sm${k===o?' on':''}" data-ord="${k}">${n}</button>`).join('')}</div>
  <div class="hint">${o>=0?ORDER_HELP[o]:'Mixed orders. Pick one to give it to every selected regiment.'}${battle?' Orders take effect at once.':''}</div>
  ${battle?`<div class="row"><button class="btn sm" id="gpAll">Select all</button></div>`:`<div class="row"><button class="btn sm" id="gpL" aria-label="Turn left">⟲ Turn</button><button class="btn sm" id="gpR" aria-label="Turn right">Turn ⟳</button><button class="btn sm" id="gpAll">Select all</button><div class="spacer"></div><button class="btn sm danger" id="gpDel">Remove</button></div>`}`;
  p.hidden=false;
  p.querySelectorAll('[data-ord]').forEach(b=>b.onclick=()=>{ const k=+b.dataset.ord;
    if(GAME.phase==='deploy') selGroups().forEach(g=>g.order=ORDER_IDS[k]); else for(const gi of BSEL) setBattleOrder(gi,k);
    renderGroupPanel(); });
  $('#gpX').onclick=()=>{ if(GAME.phase==='deploy') selectGroup(-1); else setBattleSel([]); };
  $('#gpAll').onclick=selectAll;
  if(!battle){ $('#gpL').onclick=()=>rotateSelected(Math.PI/12); $('#gpR').onclick=()=>rotateSelected(-Math.PI/12); $('#gpDel').onclick=deleteSelected; }
  refreshHighlight();
}
function renderBrushPop(){
  const p=$('#brushPop'); const deg=Math.round(-D.rot*180/Math.PI);
  p.innerHTML=`<h4>Placement<button class="x" id="bpX" aria-label="Close">×</button></h4>
  <div class="hint">${TOOL_HELP[D.tool]||''}</div>
  <label class="slider"><span>Brush</span><input type="range" id="bpSize" min="1" max="24" step="1" value="${D.size}"><output>${D.size} m</output></label>
  <label class="slider"><span>Density</span><input type="range" id="bpDen" min="0.6" max="1.6" step="0.05" value="${D.density}"><output>${D.density.toFixed(2)}×</output></label>
  <label class="slider"><span>Ranks</span><input type="range" id="bpRanks" min="1" max="16" step="1" value="${D.ranks}"><output>${D.ranks}</output></label>
  <div class="row"><span class="hudtext" style="color:var(--muted);font-size:13.5px">Facing ${deg>0?'+':''}${deg}°</span><div class="spacer"></div><button class="btn sm" id="bpL">⟲</button><button class="btn sm" id="bpR">⟳</button><button class="btn sm" id="bp0">Reset</button></div>`;
  const bind=(id,key,fmtf)=>{ const i=p.querySelector('#'+id); i.oninput=()=>{ D[key]=+i.value; i.nextElementSibling.textContent=fmtf(D[key]); }; };
  bind('bpSize','size',v=>v+' m'); bind('bpDen','density',v=>v.toFixed(2)+'×'); bind('bpRanks','ranks',v=>String(v));
  $('#bpX').onclick=closePops; $('#bpL').onclick=()=>{ D.rot+=Math.PI/12; renderBrushPop(); }; $('#bpR').onclick=()=>{ D.rot-=Math.PI/12; renderBrushPop(); }; $('#bp0').onclick=()=>{ D.rot=0; renderBrushPop(); };
}
function loadFormation(arr){
  pushUndo();
  let gs=validateGroups(deserializeGroups(arr,D.team),TER); if(GAME.limited) gs=trimToRoster(gs);
  D.groups=D.groups.filter(g=>g.team!==D.team); gs.forEach(addDeployGroup); D.sel=-1; D.comp[D.team]=Array.from(deployCounts(D.team).by); syncDeploy(); buildDeployDock(); closePops();
  toast(gs.length?`Loaded ${fmt(gs.reduce((a,g)=>a+g.slots.length/3,0))} soldiers`:'None of those soldiers fit on this map');
}
$('#sideSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-side]'); if(!b) return; D.team=+b.dataset.side; selectGroup(-1); const av=availableTypes(); if(!av.includes(D.type)) D.type=av[0]; buildDeployDock(); });
$('#btnTerrain').onclick=()=>{ D.terrain=!D.terrain; selectGroup(-1); buildDeployDock(); };
$('#btnUndo').onclick=undo;
$('#btnResearch').onclick=()=>showCouncil('tech');
$('#btnClear').onclick=clearTeam;
$('#btnFight').onclick=()=>startBattle();

/* ---------- battle dock ---------- */
function setSpeed(s){ if(s>0) GAME.lastSpeed=s; GAME.speed=s; document.querySelectorAll('#speedSeg [data-speed]').forEach(b=>b.classList.toggle('on',+b.dataset.speed===s)); }
$('#speedSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-speed]'); if(b) setSpeed(+b.dataset.speed); });
$('#camSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-cam]'); if(!b) return; camPreset(b.dataset.cam,false); document.querySelectorAll('#camSeg [data-cam]').forEach(x=>x.classList.toggle('on',x===b)); });
$('#btnStats').onclick=()=>{ const p=$('#statsPanel'); p.hidden=!p.hidden; if(!p.hidden) renderStats(); };
$('#btnEnd').onclick=()=>{ if(GAME.phase!=='battle') return; if(GAME.ended){ GAME.endTimer=0; return; } if(GAME.limited) endBattle(1); else { let w=B.active[0]>B.active[1]?0:B.active[1]>B.active[0]?1:-1; endBattle(w); } GAME.endTimer=0.4; };
// kills each unit type has made and the deaths it has suffered, per side
function casualtyTable(){
  let rows=''; const tk=[0,0];
  for(let ty=0;ty<NT;ty++){ const in0=B.startT[0][ty]>0, in1=B.startT[1][ty]>0; if(!in0&&!in1) continue;
    tk[0]+=B.killsT[0][ty]; tk[1]+=B.killsT[1][ty];
    rows+=`<tr><td class="nm"><span style="color:var(--muted)">${unitIcon(ty)}</span>${UNITS[ty].name}</td><td class="k">${in0?fmt(B.killsT[0][ty]):'·'}</td><td>${in0?fmt(B.deadT[0][ty]):'·'}</td><td class="k">${in1?fmt(B.killsT[1][ty]):'·'}</td><td>${in1?fmt(B.deadT[1][ty]):'·'}</td></tr>`; }
  return `<table class="cas"><thead><tr><th rowspan="2">Unit</th><th colspan="2" class="b">Blue</th><th colspan="2" class="r">Red</th></tr><tr><th>Kills</th><th>Deaths</th><th>Kills</th><th>Deaths</th></tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><td class="nm">Total</td><td>${fmt(tk[0])}</td><td>${fmt(B.dead[0])}</td><td>${fmt(tk[1])}</td><td>${fmt(B.dead[1])}</td></tr><tr><td class="nm">Fled the field</td><td></td><td>${fmt(B.esc[0])}</td><td></td><td>${fmt(B.esc[1])}</td></tr></tfoot></table>`;
}
function renderStats(){
  const p=$('#statsPanel'); if(p.hidden) return;
  p.innerHTML=`<h4 class="hudtext" style="margin:0 0 6px;display:flex;align-items:center">Casualties<button class="x" onclick="this.closest('.card').hidden=true" aria-label="Close">×</button></h4>${casualtyTable()}`;
}
function inspectUnit(i){ VIEW.hlUnit=i; const p=$('#inspect'); if(i<0){ p.hidden=true; return; } p.hidden=false; updateInspect(); }
function updateInspect(){
  const p=$('#inspect'), i=VIEW.hlUnit; if(p.hidden||i<0) return;
  if(i>=N){ p.hidden=true; VIEW.hlUnit=-1; return; }
  const st=STT[TM[i]][TY[i]], u=UNITS[TY[i]], s=SS[i];
  const state=s===0?'Fallen':s===3?'Left the field':s===2?'Fleeing':TG[i]>=0?(u.isR?'Shooting':'Fighting'):'Holding formation';
  const g=GAME.phase==='battle'?G[GR[i]]:null;
  const hp=Math.max(0,HP[i])/st.hp, mo=Math.max(0,MO[i])/st.morale;
  p.innerHTML=`<h4><span style="color:${TM[i]?'var(--red)':'var(--blue)'}">${unitIcon(TY[i])}</span>${u.name}<button class="x" id="inX" aria-label="Close">×</button></h4>
  <div class="hudtext" style="font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin-top:4px">Health ${Math.round(Math.max(0,HP[i]))} / ${Math.round(st.hp)}</div><div class="meter"><i style="width:${hp*100}%;background:${hp>0.5?'var(--good)':hp>0.25?'var(--warn)':'var(--red)'}"></i></div>
  <div class="hudtext" style="font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em">Morale</div><div class="meter"><i style="width:${Math.min(1,mo)*100}%;background:var(--brass)"></i></div>
  <div class="kv"><span>State</span><b>${state}</b><span>Kills</span><b>${KL[i]}</b><span>Armour</span><b>${st.armor.toFixed(1).replace('.0','')}</b><span>Damage</span><b>${Math.round(st.dmg)}</b></div>
  ${g&&g.cnt>0&&battleTeams().includes(TM[i])?`<div class="hudtext" style="font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.08em;margin-top:8px">Regiment orders</div><div class="seg" style="margin-top:4px">${ORDER_NAMES.map((n,k)=>`<button class="btn sm${k===g.order?' on':''}" data-iord="${k}">${n}</button>`).join('')}</div>`:''}`;
  $('#inX').onclick=()=>inspectUnit(-1);
  p.querySelectorAll('[data-iord]').forEach(b=>b.onclick=()=>{ setBattleOrder(GR[i],+b.dataset.iord); updateInspect(); });
}

/* ---------- HUD ---------- */
function updateHud(force){
  let a=0,b=0;
  if(GAME.phase==='deploy'){ a=deployCounts(0).total; b=deployCounts(1).total; }
  else { a=B.active[0]+B.fleeing[0]; b=B.active[1]+B.fleeing[1]; }
  $('#sBlue').textContent=fmt(a); $('#sRed').textContent=fmt(b);
  const t=a+b||1; $('#barB').style.width=(a/t*100)+'%'; $('#barR').style.width=(b/t*100)+'%';
  $('#goldNum').textContent=fmt(PROG.gold);
  $('#goldPend').textContent=(GAME.phase==='battle'&&GAME.limited&&GAME.gold>=1)?'+'+fmt(GAME.gold):'';
  let line=GAME.title;
  if(GAME.phase==='deploy') line+=GAME.limited?' · deploy your army':' · paint both armies';
  else if(GAME.mode==='endless') line=`Endless · wave ${GAME.wave}`;
  else if(GAME.mode==='survival') line=`Survival · ${mmss(GAME.survT)} held`;
  else line+=` · ${mmss(simTime)}`;
  if(GAME.speed===0 && GAME.phase==='battle') line+=' · paused';
  $('#modeLine').textContent=line;
}
function drawMinimap(){
  if(!MINI.base) return;
  const w=MINI.w, h=MINI.h, d=MINI.buf.data; d.set(MINI.base.data);
  const sx=w/(X1-X0), sz=h/(Z1-Z0);
  const C=[[85,140,255],[255,90,70]];
  for(let i=0;i<N;i++){ const s=SS[i]; if(s!==1&&s!==2) continue; const px=((PX[i]-X0)*sx)|0, pz=((PZ[i]-Z0)*sz)|0; if(px<0||pz<0||px>=w-1||pz>=h-1) continue; const c=C[TM[i]];
    for(const o of [(pz*w+px)*4,(pz*w+px+1)*4,((pz+1)*w+px)*4]){ d[o]=c[0]; d[o+1]=c[1]; d[o+2]=c[2]; } }
  MINI.ctx.putImageData(MINI.buf,0,0);
  // camera footprint
  if(RENDER==='gpu'){
    const pts=[[0,0],[CAM.W,0],[CAM.W,CAM.H],[0,CAM.H]].map(p=>{ const r=screenRay(p[0],p[1]); let q=rayPlane(r,0); if(!q){ const t=600; q=[r.o[0]+r.d[0]*t,r.o[2]+r.d[2]*t]; } return q; });
    const ctx=MINI.ctx; ctx.strokeStyle='rgba(255,236,190,0.9)'; ctx.lineWidth=1.5; ctx.beginPath();
    pts.forEach((q,k)=>{ const x=(clamp(q[0],X0-200,X1+200)-X0)*sx, y=(clamp(q[1],Z0-200,Z1+200)-Z0)*sz; if(k) ctx.lineTo(x,y); else ctx.moveTo(x,y); }); ctx.closePath(); ctx.stroke();
  }
}
$('#minimapWrap').addEventListener('pointerdown',e=>{ const r=e.currentTarget.getBoundingClientRect(); const x=X0+(e.clientX-r.left)/r.width*(X1-X0), z=Z0+(e.clientY-r.top)/r.height*(Z1-Z0); CAM.follow=-1; CAM.g.tx=x; CAM.g.tz=z; camClamp(CAM.g); e.stopPropagation(); });

/* ---------- input ---------- */
const stage=$('#stage'), PTR=new Map(); let GST=null;
function spos(e){ const r=stage.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }
function r2dToWorld(sx,sy){ const s=CAM.H/(CAM.dist*0.9+20), sn=Math.sin(CAM.yaw), cs=Math.cos(CAM.yaw); const u=(sx-CAM.W/2)/s, v=(sy-CAM.H/2)/s; return [CAM.tx+u*sn+v*cs, CAM.tz-u*cs+v*sn]; }
function worldAt(x,y){ return RENDER==='2d'?r2dToWorld(x,y):rayGround(screenRay(x,y)); }
function worldAtPlane(x,y,h){ if(RENDER==='2d') return r2dToWorld(x,y); return rayPlane(screenRay(x,y),h)||rayGround(screenRay(x,y)); }
function snapCam(){ CAM.tx=CAM.g.tx; CAM.tz=CAM.g.tz; CAM.yaw=CAM.g.yaw; CAM.pitch=CAM.g.pitch; CAM.dist=CAM.g.dist; computeView(); }
stage.addEventListener('pointerdown',e=>{
  try{ stage.setPointerCapture(e.pointerId); }catch(_){}
  const p=spos(e); PTR.set(e.pointerId,{p,start:p,t:performance.now()});
  closePops();
  if(PTR.size===1) beginSingle(e,p); else if(PTR.size===2){ cancelSingle(); beginPinch(); }
  e.preventDefault();
});
let HOVER=null, HOVER_T=0;
stage.addEventListener('pointerleave',()=>{ HOVER=null; });
stage.addEventListener('pointermove',e=>{ HOVER=spos(e); HOVER_T=performance.now(); const o=PTR.get(e.pointerId); if(!o) return; o.p=spos(e); if(PTR.size>=2) movePinch(); else moveSingle(o.p); });
function pointerUp(e){
  const o=PTR.get(e.pointerId); if(!o) return; PTR.delete(e.pointerId);
  if(GST&&GST.kind==='pinch'){ GST=null; if(PTR.size===1){ const q=[...PTR.values()][0]; q.start=q.p; q.t=0; beginPan(q.p); } return; }
  endSingle(o);
}
stage.addEventListener('pointerup',pointerUp); stage.addEventListener('pointercancel',pointerUp);
stage.addEventListener('contextmenu',e=>e.preventDefault());
stage.addEventListener('wheel',e=>{ e.preventDefault(); zoomAt(spos(e),Math.exp(clamp(e.deltaY,-120,120)*0.0016)); },{passive:false});
function beginSingle(e,p){
  if(e.button===2||(e.button===0&&e.altKey)){ GST={kind:'orbit',last:p}; CAM.follow=-1; return; }
  if(e.button===1){ beginPan(p); return; }
  if(GAME.phase==='deploy'){
    const W=worldAt(p[0],p[1]);
    if(W && D.terrain){ GST={kind:'terrain'}; terrainBegin(W); return; }
    if(W){ const gi=pickGroup(W);
      if(gi>=0){ const g=D.groups[gi]; if(e.shiftKey||e.ctrlKey||e.metaKey){ selectGroup(gi,true); return; } if(!D.selObj.has(g)) selectGroup(gi); pushUndo(); GST={kind:'move',last:W,gi}; return; }
      if(e.shiftKey||e.ctrlKey||e.metaKey){ GST={kind:'box',a:p,b:p,add:true}; return; } }
  }
  if(GAME.phase==='battle' && (BSELMODE||e.shiftKey) && e.button===0){ GST={kind:'box',a:p,b:p,add:e.shiftKey}; return; }
  beginPan(p);
}
function beginPan(p){ GST={kind:'pan',W0:worldAtPlane(p[0],p[1],CAM.ty),h:CAM.ty}; CAM.follow=-1; if(GAME.phase==='battle') document.querySelectorAll('#camSeg [data-cam]').forEach(x=>x.classList.remove('on')); }
function moveSingle(p){
  if(!GST) return;
  if(GST.kind==='orbit'){ const dx=p[0]-GST.last[0], dy=p[1]-GST.last[1]; GST.last=p; CAM.g.yaw-=dx*0.006; CAM.g.pitch=clamp(CAM.g.pitch+dy*0.005,0.12,1.47); snapCam(); }
  else if(GST.kind==='pan'){ if(!GST.W0) return; const W=worldAtPlane(p[0],p[1],GST.h); if(!W) return; CAM.g.tx+=GST.W0[0]-W[0]; CAM.g.tz+=GST.W0[1]-W[1]; camClamp(CAM.g); snapCam(); }
  else if(GST.kind==='tool'){ const W=worldAt(p[0],p[1]); if(W) toolMove(W); }
  else if(GST.kind==='terrain'){ const W=worldAt(p[0],p[1]); if(W) terrainPaint(W); }
  else if(GST.kind==='move'){ const W=worldAt(p[0],p[1]); if(W){ moveGroup(GST.gi,W[0]-GST.last[0],W[1]-GST.last[1]); GST.last=W; } }
  else if(GST.kind==='box'){ GST.b=p; }
}
function endSingle(o){
  const g=GST; GST=null; if(!g) return;
  const moved=Math.hypot(o.p[0]-o.start[0],o.p[1]-o.start[1]), dt=performance.now()-o.t;
  if(g.kind==='tool') toolEnd(); else if(g.kind==='terrain') terrainEnd(); else if(g.kind==='move') moveEnd(g.gi);
  else if(g.kind==='pan' && moved<8 && dt<450) tap(o.p);
  else if(g.kind==='box'){ if(moved<6) boxTap(o.p,g.add); else boxSelect(g.a,g.b,g.add); }
}
function cancelSingle(){ if(!GST) return; const k=GST.kind; GST=null; if(k==='tool') toolCancel(); else if(k==='terrain') terrainEnd(); else if(k==='move'){ const gi=D.sel; if(D.undo.length){ popUndo(); syncDeploy(); } selectGroup(gi); } }
function beginPinch(){ const ps=[...PTR.values()].map(o=>o.p); const m=[(ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2];
  GST={kind:'pinch',d0:Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1])||1,a0:Math.atan2(ps[1][1]-ps[0][1],ps[1][0]-ps[0][0]),dist0:CAM.g.dist,yaw0:CAM.g.yaw,h:CAM.ty,W0:worldAtPlane(m[0],m[1],CAM.ty)}; CAM.follow=-1; }
function movePinch(){
  if(!GST||GST.kind!=='pinch') return; const ps=[...PTR.values()].slice(0,2).map(o=>o.p);
  const d=Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1])||1, a=Math.atan2(ps[1][1]-ps[0][1],ps[1][0]-ps[0][0]), m=[(ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2];
  CAM.g.dist=clamp(GST.dist0*GST.d0/d,6,CAM_MAX); CAM.g.yaw=GST.yaw0-angDiff(GST.a0,a); snapCam();
  if(GST.W0){ const W=worldAtPlane(m[0],m[1],GST.h); if(W){ CAM.g.tx+=GST.W0[0]-W[0]; CAM.g.tz+=GST.W0[1]-W[1]; camClamp(CAM.g); snapCam(); } }
}
function zoomAt(p,f){ const W0=worldAtPlane(p[0],p[1],CAM.ty); CAM.g.dist=clamp(CAM.g.dist*f,6,CAM_MAX); CAM.follow=-1; snapCam(); if(W0){ const W=worldAtPlane(p[0],p[1],CAM.ty); if(W){ CAM.g.tx+=W0[0]-W[0]; CAM.g.tz+=W0[1]-W[1]; camClamp(CAM.g); snapCam(); } } }
function boxTap(p,add){ const W=worldAt(p[0],p[1]);
  if(GAME.phase==='deploy'){ if(!add) selectGroup(-1); return; }
  const i=W?pickUnit(W,2.4,battleTeams()):-1; setBattleSel(i>=0?[GR[i]]:[],add); }
function tap(p){
  const W=worldAt(p[0],p[1]); if(!W) return;
  if(GAME.phase==='deploy'){ selectGroup(pickGroup(W)); return; }
  inspectUnit(pickUnit(W,2.4,null));
}
const KEYS=new Set();
window.addEventListener('keydown',e=>{
  if(e.target.closest&&e.target.closest('input,textarea,select')) return;
  const k=e.key.toLowerCase();
  if(k===' '){ if(GAME.phase==='battle'){ e.preventDefault(); setSpeed(GAME.speed?0:GAME.lastSpeed||1); } return; }
  if(GAME.phase==='battle'&&(k==='1'||k==='2'||k==='3'||k==='0')){ setSpeed({0:0,1:1,2:3,3:9}[k]); return; }
  if(k==='f'&&GAME.phase==='deploy'&&$('#modal').hidden){ startBattle(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='z'){ e.preventDefault(); undo(); return; }
  if(k==='delete'||k==='backspace'){ deleteSelected(); return; }
  if((e.ctrlKey||e.metaKey)&&k==='a'){ e.preventDefault(); selectAll(); return; }
  if(k==='t'&&$('#modal').hidden){ showCouncil('tech'); return; }
  if(k==='m'){ audSetOn(!AUD.on); renderSoundBtn(); toast(AUD.on?'Sound on':'Sound off',1200); return; }
  if(k==='escape'){ closeModal(); closePops(); if(GAME.phase==='deploy') selectGroup(-1); else setBattleSel([]); inspectUnit(-1); return; }
  KEYS.add(k);
});
window.addEventListener('keyup',e=>KEYS.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>KEYS.clear());
function keyCamera(dt){
  if(!KEYS.size) return; let fx=0,fz=0,rot=0;
  if(KEYS.has('w')||KEYS.has('arrowup')) fz+=1; if(KEYS.has('s')||KEYS.has('arrowdown')) fz-=1; if(KEYS.has('a')||KEYS.has('arrowleft')) fx-=1; if(KEYS.has('d')||KEYS.has('arrowright')) fx+=1;
  if(KEYS.has('q')) rot+=1; if(KEYS.has('e')) rot-=1;
  if(!fx&&!fz&&!rot) return; CAM.follow=-1;
  const sp=CAM.g.dist*0.9*dt, fwx=-Math.cos(CAM.g.yaw), fwz=-Math.sin(CAM.g.yaw), rx=Math.sin(CAM.g.yaw), rz=-Math.cos(CAM.g.yaw);
  CAM.g.tx+=(fwx*fz+rx*fx)*sp; CAM.g.tz+=(fwz*fz+rz*fx)*sp; CAM.g.yaw+=rot*dt*1.2; camClamp(CAM.g);
}

/* ---------- modal screens ---------- */
const mapOptions=(sel,skip)=>MAPS.filter(m=>!(skip||[]).includes(m.id)).map(m=>`<option value="${m.id}"${m.id===sel?' selected':''}>${m.name}</option>`).join('');
function legendHtml(){ return `<div class="legend">${[['sword','Infantry'],['archer','Ranged'],['lcav','Cavalry'],['cata','Siege'],['cmdr','Support']].map(([id,n])=>`<span>${unitIcon(UID[id])}<em>${n}</em></span>`).join('')}</div>`; }
function showWelcome(){
  const L=PROG.level;
  openModal(`<div class="sheet-h"><h2 class="welcome-mark">MASSIVE<br><span>ARMIES</span></h2><button class="x" id="wX" aria-label="Close" style="align-self:flex-start">×</button></div>
  <p class="lede">Deploy thousands of geometric soldiers in formations, give each regiment its orders, then watch the lines collide. Earn gold from every enemy you break, recruit, research, and grow toward armies of thousands.</p>
  ${legendHtml()}
  <div class="actions" style="justify-content:flex-start">
    <button class="btn primary" id="wCamp">${campaignDone()?'Campaign won · replay battles':L>1?`Continue campaign · Battle ${L} of ${CAMPAIGN_LEN}`:'Start campaign'}</button>
    <button class="btn" id="wSand">Sandbox</button>
    <button class="btn" id="wCustom">Custom battle</button>
    <button class="btn" id="wMore">Endless & Survival</button>
    <button class="btn ghost" id="wWatch">Keep watching</button>
  </div>
  <div class="hint">Drag to pan · scroll or pinch to zoom · right-drag or two-finger twist to turn · WASD and Q/E fly the camera · Space pauses · 1, 2, 3 set 1×, 3×, 9× speed · T opens the tech tree · tap a soldier to inspect it</div>`,s=>{
    $('#wX').onclick=closeModal; $('#wWatch').onclick=closeModal;
    $('#wCamp').onclick=()=>campaignDone()?showBattles('campaign'):openCampaign(PROG.level);
    $('#wSand').onclick=()=>showBattles('sandbox'); $('#wCustom').onclick=()=>showBattles('custom'); $('#wMore').onclick=()=>showBattles('endless');
  });
}
function showBattles(tab){
  tab=tab||'campaign';
  const tabs=[['campaign','Campaign'],['endless','Endless'],['survival','Survival'],['sandbox','Sandbox'],['custom','Custom']];
  let body='';
  if(tab==='campaign'){
    const top=PROG.level; const rows=[];
    for(let L=1;L<=Math.min(top+1,CAMPAIGN_LEN);L++){ const cl=campaignLevel(L), locked=L>top, won=PROG.won[L];
      rows.push(`<div class="lrow${locked?' locked':''}"><div class="no">${L}</div><div style="min-width:0"><div class="t">${cl.name}</div><div class="m">${cl.final?'Final battle · ':''}${MAPS.find(m=>m.id===cl.mapId).name} · ${fmt(cl.count)} enemies · ${STYLES[cl.style].name.toLowerCase()} · reward ${fmt(cl.reward)}${won?' · <span class="won">won</span>':''}</div></div>${locked?'<span class="hint">Win battle '+(L-1)+'</span>':`<button class="btn sm${L===top?' primary':''}" data-camp="${L}">${won?'Replay':'Deploy'}</button>`}</div>`); }
    body=`<p class="lede">${campaignDone()?`You have won the war. Replay any battle, or take your army into Endless and Survival.`:`Battle ${Math.min(top,CAMPAIGN_LEN)} of ${CAMPAIGN_LEN}.`} Your army: <b>${fmt(rosterTotal())}</b> soldiers in the roster, up to <b>${fmt(capOf())}</b> on the field at once. Enemies grow about 30% larger each battle. The fallen recover between battles, but soldiers who flee the field desert for good.</p><div class="list" id="campList">${rows.reverse().join('')}</div>
    <div class="resetrow"><span class="hint">Start again from battle 1 with a fresh army. Gold, soldiers, research, upgrades and best scores are wiped${CLOUD.on?' on every device signed in to your account':''}. Saved layouts are kept.</span><button class="btn sm danger" id="bReset">Reset progress</button></div>`;
  } else if(tab==='endless'){
    body=`<p class="lede">Deploy your roster and hold out against waves that grow 25% larger every round. Between waves your survivors heal fully and a third of the fallen return as reinforcements. Each broken wave pays a bonus. Best: <b>${PROG.best.endless}</b> waves.</p>
    <div class="grid2"><label class="field">Battlefield<select id="eMap">${mapOptions('grassland',['blank'])}</select></label></div><div class="actions"><button class="btn primary" id="eGo">Deploy</button></div>`;
  } else if(tab==='survival'){
    body=`<p class="lede">Defend the western wall. Enemy columns arrive without pause and get stronger every minute. Your walls block missiles and funnel attackers through three gates. Best: <b>${mmss(PROG.best.survival)}</b> held.</p><div class="actions"><button class="btn primary" id="sGo">Deploy behind the wall</button></div>`;
  } else if(tab==='sandbox'){
    body=`<p class="lede">Every unit unlocked, no limits. Paint both armies, reshape the terrain with the map editor, then press Fight.</p>
    <div class="grid2"><label class="field">Battlefield<select id="sbMap">${mapOptions('grassland')}</select></label><label class="check" style="align-self:end"><input type="checkbox" id="sbArm" checked>Start with two sample armies</label></div>
    <div class="actions"><button class="btn primary" id="sbGo">Open sandbox</button></div>`;
  } else {
    const c=GAME.custom;
    const styleOpts=v=>Object.entries(STYLES).map(([k,s])=>`<option value="${k}"${k===v?' selected':''}>${s.name}</option>`).join('');
    body=`<p class="lede">Generate two armies, fine-tune them in deployment, and let them fight. Up to 8,000 a side; battles over about 10,000 soldiers in total need a fast device.</p>
    <div class="grid2">
      <label class="field">Battlefield<select id="cMap">${mapOptions(c.map,['blank'])}</select></label>
      <label class="field">Starting distance<select id="cDist"><option value="close"${c.dist==='close'?' selected':''}>Close</option><option value="normal"${c.dist==='normal'?' selected':''}>Normal</option><option value="far"${c.dist==='far'?' selected':''}>Far</option></select></label>
      <label class="field"><span>Blue army <output id="cBo">${fmt(c.blue)}</output></span><input type="range" id="cB" min="50" max="8000" step="50" value="${c.blue}"></label>
      <label class="field"><span>Red army <output id="cRo">${fmt(c.red)}</output></span><input type="range" id="cR" min="50" max="8000" step="50" value="${c.red}"></label>
      <label class="field">Blue composition<select id="cBs">${styleOpts(c.bs)}</select></label>
      <label class="field">Red composition<select id="cRs">${styleOpts(c.rs)}</select></label>
      <label class="check"><input type="checkbox" id="cMor"${c.morale?' checked':''}>Morale and routing</label>
      <label class="check"><input type="checkbox" id="cRain"${c.rain?' checked':''}>Rain (missiles scatter more)</label>
    </div><div class="actions"><button class="btn primary" id="cGo">Generate armies</button></div>`;
  }
  openModal(`<div class="sheet-h"><h2>Battles</h2><button class="x" id="bX" aria-label="Close">×</button></div>
  <div class="tabs">${tabs.map(([k,n])=>`<button class="tab${k===tab?' on':''}" data-tab="${k}">${n}</button>`).join('')}</div>${body}`,s=>{
    $('#bX').onclick=closeModal;
    s.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showBattles(b.dataset.tab));
    s.querySelectorAll('[data-camp]').forEach(b=>b.onclick=()=>openCampaign(+b.dataset.camp));
    if(tab==='campaign'){ const rb=$('#bReset'); let armed=0;
      rb.onclick=()=>{ if(!armed){ armed=setTimeout(()=>{ armed=0; rb.classList.remove('armed'); rb.textContent='Reset progress'; },4000); rb.classList.add('armed'); rb.textContent='Tap again to wipe progress'; return; }
        clearTimeout(armed); resetProgress(); }; }
    if(tab==='endless') $('#eGo').onclick=()=>openEndless($('#eMap').value);
    if(tab==='survival') $('#sGo').onclick=openSurvival;
    if(tab==='sandbox') $('#sbGo').onclick=()=>openSandbox($('#sbMap').value,$('#sbArm').checked);
    if(tab==='custom'){
      const c=GAME.custom;
      $('#cB').oninput=e=>{ $('#cBo').textContent=fmt(+e.target.value); }; $('#cR').oninput=e=>{ $('#cRo').textContent=fmt(+e.target.value); };
      $('#cGo').onclick=()=>{ Object.assign(c,{map:$('#cMap').value,dist:$('#cDist').value,blue:+$('#cB').value,red:+$('#cR').value,bs:$('#cBs').value,rs:$('#cRs').value,morale:$('#cMor').checked,rain:$('#cRain').checked}); openCustom(c); };
    }
  });
}
function showCouncil(tab){
  tab=tab||'recruit';
  const tabs=[['recruit','Recruit'],['tech','Tech tree'],['upgrades','Upgrades']];
  const ps=computeStats(upgLv,PROG.tech);
  let body='';
  if(tab==='recruit'){
    const rows=UNITS.map((u,i)=>{ if(!fieldable(u.id)) return ''; const s=ps[i], own=PROG.roster[u.id]||0;
      const b=n=>{ const c=u.cost*n; return `<button class="btn sm" data-buy="${u.id}" data-n="${n}"${PROG.gold<c?' disabled':''}>+${n} · ${fmt(c)}</button>`; };
      const big=capOf()>=2000?b(1000):'';
      return `<div class="rec">${unitIcon(i)}<div style="min-width:0"><div class="t">${u.name}<small>${u.role}</small></div><div class="st">HP ${Math.round(s.hp)} · ARM ${s.armor.toFixed(1).replace('.0','')} · DMG ${Math.round(s.dmg)} · RNG ${u.isR?Math.round(s.range):s.range.toFixed(1)} · SPD ${s.speed.toFixed(1)} · ${u.cost}g each</div></div><div><div class="own"><b>${fmt(own)}</b> owned</div><div class="buy">${u.cls==='sie'?b(1)+b(5):b(10)+b(100)}${big}</div></div></div>`; }).join('');
    body=`<p class="lede">Recruits join your roster permanently. You can field up to <b>${fmt(capOf())}</b> at once; research Logistics to raise the cap. Roster: <b>${fmt(rosterTotal())}</b>.</p><div class="list">${rows}</div>`;
  } else if(tab==='tech'){
    const cols=BRANCHES.map((bn,b)=>{ const nodes=TECH.filter(t=>t.b===b).map(t=>{ const own=owned(t.id), avail=!own&&t.req.every(owned);
      const u=t.unit?UNITS[UID[t.unit]]:null;
      const prev=t.unit&&PREV_TIER[t.unit], next=t.unit&&NEXT_TIER[t.unit];
      const desc=t.desc||(u?(prev?`<b class="up">Upgrades your ${UNITS[UID[prev]].name.toLowerCase()}.</b> `:'')+u.desc:t.cap?`Field up to ${fmt(t.cap)} soldiers at once.`:'');
      const doneTxt= t.unit&&superseded(t.unit) ? `Upgraded to ${UNITS[UID[NEXT_TIER[t.unit]]].name}` : 'Researched';
      const req=t.req.filter(r=>!owned(r)).map(r=>TECHBY[r].name);
      return `<div class="node ${own?'owned':avail?'avail':'locked'}"><div class="nt">${u?unitIcon(UID[t.unit]):''}${t.name}</div><div class="nd">${desc}</div>${own?`<div class="ok">${doneTxt}</div>`:avail?`<button class="btn sm primary" data-tech="${t.id}"${PROG.gold<t.cost?' disabled':''}>Research · ${fmt(t.cost)}</button>`:`<div class="req">Needs ${req.join(' and ')} · ${fmt(t.cost)}</div>`}</div>`; }).join('');
      return `<div class="branch"><h5>${bn}</h5>${nodes}</div>`; }).join('');
    body=`<p class="lede">Unlock unit classes, battlefield abilities and larger armies. Researching the next unit in a line, like Swordsmen to Heavy Infantry, re-equips every soldier of the old type, so your army keeps a short list of units. Scroll sideways to see every branch.</p><div class="tree">${cols}</div>`;
  } else {
    const blocks=UPG_CATS.map(c=>`<div class="ucat"><h5>${c.name}</h5>${UPG_STATS.map(s=>{ const lv=upgLv(c.id,s.id), cost=upgCost(c.id,s.id,lv);
      return `<div class="urow"><div class="t">${s.name}<small>${s.fx} per level</small></div><div class="pips" aria-label="Level ${lv} of ${UPG_MAX}">${Array.from({length:UPG_MAX},(_,k)=>`<i class="${k<lv?'f':''}"></i>`).join('')}</div>${lv>=UPG_MAX?'<span class="ok hudtext" style="color:var(--good)">MAX</span>':`<button class="btn sm" data-upg="${c.id}_${s.id}"${PROG.gold<cost?' disabled':''}>${fmt(cost)}</button>`}</div>`; }).join('')}</div>`).join('');
    body=`<p class="lede">Upgrades apply to every soldier of that class, in every battle.</p><div class="grid2">${blocks}</div>`;
  }
  openModal(`<div class="sheet-h"><h2>War Council</h2><div class="gold" style="margin-left:auto"><span class="coin"></span>${fmt(PROG.gold)}</div>${GAME.phase==='result'?`<button class="btn primary sm" id="cNext">${nextAction()[0]}</button>`:''}<button class="x" id="cX" aria-label="Close">×</button></div>
  <div class="tabs">${tabs.map(([k,n])=>`<button class="tab${k===tab?' on':''}" data-tab="${k}">${n}</button>`).join('')}</div>${body}`,s=>{
    $('#cX').onclick=closeModal; const cn=s.querySelector('#cNext'); if(cn) cn.onclick=()=>nextAction()[1]();
    s.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>showCouncil(b.dataset.tab));
    s.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{ const id=b.dataset.buy, n=+b.dataset.n, c=UNITS[UID[id]].cost*n; if(PROG.gold<c) return; PROG.gold-=c; PROG.roster[id]=(PROG.roster[id]||0)+n; saveProg(); keepScroll(()=>showCouncil('recruit')); afterProgressChange(); });
    s.querySelectorAll('[data-tech]').forEach(b=>b.onclick=()=>{ const t=TECHBY[b.dataset.tech]; if(PROG.gold<t.cost) return; PROG.gold-=t.cost; PROG.tech[t.id]=true; let msg=`${t.name} researched`;
      if(t.unit){ const prev=PREV_TIER[t.unit], conv=prev?(PROG.roster[prev]||0):0;
        if(conv){ PROG.roster[t.unit]=(PROG.roster[t.unit]||0)+conv; PROG.roster[prev]=0; msg=`Your ${fmt(conv)} ${UNITS[UID[prev]].name.toLowerCase()} are now ${t.name.toLowerCase()}`; }
        else if(!PROG.roster[t.unit]){ PROG.roster[t.unit]=UNITS[UID[t.unit]].cls==='sie'?2:UNITS[UID[t.unit]].cls==='sup'?3:10; msg+='. A few recruits have joined.'; } }
      saveProg(); toast(msg,3000); keepScroll(()=>showCouncil('tech')); afterProgressChange(); });
    s.querySelectorAll('[data-upg]').forEach(b=>b.onclick=()=>{ const [c,st]=b.dataset.upg.split('_'), lv=upgLv(c,st), cost=upgCost(c,st,lv); if(PROG.gold<cost||lv>=UPG_MAX) return; PROG.gold-=cost; PROG.upg[c+'_'+st]=lv+1; saveProg(); keepScroll(()=>showCouncil('upgrades')); afterProgressChange(); });
  });
}
function keepScroll(fn){ const s=$('#sheet'), y=s.scrollTop, tree=s.querySelector('.tree'), tx=tree?tree.scrollLeft:0; fn(); s.scrollTop=y; const t2=s.querySelector('.tree'); if(t2) t2.scrollLeft=tx; }
// wipe the campaign and the army, keeping only saved layouts
function resetProgress(){ const saves=PROG.saves||[]; PROG=defaultProg(); PROG.saves=saves; saveProg(); normalizeRoster(); openCampaign(1); toast('Progress reset. A fresh army stands ready for battle 1.',3200); }
function afterProgressChange(){ updateHud(true); if(GAME.phase==='deploy'&&GAME.limited){ STT[0]=playerStats(); for(const g of D.groups) if(g.team===0) g.type=UID[currentTier(UNITS[g.type].id)]; syncDeploy(); buildDeployDock(); } }
// what "continue" means after a battle, so the player is never stuck on the results
function nextAction(){
  if(GAME.mode==='campaign'){ const L=GAME.level, won=GAME.winner===0;
    if(won&&L<CAMPAIGN_LEN) return [`Battle ${L+1}`,()=>openCampaign(L+1)];
    if(won) return ['Endless & Survival',()=>showBattles('endless')];
    if(PROG.level>L) return [`Continue · Battle ${PROG.level}`,()=>openCampaign(PROG.level)];
    return [`Try battle ${L} again`,()=>openCampaign(L)]; }
  if(GAME.mode==='endless') return ['Go again',()=>openEndless(GAME.mapId)];
  if(GAME.mode==='survival') return ['Go again',()=>openSurvival()];
  return ['Edit armies and refight',()=>{ const gs=GAME.lastDeploy; enterDeploy({mode:GAME.mode,limited:false,editTeams:[0,1],rules:GAME.rules,title:GAME.title,keepTerrain:true,keepCamera:true,groups:gs}); }];
}
function refreshResultDock(){ const [label,fn]=nextAction(); const b=$('#btnNext'); b.textContent=label; b.onclick=fn; }
$('#btnResults').onclick=()=>showResults();
$('#btnRCouncil').onclick=()=>showCouncil('recruit');
function showResults(){
  GAME.phase='result'; setBattleSel([]); showDock('result'); refreshResultDock();
  const r=settleRewards(), won=GAME.winner===0;
  if(GAME.limited && r.total>0 && !GAME.coinPlayed){ GAME.coinPlayed=true; audUi('coin',0.6); }
  let title, color, sub;
  if(GAME.mode==='endless'){ title=`Wave ${GAME.wave}`; color='var(--red)'; sub=`You broke ${GAME.wave-1} wave${GAME.wave-1===1?'':'s'} before being overrun.`; }
  else if(GAME.mode==='survival'){ title=mmss(GAME.survT); color='var(--brass-hi)'; sub='held before the wall fell.'; }
  else if(GAME.mode==='campaign'&&won&&GAME.level===CAMPAIGN_LEN){ title='The war is won'; color='var(--brass-hi)'; sub=`You won the last battle. All ${CAMPAIGN_LEN} battles of the campaign are yours.`; }
  else { title=won?'Victory':GAME.winner===1?'Defeat':'Stalemate'; color=won?'var(--brass-hi)':GAME.winner===1?'var(--red)':'var(--fg)'; sub=GAME.mode==='campaign'?`Battle ${GAME.level} · ${campaignLevel(GAME.level).name}`:GAME.title; }
  const goldHtml=GAME.limited?`<div class="goldlines">${r.lines.map(([l,v])=>`<div><span>${l}</span><b>+${fmt(v)}</b></div>`).join('')}<div class="total"><span>Gold earned</span><b>+${fmt(r.total)}</b></div></div>${r.deserted?`<div class="desert">${fmt(r.deserted)} soldier${r.deserted===1?'':'s'} ran off the field and deserted. They have left your roster.</div>`:''}<div class="hint" style="margin-top:6px">Your roster now: <b>${fmt(rosterTotal())}</b> soldiers. Every one of them, upgrades included, marches into the next battle; only deserters leave.</div>`:'';
  const [nextLabel,nextFn]=nextAction();
  let btns=`<button class="btn" id="rBattles">Battles</button>`+(GAME.limited?`<button class="btn" id="rCouncil">Council</button>`:'');
  if(GAME.mode==='campaign'&&!nextLabel.startsWith('Try')) btns+=`<button class="btn" id="rRetry">Replay battle ${GAME.level}</button>`;
  btns+=`<button class="btn primary" id="rGo">${nextLabel}</button>`;
  openModal(`<div class="sheet-h"><div><h2 class="result-title" style="color:${color}">${title}</h2><div class="sub" style="margin-top:6px">${esc(sub)}</div></div><button class="x" id="rX" aria-label="Close" style="align-self:flex-start">×</button></div>
  <div class="statgrid"><div class="stat"><div class="l">Blue lost</div><div class="v" style="color:var(--blue)">${fmt(B.dead[0])}<span class="hudtext" style="font-size:14px;color:var(--dim)"> / ${fmt(B.start[0])}</span></div></div>
  <div class="stat"><div class="l">Red lost</div><div class="v" style="color:var(--red)">${fmt(B.dead[1])}<span class="hudtext" style="font-size:14px;color:var(--dim)"> / ${fmt(B.start[1])}</span></div></div>
  <div class="stat"><div class="l">Routed</div><div class="v">${fmt(B.esc[0]+B.esc[1])}</div></div><div class="stat"><div class="l">Battle time</div><div class="v">${mmss(simTime)}</div></div></div>
  ${goldHtml}
  <div style="overflow-x:auto">${casualtyTable()}</div>
  <div class="actions">${btns}</div>`,s=>{
    const on=(id,f)=>{ const e=s.querySelector('#'+id); if(e) e.onclick=f; };
    on('rCouncil',()=>showCouncil('recruit')); on('rBattles',()=>showBattles(GAME.mode==='endless'?'endless':GAME.mode==='survival'?'survival':'campaign'));
    on('rGo',nextFn); on('rX',closeModal); on('rNext',()=>openCampaign(GAME.level+1)); on('rRetry',()=>openCampaign(GAME.level)); on('rEndless',()=>showBattles('endless'));
    on('rAgain',()=>GAME.mode==='endless'?openEndless(GAME.mapId):openSurvival());
    on('rEdit',()=>{ const gs=GAME.lastDeploy; enterDeploy({mode:GAME.mode,limited:false,editTeams:[0,1],rules:GAME.rules,title:GAME.title,keepTerrain:true,keepCamera:true,groups:gs}); });
  });
}
$('#btnCouncil').onclick=()=>showCouncil('recruit');

/* ---------- sound controls ---------- */
const SND_ON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/></svg>';
const SND_OFF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
function renderSoundBtn(){ const b=$('#btnSound'); b.innerHTML=AUD.on?SND_ON:SND_OFF; b.classList.toggle('muted',!AUD.on); b.setAttribute('aria-label',AUD.on?'Sound on. Open sound settings':'Sound off. Open sound settings'); if(!$('#soundPop').hidden) renderSoundPop(); }
/* ---------- sound board: every sound in the game, what plays it and where it comes from ---------- */
const SOUND_BOARD=[
  ['Melee',[['clang','Sword clash','Melee blows landing'],['wood','Shield block','A blow stopped by a shield'],['punch','Soldier falls','Every kill'],['thud','Heavy thud','Cavalry charges, boulders landing and bouncing']]],
  ['Missiles and siege',[['whoosh','Arrow volley','Archers loosing together near the camera'],['struck','Missile hit','Arrows, bolts and shot striking a soldier'],['xbow','Crossbow','Each crossbow shot'],['musket','Musket','Each musket shot'],['woodH','Catapult and ballista','A siege engine loosing'],['cannon','Cannon and mortar','Each gun firing'],['blast','Exploding shell','Mortar shells bursting']]],
  ['Battle cues',[['drum','Battle drum','A battle starting'],['hornWave','New wave','A new wave in Endless'],['fanfare','Victory','Winning a battle'],['hornDefeat','Defeat','Losing a battle']]],
  ['Interface',[['coin','Coins','Recruiting, research and gold rewards'],['tick','Click','Buttons'],['place','Place','Dropping a regiment in deployment']]],
  ['Ambience (loops)',[['bed:din','Melee roar','Rises with the fighting near the camera'],['bed:march','Marching','Troops and horse on the move'],['bed:wind','Wind','Always there, louder zoomed out']]],
];
const SB_PLAYING=new Set();
const sbList=k=>{ if(k.startsWith('bed:')){ const b=AUD.beds[k.slice(4)]; return b?[b.buf]:null; } return AUD.B[k]||null; };
function sbSource(k){
  if(k==='bed:din') return 'Mixed in the game from the sword, shield and blow recordings';
  if(k==='bed:march') return 'Mixed in the game from the footstep recordings: '+sbSource('step');
  if(k==='bed:wind') k='wind';
  const s=typeof SFX_DATA!=='undefined'&&SFX_DATA.src[k]; if(!s) return '';
  const labels=s.map(x=>x[0]), stem=labels[0].replace(/_?(OS_)?\d+$|\s\d+$/,''), same=labels.every(l=>l.replace(/_?(OS_)?\d+$|\s\d+$/,'')===stem);
  return (same&&labels.length>1?`${stem} ×${labels.length}`:labels.join(', '))+' · '+[...new Set(s.map(x=>SFX_DATA.credits[x[1]]))].join(', '); }
function sbPlay(k,i){ audUnlock(); if(!audLive()){ toast('Sounds are still loading. Try again in a moment.'); return; }
  const list=sbList(k); if(!list) return; const loop=k.startsWith('bed:'), src=audPlay(i>=0?[list[i]]:list,loop?0.6:0.7,0,1,0,loop?0:0.1,0,loop?AUD.bus.amb:AUD.bus.sfx);
  if(src){ SB_PLAYING.add(src); src.addEventListener('ended',()=>SB_PLAYING.delete(src)); } }
function showSoundBoard(){
  audUnlock();
  const rows=SOUND_BOARD.map(([sec,items])=>`<h3 class="sb-h">${sec}</h3><div class="list">${items.map(([k,name,when])=>{ const n=(sbList(k)||[]).length||((typeof SFX_DATA!=='undefined'&&SFX_DATA.files[k])||[]).length||1;
    return `<div class="sb-row"><button class="btn sm sb-play" data-k="${k}" data-i="-1" aria-label="Play ${name}">▶</button><div style="min-width:0"><div class="t">${name}</div><div class="m">${when} · <span class="src">${esc(sbSource(k))}</span></div></div>
    <div class="sb-v">${n>1?Array.from({length:n},(_,i)=>`<button class="btn sm" data-k="${k}" data-i="${i}" aria-label="${name}, variant ${i+1}">${i+1}</button>`).join(''):''}</div></div>`; }).join('')}</div>`).join('');
  openModal(`<div class="sheet-h"><h2>Sound board</h2><button class="x" id="sbX" aria-label="Close">×</button></div>
    <p class="lede">Every sound in the game. ▶ plays a random take, the numbers play each variant. Every sound is a recording; in battle each plays at its natural pitch, quieter and more muffled with distance from the camera.</p>
    <div class="actions" style="justify-content:flex-start;margin:0 0 6px"><button class="btn sm" id="sbStop">Stop all</button></div>${rows}
    <h3 class="sb-h">Credits</h3><div class="hint" style="line-height:1.55">All sounds are recordings, trimmed, made mono and converted to MP3 for the game.<br>
    Kenney: Impact Sounds, Interface Sounds, RPG Audio and Sci-Fi Sounds, www.kenney.nl (CC0).<br>
    Still North Media: Medieval Weapons and Firearm Sound Effects Libraries (CC0).<br>
    Ogrebane: Battle Sound Effects, opengameart.org (CC0).<br>
    "Oculus Audio Pack 01" by Oculus VR, LLC (developers.meta.com/vr/downloads/package/oculus-audio-pack-1), licensed under CC BY 4.0 (creativecommons.org/licenses/by/4.0). Used: whooshes, marching snare, snare crash, orchestral victory and defeat stingers, footsteps and wind; cut and re-encoded.</div>`,s=>{
    $('#sbX').onclick=closeModal;
    $('#sbStop').onclick=()=>{ for(const src of SB_PLAYING){ try{ src.stop(); }catch(e){} } SB_PLAYING.clear(); };
    s.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>sbPlay(b.dataset.k,+b.dataset.i)); });
}
function renderSoundPop(){
  const p=$('#soundPop');
  p.innerHTML=`<h4>Sound<button class="x" id="sdX" aria-label="Close">×</button></h4>
  <div class="row"><div class="seg" role="group" aria-label="Sound"><button class="btn sm${AUD.on?' on':''}" id="sdOn">On</button><button class="btn sm${AUD.on?'':' on'}" id="sdOff">Off</button></div></div>
  <label class="slider"><span>Volume</span><input type="range" id="sdVol" min="0" max="100" step="1" value="${Math.round(AUD.vol*100)}"><output>${Math.round(AUD.vol*100)}%</output></label>
  <label class="slider"><span>Ambience</span><input type="range" id="sdAmb" min="0" max="100" step="1" value="${Math.round(AUD.amb*100)}"><output>${Math.round(AUD.amb*100)}%</output></label>
  <div class="row"><button class="btn sm" id="sdBoard">Sound board</button><button class="btn sm" id="sdTest">Quick test</button></div>
  <div class="hint">All sounds are recordings from Kenney, Still North Media, OpenGameArt and Meta's Oculus Audio Pack; the sound board lists them with credits. Ambience is the roar of the melee, hooves, marching feet and wind. Press M to mute.</div>`;
  $('#sdBoard').onclick=()=>{ closePops(); showSoundBoard(); };
  $('#sdTest').onclick=()=>{ if(!AUD.on){ audSetOn(true); renderSoundBtn(); } audPreview(); };
  $('#sdX').onclick=closePops;
  $('#sdOn').onclick=()=>{ audSetOn(true); renderSoundBtn(); };
  $('#sdOff').onclick=()=>{ audSetOn(false); renderSoundBtn(); };
  const v=$('#sdVol'), a=$('#sdAmb');
  v.oninput=()=>{ audSetVol(v.value/100); v.nextElementSibling.textContent=v.value+'%'; if(!AUD.on){ audSetOn(true); renderSoundBtn(); } };
  a.oninput=()=>{ audSetAmb(a.value/100); a.nextElementSibling.textContent=a.value+'%'; };
}
if(window.AudioContext||window.webkitAudioContext){ $('#btnSound').hidden=false; renderSoundBtn(); }
$('#btnSound').onclick=()=>{ const p=$('#soundPop'), show=p.hidden; closePops(); if(show){ renderSoundPop(); p.hidden=false; } };
// interface sounds: coins for purchases, a soft tick for other buttons
document.addEventListener('click',e=>{ const t=e.target.closest&&e.target.closest('button'); if(!t||t.disabled) return;
  if(t.closest('[data-buy],[data-tech],[data-upg]')) audUi('coin',0.6); else if(t.id!=='sdOn'&&!t.closest('[data-k],#sbStop')) audUi('tick',0.3); },true);
$('#btnBattles').onclick=()=>showBattles(GAME.mode==='endless'?'endless':GAME.mode==='survival'?'survival':GAME.mode==='sandbox'?'sandbox':GAME.mode==='custom'?'custom':'campaign');

/* ---------- renderer setup + loop ---------- */
const glCanvas=$('#gl'), c2d=$('#c2d');
function resize(){
  const w=Math.max(1,window.innerWidth), h=Math.max(1,window.innerHeight);
  let dpr=Math.min(window.devicePixelRatio||1,2); if(w*h*dpr*dpr>3.4e6) dpr=Math.sqrt(3.4e6/(w*h));
  CAM.W=w; CAM.H=h; CAM.aspect=w/h;
  const cv=RENDER==='gpu'?glCanvas:c2d; const pw=Math.round(w*dpr), ph=Math.round(h*dpr);
  if(cv.width!==pw||cv.height!==ph){ cv.width=pw; cv.height=ph; }
  measureDock();
}
window.addEventListener('resize',resize);
function useFallback(reason){
  RENDER='2d'; glCanvas.hidden=true; c2d.hidden=false; $('#fallbackBadge').hidden=false;
  if(reason) $('#fallbackBadge').title=String(reason);
  resize(); onTerrainChanged();
}
const OV={cv:$('#ov'),ctx:null,dirty:false};
function drawOverlay(){
  const cv=OV.cv; if(cv.width!==CAM.W||cv.height!==CAM.H){ cv.width=CAM.W; cv.height=CAM.H; }
  const ctx=OV.ctx||(OV.ctx=cv.getContext('2d'));
  if(OV.dirty){ ctx.clearRect(0,0,cv.width,cv.height); OV.dirty=false; }
  if(GST&&GST.kind==='box'){ const a=GST.a, b=GST.b; ctx.fillStyle='rgba(232,194,106,0.12)'; ctx.strokeStyle='rgba(232,194,106,0.95)'; ctx.lineWidth=1.5;
    ctx.fillRect(Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])); ctx.strokeRect(Math.min(a[0],b[0])+.5,Math.min(a[1],b[1])+.5,Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])); OV.dirty=true; }
  if(GAME.phase!=='deploy'||!$('#modal').hidden) return;
  if(!D.terrain) return;
  let p=null;
  if(GST&&(GST.kind==='tool'||GST.kind==='terrain')){ const o=[...PTR.values()][0]; p=o&&o.p; }
  else if(!GST&&HOVER&&performance.now()-HOVER_T<5000) p=HOVER;
  if(!p) return; const W=worldAt(p[0],p[1]); if(!W) return;
  const r=D.terrain&&D.ttool==='wall'?Math.max(1.1,D.size*0.3):D.size;
  ctx.beginPath(); let started=false;
  for(let k=0;k<=48;k++){ const t=k/48*TAU, x=W[0]+Math.cos(t)*r, z=W[1]+Math.sin(t)*r, q=projW(x,heightAt(x,z)+0.15,z); if(!q){ started=false; continue; } if(started) ctx.lineTo(q[0],q[1]); else { ctx.moveTo(q[0],q[1]); started=true; } }
  ctx.lineWidth=2; ctx.strokeStyle=D.terrain?'rgba(214,232,255,0.9)':D.tool==='erase'?'rgba(255,138,120,0.95)':'rgba(232,194,106,0.95)'; ctx.stroke();
  ctx.lineWidth=4; ctx.strokeStyle='rgba(0,0,0,0.25)'; ctx.globalCompositeOperation='destination-over'; ctx.stroke(); ctx.globalCompositeOperation='source-over';
  OV.dirty=true;
}
// battle selection mode: drag a box to select regiments (Shift-drag works at any time)
$('#btnBSel').onclick=()=>{ BSELMODE=!BSELMODE; $('#btnBSel').classList.toggle('on',BSELMODE); if(BSELMODE) toast('Drag a box over regiments, or tap one, then pick their orders',2600); else setBattleSel([]); };
function onGpuLost(info){ const why=info?`${info.reason||''} ${info.message||''}`.trim():''; console.warn('GPU device lost:',why); useFallback('GPU device lost'+(why?': '+why:'')); toast('The graphics device was lost. Switched to the canvas view.'); }
let lastT=performance.now(), acc=0, hudT=0, miniT=0, statT=0, fpsN=0, fpsT=0;
function loop(now){
  const dt=Math.min(0.1,(now-lastT)/1000); lastT=now;
  if(GAME.phase==='battle'){
    const sp=GAME.speed; acc+=dt*sp; let steps=0;
    // at most ~14 ms of simulation per frame: a huge battle on a slow device runs a little slower instead of stuttering
    // fast speeds get a bigger slice of the frame (9× needs about three ticks a frame at 60 fps)
    const t0=performance.now(), budget=sp>=9?24:sp>=3?18:14, maxSteps=sp>=9?14:sp>=3?8:6;
    while(acc>=DT && steps<maxSteps && (steps===0||performance.now()-t0<budget)){ simTick(); afterTick(); acc-=DT; steps++; }
    if(acc>=DT) acc=Math.min(acc,DT*0.99);
    VIEW.alpha=sp>0?clamp(acc/DT,0,1):1;
    VIEW.time+=dt*sp;
    updateParticles(dt*sp);
    if(B.rules.rain && sp>0){ for(let k=0;k<6;k++) spawnQ(CAM.tx+(Math.random()-.5)*CAM.dist*1.2,heightAt(CAM.tx,CAM.tz)+18+Math.random()*10,CAM.tz+(Math.random()-.5)*CAM.dist*1.2,0,-24,0,1.1,0.06,0,0.72,0.8,0.88,0.45,0); }
    if(GAME.ended && GAME.endTimer>0){ GAME.endTimer-=dt; if(GAME.endTimer<=0){ if(GAME.mode==='demo'){ if($('#modal').hidden||$('#sheet').querySelector('.welcome-mark')) startDemo(); else GAME.endTimer=1; } else showResults(); } }
  } else if(GAME.phase==='result'){
    acc+=dt*0.5; let steps=0; while(acc>=DT&&steps<3){ simTick(); acc-=DT; steps++; } VIEW.alpha=clamp(acc/DT,0,1); VIEW.time+=dt*0.5; updateParticles(dt*0.5);
  } else { VIEW.alpha=1; VIEW.time+=dt*0.25; updateParticles(dt); }
  keyCamera(dt);
  camUpdate(dt);
  audioFrame(dt,GAME.phase,GAME.phase==='result'?0.5:GAME.speed);
  if(GAME.terrainDirty && now-GAME.terrainT>150){ GAME.terrainT=now; onTerrainChanged(); }
  // new stakes: refresh only the stakes layer (and the flat map in canvas mode), at most a few times a second
  if(GAME.stakesDirty && now-(GAME.stakesT||0)>300){ GAME.stakesT=now; GAME.stakesDirty=false; if(RENDER==='gpu') gpuSetStakes(TER); else r2dSetTerrain(TER); }
  if(RENDER==='gpu'&&GPU_R.ok){ try{ gpuFrame(glCanvas); }catch(e){ console.error(e); useFallback(e.message); } }
  else r2dFrame(c2d);
  drawOverlay();
  hudT-=dt; if(hudT<=0){ hudT=0.2; updateHud(); if(GAME.phase==='battle') updateInspect(); }
  miniT-=dt; if(miniT<=0){ miniT=0.14; drawMinimap(); }
  statT-=dt; if(statT<=0){ statT=0.5; if(GAME.phase==='battle') renderStats(); }
  requestAnimationFrame(loop);
}
function onCompact(map){ const h=VIEW.hlUnit; VIEW.hlUnit=(h>=0&&h<map.length)?map[h]:-1; if(CAM.follow>=0) CAM.follow=CAM.follow<map.length?map[CAM.follow]:-1; }

async function boot(data){
  loadProg(data);
  if(window.claude&&window.claude.hot&&window.claude.hot.snapshot){ try{ window.claude.hot.snapshot(()=>({prog:PROG})); }catch(e){} }
  resize();
  try{ await initWebGPU(glCanvas); RENDER='gpu'; }
  catch(e){ console.warn('WebGPU unavailable:',e); RENDER='2d'; glCanvas.hidden=true; c2d.hidden=false; $('#fallbackBadge').hidden=false; $('#fallbackBadge').title=String(e.message||e); }
  resize();
  startDemo();
  camPreset('iso',true);
  showWelcome();
  initCloud();
  requestAnimationFrame(t=>{ lastT=t; loop(t); });
}
const hot=window.claude&&window.claude.hot;
if(hot&&hot.ready) hot.ready(boot); else boot((hot&&hot.data)||{});
