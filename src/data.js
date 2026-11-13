'use strict';
/* ================= DATA: units, tech, maps, army generation ================= */

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rnd = mulberry32(12345);
function seedRng(s){ rnd = mulberry32(s>>>0); }
function gauss(){ return (rnd()+rnd()+rnd()+rnd()-2)*1.732; }
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
function angDiff(a,b){ let d=(b-a)%TAU; if(d>Math.PI) d-=TAU; else if(d<-Math.PI) d+=TAU; return d; }
function turnToward(a,b,step){ const d=angDiff(a,b); return Math.abs(d)<=step? b : a+Math.sign(d)*step; }

/* ---------- World ---------- */
// Maps are designed on a 300 x 180 m plan and built MS times larger, so every battlefield keeps its
// shape while holding far more soldiers. Front lines stay 68 m apart; deployment zones run back to the edges.
const MS=1.6;
const X0=-150*MS, X1=150*MS, Z0=-90*MS, Z1=90*MS;
const TC=2, TW=Math.round((X1-X0)/TC), TH=Math.round((Z1-Z0)/TC);   // terrain cells (2 m)
const ZONES=[[X0+12,-30],[30,X1-12]];      // deployment x-ranges per team

const T_GRASS=0,T_FOREST=1,T_WATER=2,T_FORD=3,T_ROCK=4,T_SAND=5,T_WALL=6,T_STAKES=7,T_ROAD=8;
const TERRAIN=[
  {name:'Grass',   speed:1,    cost:1,   pass:1},
  {name:'Forest',  speed:0.65, cost:1.7, pass:1},
  {name:'Deep water',speed:0,  cost:Infinity, pass:0},
  {name:'Ford',    speed:0.45, cost:2.4, pass:1},
  {name:'Rock',    speed:0,    cost:Infinity, pass:0},
  {name:'Sand',    speed:0.9,  cost:1.1, pass:1},
  {name:'Wall',    speed:0,    cost:Infinity, pass:0},
  {name:'Stakes',  speed:0.55, cost:2.5, pass:1},
  {name:'Road',    speed:1.15, cost:0.9, pass:1},
];
const PASSK=new Uint8Array(TERRAIN.map(t=>t.pass));
const SPEEDK=new Float32Array(TERRAIN.map(t=>t.speed));
const COSTK=new Float32Array(TERRAIN.map(t=>t.cost));

/* ---------- Units ---------- */
// cls: inf rng cav sie sup.  ucat: upgrade category
const UNITS=[
 {id:'sword', name:'Swordsmen', cls:'inf', hp:100,armor:3, dmg:14,aps:1.0, speed:3.2,range:0.9,morale:60, cost:10, r:.42,sp:1.1,mass:1,  scale:1,   foot:.55, role:'Line infantry', desc:'Reliable all-rounders for the main battle line.'},
 {id:'spear', name:'Spearmen',  cls:'inf', hp:95, armor:2, dmg:12,aps:0.9, speed:3.0,range:2.0,morale:62, cost:12, r:.40,sp:1.1,mass:1,  scale:1,   foot:.55, antiCav:3, brace:1, role:'Anti-cavalry', desc:'Long reach. Deals 3× damage to cavalry and stops charges, from any side when they are standing.'},
 {id:'shield',name:'Shieldbearers',cls:'inf',hp:150,armor:7,dmg:8, aps:0.8, speed:2.7,range:0.9,morale:75, cost:18, r:.46,sp:1.2,mass:1.4,scale:1,   foot:.6,  shield:1, role:'Defensive wall', desc:'Blocks arrows from the front and armours troops standing beside them.'},
 {id:'heavy', name:'Heavy Infantry',cls:'inf',hp:230,armor:10,dmg:20,aps:0.7,speed:2.2,range:1.0,morale:85, cost:30, r:.50,sp:1.3,mass:1.8,scale:1.15,foot:.65, role:'Armoured front', desc:'Slow, heavily armoured troops that anchor the line.'},
 {id:'bers',  name:'Berserkers',cls:'inf', hp:90, armor:0, dmg:24,aps:1.2, speed:4.1,range:0.9,morale:100,cost:22, r:.44,sp:1.15,mass:1.1,scale:1,  foot:.55, noFlee:1, role:'Shock troops', desc:'Huge damage and no armour. They never rout.'},
 {id:'archer',name:'Archers',   cls:'rng', hp:70, armor:1, dmg:10,aps:0.55,speed:3.0,range:36, morale:45, cost:12, r:.40,sp:1.1,mass:.9, scale:1,   foot:.5,  proj:0, acc:.045, role:'Volley fire', desc:'Lob volleys of arrows over friendly lines.'},
 {id:'xbow',  name:'Crossbowmen',cls:'rng',hp:80, armor:3, dmg:24,aps:0.3, speed:2.8,range:32, morale:50, cost:18, r:.42,sp:1.1,mass:1,  scale:1,   foot:.55, proj:1, acc:.03, pen:.7, role:'Armour piercing', desc:'Slow-loading bolts that ignore 70% of armour.'},
 {id:'musket',name:'Musketeers',cls:'rng', hp:85, armor:2, dmg:48,aps:0.18,speed:2.8,range:28, morale:55, cost:28, r:.42,sp:1.1,mass:1,  scale:1,   foot:.55, proj:2, acc:.028, pen:.8, role:'Gunpowder', desc:'Devastating flat volleys with long reloads.'},
 {id:'lcav',  name:'Light Cavalry',cls:'cav',hp:150,armor:3,dmg:17,aps:1.0,speed:8,range:1.2,morale:62, cost:25, r:.62,sp:2.0,mass:3,  scale:1,   foot:.95, charge:2, knock:1.1, sense:16, role:'Flankers', desc:'Fast riders that swing wide and hunt archers and siege crews.'},
 {id:'hcav',  name:'Heavy Cavalry',cls:'cav',hp:300,armor:9,dmg:27,aps:0.85,speed:6.4,range:1.3,morale:85, cost:50, r:.70,sp:2.2,mass:4.5,scale:1.12,foot:1.05,charge:3.6, knock:2.1, sense:16, role:'Breakthrough', desc:'Crushing charges that knock infantry out of formation.'},
 {id:'lancer',name:'Lancers',   cls:'cav', hp:210,armor:6, dmg:19,aps:0.85, speed:7.2,range:2.2,morale:75, cost:45, r:.66,sp:2.1,mass:3.6,scale:1,   foot:1,   charge:6, knock:2.5, pen:.35, sense:16, role:'Charge specialists', desc:'The lance hit deals 6× damage on impact and punches through armour.'},
 {id:'cata',  name:'Catapults', cls:'sie', hp:220,armor:2, dmg:70,aps:0.11,speed:2.7,range:80, morale:40, cost:120,r:1.2,sp:4.5,mass:12, scale:1,   foot:1.7, proj:3, acc:.05, aoe:3.5, minR:20, role:'Area siege', desc:'Hurl boulders that smash packed formations.'},
 {id:'ballista',name:'Ballistae',cls:'sie',hp:180,armor:2, dmg:80,aps:0.25,speed:2.9,range:72, morale:40, cost:110,r:1.0,sp:4,  mass:10, scale:1,   foot:1.5, proj:4, acc:.015, pierce:5, minR:8, role:'Precision', desc:'Bolts that skewer up to five soldiers in a file.'},
 {id:'cannon',name:'Cannons',   cls:'sie', hp:240,armor:4, dmg:95,aps:0.15,speed:2.7,range:88, morale:40, cost:180,r:1.1,sp:4.5,mass:12, scale:1,   foot:1.6, proj:5, acc:.03, pierce:8, minR:10, role:'Bouncing shot', desc:'Round shot bounces through ranks, hitting everyone in its path.'},
 {id:'mortar',name:'Mortars',   cls:'sie', hp:190,armor:3, dmg:75,aps:0.12,speed:2.6,range:68, morale:40, cost:160,r:1.0,sp:4,  mass:10, scale:1,   foot:1.5, proj:6, acc:.06, aoe:4.5, minR:15, role:'High angle', desc:'Explosive shells dropped from above. Walls give no cover.'},
 {id:'cmdr',  name:'Commanders',cls:'sup', hp:320,armor:8, dmg:24,aps:0.8, speed:3.4,range:1.1,morale:100,cost:150,r:.50,sp:2.5,mass:2,  scale:1.2, foot:.7,  aura:12, noFlee:1, role:'Leadership', desc:'Nearby troops deal 25% more damage and recover morale. Routed soldiers can only rally beside a commander.'},
 {id:'medic', name:'Medics',    cls:'sup', hp:70, armor:1, dmg:4, aps:0.5, speed:3.2,range:0.9,morale:50, cost:40, r:.40,sp:1.6,mass:.9, scale:1,   foot:.5,  heal:7, role:'Healing', desc:'Heal the most wounded soldier nearby and keep clear of melee.'},
 {id:'eng',   name:'Engineers', cls:'sup', hp:90, armor:2, dmg:8, aps:0.8, speed:3.0,range:0.9,morale:50, cost:40, r:.42,sp:1.6,mass:1,  scale:1,   foot:.55, stakes:1, role:'Fieldworks', desc:'Plant sharpened stakes ahead of them that maul enemy cavalry.'},
 {id:'elite', name:'Champions', cls:'inf', hp:420,armor:8, dmg:38,aps:1.0, speed:3.6,range:1.5,morale:100,cost:150,supply:5,r:.55,sp:1.6,mass:3,  scale:1.35,foot:.8,  noFlee:1, cleave:1, role:'Elite', desc:'Heroes whose blows cleave through a second enemy and who never rout. Each takes 5 places in the army limit.'},
];
const NT=UNITS.length;
const UID={}; UNITS.forEach((u,i)=>{UID[u.id]=i; u.ucat = (u.cls==='sup')?'inf':u.cls; u.isR = u.proj!=null; u.isSiege = u.cls==='sie';});
const URAD=new Float32Array(UNITS.map(u=>u.r));
const UMASS=new Float32Array(UNITS.map(u=>u.mass));
const CLS_NAMES={inf:'Infantry',rng:'Ranged',cav:'Cavalry',sie:'Siege',sup:'Support'};

/* ---------- Tech tree ---------- */
const BRANCHES=['Infantry','Ranged','Cavalry','Siege','Command','Logistics'];
// Upgrade lines: researching the next unit in a line re-equips every soldier of the previous tier,
// and the old type retires from your roster, so a developed army keeps a short list of unit types.
// Swordsmen, heavy infantry and champions are separate classes, bought separately (no free upgrades)
const LINES=[['archer','xbow','musket'],['lcav','hcav','lancer'],['cata','mortar'],['ballista','cannon']];
const PREV_TIER={}, NEXT_TIER={};
LINES.forEach(l=>l.forEach((id,k)=>{ if(k>0) PREV_TIER[id]=l[k-1]; if(k<l.length-1) NEXT_TIER[id]=l[k+1]; }));
// enemy armies still trade up their infantry as the campaign goes on
const ENEMY_NEXT=Object.assign({sword:'heavy',heavy:'elite'},NEXT_TIER);
// how many places in the army limit one soldier takes (champions count as several)
const supplyOf=t=>UNITS[t].supply||1;
const TECH=[
 {id:'sword', b:0,name:'Swordsmen',cost:0,req:[],unit:'sword'},
 {id:'spear', b:0,name:'Spearmen',cost:120,req:['sword'],unit:'spear'},
 {id:'shield',b:0,name:'Shieldbearers',cost:350,req:['spear'],unit:'shield'},
 {id:'shieldwall',b:0,name:'Shield Wall',cost:800,req:['shield'],desc:'Shieldbearers block 70% of frontal missiles and give +5 armour to neighbours.'},
 {id:'bers',  b:0,name:'Berserkers',cost:600,req:['spear'],unit:'bers'},
 {id:'heavy', b:0,name:'Heavy Infantry',cost:900,req:['shield'],unit:'heavy'},
 {id:'elite', b:0,name:'Champions',cost:4500,req:['heavy','cmdr'],unit:'elite',desc:'The finest fighters in the army. Each champion takes 5 places in your army limit.'},
 {id:'archer',b:1,name:'Archers',cost:0,req:[],unit:'archer'},
 {id:'firearrows',b:1,name:'Bodkin Arrows',cost:450,req:['archer'],desc:'Archers and crossbowmen deal 30% more damage.'},
 {id:'xbow',  b:1,name:'Crossbowmen',cost:450,req:['archer'],unit:'xbow'},
 {id:'gunpowder',b:1,name:'Gunpowder',cost:1600,req:['xbow'],desc:'Opens firearms: Musketeers, Mortars and Cannons.'},
 {id:'musket',b:1,name:'Musketeers',cost:1400,req:['gunpowder'],unit:'musket'},
 {id:'lcav',  b:2,name:'Light Cavalry',cost:250,req:['sword'],unit:'lcav'},
 {id:'hcav',  b:2,name:'Heavy Cavalry',cost:950,req:['lcav'],unit:'hcav'},
 {id:'thunder',b:2,name:'Thunder Charge',cost:1500,req:['hcav'],desc:'All cavalry charges hit 50% harder.'},
 {id:'lancer',b:2,name:'Lancers',cost:1800,req:['hcav'],unit:'lancer'},
 {id:'cata',  b:3,name:'Catapults',cost:650,req:['archer'],unit:'cata'},
 {id:'ballista',b:3,name:'Ballistae',cost:1100,req:['cata'],unit:'ballista'},
 {id:'mortar',b:3,name:'Mortars',cost:3200,req:['cata','gunpowder'],unit:'mortar'},
 {id:'cannon',b:3,name:'Cannons',cost:2800,req:['ballista','gunpowder'],unit:'cannon'},
 {id:'shells',b:3,name:'Explosive Shells',cost:3200,req:['mortar'],desc:'Blast radius of catapults and mortars grows by 40%.'},
 {id:'cmdr',  b:4,name:'Commanders',cost:750,req:['sword'],unit:'cmdr'},
 {id:'hymn',  b:4,name:'Battle Hymn',cost:1300,req:['cmdr'],desc:'Commander aura reaches 50% further, so routed troops rally from further away.'},
 {id:'medic', b:4,name:'Medics',cost:900,req:['cmdr'],unit:'medic'},
 {id:'surgery',b:4,name:'Field Surgery',cost:1600,req:['medic'],desc:'Medics heal twice as fast.'},
 {id:'eng',   b:4,name:'Engineers',cost:1100,req:['cmdr'],unit:'eng'},
 {id:'log1',b:5,name:'Logistics I',cost:200,req:[],cap:375},
 {id:'log2',b:5,name:'Logistics II',cost:750,req:['log1'],cap:750},
 {id:'log3',b:5,name:'Logistics III',cost:2500,req:['log2'],cap:1500},
 {id:'log4',b:5,name:'Logistics IV',cost:7500,req:['log3'],cap:2400},
 {id:'log5',b:5,name:'Logistics V',cost:15000,req:['log4'],cap:3600},
 {id:'log6',b:5,name:'Logistics VI',cost:27500,req:['log5'],cap:4800},
 {id:'log7',b:5,name:'Logistics VII',cost:45000,req:['log6'],cap:6300},
 {id:'log8',b:5,name:'Logistics VIII',cost:70000,req:['log7'],cap:7500},
 {id:'log9',b:5,name:'Logistics IX',cost:100000,req:['log8'],cap:9000},
];
const TECHBY={}; TECH.forEach(t=>TECHBY[t.id]=t);
const BASE_CAP=120;

const UPG_CATS=[{id:'inf',name:'Infantry & support',mul:1},{id:'rng',name:'Ranged',mul:1.1},{id:'cav',name:'Cavalry',mul:1.3},{id:'sie',name:'Siege',mul:1.5}];
const UPG_STATS=[
 {id:'dmg',name:'Forged weapons',fx:'+10% damage',base:180},
 {id:'arm',name:'Tempered armour',fx:'+1.5 armour',base:160},
 {id:'hp', name:'Vitality',fx:'+12% health',base:170},
 {id:'aps',name:'Drill',fx:'+8% attack speed',base:200},
 {id:'spd',name:'Forced march',fx:'+5% speed',base:140},
];
const UPG_MAX=5;
function upgCost(cat,stat,lvl){ const c=UPG_CATS.find(x=>x.id===cat), s=UPG_STATS.find(x=>x.id===stat); return Math.round(s.base*c.mul*Math.pow(1.9,lvl)/10)*10; }

// lv(cat,stat)->level ; ab: {abilityId:true}
function computeStats(lv, ab){
  return UNITS.map(u=>{
    const c=u.ucat, s=Object.assign({},u);
    s.hp=u.hp*(1+0.12*lv(c,'hp'));
    s.armor=u.armor+1.5*lv(c,'arm');
    s.dmg=u.dmg*(1+0.10*lv(c,'dmg'));
    s.cdT=1/(u.aps*(1+0.08*lv(c,'aps')));
    s.speed=u.speed*(1+0.05*lv(c,'spd'));
    if(ab.firearrows && (u.id==='archer'||u.id==='xbow')) s.dmg*=1.3;
    s.charge=(u.charge||0)*(ab.thunder?1.5:1);
    s.aoe=(u.aoe||0)*(ab.shells?1.4:1);
    s.aura=u.aura?u.aura*(ab.hymn?1.5:1):0;
    s.heal=u.heal?u.heal*(ab.surgery?2:1):0;
    s.sense=u.sense||(u.isR?u.range:9);
    s.pen=u.pen||0; s.minR=u.minR||0;
    return s;
  });
}
const lvZero=()=>0;

/* ---------- Maps ---------- */
const MAPS=[
 {id:'grassland',name:'Open Grassland',blurb:'Rolling fields, a road and a few copses.'},
 {id:'hills',name:'Hills & Valleys',blurb:'High ground adds damage and range.'},
 {id:'forest',name:'Forest',blurb:'Trees slow troops, hide them from archers and stall cavalry.'},
 {id:'river',name:'River Crossing',blurb:'Deep water is impassable. Three fords funnel the fight.'},
 {id:'pass',name:'Mountain Pass',blurb:'A narrow gap between cliffs. Ideal for a defensive stand.'},
 {id:'desert',name:'Desert',blurb:'Dunes, rock outcrops and choking dust.'},
 {id:'fortress',name:'Fortified Line',blurb:'Walls with three gates. Defenders get cover from missiles.'},
 {id:'blank',name:'Blank Field',blurb:'A flat empty field for the map editor.'},
];
const BATTLE_NAMES={grassland:'Wheatmere Plain',hills:'Crowsback Heights',forest:'Thornwald',river:'Fords of Avel',pass:'Iron Gate Pass',desert:'Saltglass Waste',fortress:'Bastion of Kael',blank:'Proving Ground'};

function makeNoise(seed){
  const R=mulberry32(seed), P=new Uint8Array(512), p=[...Array(256).keys()];
  for(let i=255;i>0;i--){const j=(R()*(i+1))|0; [p[i],p[j]]=[p[j],p[i]];}
  for(let i=0;i<512;i++) P[i]=p[i&255];
  const V=new Float32Array(256); for(let i=0;i<256;i++) V[i]=R();
  const val=(x,z)=>V[P[P[x&255]+(z&255)]];
  function n2(x,z){ const xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi; const u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf);
    const a=val(xi,zi), b=val(xi+1,zi), c=val(xi,zi+1), d=val(xi+1,zi+1); return lerp(lerp(a,b,u),lerp(c,d,u),v); }
  function fbm(x,z,o=4){ let s=0,a=0.5,f=1,t=0; for(let i=0;i<o;i++){s+=n2(x*f,z*f)*a; t+=a; a*=0.5; f*=2.03;} return s/t; }
  return {n2,fbm};
}

function newTerrain(){ return {h:new Float32Array((TW+1)*(TH+1)), k:new Uint8Array(TW*TH), own:new Int8Array(TW*TH).fill(-1), bld:new Uint8Array(TW*TH), theme:'grass', id:'blank', ver:0}; }

const FORT_GATES=[-40,0,40], FORT_X=45;   // design units
const FORT_WX=FORT_X*MS, FORT_BACK=FORT_X*MS+5-34;   // real wall x, and how far a defending army sits behind its front line
function genMap(id, seed, opt={}){
  const T=newTerrain(); T.id=id; T.theme=(id==='desert')?'desert':'grass';
  const N=makeNoise(seed), R=mulberry32(seed^0x9e37);
  const VW=TW+1;
  // design coordinates of vertices and cell centres
  const vx=i=>(X0+i*TC)/MS, vz=j=>(Z0+j*TC)/MS;
  const cx=i=>(X0+(i+.5)*TC)/MS, cz=j=>(Z0+(j+.5)*TC)/MS;
  const bld=(x,z,size)=>placeBuilding(T,x*MS,z*MS,size);
  const setH=(f)=>{ for(let j=0;j<=TH;j++) for(let i=0;i<=TW;i++){ T.h[j*VW+i]=f(vx(i),vz(j),T.h[j*VW+i]); } };
  const setK=(f)=>{ for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){ const r=f(cx(i),cz(j),T.k[j*TW+i]); if(r!=null) T.k[j*TW+i]=r; } };
  const bump=(x,z,bx,bz,r,h)=>{const d2=((x-bx)**2+(z-bz)**2)/(r*r); return h*Math.exp(-d2*2.2);};
  if(id!=='blank') setH((x,z)=>(N.fbm(x*0.03,z*0.03)-0.5)*1.6);
  if(id==='grassland'){
    setH((x,z,h)=>h+(N.fbm(x*0.012+7,z*0.012)-0.5)*3);
    setK((x,z)=> N.fbm(x*0.04+30,z*0.04-11)>0.66 && Math.abs(x)<120 ? T_FOREST : null);
    setK((x,z,k)=> Math.abs(z-(Math.sin(x*0.025)*14+10))<1.6 ? T_ROAD : null);
    bld(6, 14+(R()*8|0), 4); bld(-10, 24+(R()*6|0), 4);
  } else if(id==='hills'){
    const hills=[[-80,-30,38,9],[-70,40,30,6],[80,30,36,9],[75,-45,28,6],[0,-60,40,7],[0,60,34,5],[-5,0,22,3]];
    hills.forEach(hh=>{hh[0]+= (R()-.5)*20; hh[1]+=(R()-.5)*20;});
    setH((x,z,h)=>{ let s=h; for(const b of hills) s+=bump(x,z,b[0],b[1],b[2],b[3]); return s; });
    setK((x,z)=> N.fbm(x*0.05+3,z*0.05+9)>0.7 ? T_FOREST : null);
  } else if(id==='forest'){
    setH((x,z,h)=>h+(N.fbm(x*0.015,z*0.015+4)-0.5)*3);
    setK((x,z)=>{ const f=N.fbm(x*0.035+5,z*0.035-5); const clear = Math.abs(z)<12 && Math.abs(x)<130 ? 0.18:0; return f-clear>0.47 ? T_FOREST : null; });
  } else if(id==='river'){
    const rx=z=>Math.sin(z*0.035+1)*10+Math.sin(z*0.011)*6;
    const fords=[-56,-4,48].map(f=>f+(R()-.5)*10);
    setH((x,z,h)=>{ const d=Math.abs(x-rx(z)); const bank=Math.max(0,1-d/14); return h*(1-bank)+ (d<6? -1.7 : -1.7*bank*bank*0.6); });
    setK((x,z)=>{ const d=Math.abs(x-rx(z)); if(d<5){ for(const f of fords) if(Math.abs(z-f)<6) return T_FORD; return T_WATER; } return null; });
    // raise ford beds
    for(let j=0;j<=TH;j++) for(let i=0;i<=TW;i++){ const x=vx(i),z=vz(j); const d=Math.abs(x-rx(z)); if(d<7) for(const f of fords) if(Math.abs(z-f)<7){ T.h[j*VW+i]=Math.max(T.h[j*VW+i],-0.75); } }
    setK((x,z,k)=> k===T_GRASS && N.fbm(x*0.06,z*0.06+50)>0.68 ? T_FOREST : null);
  } else if(id==='pass'){
    const half=x=>15+Math.abs(x)*0.33+ (N.n2(x*0.05,3)-.5)*6;
    setH((x,z,h)=>{ const over=Math.abs(z)-half(x); return over>0 ? h+Math.min(16, 4+over*0.7)+N.fbm(x*0.08,z*0.08)*5 : h+Math.max(0, (over+8))*0.25; });
    setK((x,z)=> Math.abs(z)>half(x) ? T_ROCK : null);
    setK((x,z,k)=> k===T_GRASS && N.fbm(x*0.07+9,z*0.07)>0.72 ? T_FOREST : null);
  } else if(id==='desert'){
    setH((x,z,h)=>{ const r=1-Math.abs(N.fbm(x*0.02+2,z*0.035-3)*2-1); return h+r*r*4.5; });
    setK(()=>T_SAND);
    const rocks=[];
    for(let n=0;n<7;n++) rocks.push([(R()-.5)*260,(R()-.5)*160,4+R()*7]);
    setK((x,z)=>{ for(const r of rocks){ if(Math.hypot(x-r[0],z-r[1])<r[2]) return T_ROCK; } return null; });
    setH((x,z,h)=>{ let s=h; for(const r of rocks){ const d=Math.hypot(x-r[0],z-r[1]); if(d<r[2]+2) s+=Math.max(0,(r[2]+2-d))*1.6; } return s; });
    setK((x,z,k)=> k===T_SAND && N.fbm(x*0.08+20,z*0.08)>0.76 ? T_FOREST : null);
  } else if(id==='fortress'){
    const side=opt.fortSide===0?-1:1; const wx=FORT_X*side;
    setH((x,z,h)=>h*0.6);
    const gates=FORT_GATES;
    setK((x,z)=>{
      if(Math.abs(x-wx)<1.01 && Math.abs(z)<78){ for(const g of gates) if(Math.abs(z-g)<3.2) return T_ROAD; return T_WALL; }
      if(Math.abs(z)>=78 && Math.abs(z)<84 && Math.abs(x-wx)<1.01) return T_WALL;
      return null; });
    setK((x,z,k)=> (Math.abs(z)>84) ? T_ROCK : null);
    setH((x,z,h)=> Math.abs(z)>84 ? h+6+(Math.abs(z)-84)*1.2 : h);
    // towers either side of gates
    for(const g of gates) for(const dz of [-5,5]) for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){ const i=Math.floor((wx*MS+a*TC-X0)/TC), j=Math.floor(((g+dz)*MS+b*TC*0.5-Z0)/TC); if(i>=0&&i<TW&&j>=0&&j<TH) T.k[j*TW+i]=T_WALL; }
    // roads leading to gates, buildings behind
    setK((x,z,k)=>{ if(k!==T_GRASS) return null; for(const g of gates) if(Math.abs(z-g)<1.8 && (x-wx)*side>0 && (x-wx)*side<40) return T_ROAD; return null; });
    for(let n=0;n<10;n++){ const bx=wx+side*(14+R()*30), bz=(R()-.5)*140; bld(bx,bz,4); }
    setK((x,z,k)=> k===T_GRASS && (x*side)<20 && N.fbm(x*0.06,z*0.06+70)>0.7 ? T_FOREST : null);
  }
  // fade heights to 0 at the edges (except water beds)
  for(let j=0;j<=TH;j++) for(let i=0;i<=TW;i++){
    const x=X0+i*TC, z=Z0+j*TC; const e=Math.min(x-X0, X1-x, z-Z0, Z1-z); const m=clamp(e/10,0,1);
    const k=T.h[j*VW+i]; if(k>0 || id!=='river') T.h[j*VW+i]=k*m;
  }
  // rock cells next to edges stay rock; make sure deployment edges are passable in pass map
  T.ver++;
  return T;
}
function placeBuilding(T,x,z,size){
  const i0=Math.floor((x-X0)/TC), j0=Math.floor((z-Z0)/TC);
  if(i0<1||j0<1||i0+size>=TW-1||j0+size>=TH-1) return;
  for(let j=j0;j<j0+size;j++) for(let i=i0;i<i0+size;i++){ const c=j*TW+i; if(T.k[c]!==T_GRASS && T.k[c]!==T_SAND && T.k[c]!==T_ROAD) return; }
  for(let j=j0;j<j0+size;j++) for(let i=i0;i<i0+size;i++){ T.k[j*TW+i]=T_WALL; T.bld[j*TW+i]=255; }
  T.bld[j0*TW+i0]=size;
}

/* ---------- Formations (local slots: x right, z forward) ---------- */
function fmRect(cols,rows,sp,count){
  const out=[]; let left=count;
  for(let r=0;r<rows&&left>0;r++){ const n=Math.min(cols,left), off=(cols-n)*sp/2;
    for(let c=0;c<n;c++) out.push(-(cols-1)*sp/2+off+c*sp, (rows-1)*sp/2-r*sp, 0);
    left-=n; }
  return out;
}
function localToWorld(g,lx,lz){ const ca=Math.cos(g.a), sa=Math.sin(g.a); return [g.cx+sa*lx+ca*lz, g.cz-ca*lx+sa*lz]; }
function worldToLocal(g,wx,wz){ const ca=Math.cos(g.a), sa=Math.sin(g.a), dx=wx-g.cx, dz=wz-g.cz; return [sa*dx-ca*dz, ca*dx+sa*dz]; }

/* ---------- Army generation ---------- */
const STYLES={
  balanced:{name:'Balanced',inf:.55,rng:.25,cav:.12,sie:.04,sup:.04},
  horde:{name:'Infantry horde',inf:.82,rng:.1,cav:.06,sie:.01,sup:.01},
  ranged:{name:'Ranged heavy',inf:.36,rng:.48,cav:.06,sie:.06,sup:.04},
  cavalry:{name:'Cavalry storm',inf:.32,rng:.15,cav:.47,sie:.02,sup:.04},
  siege:{name:'Siege line',inf:.45,rng:.25,cav:.08,sie:.17,sup:.05},
};
function armyCounts(total, pool, style, R){
  const fr=STYLES[style]||STYLES.balanced;
  const by={inf:[],rng:[],cav:[],sie:[],sup:[]};
  pool.forEach(id=>{ const u=UNITS[UID[id]]; if(u) by[u.cls].push(UID[id]); });
  const counts=new Array(NT).fill(0);
  // support first (by ratio)
  if(by.sup.length){
    if(by.sup.includes(UID.cmdr)) counts[UID.cmdr]=Math.max(1,Math.round(total/180));
    if(by.sup.includes(UID.medic)) counts[UID.medic]=Math.round(total/70);
    if(by.sup.includes(UID.eng)) counts[UID.eng]=Math.max(1,Math.round(total/90));
  }
  let used=counts.reduce((a,b)=>a+b,0);
  let sum=0; for(const c of ['inf','rng','cav','sie']) if(by[c].length) sum+=fr[c];
  const rest=Math.max(0,total-used);
  for(const c of ['inf','rng','cav','sie']){
    if(!by[c].length) continue;
    let n=rest*fr[c]/sum;
    if(c==='sie') n=Math.max(1,Math.round(n*0.35)); else n=Math.round(n);
    const ts=by[c], w=ts.map(()=>0.5+R()); const ws=w.reduce((a,b)=>a+b,0);
    ts.forEach((t,k)=>{ counts[t]+=Math.round(n*w[k]/ws); });
  }
  return counts;
}

// Build deploy groups from counts. Team 0 faces +x, team 1 faces -x.
function layoutArmy(team, counts, T, opt={}){
  const dir=team===0?1:-1;
  const front=(team===0?-34:34) - dir*(opt.back||0);
  const groups=[];
  const zoneX=ZONES[team];
  // find widest passable z-run near the front
  const probeX=front-dir*6;
  let bestA=-80,bestB=80, runA=null, bestLen=0;
  for(let z=Z0+4; z<=Z1-4; z+=2){
    const ok=passAtT(T,probeX,z) && passAtT(T,probeX-dir*20,z);
    if(ok){ if(runA===null) runA=z; const len=z-runA; if(len>bestLen){bestLen=len;bestA=runA;bestB=z;} } else runA=null;
  }
  const zc=(bestA+bestB)/2, Wmax=Math.max(20,(bestB-bestA)*0.86);
  const face=team===0?0:Math.PI;
  const mk=(type,cx,cz,slots,order)=>{ groups.push({team,type,order:order||defaultOrder(type),cx,cz,a:face,slots}); };
  // ---- infantry line ----
  const centreRank={heavy:0,shield:1,elite:2,sword:3,bers:4,spear:5};
  const infTypes=UNITS.map((u,i)=>i).filter(i=>UNITS[i].cls==='inf' && counts[i]>0).sort((a,b)=>centreRank[UNITS[a].id]-centreRank[UNITS[b].id]);
  let infWidthNeed=0; infTypes.forEach(t=>infWidthNeed+=counts[t]*UNITS[t].sp*UNITS[t].sp);
  // ranks so the line fits Wmax
  let infRanks=Math.max(3, Math.ceil(infWidthNeed/(Wmax*1.15*1.15)));
  infRanks=Math.min(infRanks,140);
  const blocks=[];
  for(const t of infTypes){
    const sp=UNITS[t].sp; let n=counts[t];
    const ranks=Math.max(2,Math.round(infRanks*1.15/sp));
    let cols=Math.ceil(n/ranks);
    const maxCols=Math.max(6,Math.floor(48/sp));
    while(n>0){ const c=Math.min(cols,maxCols); const take=Math.min(n,c*ranks); blocks.push({t,n:take,cols:Math.ceil(take/ranks),ranks,sp}); n-=take; }
  }
  // arrange blocks: centre outward alternating
  const placed=[]; let left=0,right=0, gap=1.5;
  blocks.forEach((b,k)=>{ const w=b.cols*b.sp; if(k===0){ placed.push({b,z:0}); left=-w/2; right=w/2; } else if(k%2){ placed.push({b,z:right+gap+w/2}); right+=gap+w; } else { placed.push({b,z:left-gap-w/2}); left-=gap+w; } });
  const infHalf=Math.max(right,-left);
  const shiftZ=zc-(left+right)/2;
  let infDepth=0;
  placed.forEach(p=>{ const b=p.b, depth=b.ranks*b.sp; infDepth=Math.max(infDepth,depth);
    mk(b.t, front-dir*depth/2, p.z+shiftZ, fmRect(b.cols,b.ranks,b.sp,b.n)); });
  if(!placed.length) infDepth=0;
  // ---- engineers ahead of the line ----
  if(counts[UID.eng]){ const n=counts[UID.eng], sp=Math.max(2,Math.min(8,(infHalf*2||20)/n)); mk(UID.eng, front+dir*2, zc, fmRect(n,1,sp,n),'hold'); }
  // ---- commanders and medics just behind ----
  let back=front-dir*(infDepth+1.8);
  if(counts[UID.cmdr]){ const n=counts[UID.cmdr]; const sp=Math.max(3,Math.min(14,(infHalf*2||20)/n)); mk(UID.cmdr, back, zc, fmRect(n,1,sp,n)); back-=dir*2.6; }
  if(counts[UID.medic]){ const n=counts[UID.medic]; const cols=Math.min(n,Math.max(4,Math.floor((infHalf*2||20)/2))); const rows=Math.ceil(n/cols); const sp=Math.max(1.6,Math.min(6,(infHalf*2||20)/cols)); mk(UID.medic, back-dir*rows*0.8, zc, fmRect(cols,rows,sp,n)); back-=dir*(rows*1.6+1); }
  // ---- ranged line ----
  const rngTypes=UNITS.map((u,i)=>i).filter(i=>UNITS[i].cls==='rng' && counts[i]>0);
  let rngNeed=0; rngTypes.forEach(t=>rngNeed+=counts[t]*1.21);
  const rngRanks=Math.min(90,Math.max(2,Math.ceil(rngNeed/(Wmax*1.1*1.1))));
  let rb=[]; for(const t of rngTypes){ let n=counts[t]; const sp=UNITS[t].sp; const maxCols=Math.floor(46/sp); let cols=Math.ceil(n/rngRanks); while(n>0){ const c=Math.min(cols,maxCols); const take=Math.min(n,c*rngRanks); rb.push({t,n:take,cols:Math.ceil(take/rngRanks),ranks:rngRanks,sp}); n-=take; } }
  let totalW=rb.reduce((a,b)=>a+b.cols*b.sp+2,0)-2; let zz=zc-totalW/2;
  const rngFront=back-dir*2;
  let rngDepth=0;
  rb.forEach(b=>{ const w=b.cols*b.sp, d=b.ranks*b.sp; rngDepth=Math.max(rngDepth,d); mk(b.t, rngFront-dir*d/2, zz+w/2, fmRect(b.cols,b.ranks,b.sp,b.n)); zz+=w+2; });
  // ---- siege ----
  const sieTypes=UNITS.map((u,i)=>i).filter(i=>UNITS[i].cls==='sie' && counts[i]>0);
  let sieX=rngFront-dir*(rngDepth+4);
  const minX=Math.min(zoneX[0],zoneX[1])+4, maxX=Math.max(zoneX[0],zoneX[1])-4;
  let sn=0; sieTypes.forEach(t=>sn+=counts[t]);
  if(sn){ let ranks=Math.max(1,Math.ceil(sn*4.6/(Wmax))); let sb=[]; for(const t of sieTypes){ let n=counts[t]; while(n>0){ const take=Math.min(n,8*ranks); sb.push({t,n:take,cols:Math.ceil(take/ranks),ranks}); n-=take; } }
    let tw=sb.reduce((a,b)=>a+b.cols*5+3,0)-3; let z2=zc-tw/2;
    sieX=clamp(sieX-dir*ranks*2.5,minX,maxX);
    sb.forEach(b=>{ const w=b.cols*5; mk(b.t, sieX, z2+w/2, fmRect(b.cols,b.ranks,5,b.n)); z2+=w+3; }); }
  // ---- cavalry on the flanks ----
  const cavTypes=UNITS.map((u,i)=>i).filter(i=>UNITS[i].cls==='cav' && counts[i]>0);
  let side=1; let zR=zc+infHalf+6, zL=zc-infHalf-6;
  for(const t of cavTypes){
    const sp=UNITS[t].sp; let total=counts[t];
    const halves=[Math.ceil(total/2), Math.floor(total/2)];
    for(const n of halves){ if(!n) continue;
      const ranks=Math.max(2,Math.min(12,Math.ceil(Math.sqrt(n/2.5))));
      const cols=Math.ceil(n/ranks), w=cols*sp, d=ranks*sp;
      let zcen = side>0 ? zR+w/2 : zL-w/2;
      let cx=front-dir*(d/2+1);
      if(Math.abs(zcen)+w/2>Z1-4 || !passAtT(T,cx,zcen)){ zcen=zc+(side*(infHalf*0.5)); cx=sieX-dir*(d/2+8); cx=clamp(cx,minX,maxX); }
      else { if(side>0) zR+=w+3; else zL-=w+3; }
      mk(t,cx,zcen,fmRect(cols,ranks,sp,n),'flank');
      side=-side; }
  }
  // drop slots on impassable cells or outside the zone
  for(const g of groups){ const keep=[]; for(let k=0;k<g.slots.length;k+=3){ const [wx,wz]=localToWorld(g,g.slots[k],g.slots[k+1]); if(passAtT(T,wx,wz) && wx>X0+2 && wx<X1-2 && wz>Z0+2 && wz<Z1-2) keep.push(g.slots[k],g.slots[k+1],g.slots[k+2]); } g.slots=keep; }
  return groups.filter(g=>g.slots.length);
}
// Survival: plug each gate with infantry, line the wall with missile troops, keep horse and siege in reserve.
function layoutSurvival(counts,T){
  const wx=-FORT_WX, face=0, groups=[], GATES=FORT_GATES.map(g=>g*MS);
  const mk=(type,cx,cz,slots)=>groups.push({team:0,type,order:'hold',cx,cz,a:face,slots});
  const ids=c=>UNITS.map((u,i)=>i).filter(i=>UNITS[i].cls===c && counts[i]>0);
  const rank={heavy:0,shield:1,elite:2,spear:3,sword:4,bers:5};
  const inf=ids('inf').sort((a,b)=>rank[UNITS[a].id]-rank[UNITS[b].id]);
  // infantry: split each type across the three gates, stacked back from the wall. A plug goes at most PLUG
  // metres deep (a deeper column only gets in its own way); the rest of the foot waits in reserve blocks.
  const PLUG=34, depth=[0,0,0], reserve=[], toReserve=(t,n)=>{ const r=reserve.find(x=>x[0]===t); if(r) r[1]+=n; else reserve.push([t,n]); };
  for(const t of inf){ const sp=UNITS[t].sp; let n=counts[t];
    for(let gi=0;gi<3;gi++){ const take=Math.round(n/(3-gi)); n-=take; if(!take) continue;
      const cols=Math.max(4,Math.min(9,Math.ceil(Math.sqrt(take*0.8)))), room=Math.max(0,Math.floor((PLUG-depth[gi])/sp))*cols, put=Math.min(take,room);
      if(take>put) toReserve(t,take-put); if(!put) continue;
      const ranks=Math.ceil(put/cols), d=ranks*sp;
      mk(t, wx-3.2-depth[gi]-d/2, GATES[gi], fmRect(cols,ranks,sp,put)); depth[gi]+=d+0.6; } }
  // missile troops: along the wall between and beside the gates
  const segs=[[-76,-47],[-33,-7],[7,33],[47,76]].map(s=>[s[0]*MS,s[1]*MS]), segLen=segs.reduce((a,s)=>a+s[1]-s[0],0);
  const rng=ids('rng'); let rTotal=rng.reduce((a,t)=>a+counts[t],0);
  if(rTotal){ const ranks=Math.max(2,Math.ceil(rTotal*1.15/(segLen/1.1)));
    let queue=[]; for(const t of rng) for(let k=0;k<counts[t];k++) queue.push(t);
    for(const sgm of segs){ const cols=Math.floor((sgm[1]-sgm[0])/1.1), cap=cols*ranks; let take=Math.min(queue.length,Math.ceil(rTotal*(sgm[1]-sgm[0])/segLen)); take=Math.min(take,cap);
      const part=queue.splice(0,take); const byT={}; part.forEach(t=>byT[t]=(byT[t]||0)+1);
      let z0=sgm[0]; for(const t in byT){ const n=byT[t], c=Math.min(cols,Math.ceil(n/ranks)), r=Math.ceil(n/c), w=c*1.1;
        mk(+t, wx-2.6-r*0.55, z0+w/2, fmRect(c,r,1.1,n)); z0+=w+0.4; } } }
  // support behind the gate plugs
  const sup=ids('sup'); let gz=0;
  for(const t of sup){ const n=counts[t];
    let left=n; for(let gi=0;gi<3&&left>0;gi++){ const take=Math.ceil(left/(3-gi)); left-=take; mk(t, wx-6-depth[gi]-1.5, GATES[gi]+(gz%2?6:-6), fmRect(Math.min(take,6),Math.ceil(take/6),1.6,take)); } gz++; }
  // the reserve: spare foot, then horse, then guns, in blocks of a few hundred (batteries of 24 guns) in rows
  // behind the gate plugs
  for(const t of ids('cav')) toReserve(t,counts[t]);
  for(const t of ids('sie')) toReserve(t,counts[t]);
  let rx=wx-3.2-Math.max(...depth)-10, rz=Z0+10, rowD=0;
  for(const [t,total] of reserve){ const u=UNITS[t], sg=u.cls==='sie', sp=sg?5:u.sp, cols=sg?6:16, per=cols*(sg?4:14); let n=total;
    while(n>0){ const k=Math.min(n,per); n-=k; const c=Math.min(cols,k), r=Math.ceil(k/c), w=c*sp, d=r*sp;
      if(rz+w>Z1-10){ rz=Z0+10; rx-=rowD+4; rowD=0; }
      mk(t, rx-d/2, rz+w/2, fmRect(c,r,sp,k)); rz+=w+4; rowD=Math.max(rowD,d); } }
  // anyone who would stand on the wall, in a tower or outside the field moves to the nearest open ground behind it
  const zone=[X0+8,wx-2.4]; packBlocks(groups.map(g=>({gs:[g]})),T,zone,1);
  return placeGroups(groups,T,zone,1);
}
/* ---------- formations: each one sets the shape, the front-to-back order and everyone's orders ---------- */
const ROLE={shield:'wall',heavy:'wall',elite:'shock',bers:'shock',sword:'melee',spear:'pike',archer:'missile',xbow:'missile',musket:'missile'};
const BAND_ORDER=['shield','heavy','elite','sword','bers','spear','xbow','archer','musket'];
// orders(role, band, u): band 0 is the front, u runs -1..1 across the width
const FORMATIONS=[
 {id:'ranks',name:'Ranks',shape:'bands',aspect:3.2,roles:['wall','melee','shock','pike','missile'],cav:'wings',plan:'All advance · horse flanks',
  desc:'Each kind of soldier in its own full-width rank, one behind another. Everyone marches on the enemy together.',orders:()=>'advance'},
 {id:'line',name:'Battle line',shape:'line',aspect:7,roles:['wall','shock','melee','pike','missile'],cav:'wings',plan:'All advance · horse flanks',
  desc:'One wide, shallow line of foot with missile troops behind. Hard to outflank, easy to break through.',orders:()=>'advance'},
 {id:'shieldwall',name:'Shield wall',shape:'bands',aspect:5,roles:['wall','pike','melee','shock','missile'],cav:'rear',reserve:1,siege:'hold',plan:'Everyone holds',
  desc:'Shields at the front, spears behind them, missile troops at the back. The army stands and lets the enemy come to it; horse waits in reserve.',orders:()=>'hold'},
 {id:'hammer',name:'Hammer & anvil',shape:'bands',aspect:5,roles:['pike','wall','melee','shock','missile'],cav:'wings',siege:'hold',plan:'Foot holds · horse flanks',
  desc:'The foot holds the enemy in place like an anvil while the horse rides round to strike them from behind.',orders:()=>'hold'},
 {id:'wedge',name:'Wedge',shape:'bands',aspect:2.2,wedge:1,roles:['shock','wall','melee','pike','missile'],cav:'wings',plan:'Point charges · rest advance',
  desc:'A narrow point of shock troops charges into the enemy line. Each rank behind is wider and follows it in.',orders:(r,k)=>k===0?'charge':'advance'},
 {id:'column',name:'Deep column',shape:'bands',aspect:0.9,width:0.55,roles:['shock','melee','wall','pike','missile'],cav:'rear',plan:'Foot charges',
  desc:'A narrow, deep column that runs straight at the enemy to break through at one spot.',orders:r=>r==='missile'?'advance':'charge'},
 {id:'blocks',name:'Chequerboard',shape:'blocks',aspect:2.4,roles:['melee','pike','wall','shock','missile'],cav:'wings',plan:'All advance',
  desc:'Square blocks with gaps between them, so blocks in the second row can step through and fill holes.',orders:()=>'advance'},
 {id:'crescent',name:'Crescent',shape:'bands',aspect:6,bend:'crescent',roles:['wall','melee','pike','shock','missile'],cav:'wings',plan:'Centre holds · wings advance',
  desc:'A wide line with the centre pulled back. The centre holds while the wings close round the enemy.',orders:(r,k,u)=>Math.abs(u)<0.4?'hold':'advance'},
 {id:'echelon',name:'Oblique',shape:'bands',aspect:4.5,bend:'echelon',roles:['shock','wall','melee','pike','missile'],cav:'wings',plan:'Lead wing advances · other holds',
  desc:'The line steps back from one wing. The lead wing attacks first while the held-back wing waits.',orders:(r,k,u)=>u<0.15?'advance':'hold'},
 {id:'square',name:'Square',shape:'ring',roles:['wall','pike','melee','shock','missile'],cav:'rear',reserve:1,siege:'hold',plan:'Everyone holds',
  desc:'A hollow square facing out on all four sides, with missile troops, commanders and medics inside. Very hard to break with cavalry.',orders:()=>'hold'},
 {id:'assault',name:'Storm the gates',shape:'bands',cols:3,roles:['shock','wall','melee','pike','missile'],cav:'rear',reserve:1,plan:'Columns advance · horse waits',
  desc:'Three assault columns, each lined up on a gate of the fortress (or spread across the field elsewhere). Siege engines shoot over the walls; horse waits until the way is open.',orders:()=>'advance'},
 {id:'screen',name:'Skirmish screen',shape:'bands',aspect:4,roles:['missile','shock','melee','wall','pike'],cav:'wings',plan:'Missiles advance · foot holds',
  desc:'Missile troops out in front to thin the enemy, with the foot waiting behind them to meet whoever gets through.',orders:r=>r==='missile'?'advance':'hold'},
];
// which troops a formation wants most when the roster is bigger than the army limit (1 = no preference)
const FORM_WANT={ranks:{},line:{},shieldwall:{wall:2,pike:1.6,missile:1.2,melee:.8,shock:.6,cav:.4},hammer:{cav:2.2,pike:1.4,wall:1.2,missile:.8,sie:.6},wedge:{shock:2,wall:1.2,melee:1.2,pike:.6,missile:.6,cav:1.2},column:{shock:2,melee:1.6,pike:.6,missile:.4,cav:.6,sie:.4},blocks:{melee:1.5,pike:1.3,cav:.8},crescent:{melee:1.2,wall:1.2,cav:1.4},echelon:{shock:1.5,cav:1.3,pike:.8,missile:.8},square:{pike:2,wall:1.6,missile:1.4,melee:.8,shock:.6,cav:.3,sie:.5},assault:{shock:1.8,wall:1.4,melee:1.2,sie:2,missile:.8,pike:.6,cav:.3},screen:{missile:2.2,shock:.8,wall:.8,pike:.8,sie:1.2}};
const FORM_BY={}; FORMATIONS.forEach(f=>FORM_BY[f.id]=f);
FORMATIONS.forEach(f=>f.want=FORM_WANT[f.id]||{});
const unitRole=t=>{ const u=UNITS[t]; return u.cls==='cav'?'cav':u.cls==='sie'?'sie':u.cls==='sup'?'sup':(ROLE[u.id]||'melee'); };
// a formation's front-to-back order of unit types: by role, then by the usual order within a role
function formationOrder(formId){ const F=FORM_BY[formId]||FORMATIONS[0];
  return BAND_ORDER.slice().sort((a,b)=>(F.roles.indexOf(ROLE[a])-F.roles.indexOf(ROLE[b]))||(BAND_ORDER.indexOf(a)-BAND_ORDER.indexOf(b))); }
function layoutFormation(team,counts,T,form,order,opt={}){
  const F=FORM_BY[form]||FORMATIONS[0];
  // a big army forms several squares rather than one huge one
  if(F.shape==='ring'&&!opt.single){ let nf=0; counts.forEach((n,i)=>{ if(UNITS[i].cls!=='cav') nf+=n; }); const nsq=clamp(Math.round(nf/SQUARE_SIZE),1,12); if(nsq>1) return layoutSquares(team,counts,T,F,order,opt,nsq); }
  const dir=team===0?1:-1, face=team===0?0:Math.PI;
  const front=opt.front!==undefined?opt.front:(team===0?-34:34)-dir*(opt.back||0);
  // centre on the widest open run of ground near the front
  const probeX=front-dir*6; let bestA=-80,bestB=80,runA=null,bestLen=0;
  for(let z=Z0+4; z<=Z1-4; z+=2){ const ok=passAtT(T,probeX,z)&&passAtT(T,probeX-dir*20,z); if(ok){ if(runA===null) runA=z; if(z-runA>bestLen){ bestLen=z-runA; bestA=runA; bestB=z; } } else runA=null; }
  const zc=opt.zc!==undefined?opt.zc:(bestA+bestB)/2, Wmax=opt.Wmax||Math.max(20,(bestB-bestA)*0.9);
  // regiments of one line (a band split into blocks), one square, one battery or one wing share a block number
  // `bk`, so a tap selects and moves them together
  let bkCur=0, bkLock=0; const newBk=()=>{ if(!bkLock) bkCur++; return bkCur; };
  const groups=[]; const mk=(t,cx,cz,slots,a)=>{ if(!slots.length) return null; const g={bk:bkCur,team,type:t,order:defaultOrder(t),cx,cz,a:a===undefined?face:a,slots,k:0}; groups.push(g); return g; };
  const has=t=>t!==undefined&&counts[t]>0;
  // combat bands in the requested order, then any present type the order left out
  let bands=(order&&order.length?order:formationOrder(F.id)).map(id=>UID[id]).filter(t=>has(t)&&(UNITS[t].cls==='inf'||UNITS[t].cls==='rng'));
  UNITS.forEach((u,t)=>{ if(has(t)&&(u.cls==='inf'||u.cls==='rng')&&!bands.includes(t)) bands.push(t); });
  const sup=['cmdr','medic'].map(id=>UID[id]).filter(has), eng=UID.eng;
  const cav=opt.noCav?[]:UNITS.map((u,t)=>t).filter(t=>has(t)&&UNITS[t].cls==='cav'), sie=UNITS.map((u,t)=>t).filter(t=>has(t)&&UNITS[t].cls==='sie');
  let area=0; for(const t of bands) area+=counts[t]*UNITS[t].sp**2;
  const W=clamp(Math.sqrt(Math.max(area,1)*(F.aspect||3.2)),18,Wmax);
  let depth=opt.depth0||0, span=opt.span||W, supDone=bands.length>0;
  // one band of type t, `width` wide, centred on z, starting dd metres behind the front; split into blocks about 22 m wide
  const band=(t,n,width,z,dd,k)=>{ newBk(); const sp=UNITS[t].sp, cols=Math.max(1,Math.min(n,Math.floor(width/sp))), rows=Math.ceil(n/cols);
    const parts=Math.max(1,Math.min(8,Math.round(cols*sp/22))); let left=n, c0=0;
    for(let p=0;p<parts;p++){ const c1=p===parts-1?cols:Math.round(cols*(p+1)/parts), pc=c1-c0; if(pc<=0) continue; const pn=p===parts-1?left:Math.min(left,Math.round(n*pc/cols)); left-=pn;
      const g=mk(t,front-dir*(dd+rows*sp/2),z-cols*sp/2+(c0+pc/2)*sp,fmRect(pc,Math.ceil(pn/pc),sp,pn)); if(g) g.k=k; c0=c1; }
    return rows*sp; };
  // commanders and medics spread in small parties across the whole width, just behind the front band
  const supGap=(width,z)=>{ if(supDone) return; supDone=true; if(!sup.length) return; let gd=0.9; newBk();
    for(const t of sup){ const n=counts[t], sp=UNITS[t].sp, parts=clamp(Math.round(width/(t===UID.cmdr?16:10)),1,n), cw=width/parts; let left=n, maxD=0;
      for(let i=0;i<parts;i++){ const m=Math.round(left/(parts-i)); left-=m; if(!m) continue; const cols=Math.max(1,Math.min(m,Math.max(3,Math.floor(cw*0.7/sp)))), rows=Math.ceil(m/cols);
        const g=mk(t,front-dir*(depth+gd+rows*sp/2),z-width/2+(i+0.5)*cw+(t===UID.cmdr?0:cw*0.25),fmRect(cols,rows,sp,m)); if(g) g.k=-1; maxD=Math.max(maxD,rows*sp); }
      gd+=maxD+0.6; }
    depth+=gd+0.3; };
  if(has(eng)){ newBk(); const n=counts[eng], sp=Math.max(2,Math.min(8,W/n)); mk(eng, front+dir*2, zc, fmRect(n,1,sp,n)); }
  // siege engines in compact batteries (up to 12 guns, 3.4 m apart) just behind the front band, close enough to reach the enemy
  let siegeDone=!sie.length;
  const siegeRow=(width,z)=>{ if(siegeDone) return; siegeDone=true;
    const guns=[]; for(const t of sie) for(let k=0;k<counts[t];k++) guns.push(t);
    const nb=clamp(Math.ceil(guns.length/12),1,Math.max(1,Math.floor(width/24))), per=Math.ceil(guns.length/nb), COLS=6, GX=3.4, GZ=4;
    let maxRows=0; depth+=2.5;
    for(let b=0;b<nb;b++){ const bat=guns.slice(b*per,(b+1)*per); if(!bat.length) continue; newBk(); const cols=Math.min(COLS,bat.length), rows=Math.ceil(bat.length/cols); maxRows=Math.max(maxRows,rows);
      const bz=z-width/2+(b+0.5)*width/nb, bx=front-dir*(depth+(rows-1)*GZ/2), by={};
      bat.forEach((t,g)=>{ const c=g%cols, r=(g/cols)|0; (by[t]||(by[t]=[])).push((c-(cols-1)/2)*GX,((rows-1)/2-r)*GZ,0); });
      for(const t in by){ const g=mk(+t,bx,bz,by[t]); if(g) g.k=50; } }
    depth+=maxRows*GZ+1; };
  if(F.shape==='line'){
    // melee side by side in one wide line, missile troops side by side behind it, everyone the same depth
    const tiers=[bands.filter(t=>UNITS[t].cls!=='rng'), bands.filter(t=>UNITS[t].cls==='rng')];
    tiers.forEach((tier,k)=>{ if(!tier.length) return; newBk(); bkLock=1; let ta=0; for(const t of tier) ta+=counts[t]*UNITS[t].sp**2; let z=zc-W/2, maxD=0;
      for(const t of tier){ const w=W*counts[t]*UNITS[t].sp**2/ta; maxD=Math.max(maxD,band(t,counts[t],Math.max(w-1,UNITS[t].sp),z+w/2,depth,k)); z+=w; }
      bkLock=0; depth+=maxD+1.5; supGap(W,zc); siegeRow(W,zc); });
  } else if(F.shape==='blocks'){
    // square blocks in a chequerboard, alternate rows offset by half a block
    const bw=Math.max(8,W/4), cells=[]; for(const t of bands){ let n=counts[t]; const per=Math.max(1,Math.round((bw/UNITS[t].sp)**2)); while(n>0){ const k=Math.min(n,per); cells.push([t,k]); n-=k; } }
    const perRow=Math.max(2,Math.floor(W/(bw*1.35))); let row=0;
    for(let i=0;i<cells.length;i+=perRow){ const rowCells=cells.slice(i,i+perRow), rw=rowCells.length*bw*1.35; let z=zc-rw/2+bw*0.675+(row%2?bw*0.32:0), maxD=0;
      for(const [t,k] of rowCells){ maxD=Math.max(maxD,band(t,k,bw,z,depth,row)); z+=bw*1.35; }
      depth+=maxD+2; row++; if(row===1){ supGap(W,zc); siegeRow(W,zc); } }
  } else if(F.shape==='ring'){
    // hollow square: melee ranks face out on all four sides, missile troops and officers inside
    const mel=bands.filter(t=>UNITS[t].cls==='inf'), rng=bands.filter(t=>UNITS[t].cls==='rng');
    newBk(); bkLock=1;   // the whole square is one block
    let ain=0; for(const t of rng) ain+=counts[t]*UNITS[t].sp**2*1.2; for(const t of sup) ain+=counts[t]*UNITS[t].sp**2*2; for(const t of sie) ain+=counts[t]*3.4*4*1.3;
    let am=0; for(const t of mel) am+=counts[t]*UNITS[t].sp**2;
    const sIn=Math.sqrt(ain)+4, S=sIn+(Math.sqrt(sIn*sIn+am)-sIn), cxS=front-dir*S/2; let So=S;
    span=S;
    mel.forEach((t,k)=>{ const sp=UNITS[t].sp, n=counts[t], Si=Math.sqrt(Math.max(0,So*So-n*sp*sp)), rows=Math.max(1,Math.round((So-Si)/2/sp)), d=rows*sp, off=So/2-d/2, inner=Math.max(sp,So-2*d);
      const sides=[[So,dir*off,0,face],[So,-dir*off,0,face+Math.PI],[inner,0,off,Math.PI/2],[inner,0,-off,-Math.PI/2]], per=2*So+2*inner; let left=n;
      sides.forEach(([len,fx,fz,a],i)=>{ const m=i===3?left:Math.min(left,Math.round(n*len/per)); left-=m; if(m<=0) return; const cols=Math.max(1,Math.floor(len/sp)), r=Math.ceil(m/cols);
        const g=mk(t,cxS+fx,zc+fz,fmRect(Math.min(cols,m),r,sp,m),a); if(g) g.k=k; });
      So=Math.max(sp*2,So-2*d-0.6); });
    depth=(S-So)/2+0.8;
    rng.forEach(t=>{ depth+=band(t,counts[t],Math.max(4,So-2),zc,depth,1)+0.6; });
    siegeRow(Math.max(8,So-4),zc);
    supGap(Math.max(6,So-4),zc);
    depth=Math.max(depth,S)+1.5; bkLock=0;
  } else if(F.cols){
    // separate columns, each aimed at a gate when the map has them
    const nc=opt.gates&&opt.gates.length?opt.gates.length:F.cols, cw=clamp(Math.sqrt(area/nc*0.45),8,20);
    let zs=opt.gates&&opt.gates.length?opt.gates.slice():[-1,0,1].map(i=>zc+i*Math.max(cw*1.6,W/3));
    zs=zs.map(z=>clamp(z,Z0+cw/2+4,Z1-cw/2-4)); span=Math.max(...zs)-Math.min(...zs)+cw;
    bands.forEach((t,k)=>{ let left=counts[t], maxD=0; zs.forEach((z,i)=>{ const m=Math.round(left/(zs.length-i)); left-=m; if(m) maxD=Math.max(maxD,band(t,m,cw,z,depth,k)); }); depth+=maxD+1.2; if(k===0){ supGap(span,(Math.max(...zs)+Math.min(...zs))/2); siegeRow(span,(Math.max(...zs)+Math.min(...zs))/2); } });
  } else {
    // bands one behind another: full width, or a narrow point that widens (wedge), or a narrow column
    const widthOf=k=>F.wedge?W*Math.min(1,0.35+0.3*k):W*(F.width||1);
    bands.forEach((t,k)=>{ depth+=band(t,counts[t],widthOf(k),zc,depth,k)+1.2; if(k===0){ supGap(widthOf(0),zc); siegeRow(Math.max(widthOf(0),Math.min(W,30)),zc); } });
  }
  // commanders and medics stand inside the regiments, scattered among the soldiers
  if(bands.length && !embedSupport(groups,counts,sup,dir)){ supDone=false; supGap(W,zc); }
  supGap(W,zc);
  // cavalry on both wings level with the front, or as a reserve band behind the army
  const cavPos=opt.cav||F.cav||'wings';
  if(cavPos==='rear'){ depth+=3; for(const t of cav){ const g0=groups.length; depth+=band(t,counts[t],span,zc,depth,99)+1.5; for(let i=g0;i<groups.length;i++) groups[i].rear=1; } }
  else { const wingZ=[zc-span/2-3,zc+span/2+3];
    cav.forEach(t=>{ const n=counts[t], halves=[Math.ceil(n/2),Math.floor(n/2)], sp=UNITS[t].sp;
      halves.forEach((h,side)=>{ if(!h) return; newBk(); const cols=Math.max(2,Math.min(10,Math.ceil(Math.sqrt(h/2)))), rows=Math.ceil(h/cols), w=cols*sp, s=side?1:-1;
        mk(t, front-dir*(rows*sp/2), wingZ[side]+s*w/2, fmRect(cols,rows,sp,h)); wingZ[side]+=s*(w+2); }); }); }
  // siege not yet placed (the square, or an army with no foot) stands in batteries behind everything
  siegeRow(Math.max(span,30),zc);
  // bent lines: everything is pulled back, never pushed forward out of the deployment zone
  if(F.bend) for(const g of groups){ const u=clamp((g.cz-zc)/(span/2),-1,1); g.cx-=dir*(F.bend==='crescent'?span*0.16*(1-u*u):span*0.2*(u+1)/2); }
  // orders that come with the formation
  for(const g of groups){ const c=UNITS[g.type].cls, u=clamp((g.cz-zc)/(span/2),-1,1);
    g.order= g.type===eng?'hold' : c==='sup'?'advance' : c==='cav'?(g.rear&&F.reserve?'hold':'flank') : c==='sie'?(F.siege||'advance') : F.orders(ROLE[UNITS[g.type].id]||'melee',g.k|0,u); }
  return opt.noPlace?groups:placeGroups(groups,T,opt.zone||ZONES[team],dir);
}
// Several hollow squares for a big army, one per SQUARE_SIZE foot (up to 12), every one with its share of each kind
// of soldier. They stand in rows with wide lanes between them, alternate rows shifted half a square so
// each square covers its neighbours' sides with fire (the chequer used against cavalry); horse waits behind.
const SQUARE_SIZE=300;   // up to 12 squares; from about 3,600 foot they just get bigger
function layoutSquares(team,counts,T,F,order,opt,nsq){
  const dir=team===0?1:-1, front=opt.front!==undefined?opt.front:(team===0?-34:34)-dir*(opt.back||0);
  const probeX=front-dir*6; let bestA=-80,bestB=80,runA=null,bestLen=0;
  for(let z=Z0+4; z<=Z1-4; z+=2){ const ok=passAtT(T,probeX,z)&&passAtT(T,probeX-dir*20,z); if(ok){ if(runA===null) runA=z; if(z-runA>bestLen){ bestLen=z-runA; bestA=runA; bestB=z; } } else runA=null; }
  const zc=(bestA+bestB)/2, Wmax=Math.max(40,(bestB-bestA)*0.95), gap=10;
  const foot=counts.map((n,i)=>UNITS[i].cls==='cav'?0:n), horse=counts.map((n,i)=>UNITS[i].cls==='cav'?n:0);
  const parts=Array.from({length:nsq},()=>new Array(NT).fill(0));
  foot.forEach((c,i)=>{ for(let d=0;d<nsq;d++) parts[d][i]=Math.floor(c/nsq); for(let r=0;r<c%nsq;r++) parts[(i+r)%nsq][i]++; });
  const sq=parts.map((c,k)=>{ const gs=layoutFormation(team,c,T,F.id,order,Object.assign({},opt,{single:1,noPlace:1,noCav:1,zc:0})); for(const g of gs) g.bk+=(k+1)*1000; return {gs,e:groupsExtent(gs)}; }).filter(q=>q.gs.length);
  const w=Math.max(...sq.map(q=>q.e.z1-q.e.z0)), d=Math.max(...sq.map(q=>q.e.x1-q.e.x0));
  const perRow=Math.max(1,Math.min(sq.length,Math.floor((Wmax+gap)/(w+gap))));
  let back=0, span=0;
  sq.forEach((q,k)=>{ const r=Math.floor(k/perRow), c=k%perRow, inRow=Math.min(perRow,sq.length-r*perRow);
    const rowW=inRow*w+(inRow-1)*gap, rows=Math.ceil(sq.length/perRow), stag=rows>1?(r%2?1:-1)*(w+gap)/4:0;
    const z=zc-rowW/2+c*(w+gap)+w/2+stag;
    const x=front-dir*(r*(d+gap)+d/2);
    shiftGroups(q.gs,x-(q.e.x0+q.e.x1)/2,z-(q.e.z0+q.e.z1)/2);
    back=Math.max(back,r*(d+gap)+d); span=Math.max(span,rowW); });
  let all=sq.flatMap(q=>q.gs);
  if(horse.some(n=>n>0)){ const hg=layoutFormation(team,horse,T,'ranks',null,Object.assign({},opt,{noPlace:1,zc,span,depth0:back,cav:opt.cav||F.cav}));
    if(F.reserve) for(const g of hg) if(g.rear) g.order='hold'; for(const g of hg) g.bk+=99000; all=all.concat(hg); }
  // each square as a whole to the nearest open ground that fits it, before anything is split up
  packBlocks([...sq,{gs:all.filter(g=>g.bk>=99000)}].filter(q=>q.gs.length),T,opt.zone||ZONES[team],dir);
  return placeGroups(all,T,opt.zone||ZONES[team],dir);
}
// Move each block, in turn, to the nearest spot to where it was planned that is open ground inside the
// zone and clear of the blocks already placed (with a small gap), stepping back before stepping forward.
// Uses a 1 m grid of blocked cells and a summed-area table, so each try is a constant-time rectangle check.
let PACK_OFF=null, PACK_MISS=0;
function packOffsets(){ if(PACK_OFF) return PACK_OFF; const L=[]; for(let a=-200;a<=200;a+=2) for(let b=-300;b<=300;b+=2) L.push([a,b,(a<0?-a*0.6:a*2.5)+Math.abs(b)*0.5]);
  L.sort((p,q)=>p[2]-q[2]); PACK_OFF=new Int16Array(L.length*2); L.forEach((p,i)=>{ PACK_OFF[i*2]=p[0]; PACK_OFF[i*2+1]=p[1]; }); return PACK_OFF; }
function packBlocks(built,T,zone,dir){
  const gx0=Math.floor(zone[0]), gz0=Math.floor(Z0+2), GW=Math.ceil(zone[1])-gx0+1, GH=Math.ceil(Z1-2)-gz0+1;
  const bad=new Uint8Array(GW*GH); for(let j=0;j<GH;j++) for(let i=0;i<GW;i++) if(!passAtT(T,gx0+i+0.5,gz0+j+0.5)) bad[j*GW+i]=1;
  const S=new Int32Array((GW+1)*(GH+1));
  const build=()=>{ for(let j=0;j<GH;j++){ let row=0; for(let i=0;i<GW;i++){ row+=bad[j*GW+i]; S[(j+1)*(GW+1)+i+1]=S[j*(GW+1)+i+1]+row; } } };
  const sum=(i0,j0,i1,j1)=>S[j1*(GW+1)+i1]-S[j0*(GW+1)+i1]-S[j1*(GW+1)+i0]+S[j0*(GW+1)+i0];
  build(); const O=packOffsets();
  // place one set of regiments as a unit; false when there is no room for it anywhere
  const fit=(gs,m)=>{ let e=groupsExtent(gs); if(!(e.x1>=e.x0)) return true;
    // start from inside the zone, however far back or out to the side it was planned
    const cx=e.x1-e.x0>zone[1]-zone[0]-4?0:clamp(0,zone[0]+2-e.x0,zone[1]-2-e.x1), cz=e.z1-e.z0>Z1-Z0-6?0:clamp(0,Z0+3-e.z0,Z1-3-e.z1); if(cx||cz){ shiftGroups(gs,cx,cz); e=groupsExtent(gs); }
    const w=Math.ceil(e.x1-e.x0)+1, h=Math.ceil(e.z1-e.z0)+1;
    for(let q=0;q<O.length;q+=2){ const dx=dir*O[q], dz=O[q+1];
      const i0=Math.floor(e.x0+dx)-gx0-m, j0=Math.floor(e.z0+dz)-gz0-m, i1=i0+w+2*m, j1=j0+h+2*m;
      if(i0<0||j0<0||i1>GW||j1>GH||sum(i0,j0,i1,j1)) continue;
      shiftGroups(gs,dx,dz); for(let j=j0;j<j1;j++) for(let i=i0;i<i1;i++) bad[j*GW+i]=1; build(); return true; }
    return false; };
  const miss=built.filter(b=>!fit(b.gs,1));
  // no room for a whole block: place its regiments one by one (officers stay with the regiment they stand in)
  for(const b of miss){ PACK_MISS++; for(const g of b.gs) if(!g.embedOf) fit([g,...b.gs.filter(e=>e.embedOf===g)],0); }
}
function groupsExtent(gs){ let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const g of gs) for(let k=0;k<g.slots.length;k+=3){ const p=localToWorld(g,g.slots[k],g.slots[k+1]); if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<z0)z0=p[1]; if(p[1]>z1)z1=p[1]; }
  return {x0,x1,z0,z1}; }
const shiftGroups=(gs,dx,dz)=>{ for(const g of gs){ g.cx+=dx; g.cz+=dz; } };
// Spread commanders and medics through the infantry and missile regiments. Each regiment gets a few
// empty places scattered through its ranks (never the front rank); the officers and medics stand in
// them as small groups sharing the regiment's anchor and facing, so they move and turn with it.
// Commanders favour the front regiments, where their aura does most good.
function embedSupport(groups,counts,sup,dir){
  const hosts=groups.filter(g=>{ const c=UNITS[g.type].cls; return (c==='inf'||c==='rng')&&g.slots.length>=9; });
  if(!hosts.length||!sup.length) return false;
  for(const t of sup){ const n=counts[t], w=hosts.map(h=>(h.slots.length/3)*(t===UID.cmdr&&(h.k|0)===0?3:1)), tot=w.reduce((a,b)=>a+b,0);
    const alloc=w.map(x=>Math.floor(n*x/tot)); let rem=n-alloc.reduce((a,b)=>a+b,0);
    const ord=w.map((x,i)=>[n*x/tot-alloc[i],i]).sort((a,b)=>b[0]-a[0]); for(let j=0;rem>0;j++,rem--) alloc[ord[j%ord.length][1]]++;
    hosts.forEach((h,i)=>{ if(alloc[i]>0) (h.emb||(h.emb=[])).push([t,alloc[i]]); }); }
  const out=[];
  for(const h of hosts){ if(!h.emb) continue;
    const m=h.slots.length/3, k=h.emb.reduce((a,e)=>a+e[1],0), sp=UNITS[h.type].sp, xs=new Set();
    for(let i=0;i<h.slots.length;i+=3) xs.add(Math.round(h.slots[i]*100));
    const cols=xs.size, oldRows=Math.ceil(m/cols), N=m+k, rows=Math.ceil(N/cols), all=fmRect(cols,rows,sp,N), shift=(rows-oldRows)*sp/2;
    for(let i=1;i<all.length;i+=3) all[i]-=shift;            // keep the front rank where it was
    // scatter: rows spread evenly behind the front, columns by the golden ratio so they never line up
    const pick=[], used=new Set();
    for(let j=0;j<k;j++){ const r=rows>1?1+Math.floor((j+0.5)*(rows-1)/k):0, c=Math.floor(((j*0.618+0.31)%1)*cols); let idx=Math.min(N-1,r*cols+c);
      while(used.has(idx)) idx=(idx+1)%N; used.add(idx); pick.push(idx); }
    const keep=[]; for(let i=0;i<N;i++) if(!used.has(i)) keep.push(all[i*3],all[i*3+1],all[i*3+2]); h.slots=keep;
    let at=0; for(const [t,n] of h.emb){ const sl=[]; for(let j=0;j<n;j++){ const i=pick[at++]; sl.push(all[i*3],all[i*3+1],0); }
      out.push({bk:h.bk,team:h.team,type:t,order:'advance',cx:h.cx,cz:h.cz,a:h.a,slots:sl,k:-1,embedOf:h}); }
    delete h.emb; }
  groups.push(...out); return out.length>0;
}
// Make every soldier fit: a regiment on blocked ground or outside the zone slides back or sideways
// to open ground; anyone still without a place is found the nearest free spot. Nobody is dropped.
// search offsets for one soldier at a time: nearest first, a step back preferred over a step forward
let PLACE_OFF=null;
function placeOffsets(){ if(PLACE_OFF) return PLACE_OFF; const L=[]; for(let a=-60;a<=60;a+=1.5) for(let b=-60;b<=60;b+=1.5){ const d=Math.hypot(a,b); if(d>0&&d<=60) L.push([a,b,d+(a<0?a*-0.3:0)]); }
  L.sort((p,q)=>p[2]-q[2]); PLACE_OFF=new Float32Array(L.length*2); L.forEach((p,i)=>{ PLACE_OFF[i*2]=p[0]; PLACE_OFF[i*2+1]=p[1]; }); return PLACE_OFF; }
function placeGroups(groups,T,zone,dir){
  const ok=(x,z)=>passAtT(T,x,z)&&x>=zone[0]&&x<=zone[1]&&z>Z0+2&&z<Z1-2;
  const occ=new Set(), key=(x,z)=>Math.round(x)*4096+Math.round(z);
  const near=(x,z)=>{ const X=Math.round(x), Z=Math.round(z); for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) if(occ.has((X+a)*4096+Z+b)) return true; return false; };
  const pts=g=>{ const out=[]; for(let k=0;k<g.slots.length;k+=3) out.push(localToWorld(g,g.slots[k],g.slots[k+1])); return out; };
  // a regiment and the commanders and medics standing inside it are placed together
  const clusters=groups.filter(g=>!g.embedOf).map(g=>[g,...groups.filter(e=>e.embedOf===g)]);
  const bad=[];
  for(const cl of clusters){ const P=cl.map(pts); if(P.every(L=>L.every(p=>ok(p[0],p[1])))) P.forEach(L=>L.forEach(p=>occ.add(key(p[0],p[1])))); else bad.push([cl,P]); }
  if(!bad.length) return groups;
  const shifts=[]; for(let b=0;b<=60;b+=2) for(let l=0;l<=90;l+=3) for(const s of l?[1,-1]:[1]) shifts.push([-dir*b,l*s,b+l*0.8]); shifts.sort((a,b)=>a[2]-b[2]);
  for(const [cl,P] of bad){
    let done=false;
    for(const [dx,dz] of shifts){ let fit=true; for(const L of P){ for(const p of L){ const x=p[0]+dx, z=p[1]+dz; if(!ok(x,z)||near(x,z)){ fit=false; break; } } if(!fit) break; }
      if(fit){ cl.forEach((g,i)=>{ g.cx+=dx; g.cz+=dz; P[i].forEach(p=>occ.add(key(p[0]+dx,p[1]+dz))); }); done=true; break; } }
    if(done) continue;
    // no room for the whole block: keep the soldiers who can stand and find room for the rest one by one
    cl.forEach((g,gi)=>{ const keep=[], lost=[];
      P[gi].forEach((p,i)=>{ if(ok(p[0],p[1])&&!occ.has(key(p[0],p[1]))){ occ.add(key(p[0],p[1])); keep.push(g.slots[i*3],g.slots[i*3+1],g.slots[i*3+2]); } else lost.push(p); });
      for(const p of lost){ let found=null; const O=placeOffsets();
        for(let q=0;q<O.length;q+=2){ const x=p[0]-dir*O[q], z=p[1]+O[q+1]; if(ok(x,z)&&!near(x,z)){ found=[x,z]; break; } }
        if(found){ occ.add(key(found[0],found[1])); const [lx,lz]=worldToLocal(g,found[0],found[1]); keep.push(lx,lz,0); } }
      g.slots=keep; }); }
  return groups.filter(g=>g.slots.length);
}
function defaultOrder(type){ const c=UNITS[type].cls; return c==='cav'?'flank':'advance'; }
function passAtT(T,x,z){ if(x<X0||x>=X1||z<Z0||z>=Z1) return false; const i=((x-X0)/TC)|0, j=((z-Z0)/TC)|0; return PASSK[T.k[j*TW+i]]===1; }

function genArmy(team,total,pool,style,seed,T,opt){ const R=mulberry32(seed); return layoutArmy(team, armyCounts(total,pool,style,R), T, opt); }

/* ---------- Campaign ---------- */
const POOL_AT=[[1,'sword'],[1,'archer'],[2,'spear'],[3,'lcav'],[4,'shield'],[5,'cata'],[6,'cmdr'],[7,'xbow'],[8,'hcav'],[8,'bers'],[9,'medic'],[9,'ballista'],[11,'eng'],[12,'heavy'],[13,'musket'],[14,'lancer'],[14,'cannon'],[16,'mortar'],[18,'elite']];
function poolAt(L){ const ids=POOL_AT.filter(p=>p[0]<=L).map(p=>p[1]); return ids.filter(id=>!(ENEMY_NEXT[id]&&ids.includes(ENEMY_NEXT[id]))); }
const MAP_CYCLE=['grassland','hills','forest','river','pass','desert','fortress'];
const STYLE_CYCLE=['balanced','horde','ranged','cavalry','balanced','siege','horde'];
const ROMAN=['','','II','III','IV','V','VI','VII','VIII','IX','X'];
const CAMPAIGN_LEN=25;   // battle 25 is the last battle of the campaign
function campaignLevel(L){
  const final=L===CAMPAIGN_LEN;
  const mapId=final?'grassland':MAP_CYCLE[(L-1)%7];
  const cycle=Math.floor((L-1)/7)+1;
  // 30% bigger each battle up to battle 12 (about 1,100), then gentler growth to 6,000 for the last battle
  const count=final?6000:Math.min(6000,Math.round(L<=12?60*Math.pow(1.3,L-1):60*Math.pow(1.3,11)*Math.pow(1.142,L-12)));
  const pool=poolAt(L);
  return {L,final,mapId,count,pool,style:final?'balanced':STYLE_CYCLE[(L-1)%7],ulv:Math.min(5,Math.floor((L-1)/3)),seed:1000+L*7919,
    name:final?'The Last Battle':BATTLE_NAMES[mapId]+(cycle>1?' '+(ROMAN[cycle]||cycle):''), reward:Math.round(80+L*45*Math.pow(1.18,L))};
}
