/* ================= SIMULATION ================= */
const MAXU=65536, MAXP=20000, MAXQ=12000;
const DT=0.05, GRAV=9.8;
const TCS=4, TGW=Math.ceil((X1-X0)/TCS), TGH=Math.ceil((Z1-Z0)/TCS), TGN=TGW*TGH;     // team grids (targeting)
const CCS=2, CGW=Math.ceil((X1-X0)/CCS), CGH=Math.ceil((Z1-Z0)/CCS), CGN=CGW*CGH;    // collision grid
const O_ADV=0,O_HOLD=1,O_FLANK=2,O_CHARGE=3;
const ORDER_IDS=['advance','hold','flank','charge'];
const ORDER_NAMES=['Advance','Hold','Flank','Charge'];

let TER=newTerrain();
let N=0, tick=0, simTime=0;
const F=()=>new Float32Array(MAXU);
const PX=F(),PZ=F(),OX=F(),OZ=F(),PY=F(),VX=F(),VZ=F(),FA=F(),HP=F(),MO=F(),CD=F(),AT=F(),FL=F(),DE=F(),BA=F(),BS=F(),CH=F(),SX=F(),SZ=F(),SA=F(),STN=F(),STK=F(),STU=F();
const TM=new Uint8Array(MAXU), TY=new Uint8Array(MAXU), SS=new Uint8Array(MAXU), FG=new Uint8Array(MAXU);
const GR=new Int32Array(MAXU), TG=new Int32Array(MAXU), KL=new Uint16Array(MAXU), RC=new Uint8Array(MAXU);   // RC: times routed
const ALLARR=[PX,PZ,OX,OZ,PY,VX,VZ,FA,HP,MO,CD,AT,FL,DE,BA,BS,CH,SX,SZ,SA,STN,STK,STU,TM,TY,SS,FG,GR,TG,KL,RC];
let STT=[computeStats(lvZero,{}),computeStats(lvZero,{})];
let G=[];

const B={rules:{morale:true,rain:false}, start:[0,0], dead:[0,0], esc:[0,0], active:[0,0], fleeing:[0,0], startT:[new Int32Array(NT),new Int32Array(NT)], deadT:[new Int32Array(NT),new Int32Array(NT)], escT:[new Int32Array(NT),new Int32Array(NT)], killsT:[new Int32Array(NT),new Int32Array(NT)], broken:[false,false],
  combat:[0,0], hunt:false, noRout:false, noHunt:false, phaseT:0, shieldBlock:[.5,.5], adjBlock:[.3,.3], shieldArm:[3,3], armyLoss:[0,0], hasMelee:[1,1], onKill:null, onEscape:null, tcx:[0,0], tcz:[0,0]};
const TEAMCOL=[[0.24,0.45,0.90],[0.86,0.27,0.22]];

/* ---------- sound events: filled by the simulation, read and cleared every frame by the audio engine ---------- */
const EV_HIT=0,EV_KILL=1,EV_BLOCK=2,EV_CHARGE=3,EV_BRACE=4,EV_FIRE=5 /* +projectile kind 0..6 */,EV_IMPACT=12,EV_BOOM=13,EV_BOUNCE=14,EV_STRUCK=15,EV_N=16;
const EVQ=2048, EVT=new Uint8Array(EVQ), EVX=new Float32Array(EVQ), EVY=new Float32Array(EVQ), EVZ=new Float32Array(EVQ);
let evN=0, evSeen=0;
// reservoir sampling keeps a fair sample when a frame produces more events than the queue holds (Math.random: never the sim's RNG)
function sfx(t,x,y,z){ let k=evN; if(evN<EVQ) evN++; else { k=(Math.random()*(evSeen+1))|0; if(k>=EVQ){ evSeen++; return; } } EVT[k]=t; EVX[k]=x; EVY[k]=y; EVZ[k]=z; evSeen++; }

/* ---------- terrain helpers ---------- */
function cellIdx(x,z){ let i=((x-X0)/TC)|0, j=((z-Z0)/TC)|0; if(i<0)i=0; else if(i>=TW)i=TW-1; if(j<0)j=0; else if(j>=TH)j=TH-1; return j*TW+i; }
function kindAt(x,z){ if(x<X0||x>=X1||z<Z0||z>=Z1) return 255; return TER.k[cellIdx(x,z)]; }
function passAt(x,z){ if(x<X0+0.3||x>=X1-0.3||z<Z0+0.3||z>=Z1-0.3) return false; return PASSK[TER.k[cellIdx(x,z)]]===1; }
function heightAt(x,z){
  let fx=(x-X0)/TC, fz=(z-Z0)/TC; if(fx<0)fx=0; else if(fx>TW-0.001)fx=TW-0.001; if(fz<0)fz=0; else if(fz>TH-0.001)fz=TH-0.001;
  const i=fx|0, j=fz|0, u=fx-i, v=fz-j, W=TW+1, h=TER.h;
  return (h[j*W+i]*(1-u)+h[j*W+i+1]*u)*(1-v)+(h[(j+1)*W+i]*(1-u)+h[(j+1)*W+i+1]*u)*v;
}

/* ---------- spatial grids ---------- */
const cCnt=new Int32Array(CGN+1), cStart=new Int32Array(CGN+1), cIdx=new Int32Array(MAXU);
const tCnt=[new Int32Array(TGN+1),new Int32Array(TGN+1)], tStart=[new Int32Array(TGN+1),new Int32Array(TGN+1)], tIdx=[new Int32Array(MAXU),new Int32Array(MAXU)];
const cOf=new Int32Array(MAXU), tOf=new Int32Array(MAXU);
// cell-sorted copies for the collision pass (contiguous memory in the hot loop)
const SPX=new Float32Array(MAXU), SPZ=new Float32Array(MAXU), SRAD=new Float32Array(MAXU), SMAS=new Float32Array(MAXU);
let cTotal=0;
function buildGrids(){
  cCnt.fill(0); tCnt[0].fill(0); tCnt[1].fill(0);
  for(let i=0;i<N;i++){
    const s=SS[i]; if(s!==1&&s!==2){ cOf[i]=-1; continue; }
    let cx=((PX[i]-X0)/CCS)|0, cz=((PZ[i]-Z0)/CCS)|0; if(cx<0)cx=0; else if(cx>=CGW)cx=CGW-1; if(cz<0)cz=0; else if(cz>=CGH)cz=CGH-1;
    const c=cz*CGW+cx; cOf[i]=c; cCnt[c]++;
    let tx=((PX[i]-X0)/TCS)|0, tz=((PZ[i]-Z0)/TCS)|0; if(tx<0)tx=0; else if(tx>=TGW)tx=TGW-1; if(tz<0)tz=0; else if(tz>=TGH)tz=TGH-1;
    const t=tz*TGW+tx; tOf[i]=t; tCnt[TM[i]][t]++;
  }
  prefix(cCnt,cStart,CGN); prefix(tCnt[0],tStart[0],TGN); prefix(tCnt[1],tStart[1],TGN);
  for(let i=0;i<N;i++){ const c=cOf[i]; if(c<0) continue; const k=cCnt[c]++; cIdx[k]=i; SPX[k]=PX[i]; SPZ[k]=PZ[i]; const ty=TY[i]; SRAD[k]=URAD[ty]; SMAS[k]=UMASS[ty]; const tm=TM[i]; tIdx[tm][tCnt[tm][tOf[i]]++]=i; }
  cTotal=cStart[CGN];
  buildCoarse();
}
function prefix(cnt,start,n){ let s=0; for(let c=0;c<n;c++){ start[c]=s; s+=cnt[c]; cnt[c]=start[c]; } start[n]=s; }

// coarse 16 m presence counts per team, so searches with nothing nearby exit early
const QCS=16, QGW=Math.ceil((X1-X0)/QCS), QGH=Math.ceil((Z1-Z0)/QCS);
const qCnt=[new Int32Array(QGW*QGH),new Int32Array(QGW*QGH)];
function buildCoarse(){
  qCnt[0].fill(0); qCnt[1].fill(0);
  for(let tm=0;tm<2;tm++){ const st=tStart[tm], q=qCnt[tm];
    for(let gz=0;gz<TGH;gz++){ const qz=((gz*TCS)/QCS)|0; for(let gx=0;gx<TGW;gx++){ const c=gz*TGW+gx, n=st[c+1]-st[c]; if(n) q[qz*QGW+(((gx*TCS)/QCS)|0)]+=n; } } }
}
// nearest unit of `team` to (x,z) within maxR. vis: ranged visibility rule (forest hides beyond 15 m)
function nearestIn(team,x,z,maxR,vis){
  const st=tStart[team], ix=tIdx[team];
  if(maxR<100){
    const q=qCnt[team]; let qx0=((x-maxR-X0)/QCS)|0, qx1=((x+maxR-X0)/QCS)|0, qz0=((z-maxR-Z0)/QCS)|0, qz1=((z+maxR-Z0)/QCS)|0;
    if(qx0<0)qx0=0; if(qz0<0)qz0=0; if(qx1>=QGW)qx1=QGW-1; if(qz1>=QGH)qz1=QGH-1;
    let any=0; for(let gz=qz0;gz<=qz1&&!any;gz++) for(let gx=qx0;gx<=qx1;gx++) if(q[gz*QGW+gx]){ any=1; break; }
    if(!any) return -1;
  }
  let cx=((x-X0)/TCS)|0, cz=((z-Z0)/TCS)|0; if(cx<0)cx=0; else if(cx>=TGW)cx=TGW-1; if(cz<0)cz=0; else if(cz>=TGH)cz=TGH-1;
  // clip every ring to the circle's bounding box
  let bx0=Math.floor((x-maxR-X0)/TCS), bx1=Math.floor((x+maxR-X0)/TCS), bz0=Math.floor((z-maxR-Z0)/TCS), bz1=Math.floor((z+maxR-Z0)/TCS);
  if(bx0<0)bx0=0; if(bz0<0)bz0=0; if(bx1>=TGW)bx1=TGW-1; if(bz1>=TGH)bz1=TGH-1;
  const maxRing=Math.max(cx-bx0,bx1-cx,cz-bz0,bz1-cz);
  let best=-1, bd=maxR*maxR;
  for(let r=0;r<=maxRing;r++){
    if(best>=0){ const lim=(r-1)*TCS; if(lim>0&&lim*lim>bd) break; }
    const za=cz-r, zb=cz+r;
    const gzA=za<bz0?bz0:za, gzB=zb>bz1?bz1:zb;
    for(let gz=gzA;gz<=gzB;gz++){
      const edge=(gz===za||gz===zb||r===0);
      const step=edge?1:2*r;
      let gx=cx-r, gxE=cx+r;
      if(edge){ if(gx<bx0) gx=bx0; if(gxE>bx1) gxE=bx1; }
      for(;gx<=gxE;gx+=step){
        if(gx<bx0||gx>bx1) continue;
        const c=gz*TGW+gx;
        for(let k=st[c],e=st[c+1];k<e;k++){
          const j=ix[k], s=SS[j]; if(s!==1&&s!==2) continue;
          const dx=PX[j]-x, dz=PZ[j]-z, d2=dx*dx+dz*dz;
          if(d2<bd){ if(vis && d2>225 && TER.k[cellIdx(PX[j],PZ[j])]===T_FOREST) continue; bd=d2; best=j; }
        }
      }
    }
  }
  return best;
}
function forEachIn(team,x,z,r,fn){
  const st=tStart[team], ix=tIdx[team], r2=r*r;
  const x0=Math.max(0,((x-r-X0)/TCS)|0), x1=Math.min(TGW-1,((x+r-X0)/TCS)|0), z0=Math.max(0,((z-r-Z0)/TCS)|0), z1=Math.min(TGH-1,((z+r-Z0)/TCS)|0);
  for(let gz=z0;gz<=z1;gz++) for(let gx=x0;gx<=x1;gx++){ const c=gz*TGW+gx;
    for(let k=st[c],e=st[c+1];k<e;k++){ const j=ix[k]; if(SS[j]!==1&&SS[j]!==2) continue; const dx=PX[j]-x, dz=PZ[j]-z; if(dx*dx+dz*dz<=r2) fn(j); } }
}

/* ---------- flow fields (Dijkstra toward enemies) ---------- */
const NC=TW*TH;
const FF=[new Float64Array(NC),new Float64Array(NC)], FDX=[new Float32Array(NC),new Float32Array(NC)], FDZ=[new Float32Array(NC),new Float32Array(NC)];
const HN=new Int32Array(NC*8), HK=new Float64Array(NC*8); let HS=0;
function hpush(n,k){ let i=HS++; while(i>0){ const p=(i-1)>>1; if(HK[p]<=k) break; HN[i]=HN[p]; HK[i]=HK[p]; i=p; } HN[i]=n; HK[i]=k; }
function hpop(){ const n=HN[0]; HS--; if(HS>0){ const ln=HN[HS], lk=HK[HS]; let i=0; for(;;){ let c=2*i+1; if(c>=HS) break; if(c+1<HS&&HK[c+1]<HK[c]) c++; if(HK[c]>=lk) break; HN[i]=HN[c]; HK[i]=HK[c]; i=c; } HN[i]=ln; HK[i]=lk; } return n; }
const NBX=[1,-1,0,0,1,1,-1,-1], NBZ=[0,0,1,-1,1,-1,1,-1];
function computeFlow(team){
  const dist=FF[team], dx=FDX[team], dz=FDZ[team], e=team^1, K=TER.k;
  dist.fill(Infinity); HS=0;
  for(let i=0;i<N;i++){ if(SS[i]===1&&TM[i]===e){ const c=cellIdx(PX[i],PZ[i]); if(dist[c]!==0){ dist[c]=0; hpush(c,0); } } }
  while(HS>0){
    const d=HK[0], c=hpop(); if(d>dist[c]) continue;
    const cx=c%TW, cz=(c/TW)|0;
    for(let n=0;n<8;n++){
      const nx=cx+NBX[n], nz=cz+NBZ[n]; if(nx<0||nx>=TW||nz<0||nz>=TH) continue;
      const nc=nz*TW+nx; const cost=COSTK[K[nc]]; if(cost===Infinity) continue;
      if(n>=4 && (!PASSK[K[cz*TW+nx]] || !PASSK[K[nz*TW+cx]])) continue;
      const nd=d+cost*(n>=4?1.4142:1);
      if(nd<dist[nc]-1e-4){ dist[nc]=nd; if(HS<HN.length) hpush(nc,nd); }
    }
  }
  for(let c=0;c<NC;c++){
    dx[c]=0; dz[c]=0; const d0=dist[c]; if(d0===Infinity||d0===0) continue;
    const cx=c%TW, cz=(c/TW)|0; let best=d0, bx=0, bz=0;
    for(let n=0;n<8;n++){ const nx=cx+NBX[n], nz=cz+NBZ[n]; if(nx<0||nx>=TW||nz<0||nz>=TH) continue;
      if(n>=4 && (!PASSK[K[cz*TW+nx]] || !PASSK[K[nz*TW+cx]])) continue;
      const v=dist[nz*TW+nx]; if(v<best){ best=v; bx=NBX[n]; bz=NBZ[n]; } }
    const l=Math.hypot(bx,bz)||1; dx[c]=bx/l; dz[c]=bz/l;
  }
}

/* ---------- units ---------- */
function initUnit(i,team,type,x,z,a,gi,sx,sz,sa){
  const st=STT[team][type];
  PX[i]=OX[i]=x; PZ[i]=OZ[i]=z; PY[i]=heightAt(x,z); VX[i]=VZ[i]=0; FA[i]=a; HP[i]=st.hp; MO[i]=st.morale;
  CD[i]=st.isR? rnd()*0.25 : rnd()*0.6; AT[i]=0; FL[i]=0; DE[i]=0; BA[i]=0; BS[i]=0; CH[i]=0; SX[i]=sx; SZ[i]=sz; SA[i]=sa; STN[i]=0; STK[i]=0; STU[i]=0;
  TM[i]=team; TY[i]=type; SS[i]=1; FG[i]=0; GR[i]=gi; TG[i]=-1; KL[i]=0; RC[i]=0;
}
function makeBattleGroup(dg){
  let rad=2; for(let k=0;k<dg.slots.length;k+=3) rad=Math.max(rad,Math.hypot(dg.slots[k],dg.slots[k+1]));
  const o=Math.max(0,ORDER_IDS.indexOf(dg.order));
  return {team:dg.team,type:dg.type,order:o,ax:dg.cx,az:dg.cz,a:dg.a,ca:Math.cos(dg.a),sa:Math.sin(dg.a),rad,n0:dg.slots.length/3,
    cnt:dg.slots.length/3,alive:dg.slots.length/3,sx:dg.cx*dg.slots.length/3,sz:dg.cz*dg.slots.length/3,slx:0,slz:0,cx:dg.cx,cz:dg.cz,err:0,fcnt:0,eng:0,ned:1e9,nex:0,nez:0,tg:null,phase:0,side:1,tmr:0,spdNow:0,mdx:Math.cos(dg.a),mdz:Math.sin(dg.a),retreat:false};
}
// append deploy-format groups to a running (or fresh) battle
function addGroupsToSim(dgs){
  for(const dg of dgs){
    if(N+dg.slots.length/3>=MAXU) compact();
    const gi=G.length, g=makeBattleGroup(dg); G.push(g);
    const ca=Math.cos(dg.a), sa=Math.sin(dg.a);
    for(let k=0;k<dg.slots.length;k+=3){
      if(N>=MAXU) break;
      const lx=dg.slots[k], lz=dg.slots[k+1];
      initUnit(N, dg.team, dg.type, dg.cx+sa*lx+ca*lz, dg.cz-ca*lx+sa*lz, dg.a+dg.slots[k+2], gi, lx, lz, dg.slots[k+2]);
      B.start[dg.team]++; B.startT[dg.team][dg.type]++; N++;
    }
  }
  assignFlankSides(); assignEscorts();
}
// commanders and medics marching with the army attach to the nearest fighting regiment and keep their place beside it
function escortHost(g){ let best=null, bd=1e18; for(const h of G){ if(h.team!==g.team||h.cnt<=0) continue; const c=UNITS[h.type].cls; if(c==='sup'||c==='cav'||c==='sie') continue; const d=(h.ax-g.ax)**2+(h.az-g.az)**2; if(d<bd){ bd=d; best=h; } } return best; }
function attachEscort(g){ const h=escortHost(g); g.host=h; g.embed=false; if(!h) return; const dx=g.ax-h.ax, dz=g.az-h.az; let lx=h.sa*dx-h.ca*dz, lz=h.ca*dx+h.sa*dz;
  // officers and medics deployed inside a regiment share its anchor: they simply move and turn with it
  if(dx*dx+dz*dz<0.25 && Math.abs(Math.atan2(Math.sin(g.a-h.a),Math.cos(g.a-h.a)))<0.05){ g.embed=true; g.hlx=0; g.hlz=0; return; }
  if(Math.hypot(lx,lz)>h.rad+14){ lx=0; lz=-(h.rad+3); } g.hlx=lx; g.hlz=lz; }
function assignEscorts(){ for(const g of G){ const st=STT[g.team][g.type]; if(g.host===undefined && (st.aura||st.heal) && g.order===O_ADV) attachEscort(g); } }
function assignFlankSides(){
  for(let t=0;t<2;t++){ let sx=0,sz=0,n=0; for(const g of G) if(g.team===t&&g.cnt>0){ sx+=g.ax*g.cnt; sz+=g.az*g.cnt; n+=g.cnt; } if(n){B.tcx[t]=sx/n; B.tcz[t]=sz/n;} }
  for(const g of G){ if(g.order===O_FLANK && g.phase===0){ g.side = (g.az>=B.tcz[g.team]) ? 1 : -1; if(g.team===1) g.side=-g.side; } }
}
function resetBattle(){
  N=0; G=[]; tick=0; simTime=0;
  B.start=[0,0]; B.dead=[0,0]; B.esc=[0,0]; B.active=[0,0]; B.fleeing=[0,0]; B.armyLoss=[0,0];
  B.startT=[new Int32Array(NT),new Int32Array(NT)]; B.deadT=[new Int32Array(NT),new Int32Array(NT)]; B.escT=[new Int32Array(NT),new Int32Array(NT)]; B.killsT=[new Int32Array(NT),new Int32Array(NT)]; B.broken=[false,false]; B.lastKill=0; B.phaseT=0; B.noHunt=false;
  clearProjectiles();
}
function setAbilities(team,ab){ B.shieldBlock[team]=ab.shieldwall?.7:.5; B.adjBlock[team]=ab.shieldwall?.45:.3; B.shieldArm[team]=ab.shieldwall?5:3; }

// remove old corpses and escaped units to make room (endless / survival)
function compact(){
  const map=new Int32Array(N).fill(-1); let w=0;
  const keepCorpses = N < MAXU*0.55;
  for(let i=0;i<N;i++){ const s=SS[i]; if(s===1||s===2||(s===0&&keepCorpses&&DE[i]<1)){ map[i]=w; if(w!==i) for(const a of ALLARR) a[w]=a[i]; w++; } }
  for(let i=0;i<w;i++){ const t=TG[i]; TG[i]= t>=0 && t<map.length ? map[t] : -1; }
  for(let p=0;p<pHigh;p++){ if(!PRL[p]) continue; const o=PRO[p]; PRO[p]= o>=0&&o<map.length?map[o]:-1; const h=PRH[p]; PRH[p]= h>=0&&h<map.length?map[h]:-1; }
  N=w;
  if(typeof onCompact==='function') onCompact(map);
}

/* ---------- combat ---------- */
function damage(t,dmg,src){
  if(SS[t]!==1&&SS[t]!==2) return;
  HP[t]-=dmg; FL[t]=1;
  const b=STT[TM[t]][TY[t]];
  if(B.rules.morale && !b.noFlee) MO[t]-=dmg/b.hp*10;
  if(HP[t]<=0) kill(t,src);
}
function kill(t,src){
  SS[t]=0; DE[t]=0.001; HP[t]=0; VX[t]=0; VZ[t]=0;
  const tm=TM[t], ty=TY[t];
  B.dead[tm]++; B.deadT[tm][ty]++; B.lastKill=simTime; sfx(EV_KILL,PX[t],PY[t],PZ[t]);
  if(src>=0&&src<N){ KL[src]++; B.killsT[TM[src]][TY[src]]++; }
  if(B.onKill) B.onKill(t,src);
  const c=TEAMCOL[tm];
  for(let n=0;n<3;n++) spawnQ(PX[t],PY[t]+0.8,PZ[t],(rnd()-.5)*3,2+rnd()*2.5,(rnd()-.5)*3,1.6,0.16,0,c[0]*.8,c[1]*.8,c[2]*.8,1,5);
  if(rnd()<0.5) dustPuff(PX[t],PY[t],PZ[t],1);
  if(B.rules.morale){
    const x=PX[t], z=PZ[t];
    if(UNITS[ty].id==='cmdr') forEachIn(tm,x,z,15,j=>{ MO[j]-=25; });
    else forEachIn(tm,x,z,4,j=>{ MO[j]-=2; });
  }
}
function knock(t,kx,kz){
  const nx=PX[t]+kx, nz=PZ[t]+kz;
  if(passAt(nx,PZ[t])) PX[t]=nx; if(passAt(PX[t],nz)) PZ[t]=nz;
  VX[t]=kx*2; VZ[t]=kz*2;
}
function meleeHit(i,t,mult){
  const a=STT[TM[i]][TY[i]], b=STT[TM[t]][TY[t]];
  let dmg=a.dmg*mult*(0.85+0.3*rnd());
  if(BA[i]>0) dmg*=1.25;
  dmg*=1+clamp((PY[i]-PY[t])*0.05,-0.2,0.25);
  const dx=PX[i]-PX[t], dz=PZ[i]-PZ[t], d=Math.sqrt(dx*dx+dz*dz)||1;
  const dot=(Math.cos(FA[t])*dx+Math.sin(FA[t])*dz)/d;
  let shock=0;
  if(dot<-0.35){ dmg*=1.6; shock+=5; } else if(dot<0.35){ dmg*=1.25; shock+=2; }
  if(a.antiCav && b.cls==='cav') dmg*=a.antiCav;
  if(a.cls==='cav' && CH[i]>0.55 && TER.k[cellIdx(PX[i],PZ[i])]!==T_FOREST){
    if(b.brace && dot>0.3 && SS[t]===1){
      damage(i,22+b.dmg*1.5,t); CH[i]=0; STN[i]=0.9; VX[i]*=-0.3; VZ[i]*=-0.3; sfx(EV_BRACE,PX[t],PY[t],PZ[t]);
      spark(PX[t]+dx*.4,PY[t]+1.2,PZ[t]+dz*.4); spark(PX[t]+dx*.4,PY[t]+1.2,PZ[t]+dz*.4);
      return;
    }
    dmg*=a.charge;
    const vl=Math.hypot(VX[i],VZ[i])||1, kn=a.knock/Math.sqrt(b.mass);
    knock(t,VX[i]/vl*kn,VZ[i]/vl*kn); STN[t]=0.6; shock+=15; sfx(EV_CHARGE,PX[t],PY[t],PZ[t]);
    CH[i]= a.id==='lancer'?0.5:0;
    dustPuff(PX[t],PY[t],PZ[t],2);
  }
  if(SS[t]===2) dmg*=1.6;   // a routed soldier does not defend himself
  let arm=b.armor+(BS[t]>0?B.shieldArm[TM[t]]:0); arm*=1-a.pen;
  dmg*=12/(12+Math.max(0,arm));
  AT[i]=1; sfx(EV_HIT,PX[t],PY[t],PZ[t]);
  if(B.rules.morale && !b.noFlee) MO[t]-=shock;
  damage(t,dmg,i);
  if(a.cleave && SS[i]===1){
    let n=a.cleave; const x=PX[i], z=PZ[i], rr=a.range+1.4;
    forEachIn(TM[i]^1,x,z,rr,j=>{ if(n>0 && j!==t){ n--; let dd=a.dmg*0.6*(12/(12+STT[TM[j]][TY[j]].armor)); damage(j,dd,i); } });
  }
  if(SS[t]===1){ const tt=TG[t]; if(tt<0||(SS[tt]!==1&&SS[tt]!==2)||Math.hypot(PX[tt]-PX[t],PZ[tt]-PZ[t])>d+0.6) TG[t]=i; }
  if(rnd()<0.45) spark(PX[t]+dx*0.35,PY[t]+1.0,PZ[t]+dz*0.35);
}
function healAround(i,st){
  let best=-1, br=0.98;
  forEachIn(TM[i],PX[i],PZ[i],4.5,j=>{ if(j===i||SS[j]!==1) return; const r=HP[j]/STT[TM[j]][TY[j]].hp; if(r<br){ br=r; best=j; } });
  if(best>=0){ const mx=STT[TM[best]][TY[best]].hp; HP[best]=Math.min(mx,HP[best]+st.heal*0.5); spawnQ(PX[best],PY[best]+1.4,PZ[best],0,0.9,0,0.8,0.2,0,0.45,0.95,0.55,0.9,0); }
}

/* ---------- groups ---------- */
function flowAt(team,x,z){ const c=cellIdx(x,z); return [FDX[team][c],FDZ[team][c]]; }
function updateGroups(){
  const retarget=(tick%10)===1;
  // stalled battles (no kills for a while, or a very long fight) turn every regiment loose on the enemy
  const pt=simTime-B.phaseT, stall=!B.noHunt && ((pt>60 && simTime-Math.max(B.lastKill,B.phaseT)>25) || pt>210); B.hunt=stall;
  if(retarget){
    for(let t=0;t<2;t++){ let sx=0,sz=0,n=0; for(const g of G) if(g.team===t&&g.alive>0){ sx+=g.cx*g.alive; sz+=g.cz*g.alive; n+=g.alive; } if(n){ B.tcx[t]=sx/n; B.tcz[t]=sz/n; } }
    B.hasMelee=[0,0]; for(const g of G) if(g.alive>0 && !UNITS[g.type].isR) B.hasMelee[g.team]=1;
  }
  for(const g of G){
    g.alive=g.cnt;
    if(g.cnt>0){ g.cx=g.sx/g.cnt; g.cz=g.sz/g.cnt; }
    if(!g.cnt){ g.spdNow=0; continue; }
    const st=STT[g.team][g.type];
    if(retarget){
      const e=nearestIn(g.team^1,g.cx,g.cz,Math.hypot(X1-X0,Z1-Z0));
      if(e>=0){ g.nex=PX[e]; g.nez=PZ[e]; g.ned=Math.hypot(g.nex-g.cx,g.nez-g.cz); } else g.ned=1e9;
      let best=null, bd=1e18;
      for(const h of G){ if(h.team===g.team||h.alive<=0) continue; let d=(h.cx-g.cx)**2+(h.cz-g.cz)**2; if(st.cls==='cav'){ const hc=UNITS[h.type].cls; if(hc==='rng'||hc==='sie') d*=0.35; } if(d<bd){ bd=d; best=h; } }
      g.tg=best;
    }
    if(retarget && g.host && (g.host.alive<=0||g.order!==O_ADV)){ if(g.order===O_ADV) attachEscort(g); else g.host=null; }
    if(stall && (g.order===O_HOLD||g.order===O_FLANK)){ g.order=O_ADV; }
    const err=g.fcnt? g.err/g.fcnt : 0;
    let spd=st.speed*0.82; if(err>2.2) spd*=Math.max(0.22,1-(err-2.2)*0.18);
    const mlx=g.slx/g.cnt, mlz=g.slz/g.cnt;
    const ex=g.ax+g.sa*mlx+g.ca*mlz, ez=g.az-g.ca*mlx+g.sa*mlz;
    const lead=Math.hypot(ex-g.cx,ez-g.cz), leash=4+g.rad*0.25;
    const leashMul= lead>leash ? Math.max(0,1-(lead-leash)/4) : 1;
    let mx=0,mz=0,move=false; g.retreat=false;
    const tg=g.tg, h=g.host;
    if(h && h.alive>0 && g.order===O_ADV && g.embed){ g.ax=h.ax; g.az=h.az; g.a=h.a; g.spdNow=h.spdNow; g.ca=h.ca; g.sa=h.sa; continue; }
    if(h && h.alive>0 && g.order===O_ADV){
      // escort: hold station beside the host regiment, moving no faster than it needs to
      const tx=h.ax+h.sa*g.hlx+h.ca*g.hlz, tz=h.az-h.ca*g.hlx+h.sa*g.hlz, dx=tx-g.ax, dz=tz-g.az, d=Math.hypot(dx,dz);
      if(d>0.4){ mx=dx; mz=dz; move=true; spd=Math.min(st.speed,Math.max(h.spdNow*1.1,d*0.9)); g.escort=true; }
    } else if(g.order===O_ADV||g.order===O_CHARGE){
      if(st.isR){
        const rng=st.range*0.85;
        if(g.ned>rng && g.ned<1e8){ const f=flowAt(g.team,g.ax,g.az); if(f[0]||f[1]){ mx=f[0]; mz=f[1]; } else { mx=g.nex-g.ax; mz=g.nez-g.az; } move=true; }
        else if(g.ned<11 && !st.isSiege && B.hasMelee[g.team]){ mx=g.cx-g.nex; mz=g.cz-g.nez; move=true; spd*=0.7; g.retreat=true; }
      } else {
        if(g.ned>7 && g.ned<1e8){ const f=flowAt(g.team,g.ax,g.az); if(f[0]||f[1]){ mx=f[0]; mz=f[1]; } else { mx=g.nex-g.ax; mz=g.nez-g.az; } move=true; }
        else if(tg){ const dx=tg.cx-g.ax, dz=tg.cz-g.az; if(dx*dx+dz*dz>9){ mx=dx; mz=dz; move=true; spd*=0.5; } }
      }
      if(g.order===O_CHARGE && !st.isR) spd=st.speed;
    } else if(g.order===O_FLANK){
      if(g.phase===0 && tg){
        let ux=B.tcx[g.team^1]-B.tcx[g.team], uz=B.tcz[g.team^1]-B.tcz[g.team]; const ul=Math.hypot(ux,uz)||1; ux/=ul; uz/=ul;
        const px=-uz*g.side, pz=ux*g.side;
        const wx=clamp(tg.cx+px*36+ux*6,X0+8,X1-8), wz=clamp(tg.cz+pz*36+uz*6,Z0+8,Z1-8);
        const dx=wx-g.ax, dz=wz-g.az, d=Math.hypot(dx,dz);
        g.tmr+=DT;
        if(d<10||g.tmr>30||g.ned<9||!passAt(wx,wz)) g.phase=1; else { mx=dx; mz=dz; move=true; spd=st.speed*0.85; }
      }
      if(g.phase===1 && tg){ const dx=tg.cx-g.ax, dz=tg.cz-g.az; if(dx*dx+dz*dz>9){ mx=dx; mz=dz; move=true; spd=st.speed*0.9; } }
    }
    const ml=Math.hypot(mx,mz);
    if(move && ml>0){
      mx/=ml; mz/=ml;
      g.mdx+= (mx-g.mdx)*0.15; g.mdz+=(mz-g.mdz)*0.15; const l=Math.hypot(g.mdx,g.mdz)||1;
      const ux=g.mdx/l, uz=g.mdz/l;
      spd*=leashMul;
      let nax=clamp(g.ax+ux*spd*DT,X0+2,X1-2), naz=clamp(g.az+uz*spd*DT,Z0+2,Z1-2);
      if(!passAt(nax,naz) && passAt(g.ax,g.az)){
        const f=flowAt(g.team,g.ax,g.az); const fx=clamp(g.ax+f[0]*spd*DT,X0+2,X1-2), fz=clamp(g.az+f[1]*spd*DT,Z0+2,Z1-2);
        if((f[0]||f[1]) && passAt(fx,fz)){ nax=fx; naz=fz; } else if(passAt(nax,g.az)) naz=g.az; else if(passAt(g.ax,naz)) nax=g.ax; else { nax=g.ax; naz=g.az; }
      }
      g.ax=nax; g.az=naz; g.spdNow=spd;
      if(h && g.escort){ g.escort=false; g.a=turnToward(g.a,h.a,0.6*DT); }
      else if(!g.retreat){ const rate=Math.min(0.7, st.speed*0.9/Math.max(3,g.rad))*(st.cls==='cav'?2:1); g.a=turnToward(g.a,Math.atan2(uz,ux),rate*DT); }
    } else {
      g.spdNow=0;
      if(g.ned<220 && g.order!==O_HOLD){ const rate=Math.min(0.5,st.speed*0.8/Math.max(3,g.rad)); g.a=turnToward(g.a,Math.atan2(g.nez-g.az,g.nex-g.ax),rate*DT); }
    }
    g.ca=Math.cos(g.a); g.sa=Math.sin(g.a);
  }
  for(const g of G){ g.sx=0; g.sz=0; g.slx=0; g.slz=0; g.cnt=0; g.err=0; g.fcnt=0; g.eng=0; }
}

/* ---------- main tick ---------- */
const SEPX=new Float32Array(MAXU), SEPZ=new Float32Array(MAXU);
let stakesChanged=false;
function simTick(){
  tick++; simTime+=DT;
  buildGrids();
  if(tick%20===1){ computeFlow(0); computeFlow(1); }
  updateGroups();
  // buffs from shieldbearers and commanders
  if(tick%5===0){
    for(let i=0;i<N;i++){ if(SS[i]!==1) continue; const u=UNITS[TY[i]];
      if(u.shield) forEachIn(TM[i],PX[i],PZ[i],2.3,j=>{ BS[j]=0.3; });
      if(u.aura && (tick%10===0)){ const r=STT[TM[i]][TY[i]].aura; forEachIn(TM[i],PX[i],PZ[i],r,j=>{ BA[j]=0.6; }); }
    }
  }
  B.active[0]=B.active[1]=0; B.fleeing[0]=B.fleeing[1]=0; B.combat[0]=B.combat[1]=0;
  const morale=B.rules.morale;
  const fwd=(tick&1)===0;
  for(let n=0;n<N;n++){
    const i=fwd?n:N-1-n;
    const s=SS[i];
    OX[i]=PX[i]; OZ[i]=PZ[i];
    if(s===0){ if(DE[i]<1) DE[i]=Math.min(1,DE[i]+DT*1.7); continue; }
    if(s===3) continue;
    const ty=TY[i], tm=TM[i], st=STT[tm][ty], g=G[GR[i]];
    const x=PX[i], z=PZ[i];
    if(CD[i]>0) CD[i]-=DT;
    if(AT[i]>0) AT[i]=Math.max(0,AT[i]-DT*2.4);
    if(FL[i]>0) FL[i]=Math.max(0,FL[i]-DT*5);
    if(BA[i]>0) BA[i]-=DT; if(BS[i]>0) BS[i]-=DT; if(STN[i]>0) STN[i]-=DT;
    const cell=cellIdx(x,z), kind=TER.k[cell];
    let tmul=SPEEDK[kind]; if(st.cls==='cav'){ if(kind===T_FOREST) tmul=0.45; else if(kind===T_STAKES && TER.own[cell]===tm) tmul=0.8; }
    else if(kind===T_STAKES && TER.own[cell]===tm) tmul=0.85;
    if(kind===T_STAKES && TER.own[cell]!==tm && st.cls==='cav'){ CH[i]=0; damage(i,32*DT,-1); if(SS[i]===0) continue; }
    if(tmul<=0) tmul=0.3;
    let dvx=0, dvz=0, faceT=NaN; const spd=st.speed*tmul;
    let tgt=TG[i];
    if(s===2){
      // fleeing toward own edge, away from enemies
      let ax=tm===0?-1:1, az=0, enemyNear=false;
      if(((tick+i)&7)===0) TG[i]=nearestIn(tm^1,x,z,11,false);
      const e=TG[i];
      if(e>=0 && SS[e]===1){ const ex=x-PX[e], ez=z-PZ[e], d=Math.hypot(ex,ez)||1; if(d<11){ ax+=ex/d*1.4; az+=ez/d*1.4; enemyNear=true; } }
      const al=Math.hypot(ax,az)||1; dvx=ax/al*spd*0.9; dvz=az/al*spd*0.9;
      // routed troops only recover beside a commander, and a soldier who has broken twice never returns
      if(BA[i]>0 && RC[i]<2){ MO[i]+=DT*(enemyNear?0.5:8); if(!enemyNear && MO[i]>st.morale*0.45){ SS[i]=1; TG[i]=-1; } }
      if((tm===0&&x<X0+1.6)||(tm===1&&x>X1-1.6)){ SS[i]=3; B.esc[tm]++; B.escT[tm][ty]++; if(B.onEscape) B.onEscape(i); continue; }
      B.fleeing[tm]++;
    } else {
      if(tgt>=0 && SS[tgt]!==1 && SS[tgt]!==2) tgt=-1;
      const rangeE = st.isR ? st.range+Math.max(0,PY[i])*1.2 : 0;
      const near=g.ned < (st.isR?rangeE:st.sense)+22;
      let need=near && ((tick+i)%6)===0;
      if(need && tgt>=0 && ((tick+i)%18)!==0){
        // already striking or shooting a valid target: keep it instead of re-scanning
        const ddx=PX[tgt]-x, ddz=PZ[tgt]-z, d2=ddx*ddx+ddz*ddz;
        if(st.isR){ if(d2<=rangeE*rangeE && d2>=st.minR*st.minR) need=false; }
        else { const reach=st.range+st.r+URAD[TY[tgt]]+0.3; if(d2<=reach*reach) need=false; }
      }
      if(need){
        const sr= st.isR ? rangeE : (g.order===O_HOLD? st.sense+2 : st.sense);
        // triangle inequality on the regiment's nearest-enemy distance (refreshed every 10 ticks):
        // skip the grid scan when no enemy can possibly be inside the search radius
        const dc=Math.sqrt((x-g.cx)*(x-g.cx)+(z-g.cz)*(z-g.cz));
        if(g.ned-dc-8>sr) tgt=-1;
        else tgt=nearestIn(tm^1,x,z,sr,st.isR);
      }
      TG[i]=tgt;
      let follow=true;
      if(tgt>=0){
        const tx=PX[tgt], tz=PZ[tgt], dx=tx-x, dz=tz-z, d=Math.sqrt(dx*dx+dz*dz)||0.001;
        if(st.isR){
          if(d<2.4){
            follow=false; faceT=Math.atan2(dz,dx);
            const reach=st.r+URAD[TY[tgt]]+0.9;
            if(d>reach){ dvx=dx/d*spd; dvz=dz/d*spd; } else if(CD[i]<=0&&STN[i]<=0){ meleeHit(i,tgt,0.35); CD[i]=1.0; }
          } else if(d<=rangeE && d>=st.minR){
            follow=false; faceT=Math.atan2(dz,dx);
            if(CD[i]<=0&&STN[i]<=0){ fire(i,tgt,d); CD[i]=st.cdT*(st.proj===0?0.97+0.06*rnd():0.85+0.3*rnd()); AT[i]=1; }
          }
        } else if(st.heal){
          if(d<1.6){ follow=false; faceT=Math.atan2(dz,dx); if(CD[i]<=0&&STN[i]<=0){ meleeHit(i,tgt,1); CD[i]=st.cdT; } }
          else if(d<4){ follow=false; dvx=-dx/d*spd; dvz=-dz/d*spd; }
        } else {
          const eng= g.order===O_HOLD? st.sense+2 : st.sense;
          let ok=d<=eng;
          if(ok && g.order===O_HOLD && !B.hunt){
            // regiments on Hold stay anchored: only fight enemies close to their own formation slot
            const wx=g.ax+g.sa*SX[i]+g.ca*SZ[i], wz=g.az-g.ca*SX[i]+g.sa*SZ[i], ex=PX[tgt]-wx, ez=PZ[tgt]-wz;
            if(ex*ex+ez*ez>(st.sense*0.6+st.range+1)**2) ok=false;
          }
          if(ok){
            follow=false; g.eng++; faceT=Math.atan2(dz,dx);
            const reach=st.range+st.r+URAD[TY[tgt]];
            if(d>reach){ dvx=dx/d*spd; dvz=dz/d*spd; }
            else { dvx=dx/d*0.3; dvz=dz/d*0.3; if(CD[i]<=0&&STN[i]<=0){ meleeHit(i,tgt,1); CD[i]=st.cdT*(0.85+0.3*rnd()); } }
          }
        }
      }
      if(st.heal && ((tick+i)%10)===0) healAround(i,st);
      if(st.stakes && !FG[i] && simTime>0.6+(i%12)*0.18){
        FG[i]=1; const fx=x+Math.cos(FA[i])*2.6, fz=z+Math.sin(FA[i])*2.6;
        for(const off of [-1.2,1.2]){ const sx=fx+Math.sin(FA[i])*off, sz=fz-Math.cos(FA[i])*off; const k2=kindAt(sx,sz);
          if(k2===T_GRASS||k2===T_SAND||k2===T_ROAD){ const c2=cellIdx(sx,sz); TER.k[c2]=T_STAKES; TER.own[c2]=tm; stakesChanged=true; } }
        AT[i]=1; dustPuff(fx,heightAt(fx,fz),fz,1);
      }
      if(follow && B.hunt){
        follow=false; const f=flowAt(tm,x,z);
        if(f[0]||f[1]){ dvx=f[0]*spd; dvz=f[1]*spd; } else if(g.ned<1e8){ const hx=g.nex-x, hz=g.nez-z, hl=Math.hypot(hx,hz)||1; dvx=hx/hl*spd; dvz=hz/hl*spd; }
      }
      if(follow){
        const wx=g.ax+g.sa*SX[i]+g.ca*SZ[i], wz=g.az-g.ca*SX[i]+g.sa*SZ[i];
        const dx=wx-x, dz=wz-z, d=Math.sqrt(dx*dx+dz*dz);
        g.err+=d; g.fcnt++;
        if(d>0.12){ const v=Math.min(spd,d*1.6+g.spdNow*0.95); dvx=dx/d*v; dvz=dz/d*v; }
        else faceT=g.a+SA[i];
      }
      if(STU[i]>0){ STU[i]-=DT; const f=flowAt(tm,x,z); if(f[0]||f[1]){ const m=Math.max(spd*0.8,Math.hypot(dvx,dvz)); dvx=f[0]*m; dvz=f[1]*m; } }
      // morale
      if(morale && !st.noFlee){
        if(BA[i]>0) MO[i]=Math.min(st.morale,MO[i]+DT*4);
        else if(tgt<0) MO[i]=Math.min(st.morale,MO[i]+DT);
        if(g.alive<g.n0*0.3) MO[i]-=DT*1.5;
        if(B.armyLoss[tm]>0.6) MO[i]-=DT;
        if(MO[i]<st.morale*0.12){ SS[i]=2; TG[i]=-1; RC[i]++; }
      }
      B.active[tm]++;
    }
    // integrate
    const acc=st.cls==='cav'?3.5:(st.isSiege?3:9), k=Math.min(1,acc*DT);
    VX[i]+=(dvx-VX[i])*k; VZ[i]+=(dvz-VZ[i])*k;
    let nx=x+VX[i]*DT, nz=z+VZ[i]*DT;
    const fleeing=SS[i]===2;
    if(!passAt(nx,z)){ if(!(fleeing && (nx<X0+1||nx>X1-1))){ nx=x; VX[i]*=-0.2; } }
    if(!passAt(nx,nz)){ if(!(fleeing && (nx<X0+1||nx>X1-1))){ nz=z; VZ[i]*=-0.2; } }
    PX[i]=nx; PZ[i]=nz;
    const want=dvx*dvx+dvz*dvz;
    if(want>0.25){ const mv2=(nx-x)*(nx-x)+(nz-z)*(nz-z); if(mv2<want*DT*DT*0.06){ STK[i]+=DT; if(STK[i]>0.7){ STU[i]=2.5; STK[i]=0; } } else STK[i]=Math.max(0,STK[i]-DT); }
    const sp2=VX[i]*VX[i]+VZ[i]*VZ[i];
    if(st.cls==='cav'){
      if(sp2>(st.speed*0.65)**2 && kind!==T_FOREST) CH[i]=Math.min(1,CH[i]+DT*1.3); else CH[i]=Math.max(0,CH[i]-DT*0.5);
      if(sp2>16 && ((tick+i)&7)===0) dustPuff(nx,heightAt(nx,nz),nz,0);
    } else if(TER.theme==='desert' && sp2>4 && ((tick+i)&31)===0) dustPuff(nx,heightAt(nx,nz),nz,0);
    if(faceT!==faceT && sp2>0.3) faceT=Math.atan2(VZ[i],VX[i]);
    if(faceT===faceT) FA[i]=turnToward(FA[i],faceT,(st.cls==='cav'?4:7)*DT);
    if(nx!==x||nz!==z) PY[i]=heightAt(nx,nz);
    if(SS[i]===1){ g.sx+=nx; g.sz+=nz; g.slx+=SX[i]; g.slz+=SZ[i]; g.cnt++; if(!st.isSiege && !st.heal && !st.stakes) B.combat[tm]++; }
  }
  separation();
  updateProjectiles();
  for(let t=0;t<2;t++){
    B.armyLoss[t]= B.start[t]? 1-(B.active[t]+B.fleeing[t])/B.start[t] : 0;
    // crews and medics abandon the field once no fighting troops remain
    if(B.combat[t]===0 && B.active[t]>0 && !B.noRout) breakArmy(t);
  }
}

// the whole army routes for good: no rallies, the battle ends once the field clears of fighters
function breakArmy(t){ B.broken[t]=true; for(let i=0;i<N;i++) if(TM[i]===t && SS[i]===1){ SS[i]=2; TG[i]=-1; MO[i]=0; RC[i]=9; } }
function separation(){
  SEPX.fill(0,0,N); SEPZ.fill(0,0,N);
  // walk units in cell order; neighbours come from the cell-sorted copies built in buildGrids
  for(let c=0;c<CGN;c++){
    const k0=cStart[c], k1=cStart[c+1]; if(k0===k1) continue;
    const cx=c%CGW, cz=(c/CGW)|0;
    const gz0=cz>0?cz-1:0, gz1=cz<CGH-1?cz+1:cz, gx0=cx>0?cx-1:0, gx1=cx<CGW-1?cx+1:cx;
    for(let ki=k0;ki<k1;ki++){
      const i=cIdx[ki];
      // near the fighting every other tick, elsewhere every fourth (the push is scaled to match)
      if(((tick+i)&(G[GR[i]].ned>45?3:1))!==0) continue;
      const x=SPX[ki], z=SPZ[ki], ri=SRAD[ki], mi=SMAS[ki];
      let fx=0, fz=0;
      for(let gz=gz0;gz<=gz1;gz++){
        const row=gz*CGW, ka=cStart[row+gx0], kb=cStart[row+gx1+1];
        for(let k=ka;k<kb;k++){
          if(k===ki) continue;
          const dx=x-SPX[k], dz=z-SPZ[k], rr=ri+SRAD[k], d2=dx*dx+dz*dz;
          if(d2<rr*rr){
            if(d2>1e-6){ const d=Math.sqrt(d2), mj=SMAS[k], w=(rr-d)*mj/(mi+mj)/d; fx+=dx*w; fz+=dz*w; }
            else { fx+=(ki>k?0.05:-0.05); fz+=(ki>k?0.03:-0.03); }
          }
        }
      }
      SEPX[i]=fx*0.8; SEPZ[i]=fz*0.8;
    }
  }
  for(let i=0;i<N;i++){
    let fx=SEPX[i], fz=SEPZ[i]; if(fx===0&&fz===0) continue;
    const l=Math.hypot(fx,fz); if(l>0.42){ fx*=0.42/l; fz*=0.42/l; }
    const nx=PX[i]+fx, nz=PZ[i]+fz;
    if(passAt(nx,PZ[i])) PX[i]=nx; if(passAt(PX[i],nz)) PZ[i]=nz;
  }
}

/* ---------- projectiles ---------- */
const PF=()=>new Float32Array(MAXP);
const PSX=PF(),PSZ=PF(),PRX=PF(),PRY=PF(),PRZ=PF(),POX=PF(),POY=PF(),POZ=PF(),PRVX=PF(),PRVY=PF(),PRVZ=PF(),PRD=PF(),PRA=PF(),PRN=PF();
const PRK=new Uint8Array(MAXP), PRT=new Uint8Array(MAXP), PRL=new Uint8Array(MAXP), PRP=new Uint8Array(MAXP), PRB=new Uint8Array(MAXP);
const PRO=new Int32Array(MAXP), PRH=new Int32Array(MAXP);
const pFree=new Int32Array(MAXP); let pTop=0, pHigh=0;
function clearProjectiles(){ PRL.fill(0); pTop=0; for(let p=MAXP-1;p>=0;p--) pFree[pTop++]=p; pHigh=0; }
clearProjectiles();
function spawnProj(k,tm,x,y,z,vx,vy,vz,dmg,own,aoe,pen,pierce){
  if(pTop===0) return -1;
  const p=pFree[--pTop]; if(p>=pHigh) pHigh=p+1;
  PRX[p]=POX[p]=PSX[p]=x; PSZ[p]=z; PRY[p]=POY[p]=y; PRZ[p]=POZ[p]=z; PRVX[p]=vx; PRVY[p]=vy; PRVZ[p]=vz; PRD[p]=dmg; PRA[p]=aoe; PRN[p]=pen;
  PRK[p]=k; PRT[p]=tm; PRL[p]=1; PRP[p]=pierce; PRB[p]=0; PRO[p]=own; PRH[p]=-1; return p;
}
function freeProj(p){ PRL[p]=0; pFree[pTop++]=p; }
function fire(i,t,d){
  const st=STT[TM[i]][TY[i]], k=st.proj;
  let T;
  switch(k){ case 0:T=d/22+0.6;break; case 1:T=d/38+0.25;break; case 2:T=d/85;break; case 3:T=d/20+1.4;break; case 4:T=d/55;break; case 5:T=(d*0.75)/42;break; default:T=3.0+d/60; }
  let tx=PX[t]+VX[t]*T, tz=PZ[t]+VZ[t]*T;
  let sig=st.acc*d*(B.rules.rain?1.6:1); if(TER.k[cellIdx(tx,tz)]===T_FOREST) sig*=1.5;
  tx+=gauss()*sig; tz+=gauss()*sig;
  const x0=PX[i], z0=PZ[i], y0=PY[i]+(st.isSiege?1.6:1.4);
  let ty=heightAt(tx,tz)+((k===2||k===4)?0.9:0);
  if(k===5){ tx=x0+(tx-x0)*0.72; tz=z0+(tz-z0)*0.72; ty=heightAt(tx,tz); }
  const vx=(tx-x0)/T, vz=(tz-z0)/T, vy=(ty-y0)/T+0.5*GRAV*T;
  sfx(EV_FIRE+k,x0,y0,z0);
  spawnProj(k,TM[i],x0,y0,z0,vx,vy,vz,st.dmg*(BA[i]>0?1.15:1),i,st.aoe||0,k>=3?0.3:st.pen,st.pierce||1);
  const fx=Math.cos(FA[i]), fz=Math.sin(FA[i]);
  if(k===2){ spawnQ(x0+fx*0.9,y0,z0+fz*0.9,0,0,0,0.09,0.45,4,1,0.8,0.4,0.95,0); smokePuff(x0+fx*1.1,y0,z0+fz*1.1,1,0.5); }
  else if(k===5){ spawnQ(x0+fx*1.6,y0,z0+fz*1.6,0,0,0,0.12,1.1,8,1,0.75,0.35,0.95,0); smokePuff(x0+fx*1.8,y0,z0+fz*1.8,4,0.9); }
  else if(k===6){ smokePuff(x0,y0+0.8,z0,2,0.7); }
}
function midHit(p){
  const x=PRX[p], z=PRZ[p], y=PRY[p], tm=PRT[p];
  let cx=((x-X0)/CCS)|0, cz=((z-Z0)/CCS)|0; if(cx<1||cz<1||cx>=CGW-1||cz>=CGH-1) return false;
  for(let gz=cz-1;gz<=cz+1;gz++) for(let gx=cx-1;gx<=cx+1;gx++){ const c=gz*CGW+gx;
    for(let k=cStart[c],e=cStart[c+1];k<e;k++){ const j=cIdx[k]; if(TM[j]===tm||j===PRH[p]) continue; const s=SS[j]; if(s!==1&&s!==2) continue;
      const dx=PX[j]-x, dz=PZ[j]-z, rr=URAD[TY[j]]+0.3; if(dx*dx+dz*dz>rr*rr) continue; if(y<PY[j]-0.3||y>PY[j]+2.5) continue;
      projHit(p,j); PRH[p]=j;
      const kind=PRK[p];
      if(kind===2){ freeProj(p); return true; }
      if(kind===5){ const vl=Math.hypot(PRVX[p],PRVZ[p])||1; knock(j,PRVX[p]/vl*1.2/Math.sqrt(UMASS[TY[j]]),PRVZ[p]/vl*1.2/Math.sqrt(UMASS[TY[j]])); }
      PRD[p]*= kind===5?0.85:0.8; if(PRP[p]>0) PRP[p]--; if(PRP[p]===0){ freeProj(p); return true; }
      return false;
    } }
  return false;
}
function coverAt(x,z,dx,dz){ for(let s=1.2;s<=3.7;s+=1.25){ if(kindAt(x+dx*s,z+dz*s)===T_WALL) return true; } return false; }
function projHit(p,j){
  const b=STT[TM[j]][TY[j]], k=PRK[p];
  const vx=PRVX[p], vz=PRVZ[p], vl=Math.hypot(vx,vz)||1;
  const front=(Math.cos(FA[j])*(-vx)+Math.sin(FA[j])*(-vz))/vl;
  if(k<=2||k===4){
    if(b.shield && front>0.2 && rnd()<B.shieldBlock[TM[j]]){ spark(PX[j],PY[j]+1,PZ[j]); sfx(EV_BLOCK,PX[j],PY[j],PZ[j]); return; }
    if(BS[j]>0 && front>0.2 && rnd()<B.adjBlock[TM[j]]){ spark(PX[j],PY[j]+1,PZ[j]); sfx(EV_BLOCK,PX[j],PY[j],PZ[j]); return; }
    if(k<=1 && TER.k[cellIdx(PX[j],PZ[j])]===T_FOREST && rnd()<0.35) return;
    if(coverAt(PX[j],PZ[j],-vx/vl,-vz/vl) && rnd()<0.75){ spark(PX[j]-vx/vl*1.2,PY[j]+1.5,PZ[j]-vz/vl*1.2); sfx(EV_BLOCK,PX[j],PY[j],PZ[j]); return; }
  }
  let dmg=PRD[p]*(0.85+0.3*rnd());
  let arm=b.armor+(BS[j]>0?B.shieldArm[TM[j]]:0); arm*=1-PRN[p];
  dmg*=12/(12+Math.max(0,arm));
  if(SS[j]===2) dmg*=1.5;
  if(B.rules.morale && !b.noFlee) MO[j]-=2;
  sfx(EV_STRUCK,PX[j],PY[j],PZ[j]);
  damage(j,dmg,PRO[p]);
}
function arrowLand(p){
  const x=PRX[p], z=PRZ[p], tm=PRT[p];
  let cx=((x-X0)/CCS)|0, cz=((z-Z0)/CCS)|0; if(cx<1||cz<1||cx>=CGW-1||cz>=CGH-1) return;
  let best=-1, bd=Infinity;
  for(let gz=cz-1;gz<=cz+1;gz++) for(let gx=cx-1;gx<=cx+1;gx++){ const c=gz*CGW+gx;
    for(let k=cStart[c],e=cStart[c+1];k<e;k++){ const j=cIdx[k]; if(TM[j]===tm) continue; const s=SS[j]; if(s!==1&&s!==2) continue;
      const dx=PX[j]-x, dz=PZ[j]-z, rr=URAD[TY[j]]+0.35, d2=dx*dx+dz*dz; if(d2<rr*rr && d2<bd){ bd=d2; best=j; } } }
  if(best>=0) projHit(p,best); else if(rnd()<0.25) spawnQ(x,heightAt(x,z)+0.05,z,0,0.3,0,0.7,0.25,0.6,0.6,0.55,0.45,0.3,2);
}
function explode(p){
  const x=PRX[p], z=PRZ[p], r=PRA[p], tm=PRT[p], dmg=PRD[p], y=heightAt(x,z);
  const x0=Math.max(0,((x-r-X0)/CCS)|0), x1=Math.min(CGW-1,((x+r-X0)/CCS)|0), z0=Math.max(0,((z-r-Z0)/CCS)|0), z1=Math.min(CGH-1,((z+r-Z0)/CCS)|0);
  for(let gz=z0;gz<=z1;gz++) for(let gx=x0;gx<=x1;gx++){ const c=gz*CGW+gx;
    for(let k=cStart[c],e=cStart[c+1];k<e;k++){ const j=cIdx[k]; if(TM[j]===tm) continue; const s=SS[j]; if(s!==1&&s!==2) continue;
      const dx=PX[j]-x, dz=PZ[j]-z, d=Math.sqrt(dx*dx+dz*dz); if(d>r) continue;
      const f=1-d/r*0.6, b=STT[TM[j]][TY[j]];
      const kn=(1-d/r)*1.6/Math.sqrt(b.mass), dl=d||1;
      if(B.rules.morale && !b.noFlee) MO[j]-=8;
      STN[j]=0.4; knock(j,dx/dl*kn,dz/dl*kn);
      damage(j,dmg*f*(12/(12+b.armor*0.7)),PRO[p]);
    } }
  // effects
  sfx(PRK[p]===3?EV_IMPACT:EV_BOOM,x,y,z);
  spawnQ(x,y+0.6,z,0,0,0,0.16,r*0.8,r*4,1,0.7,0.3,0.95,0);
  smokePuff(x,y+0.3,z,5,1.1);
  dustPuff(x,y,z,3);
  const col=TER.theme==='desert'?[0.72,0.62,0.42]:[0.38,0.32,0.22];
  for(let n=0;n<7;n++) spawnQ(x,y+0.3,z,(rnd()-.5)*8,4+rnd()*5,(rnd()-.5)*8,1.4,0.18,0,col[0],col[1],col[2],1,5);
}
function updateProjectiles(){
  for(let p=0;p<pHigh;p++){
    if(!PRL[p]) continue;
    POX[p]=PRX[p]; POY[p]=PRY[p]; POZ[p]=PRZ[p];
    const k=PRK[p];
    PRVY[p]-=GRAV*DT;
    const flat=(k===2||k===4||k===5);
    const steps=flat?Math.max(1,Math.ceil(Math.hypot(PRVX[p],PRVZ[p])*DT/0.8)):1, sdt=DT/steps;
    for(let s=0;s<steps;s++){
      PRX[p]+=PRVX[p]*sdt; PRY[p]+=PRVY[p]*sdt; PRZ[p]+=PRVZ[p]*sdt;
      const x=PRX[p], z=PRZ[p];
      if(x<X0||x>X1||z<Z0||z>Z1||PRY[p]<-20){ freeProj(p); break; }
      const gh=heightAt(x,z);
      if(flat && PRY[p]-gh<2.6){ if(midHit(p)) break; if(!PRL[p]) break; }
      // walls stop low missiles, except within a few metres of the shooter (firing over the parapet)
      if(k<=2 && kindAt(x,z)===T_WALL && PRY[p]-gh<2.8 && (x-PSX[p])*(x-PSX[p])+(z-PSZ[p])*(z-PSZ[p])>25){ spark(x,PRY[p],z); sfx(EV_BLOCK,x,PRY[p],z); freeProj(p); break; }
      if(PRY[p]<=gh){
        if(k===5 && PRB[p]<3){ PRY[p]=gh+0.01; PRVY[p]=Math.abs(PRVY[p])*0.42; PRVX[p]*=0.72; PRVZ[p]*=0.72; PRB[p]++; dustPuff(x,gh,z,1); sfx(EV_BOUNCE,x,gh,z); if(Math.hypot(PRVX[p],PRVZ[p])<3){ freeProj(p); break; } }
        else if(k===3||k===6){ explode(p); freeProj(p); break; }
        else if(k<=1){ arrowLand(p); freeProj(p); break; }
        else { if(rnd()<0.5) dustPuff(x,gh,z,0); freeProj(p); break; }
      }
    }
  }
}

/* ---------- particles (visual only) ---------- */
const QF=()=>new Float32Array(MAXQ);
const QX=QF(),QY=QF(),QZ=QF(),QVX=QF(),QVY=QF(),QVZ=QF(),QL=QF(),QM=QF(),QS=QF(),QG=QF(),QR=QF(),QGc=QF(),QB=QF(),QA=QF();
const QK=new Uint8Array(MAXQ); let qHead=0;
// flags: 1 gravity, 2 drag, 4 stop on ground
function spawnQ(x,y,z,vx,vy,vz,life,size,grow,r,g,b,a,flags){
  const q=qHead; qHead=(qHead+1)%MAXQ;
  QX[q]=x;QY[q]=y;QZ[q]=z;QVX[q]=vx;QVY[q]=vy;QVZ[q]=vz;QL[q]=life;QM[q]=life;QS[q]=size;QG[q]=grow;QR[q]=r;QGc[q]=g;QB[q]=b;QA[q]=a;QK[q]=flags;
}
function spark(x,y,z){ for(let n=0;n<2;n++) spawnQ(x,y,z,(rnd()-.5)*4,1+rnd()*3,(rnd()-.5)*4,0.28,0.11,0,1,0.86,0.5,1,1); }
function dustPuff(x,y,z,big){
  const d=TER.theme==='desert'; const n=big?2+big*2:1;
  for(let k=0;k<n;k++) spawnQ(x+(rnd()-.5)*big,y+0.2,z+(rnd()-.5)*big,(rnd()-.5)*0.8,0.4+rnd()*0.5,(rnd()-.5)*0.8,1.4+rnd()*0.8,0.5+big*0.3,0.9+big*0.4,d?0.82:0.6,d?0.72:0.54,d?0.52:0.42,d?0.4:0.32,2);
}
function smokePuff(x,y,z,n,s){ for(let k=0;k<n;k++) spawnQ(x+(rnd()-.5)*s,y+(rnd())*s*0.5,z+(rnd()-.5)*s,(rnd()-.5)*0.6,0.5+rnd()*0.5,(rnd()-.5)*0.6,2.5+rnd()*1.5,0.5*s+0.3,1.1*s,0.86,0.86,0.83,0.55,2); }
function updateParticles(dt){
  if(dt<=0) return;
  const drag=Math.max(0,1-1.6*dt);
  for(let q=0;q<MAXQ;q++){
    if(QL[q]<=0) continue;
    QL[q]-=dt; const f=QK[q];
    if(f&1) QVY[q]-=9.8*0.7*dt;
    if(f&2){ QVX[q]*=drag; QVY[q]*=drag; QVZ[q]*=drag; }
    QX[q]+=QVX[q]*dt; QY[q]+=QVY[q]*dt; QZ[q]+=QVZ[q]*dt; QS[q]+=QG[q]*dt;
    if(f&4){ const h=heightAt(QX[q],QZ[q])+0.05; if(QY[q]<h){ QY[q]=h; QVX[q]=QVY[q]=QVZ[q]=0; } }
  }
}
