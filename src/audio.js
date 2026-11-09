/* ================= SOUND ================= */
// Every sound is synthesised into an AudioBuffer when audio first unlocks (no files to load).
// One-shots are placed by distance and screen side relative to the camera and rate-limited per kind,
// so the loudest nearby events play first; continuous loops (melee din, hooves, marching, wind) follow
// how much is happening near the camera.
const AUD={ctx:null,on:true,vol:0.8,amb:0.7,ready:false,building:false,voices:0,MAXV:32,
  B:{}, bus:{}, beds:{}, tok:new Float32Array(EV_N), cand:[], din:0, hoof:0, march:0, sampleT:0,
  volley:0, volleyPan:0, volleyW:0, volleyT:0, lastPlace:0, L:[0,0,0]};
const AUD_KEY='massive-armies-audio';
function audLoadPrefs(){ try{ const p=JSON.parse(localStorage.getItem(AUD_KEY)||'null'); if(p){ AUD.on=p.on!==false; if(p.vol>=0&&p.vol<=1) AUD.vol=+p.vol; if(p.amb>=0&&p.amb<=1) AUD.amb=+p.amb; } }catch(e){} }
function audSavePrefs(){ try{ localStorage.setItem(AUD_KEY,JSON.stringify({on:AUD.on,vol:AUD.vol,amb:AUD.amb})); }catch(e){} }
const AR=Math.random;

/* ---------- synthesis helpers (plain arrays) ---------- */
function noiseArr(n){ const d=new Float32Array(n); for(let i=0;i<n;i++) d[i]=AR()*2-1; return d; }
function lp1(d,fc,SR){ const a=1-Math.exp(-2*Math.PI*fc/SR); let y=0; for(let i=0;i<d.length;i++){ y+=a*(d[i]-y); d[i]=y; } return d; }
function hp1(d,fc,SR){ const a=1-Math.exp(-2*Math.PI*fc/SR); let y=0; for(let i=0;i<d.length;i++){ y+=a*(d[i]-y); d[i]-=y; } return d; }
// RBJ band-pass with a centre frequency that may move over time
function bp(d,SR,fcAt,Q){ let x1=0,x2=0,y1=0,y2=0,b0=0,b2=0,a1=0,a2=0;
  for(let i=0;i<d.length;i++){
    if((i&31)===0){ const w=2*Math.PI*Math.min(fcAt(i/SR),SR*0.45)/SR, al=Math.sin(w)/(2*Q), a0=1+al; b0=al/a0; b2=-al/a0; a1=-2*Math.cos(w)/a0; a2=(1-al)/a0; }
    const x=d[i], y=b0*x+b2*x2-a1*y1-a2*y2; x2=x1; x1=x; y2=y1; y1=y; d[i]=y; }
  return d; }
function decay(n,SR,tau){ const e=new Float32Array(n), k=Math.exp(-1/(tau*SR)); let v=1; for(let i=0;i<n;i++){ e[i]=v; v*=k; } return e; }
// add `src` into `dst` at sample `at`, optionally wrapping (for seamless loops)
function mixIn(dst,src,at,g,wrap){ const n=dst.length; for(let i=0;i<src.length;i++){ let j=at+i; if(j>=n){ if(!wrap) break; j%=n; } dst[j]+=src[i]*g; } }
// crossfade the tail beyond n back onto the head so the loop has no seam
function loopify(d,n,X){ const o=d.slice(0,n); for(let i=0;i<X;i++){ const t=i/X; o[i]=d[i]*t+d[n+i]*(1-t); } return o; }
function toBuf(chs,peak){ const c=AUD.ctx; let m=0; for(const d of chs) for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>m) m=a; }
  const s=m>0?(peak||0.9)/m:1, b=c.createBuffer(chs.length,chs[0].length,c.sampleRate);
  chs.forEach((d,k)=>{ for(let i=0;i<d.length;i++) d[i]*=s; b.copyToChannel(d,k); }); return b; }

/* ---------- individual sounds ---------- */
// weapon clash: a bright, short burst of filtered noise with only a brief, slightly wavering ring under it,
// so it reads as a hit rather than a bell. Wood (shields) is a hollow knock with no ring at all.
function sClang(SR,metal){
  const n=((metal?0.2:0.13)*SR)|0, d=new Float32Array(n);
  if(metal){
    const sh=noiseArr(n), fc=2400+AR()*2000; bp(sh,SR,t=>fc*(1-0.25*t/0.2),1.4); const e=decay(n,SR,0.018+AR()*0.012);
    for(let i=0;i<n;i++) d[i]=sh[i]*e[i]*3;
    const f0=900+AR()*800;
    for(const [r,a,tau] of [[1,0.28,0.035],[1.41+AR()*0.12,0.2,0.025],[2.13+AR()*0.15,0.12,0.015]]){
      const w=2*Math.PI*f0*r/SR, k=Math.exp(-1/(tau*SR)), wob=2*Math.PI*(17+AR()*14)/SR; let ph=AR()*6.28, g=a;
      for(let i=0;i<n;i++){ ph+=w*(1+0.012*Math.sin(wob*i)); d[i]+=Math.sin(ph)*g; g*=k; } }
  } else {
    const kn=noiseArr(n), fc=480+AR()*360; bp(kn,SR,()=>fc,2.2); const e=decay(n,SR,0.028);
    for(let i=0;i<n;i++) d[i]=kn[i]*e[i]*3.2;
  }
  const tr=hp1(noiseArr(n),2200,SR), te=decay(n,SR,0.0022); for(let i=0;i<n;i++) d[i]+=tr[i]*te[i]*0.9;
  const w2=2*Math.PI*(metal?190+AR()*50:130+AR()*40)/SR, be=decay(n,SR,0.028); for(let i=0;i<n;i++) d[i]+=0.6*Math.sin(w2*i)*be[i];
  return d; }
function sThud(SR,f,len,noiseAmt){
  const n=(len*SR)|0, d=new Float32Array(n); let ph=0;
  for(let i=0;i<n;i++){ const t=i/SR; ph+=2*Math.PI*f*(1+1.6*Math.exp(-t/0.012))/SR; d[i]=Math.sin(ph)*Math.exp(-t/(len*0.35)); }
  const nz=lp1(noiseArr(n),900,SR), e=decay(n,SR,0.025); for(let i=0;i<n;i++) d[i]+=nz[i]*e[i]*(noiseAmt||0.8);
  return d; }
function sWhoosh(SR){
  const len=0.95, n=(len*SR)|0, d=noiseArr(n), f0=3200+AR()*900, f1=800+AR()*300;
  bp(d,SR,t=>f1+(f0-f1)*Math.exp(-t/0.35),1.1);
  const fl=20+AR()*25; for(let i=0;i<n;i++){ const t=i/SR, env=Math.min(1,t/0.1)*Math.exp(-Math.max(0,t-0.1)/0.28); d[i]*=env*(0.75+0.25*Math.sin(2*Math.PI*fl*t)); }
  return d; }
function sStruck(SR){
  const n=(0.09*SR)|0, d=new Float32Array(n), cl=hp1(noiseArr(n),3000,SR), e1=decay(n,SR,0.0025);
  for(let i=0;i<n;i++) d[i]=cl[i]*e1[i]*1.2;
  mixIn(d,sThud(SR,150+AR()*60,0.08,0.6),0,0.7);
  const w=2*Math.PI*(800+AR()*300)/SR, e2=decay(n,SR,0.012); for(let i=0;i<n;i++) d[i]+=0.35*Math.sin(w*i)*e2[i];
  return d; }
function sMusket(SR){
  const n=(0.8*SR)|0, d=new Float32Array(n), a=noiseArr(n), b=lp1(noiseArr(n),1300,SR), c=lp1(noiseArr(n),260,SR);
  const e1=decay(n,SR,0.0028), e2=decay(n,SR,0.11), e3=decay(n,SR,0.32), e4=decay(n,SR,0.05);
  for(let i=0;i<n;i++) d[i]=a[i]*e1[i]*1.4+b[i]*e2[i]*0.9+c[i]*e3[i]*0.7+Math.sin(2*Math.PI*68*i/SR)*e4[i]*0.6;
  return d; }
function sCannon(SR){
  const n=(2.3*SR)|0, d=new Float32Array(n), a=hp1(noiseArr(n),1500,SR), b=lp1(noiseArr(n),480,SR), c=lp1(lp1(noiseArr(n),140,SR),140,SR);
  let ph=0; const ea=decay(n,SR,0.006), eb=decay(n,SR,0.38), ec=decay(n,SR,1.0);
  for(let i=0;i<n;i++){ const t=i/SR; ph+=2*Math.PI*(38+70*Math.exp(-t/0.07))/SR; d[i]=Math.sin(ph)*Math.exp(-t/0.55)*1.3+a[i]*ea[i]*0.7+b[i]*eb[i]*1.1+c[i]*ec[i]*1.4; }
  return d; }
function sDebris(SR,n,from,to,count,amp){ const d=new Float32Array(n);
  for(let k=0;k<count;k++){ const t=from+AR()*(to-from), at=(t*SR)|0, m=(0.004*SR)|0, cl=hp1(noiseArr(m),1800,SR), e=decay(m,SR,0.0012); for(let i=0;i<m;i++) cl[i]*=e[i]; mixIn(d,cl,at,amp*Math.exp(-t/0.4)*(0.3+AR()*0.7)); }
  return d; }
function sImpact(SR){ // boulder landing
  const n=(1.3*SR)|0, d=sThud(SR,48,1.3,0.2), nz=lp1(noiseArr(n),650,SR), e=decay(n,SR,0.28);
  for(let i=0;i<n;i++) d[i]=d[i]*1.2+nz[i]*e[i]*1.3;
  mixIn(d,sDebris(SR,n,0.04,0.8,40,0.6),0,1); return d; }
function sBlast(SR){ // explosive shell
  const d=sCannon(SR); mixIn(d,sDebris(SR,d.length,0.05,0.9,55,0.8),0,1); return d; }
function sLaunch(SR){ // catapult creak and arm slam
  const n=(0.85*SR)|0, d=new Float32Array(n); let next=0;
  for(let i=0;i<0.2*SR;i++){ if(i>=next){ const t=i/SR, rate=30+300*t; next=i+SR/rate; const m=(0.006*SR)|0, s=noiseArr(m); bp(s,SR,()=>620,6); mixIn(d,s,i,0.4); } }
  const at=(0.2*SR)|0, m=n-at, w=new Float32Array(m), fs=[105,232,385], ts=[0.16,0.08,0.05];
  for(let p=0;p<3;p++){ const wk=2*Math.PI*fs[p]/SR, e=decay(m,SR,ts[p]); for(let i=0;i<m;i++) w[i]+=Math.sin(wk*i)*e[i]*(1-p*0.25); }
  const nz=lp1(noiseArr(m),700,SR), e=decay(m,SR,0.04); for(let i=0;i<m;i++) w[i]+=nz[i]*e[i]*0.8;
  mixIn(d,w,at,1); const wh=sWhoosh(SR); mixIn(d,wh,at,0.25); return d; }
function sTwang(SR,f,len){ // Karplus-Strong string with a wooden knock
  const n=(len*SR)|0, d=new Float32Array(n), N=Math.max(2,Math.round(SR/f)); const init=lp1(noiseArr(N),3000,SR);
  for(let i=0;i<n;i++) d[i]= i<N ? init[i] : 0.5*(d[i-N]+d[i-N-1>=0?i-N-1:0])*0.996;
  mixIn(d,sThud(SR,280,0.06,1),0,0.8); return d; }
function sDrum(SR){
  const n=(1.1*SR)|0, d=new Float32Array(n); let ph=0, ph2=0;
  for(let i=0;i<n;i++){ const t=i/SR, f=56+42*Math.exp(-t/0.04); ph+=2*Math.PI*f/SR; ph2+=2*Math.PI*f*1.58/SR; d[i]=Math.sin(ph)*Math.exp(-t/0.42)+0.3*Math.sin(ph2)*Math.exp(-t/0.12); }
  const nz=lp1(noiseArr(n),1100,SR), e=decay(n,SR,0.035); for(let i=0;i<n;i++) d[i]+=nz[i]*e[i]*0.7; return d; }
// brass-like voice: additive harmonics whose brightness swells with the attack
function brass(d,SR,f,start,dur,amp,H,vib){
  const a=(start*SR)|0, n=Math.min(d.length-a,((dur+0.4)*SR)|0); let ph=0;
  for(let i=0;i<n;i++){ const t=i/SR, scoop=1-0.05*Math.exp(-t/0.07), v=1+(vib||0.004)*Math.sin(2*Math.PI*5.2*t)*Math.min(1,t/0.4);
    ph+=2*Math.PI*f*scoop*v/SR;
    const env=Math.min(1,t/0.09)*(t<dur?1:Math.exp(-(t-dur)/0.12)), br=0.35+0.45*Math.min(1,t/0.25);
    // sin(k·ph) by recurrence: two trig calls per sample instead of H
    const c2=2*Math.cos(ph); let sm1=0, sk=Math.sin(ph), s=sk, g=br;
    for(let k=2;k<=H;k++){ const sn=c2*sk-sm1; sm1=sk; sk=sn; s+=g*sn/k; g*=br; }
    d[a+i]+=s*env*amp; } }
function sHorn(SR,notes){ let end=0; for(const nt of notes) end=Math.max(end,nt[1]+nt[2]); const d=new Float32Array(((end+0.6)*SR)|0);
  for(const [f,st,du] of notes){ brass(d,SR,f,st,du,1,14,0.005); brass(d,SR,f*1.004,st+0.01,du,0.5,10,0.006); }
  const br=lp1(noiseArr(d.length),900,SR); for(let i=0;i<d.length;i++) d[i]+=br[i]*0.02; return d; }
function sFanfare(SR){
  const d=new Float32Array((2.6*SR)|0), G4=392, C5=523.25, E4=329.63, C4=261.63, E5=659.25;
  brass(d,SR,G4,0,0.12,0.8,10); brass(d,SR,G4,0.16,0.12,0.8,10); brass(d,SR,G4,0.32,0.12,0.8,10);
  for(const [f,a] of [[C5,0.9],[E5,0.45],[G4,0.6],[E4,0.5],[C4,0.6]]) brass(d,SR,f,0.48,1.55,a,9);
  const dr=sDrum(SR); mixIn(d,dr,0,0.8); mixIn(d,dr,(0.48*SR)|0,1.1); return d; }
function sBell(SR,fs){ const d=new Float32Array((0.6*SR)|0);
  fs.forEach(([f,at])=>{ const a=(at*SR)|0, n=d.length-a; for(const [r,g,tau] of [[1,1,0.28],[2.76,0.35,0.12],[5.4,0.15,0.05]]){ const w=2*Math.PI*f*r/SR, k=Math.exp(-1/(tau*SR)); let e=g; for(let i=0;i<n;i++){ d[a+i]+=Math.sin(w*i)*e; e*=k; } } });
  return d; }
function sTick(SR,f,len){ const n=(len*SR)|0, d=new Float32Array(n), w=2*Math.PI*f/SR, e=decay(n,SR,len*0.25), nz=hp1(noiseArr(n),2000,SR), e2=decay(n,SR,0.0015);
  for(let i=0;i<n;i++) d[i]=Math.sin(w*i)*e[i]+nz[i]*e2[i]*0.6; return d; }

function sTock(SR){ const n=(0.04*SR)|0, d=noiseArr(n); bp(d,SR,()=>1700,2); const e=decay(n,SR,0.006); for(let i=0;i<n;i++) d[i]*=e[i]; const w=2*Math.PI*420/SR, e2=decay(n,SR,0.008); for(let i=0;i<n;i++) d[i]+=0.5*Math.sin(w*i)*e2[i]; return d; }

/* ---------- seamless ambience loops (stereo) ---------- */
function loopDin(SR){ const sec=4, n=sec*SR, X=(0.4*SR)|0, out=[];
  const clangs=[]; for(let k=0;k<8;k++) clangs.push(sClang(SR,k<6)); const thuds=[]; for(let k=0;k<4;k++) thuds.push(sThud(SR,90+AR()*90,0.16,0.9));
  for(let ch=0;ch<2;ch++){
    // crowd roar: noise through two vowel-like bands with a slow swell (whole cycles per loop)
    let a=noiseArr(n+X), b=a.slice(), c=a.slice(); bp(a,SR,()=>560,2.2); bp(b,SR,()=>1250,3); lp1(c,320,SR);
    const r=new Float32Array(n+X); const P=[[1,AR()*6],[3,AR()*6],[7,AR()*6]];
    for(let i=0;i<n+X;i++){ const t=i/SR; let m=0.7; for(const [k,ph] of P) m+=0.1*Math.sin(2*Math.PI*k*t/sec+ph); r[i]=(a[i]*1.0+b[i]*0.6+c[i]*0.5)*m; }
    const d=loopify(r,n,X);
    for(let k=0;k<60;k++) mixIn(d,clangs[(AR()*8)|0],(AR()*n)|0,0.05+AR()*0.16,true);
    for(let k=0;k<45;k++) mixIn(d,thuds[(AR()*4)|0],(AR()*n)|0,0.15+AR()*0.3,true);
    out.push(d); }
  return toBuf(out,0.8); }
function loopHooves(SR){ const sec=2, n=sec*SR, out=[];
  for(let ch=0;ch<2;ch++){ const r=lp1(lp1(noiseArr(n+SR),110,SR),110,SR); const d=loopify(r,n,(0.3*SR)|0); for(let i=0;i<n;i++) d[i]*=1.8;
    for(let k=0;k<64;k++){ const m=(0.05*SR)|0, s=noiseArr(m); bp(s,SR,()=>230+AR()*260,4); const e=decay(m,SR,0.014); for(let i=0;i<m;i++) s[i]*=e[i]; mixIn(d,s,(AR()*n)|0,0.4+AR()*0.6,true); mixIn(d,sThud(SR,80+AR()*40,0.06,0.3),(AR()*n)|0,0.35,true); }
    out.push(d); }
  return toBuf(out,0.8); }
function loopMarch(SR){ const sec=2.2, n=(sec*SR)|0, out=[];
  for(let ch=0;ch<2;ch++){ const d=new Float32Array(n);
    for(let k=0;k<4;k++){ const at=((k*0.55+AR()*0.04)*SR)|0; mixIn(d,sThud(SR,70,0.18,0.9),at,0.9,true); } // the tramp of a regiment in step
    for(let k=0;k<90;k++){ const m=(0.03*SR)|0, s=lp1(hp1(noiseArr(m),1200,SR),5000,SR), e=decay(m,SR,0.008); for(let i=0;i<m;i++) s[i]*=e[i]; mixIn(d,s,(AR()*n)|0,0.15+AR()*0.35,true); }
    out.push(d); }
  return toBuf(out,0.7); }
function loopWind(SR){ const sec=8, n=sec*SR, X=(1*SR)|0, out=[];
  for(let ch=0;ch<2;ch++){ const r=lp1(lp1(noiseArr(n+X),320,SR),320,SR), g=noiseArr(n+X); bp(g,SR,t=>520+180*Math.sin(2*Math.PI*t/sec*2+ch),3);
    const P=[[1,AR()*6],[2,AR()*6],[3,AR()*6]];
    for(let i=0;i<n+X;i++){ const t=i/SR; let m=0.6; for(const [k,ph] of P) m+=0.13*Math.sin(2*Math.PI*k*t/sec+ph); r[i]=(r[i]*2.2+g[i]*0.35)*Math.max(0.1,m); }
    out.push(loopify(r,n,X)); }
  return toBuf(out,0.7); }
function impulseResponse(SR){ const n=(2.4*SR)|0, out=[];
  for(let ch=0;ch<2;ch++){ const d=lp1(noiseArr(n),2600,SR), e=decay(n,SR,0.55); for(let i=0;i<n;i++) d[i]*=e[i]*(i<SR*0.01?i/(SR*0.01):1); out.push(d); }
  return toBuf(out,0.5); }

/* ---------- engine ---------- */
function audBuild(){
  const c=AUD.ctx, SR=c.sampleRate, B=AUD.B;
  const master=c.createGain(); master.gain.value=AUD.on?AUD.vol:0;
  const comp=c.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=12; comp.ratio.value=5; comp.attack.value=0.004; comp.release.value=0.25;
  master.connect(comp); comp.connect(c.destination);
  const mk=(g,to)=>{ const n=c.createGain(); n.gain.value=g; n.connect(to||master); return n; };
  AUD.bus={master, sfx:mk(0.9), amb:mk(AUD.amb), ui:mk(0.45), mus:mk(0.75)};
  const tasks=[
    ()=>{ const rv=c.createConvolver(); rv.buffer=impulseResponse(SR); const g=mk(0.42); rv.connect(g); AUD.bus.wet=rv; },
    ...sfxTasks(),
    audLoadSamples,
    ()=>{ B.loopDin=loopDin(SR); },
    ()=>{ B.loopHoof=loopHooves(SR); B.loopMarch=loopMarch(SR); },
    ()=>{ B.loopWind=loopWind(SR);
      for(const [k,buf] of [['din',B.loopDin],['hoof',B.loopHoof],['march',B.loopMarch],['wind',B.loopWind]]){
        const s=c.createBufferSource(); s.buffer=buf; s.loop=true; const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=4000; const g=c.createGain(); g.gain.value=0;
        s.connect(f); f.connect(g); g.connect(AUD.bus.amb); s.start(c.currentTime+AR()*0.1); AUD.beds[k]={s,f,g}; }
      AUD.ready=true; },
  ];
  runTasks(tasks);
}
// spread synthesis over several tasks so the page never stalls for long
function runTasks(tasks,done){ const run=()=>{ const t=tasks.shift(); if(!t){ if(done) done(); return; } try{ t(); }catch(e){ console.warn('audio build failed',e); AUD.building=false; return; } setTimeout(run,0); }; run(); }
// the one-shot effects, from ZzFX recipes or the original hand-built synthesis
// the hand-built effects; recorded samples replace most of them once decoded
function sfxTasks(){
  const SR=AUD.ctx.sampleRate, B=AUD.B;
  return [
    ()=>{ B.clang=[0,1,2,3,4,5].map(()=>toBuf([sClang(SR,true)])); B.wood=[0,1,2].map(()=>toBuf([sClang(SR,false)])); },
    ()=>{ B.thud=[0,1,2,3].map(()=>toBuf([sThud(SR,95+AR()*70,0.22)])); B.struck=[0,1,2,3].map(()=>toBuf([sStruck(SR)])); },
    ()=>{ B.whoosh=[0,1,2].map(()=>toBuf([sWhoosh(SR)])); B.musket=[0,1,2,3].map(()=>toBuf([sMusket(SR)])); },
    ()=>{ B.cannon=[0,1].map(()=>toBuf([sCannon(SR)])); },
    ()=>{ B.impact=[0,1].map(()=>toBuf([sImpact(SR)])); B.blast=[toBuf([sBlast(SR)])]; },
    ()=>{ B.launch=[0,1].map(()=>toBuf([sLaunch(SR)])); B.xbow=[0,1].map(()=>toBuf([sTwang(SR,170+AR()*40,0.35)])); B.ballista=[toBuf([sTwang(SR,72,0.8)])]; },
    ()=>{ B.drum=[toBuf([sDrum(SR)])]; B.coin=[toBuf([sBell(SR,[[1568,0],[2093,0.07]])])]; B.tick=[toBuf([sTock(SR)],0.5)]; B.place=[0,1,2].map(()=>toBuf([sTick(SR,320+AR()*160,0.04)],0.5)); },
    ()=>{ B.hornAdvance=[toBuf([sHorn(SR,[[98,0,0.55],[146.8,0.62,1.5]])])]; B.hornWave=[toBuf([sHorn(SR,[[110,0,1.3]])])]; },
    ()=>{ B.hornDefeat=[toBuf([sHorn(SR,[[110,0,0.8],[82.4,0.85,1.9]])])]; B.fanfare=[toBuf([sFanfare(SR)])]; },
  ];
}
// a short run of effects to hear the current set
function audPreview(){ if(!audLive()) return; const B=AUD.B, seq=[['clang',.5,0],['clang',.45,.35],['wood',.55,.7],['punch',.55,1.05],['struck',.4,1.4],['xbow',.45,1.75],['musket',.55,2.1],['woodH',.6,2.5],['thud',.7,2.9],['cannon',.75,3.4],['coin',.4,4.4]];
  for(const [k,g,d] of seq) audPlay(B[k],g,(AR()-.5)*.6,1,0,.15,d); }
// recorded effects from Kenney's CC0 sound packs (kenney.nl), embedded as MP3 and decoded once
function audLoadSamples(){ if(typeof SFX_DATA==='undefined') return; const c=AUD.ctx;
  for(const [k,list] of Object.entries(SFX_DATA.files)){ const out=[]; let left=list.length;
    const fin=()=>{ if(--left===0&&out.length) AUD.B[k]=out; };
    for(const b64 of list){ const bin=atob(b64), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
      try{ c.decodeAudioData(u.buffer,buf=>{ out.push(toBuf([buf.getChannelData(0).slice()],0.9*(SFX_DATA.gain[k]||1))); fin(); },fin); }catch(e){ fin(); } } } }
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
  s.start(c.currentTime+(delay||0));
}
const audUi=(name,g,rate)=>audPlay(AUD.B[name],g,0,rate||1,0,0,0,AUD.bus.ui);
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
  const buf= t===EV_HIT||t===EV_BRACE ? B.clang : t===EV_BLOCK ? B.wood : t===EV_KILL ? (B.punch||B.thud) : t===EV_CHARGE||t===EV_IMPACT ? B.thud :
    t===EV_FIRE+3 ? (B.woodH||B.launch) : B[k[3]];
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
  if(AUD.sampleT<=0){ AUD.sampleT=0.2; let hw=0,mw=0;
    if(active && speed>0) for(let i=0;i<N;i++){ if(SS[i]!==1&&SS[i]!==2) continue; const v2=VX[i]*VX[i]+VZ[i]*VZ[i]; if(v2<0.8) continue; const cls=UNITS[TY[i]].cls;
      if(cls==='cav'){ if(v2>4) hw+=audW(PX[i],PY[i],PZ[i]); } else if(cls!=='sie') mw+=audW(PX[i],PY[i],PZ[i]); }
    AUD.hoof=1-Math.exp(-hw/2.5); AUD.march=1-Math.exp(-mw/10); }
  const set=(bed,g,f)=>{ const b=AUD.beds[bed]; if(!b) return; b.g.gain.setTargetAtTime(g,now,0.3); if(f) b.f.frequency.setTargetAtTime(f,now,0.3); };
  const on=active&&speed>0;
  const dinL=on?1-Math.exp(-AUD.din/18):0;
  set('din',dinL*0.45,700+9000*Math.min(1,dinW*1.6+0.08));
  set('hoof',on?AUD.hoof*0.55:0,500+5000*AUD.hoof);
  set('march',on?AUD.march*0.4:0,1500+6000*AUD.march);
  const zoomOut=clamp((CAM.dist-30)/280,0,1);
  set('wind',0.07+0.2*zoomOut,500+700*zoomOut);
}
// battle cues
function audBattleStart(){ if(!audLive()) return; audMusic('drum',0.7,0); audMusic('drum',0.6,0.38); audMusic('drum',0.8,0.76); audMusic('hornAdvance',0.4,0.15); }
function audWave(){ if(!audLive()) return; audMusic('hornWave',0.38,0); audMusic('drum',0.6,0); }
function audEnd(win){ if(!audLive()) return; if(win) audMusic('fanfare',0.7,0.1); else { audMusic('hornDefeat',0.42,0.1); audMusic('drum',0.6,0.1); audMusic('drum',0.5,1.0); } }
function audPlace(erase){ const t=performance.now(); if(t-AUD.lastPlace<45) return; AUD.lastPlace=t; audUi('place',erase?0.35:0.5); }
audLoadPrefs();
