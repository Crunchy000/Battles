/* ================= SOUND ================= */
// Every sound is a recording (see sounds/manifest.json for sources and licences), embedded in the page
// as MP3 and decoded when audio first unlocks. One-shots are placed by distance and screen side relative
// to the camera and rate-limited per kind, so the loudest nearby events play first; continuous beds
// (melee roar and marching, both mixed from the recordings, and a wind loop) follow how much is
// happening near the camera.
const AUD={ctx:null,on:true,vol:0.8,amb:0.7,ready:false,building:false,voices:0,MAXV:32,
  B:{}, bus:{}, beds:{}, tok:new Float32Array(EV_N), cand:[], din:0, march:0, sampleT:0,
  volley:0, volleyPan:0, volleyW:0, volleyT:0, lastPlace:0, L:[0,0,0]};
const AUD_KEY='massive-armies-audio';
function audLoadPrefs(){ try{ const p=JSON.parse(localStorage.getItem(AUD_KEY)||'null'); if(p){ AUD.on=p.on!==false; if(p.vol>=0&&p.vol<=1) AUD.vol=+p.vol; if(p.amb>=0&&p.amb<=1) AUD.amb=+p.amb; } }catch(e){} }
function audSavePrefs(){ try{ localStorage.setItem(AUD_KEY,JSON.stringify({on:AUD.on,vol:AUD.vol,amb:AUD.amb})); }catch(e){} }
const AR=Math.random;

function toBuf(chs,peak){ const c=AUD.ctx; let m=0; for(const d of chs) for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>m) m=a; }
  const s=m>0?(peak||0.9)/m:1, b=c.createBuffer(chs.length,chs[0].length,c.sampleRate);
  chs.forEach((d,k)=>{ for(let i=0;i<d.length;i++) d[i]*=s; b.copyToChannel(d,k); }); return b; }
// add `src` into `dst` at sample `at`, wrapping round the end (for seamless loops)
function mixWrap(dst,src,at,g){ const n=dst.length; for(let i=0;i<src.length;i++) dst[(at+i)%n]+=src[i]*g; }
// the room: a short decaying wash that the reverb send plays distant sounds through
function impulseResponse(SR){ const n=(2.4*SR)|0, out=[], a=1-Math.exp(-2*Math.PI*2600/SR), k=Math.exp(-1/(0.55*SR));
  for(let ch=0;ch<2;ch++){ const d=new Float32Array(n); let y=0, e=1; for(let i=0;i<n;i++){ y+=a*((AR()*2-1)-y); d[i]=y*e*(i<SR*0.01?i/(SR*0.01):1); e*=k; } out.push(d); }
  return toBuf(out,0.5); }

/* ---------- engine ---------- */
function audBuild(){
  const c=AUD.ctx, SR=c.sampleRate;
  const master=c.createGain(); master.gain.value=AUD.on?AUD.vol:0;
  const comp=c.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=12; comp.ratio.value=5; comp.attack.value=0.004; comp.release.value=0.25;
  master.connect(comp); comp.connect(c.destination);
  const mk=(g,to)=>{ const n=c.createGain(); n.gain.value=g; n.connect(to||master); return n; };
  AUD.bus={master, sfx:mk(0.9), amb:mk(AUD.amb), ui:mk(0.45), mus:mk(0.75)};
  setTimeout(()=>{ try{ const rv=c.createConvolver(); rv.buffer=impulseResponse(SR); const g=mk(0.42); rv.connect(g); AUD.bus.wet=rv; }catch(e){}
    AUD.ready=true; audLoadSamples(); },0);
}
function audUnlock(){
  if(!AUD.on) return;
  if(!AUD.ctx){ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; try{ AUD.ctx=new AC({latencyHint:'interactive'}); }catch(e){ return; } AUD.building=true; audBuild(); }
  if(AUD.ctx.state==='suspended') AUD.ctx.resume().catch(()=>{});
}
['pointerdown','keydown','touchend'].forEach(t=>window.addEventListener(t,audUnlock,{capture:true,passive:true}));
document.addEventListener('visibilitychange',()=>{ if(!AUD.ctx) return; if(document.hidden) AUD.ctx.suspend().catch(()=>{}); else if(AUD.on) AUD.ctx.resume().catch(()=>{}); });
function audSetOn(on){ AUD.on=on; audSavePrefs(); if(on) audUnlock(); if(AUD.ctx&&AUD.bus.master){ const g=AUD.bus.master.gain, t=AUD.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(on?AUD.vol:0,t,0.05); if(!on) setTimeout(()=>{ if(!AUD.on&&AUD.ctx) AUD.ctx.suspend().catch(()=>{}); },400); } }
function audSetVol(v){ AUD.vol=v; audSavePrefs(); if(AUD.ctx&&AUD.bus.master&&AUD.on) AUD.bus.master.gain.setTargetAtTime(v,AUD.ctx.currentTime,0.03); }
function audSetAmb(v){ AUD.amb=v; audSavePrefs(); if(AUD.ctx&&AUD.bus.amb) AUD.bus.amb.gain.setTargetAtTime(v,AUD.ctx.currentTime,0.05); }
const audLive=()=>AUD.ready&&AUD.on&&AUD.ctx.state==='running';

// decode the embedded recordings; the beds are mixed once everything they need has arrived
function audLoadSamples(){ if(typeof SFX_DATA==='undefined') return; const c=AUD.ctx; let pending=Object.keys(SFX_DATA.files).length;
  const done=()=>{ if(--pending===0) audBuildBeds(); };
  for(const [k,list] of Object.entries(SFX_DATA.files)){ const out=[]; let left=list.length;
    const fin=()=>{ if(--left===0){ if(out.length) AUD.B[k]=out; done(); } };
    for(const b64 of list){ const bin=atob(b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
      try{ c.decodeAudioData(u.buffer,buf=>{ out.push(toBuf([buf.getChannelData(0).slice()],0.9*(SFX_DATA.gain[k]||1))); fin(); },fin); }catch(e){ fin(); } } } }
// melee roar: a few seconds of distant clashes, blows and blocks; marching: many feet out of step; wind: the recorded loop
function audBuildBeds(){
  const c=AUD.ctx, SR=c.sampleRate, B=AUD.B, ch=b=>b.getChannelData(0), pick=l=>ch(l[(AR()*l.length)|0]);
  const beds={};
  if(B.clang&&B.punch&&B.wood){ const n=4*SR, L=new Float32Array(n), R=new Float32Array(n);
    for(let k=0;k<70;k++){ const r=AR(), src=pick(r<0.6?B.clang:r<0.8?B.wood:B.punch), at=(AR()*n)|0, g=0.08+AR()*0.18, p=AR(); mixWrap(L,src,at,g*(1-p*0.6)); mixWrap(R,src,at,g*(0.4+p*0.6)); }
    beds.din=toBuf([L,R],0.5); }
  if(B.step){ const n=(2.4*SR)|0, L=new Float32Array(n), R=new Float32Array(n);
    for(let k=0;k<48;k++){ const src=pick(B.step), at=(((k%2)*0.6+AR()*0.6)*SR+((k/2|0)%2)*1.2*SR)|0, g=0.25+AR()*0.4, p=AR(); mixWrap(L,src,at,g*(1-p*0.6)); mixWrap(R,src,at,g*(0.4+p*0.6)); }
    beds.march=toBuf([L,R],0.5); }
  if(B.wind) beds.wind=B.wind[0];
  for(const [k,buf] of Object.entries(beds)){
    const s=c.createBufferSource(); s.buffer=buf; s.loop=true; const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=4000; const g=c.createGain(); g.gain.value=0;
    s.connect(f); f.connect(g); g.connect(AUD.bus.amb); s.start(c.currentTime+AR()*0.1); AUD.beds[k]={s,f,g,buf}; }
}

// play one buffer: gain, stereo pan, playback rate, low-pass cutoff (distance muffling), reverb send, delay, bus
function audPlay(list,g,pan,rate,lp,wet,delay,bus){
  if(!audLive()||!list||AUD.voices>=AUD.MAXV||g<0.004) return;
  const c=AUD.ctx, s=c.createBufferSource(); s.buffer=list[(AR()*list.length)|0]; s.playbackRate.value=rate||1;
  let node=s; const nodes=[s];
  if(lp && lp<15000){ const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=lp; node.connect(f); node=f; nodes.push(f); }
  const gn=c.createGain(); gn.gain.value=g; node.connect(gn); nodes.push(gn);
  let out=gn; if(pan){ const p=c.createStereoPanner(); p.pan.value=clamp(pan,-1,1); gn.connect(p); out=p; nodes.push(p); }
  out.connect(bus||AUD.bus.sfx);
  if(wet>0&&AUD.bus.wet){ const w=c.createGain(); w.gain.value=wet; gn.connect(w); w.connect(AUD.bus.wet); nodes.push(w); }
  AUD.voices++; s.onended=()=>{ AUD.voices--; for(const n of nodes) n.disconnect(); };
  s.start(c.currentTime+(delay||0)); return s;
}
const audUi=(name,g)=>audPlay(AUD.B[name],g,0,1,0,0,0,AUD.bus.ui);
const audMusic=(name,g,delay)=>audPlay(AUD.B[name],g,0,1,0,0.25,delay||0,AUD.bus.mus);

/* ---------- per-kind tuning: [rate/s, burst, base gain, buffer, pitch spread] ---------- */
const EVK=[];
EVK[EV_HIT]=[7,2,0.42]; EVK[EV_KILL]=[3,1,0.5]; EVK[EV_BLOCK]=[3,1,0.32]; EVK[EV_CHARGE]=[3,2,0.85]; EVK[EV_BRACE]=[2,1,0.8];
EVK[EV_FIRE+0]=[0,0,0]; EVK[EV_FIRE+1]=[3,2,0.38,'xbow']; EVK[EV_FIRE+2]=[8,3,0.62,'musket']; EVK[EV_FIRE+3]=[2,1,0.7,'launch'];
EVK[EV_FIRE+4]=[2,1,0.6,'ballista']; EVK[EV_FIRE+5]=[3,2,1.0,'cannon']; EVK[EV_FIRE+6]=[3,2,0.55,'cannon'];
EVK[EV_IMPACT]=[3,1,0.8,'impact']; EVK[EV_BOOM]=[3,1,0.95,'blast']; EVK[EV_BOUNCE]=[2,1,0.5,'thud']; EVK[EV_STRUCK]=[4,2,0.34,'struck'];
const AUD_R=30;
function audW(x,y,z){ const L=AUD.L, dx=x-L[0], dy=y-L[1], dz=z-L[2], d2=dx*dx+dy*dy+dz*dz; return 1/(1+d2/(AUD_R*AUD_R)); }
function audPan(x,z){ const L=AUD.L, dx=x-L[0], dz=z-L[2], d=Math.sqrt(dx*dx+dz*dz)+6; return clamp((dx*CAM.right[0]+dz*CAM.right[2])/d,-1,1)*0.85; }
// one sound per event, at its natural pitch
function audVoice(t,w,pan,delay){
  const k=EVK[t], g=k[2]*Math.pow(w,0.8), lp=1100+15000*Math.pow(w,1.4), wet=0.08+0.45*(1-w), B=AUD.B;
  const buf= t===EV_HIT||t===EV_BRACE ? B.clang : t===EV_BLOCK ? B.wood : t===EV_KILL ? B.punch : t===EV_CHARGE||t===EV_IMPACT||t===EV_BOUNCE ? B.thud :
    t===EV_FIRE+3||t===EV_FIRE+4 ? B.woodH : B[k[3]];
  audPlay(buf,g,pan,1,lp,wet,delay);
}
function audioFrame(dt,phase,speed){
  const n=evN; evN=0; evSeen=0;
  if(!audLive()) return;
  const c=AUD.ctx, now=c.currentTime;
  // listener sits between the camera and the point it looks at, so zooming in brings the fight closer
  const L=AUD.L, e=CAM.eye; L[0]=CAM.tx+(e[0]-CAM.tx)*0.25; L[1]=CAM.ty+(e[1]-CAM.ty)*0.25; L[2]=CAM.tz+(e[2]-CAM.tz)*0.25;
  for(let t=0;t<EV_N;t++){ const k=EVK[t]; if(k) AUD.tok[t]=Math.min(k[1],AUD.tok[t]+k[0]*dt); }
  // keep the three most audible events of each kind this frame
  const cand=AUD.cand; for(let t=0;t<EV_N;t++){ if(!cand[t]) cand[t]=[]; cand[t].length=0; }
  let melee=0, meleeW2=0;
  for(let i=0;i<n;i++){
    const t=EVT[i], w=audW(EVX[i],EVY[i],EVZ[i]);
    if(t===EV_HIT||t===EV_KILL||t===EV_CHARGE){ melee+=w; meleeW2+=w*w; }
    if(t===EV_FIRE){ AUD.volley+=w; AUD.volleyW+=w*w; AUD.volleyPan+=w*audPan(EVX[i],EVZ[i]); continue; }
    if(w<0.015) continue;
    const cl=cand[t];
    if(cl.length<2){ cl.push(i); cl.sort((a,b)=>audW(EVX[b],EVY[b],EVZ[b])-audW(EVX[a],EVY[a],EVZ[a])); }
    else if(w>audW(EVX[cl[1]],EVY[cl[1]],EVZ[cl[1]])){ cl[1]=i; cl.sort((a,b)=>audW(EVX[b],EVY[b],EVZ[b])-audW(EVX[a],EVY[a],EVZ[a])); }
  }
  for(let t=0;t<EV_N;t++){ const cl=cand[t];
    for(let j=0;j<cl.length&&AUD.tok[t]>=1;j++){ const i=cl[j]; AUD.tok[t]-=1; const w=audW(EVX[i],EVY[i],EVZ[i]);
      audVoice(t,w,audPan(EVX[i],EVZ[i]), t===EV_FIRE+2? AR()*0.07 : AR()*0.02); } }
  // arrow volleys: many bows loosing together become one swelling whoosh
  AUD.volleyT-=dt;
  if(AUD.volley>0.04 && AUD.volleyT<=0){ const v=AUD.volley, w=AUD.volleyW/v;
    audPlay(AUD.B.whoosh,clamp(0.12+0.3*Math.sqrt(v),0,0.75),AUD.volleyPan/v,1,1500+14000*Math.pow(w,1.2),0.1+0.4*(1-w));
    AUD.volley=0; AUD.volleyW=0; AUD.volleyPan=0; AUD.volleyT=0.6; }
  else if(AUD.volleyT<=-1){ AUD.volley*=0.5; AUD.volleyW*=0.5; AUD.volleyPan*=0.5; }
  // continuous beds
  const active=phase==='battle'||phase==='result';
  const rate=dt>0?melee/dt:0; AUD.din+=(rate-AUD.din)*Math.min(1,dt*2.5);
  const dinW=melee>0?meleeW2/melee:0;
  AUD.sampleT-=dt;
  if(AUD.sampleT<=0){ AUD.sampleT=0.2; let mw=0;
    if(active && speed>0) for(let i=0;i<N;i++){ if(SS[i]!==1&&SS[i]!==2) continue; const v2=VX[i]*VX[i]+VZ[i]*VZ[i]; if(v2<0.8) continue; const cls=UNITS[TY[i]].cls;
      if(cls!=='sie') mw+=audW(PX[i],PY[i],PZ[i])*(cls==='cav'?2:1); }
    AUD.march=1-Math.exp(-mw/10); }
  const set=(bed,g,f)=>{ const b=AUD.beds[bed]; if(!b) return; b.g.gain.setTargetAtTime(g,now,0.3); if(f) b.f.frequency.setTargetAtTime(f,now,0.3); };
  const on=active&&speed>0;
  const dinL=on?1-Math.exp(-AUD.din/18):0;
  set('din',dinL*0.45,700+9000*Math.min(1,dinW*1.6+0.08));
  set('march',on?AUD.march*0.4:0,1500+6000*AUD.march);
  const zoomOut=clamp((CAM.dist-30)/280,0,1);
  set('wind',0.07+0.2*zoomOut,500+700*zoomOut);
}
// battle cues
function audBattleStart(){ if(!audLive()) return; audMusic('drum',0.75,0); }
function audWave(){ if(!audLive()) return; audMusic('hornWave',0.5,0); }
function audEnd(win){ if(!audLive()) return; audMusic(win?'fanfare':'hornDefeat',0.7,0.1); }
function audPlace(erase){ const t=performance.now(); if(t-AUD.lastPlace<45) return; AUD.lastPlace=t; audUi('place',erase?0.35:0.5); }
function audPreview(){ if(!audLive()) return; const B=AUD.B, seq=[['clang',.5,0],['clang',.45,.4],['wood',.55,.8],['punch',.55,1.15],['whoosh',.5,1.5],['struck',.4,1.85],['xbow',.5,2.2],['musket',.55,2.6],['woodH',.6,3.1],['thud',.7,3.5],['cannon',.75,3.9],['blast',.7,5],['coin',.4,6.2]];
  for(const [k,g,d] of seq) audPlay(B[k],g,0,1,0,.15,d); }
audLoadPrefs();
