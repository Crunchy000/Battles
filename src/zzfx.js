/* ================= ZzFX ================= */
// A port of the ZzFX synth ("Zuper Zmall Zound Zynth") by Frank Force, MIT licence,
// https://github.com/KilledByAPixel/ZzFX. Each sound is a short list of numbers in ZzFX's own order:
// [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve, slide, deltaSlide,
//  pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter]
// so any sound can be pasted into the ZzFX designer to audition or tweak it.
function zzfxBuild(P,SR){
  let [volume=1,randomness=.05,frequency=220,attack=0,sustain=0,release=.1,shape=0,shapeCurve=1,slide=0,deltaSlide=0,
       pitchJump=0,pitchJumpTime=0,repeatTime=0,noise=0,modulation=0,bitCrush=0,delay=0,sustainVolume=1,decay=0,tremolo=0,filter=0]=P;
  const PI2=Math.PI*2, sign=v=>v<0?-1:1, abs=Math.abs;
  let startSlide=slide*=500*PI2/SR/SR,
    startFrequency=frequency*=(1+randomness*2*Math.random()-randomness)*PI2/SR,
    modOffset=0, repeat=0, crush=0, jump=1, t=0, i=0, s=0, f;
  // biquad low-pass (filter < 0) or high-pass (filter > 0)
  const quality=2, w=PI2*abs(filter)*2/SR, cs=Math.cos(w), alpha=Math.sin(w)/2/quality,
    a0=1+alpha, a1=-2*cs/a0, a2=(1-alpha)/a0, b0=(1+sign(filter)*cs)/2/a0, b1=-(sign(filter)+cs)/a0, b2=b0;
  let x2=0,x1=0,y2=0,y1=0;
  attack=attack*SR||9; decay*=SR; sustain*=SR; release*=SR; delay*=SR;
  deltaSlide*=500*PI2/SR**3; modulation*=PI2/SR; pitchJump*=PI2/SR; pitchJumpTime*=SR; repeatTime=repeatTime*SR|0;
  const length=attack+decay+sustain+release+delay|0, b=new Float32Array(length);
  for(;i<length;b[i++]=s*volume){
    if(!(++crush%(bitCrush*100|0))){
      s= shape? shape>1? shape>2? shape>3? shape>4?
          (t/PI2%1<shapeCurve/2?1:-1) :            // 5 square with duty
          Math.sin(t**3) :                         // 4 noise
          Math.max(Math.min(Math.tan(t),1),-1) :   // 3 tan
          1-(2*t/PI2%2+2)%2 :                      // 2 saw
          1-4*abs(Math.round(t/PI2)-t/PI2) :       // 1 triangle
          Math.sin(t);                             // 0 sine
      s=(repeatTime?1-tremolo+tremolo*Math.sin(PI2*i/repeatTime):1)*
        sign(s)*(abs(s)**shapeCurve)*
        (i<attack?i/attack : i<attack+decay?1-((i-attack)/decay)*(1-sustainVolume) : i<attack+decay+sustain?sustainVolume :
         i<length-delay?(length-i-delay)/release*sustainVolume : 0);
      s=delay? s/2+(delay>i?0:(i<length-delay?1:(length-i)/delay)*b[i-delay|0]/2/volume) : s;
      if(filter) s=y1=b2*x2+b1*(x2=x1)+b0*(x1=s)-a2*y2-a1*(y2=y1);
    }
    f=(frequency+=slide+=deltaSlide)*Math.cos(modulation*modOffset++);
    t+=f+f*noise*Math.sin(i**5);
    if(jump&&++jump>pitchJumpTime){ frequency+=pitchJump; startFrequency+=pitchJump; jump=0; }
    if(repeatTime&&!(++repeat%repeatTime)){ frequency=startFrequency; slide=startSlide; jump||=1; }
  }
  return b;
}
// layer several ZzFX sounds into one buffer: [[params, start seconds, gain], ...]
function zzLayers(SR,layers){
  const parts=layers.map(([p,at,g])=>[zzfxBuild(p,SR),(at||0)*SR|0,g===undefined?1:g]);
  const n=Math.max(...parts.map(([b,a])=>a+b.length)), d=new Float32Array(n);
  for(const [b,a,g] of parts) for(let i=0;i<b.length;i++) d[a+i]+=b[i]*g;
  return d;
}
// The battle's sound set. Several takes of each are built so repeats never sound identical.
//           vol  rnd  freq  att  sus  rel  shp curve slide dSl  pJmp pJT  rep  noise mod  crush dly  sVol dec  trem filter
const ZZ={
  clang:   ()=>[[[.8, .2, 2300, 0,   0,  .08, 3,  1,   0,   0,   0,   0,   0,   .6,  211, 0,   0,   1,   0,   0,   1200],0,.8],
                [[.8, .2, 3400, 0,   0,  .06, 4,  1,   0,   0,   0,   0,   0,   .8,  0,   0,   0,   1,   0,   0,   1800],0,1],
                [[.4, .2,  900, 0,   0,  .05, 4,  1,   0,   0,   0,   0,   0,   .5,  0,   0,   0,   1,   0,   0,  -2500],.004,.6]],
  wood:    ()=>[[[1,  .15, 300, 0,   .01, .07, 1,  2,   -.4, 0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,1],
                [[.7, .2, 1200, 0,   0,  .05, 4,  1,   0,   0,   0,   0,   0,   .3,  0,   0,   0,   1,   0,   0,  -2600],0,.6]],
  thud:    ()=>[[[1,  .2,  120, 0,  .02, .2,  0,  1,  -.3,  0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,1],
                [[.7, .2,  300, 0,   0,  .14, 4,  1,   0,   0,   0,   0,   0,   .6,  0,   0,   0,   1,   0,   0,  -700],0,.8]],
  struck:  ()=>[[[.8, .2,  520, 0,   0,  .07, 4,  1,  -1,   0,   0,   0,   0,   .5,  0,   0,   0,   1,   0,   0,  -3000],0,1],
                [[.5, .2,  180, 0,   0,  .09, 0,  1,  -.4,  0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,.7]],
  whoosh:  ()=>[[[.6, .1, 1400, .16, .04, .32, 4,  1,  -1.2, 0,   0,   0,   0,   .8,  0,   0,   0,   1,   0,   0,  -2400],0,1]],
  musket:  ()=>[[[1,  .1, 2600, 0,   0,  .03, 4,  1,   0,   0,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0,   1600],0,1.4],
                [[1,  .15,  75, 0,  .04, .5,  4,  .8, -.05, 0,   0,   0,   0,   1,   0,   .1,  0,   1,   .05, 0,  -800],0,.8]],
  cannon:  ()=>[[[1,  .05,  52, 0,  .08, .9,  0,  1,  -.04, 0,   0,   0,   0,   0,   0,   0,   0,   1,   .05, 0,   0],0,1],
                [[1,  .05,  48, 0,  .12,1.3,  4,  1,  -.03, 0,   0,   0,   0,   1.2, 0,   .15, .14, 1,   .1,  0,  -300],0,.8],
                [[.8, .1, 1600, 0,   0,  .05, 4,  1,   0,   0,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0,   900],0,.35]],
  impact:  ()=>[[[1,  .1,   58, 0,  .03, .45, 0,  1,  -.06, 0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,1],
                [[1,  .1,   62, 0,  .05, .55, 4,  1,  -.08, 0,   0,   0,   0,   1,   0,   0,   0,   1,   0,   0,  -380],0,.8],
                [[.5, .3,  900, 0,  .1,  .35, 4,  1,   0,   0,   0,   0,  .045, .5,  0,   0,   0,   1,   0,   .9, -2600],.04,.25]],
  blast:   ()=>[[[1,  .05,  44, 0,  .1, 1.1,  0,  1,  -.03, 0,   0,   0,   0,   0,   0,   0,   0,   1,   .05, 0,   0],0,1],
                [[1,  .05,  40, 0,  .2, 1.6,  4,  1,  -.02, 0,   0,   0,   0,   1.5, 0,   .3,  .18, 1,   .1,  0,  -320],0,.8],
                [[.7, .2, 1100, 0,  .15, .6,  4,  1,   0,   0,   0,   0,  .06, .6,  0,   0,   0,   1,   0,   .8, -3000],.05,.25]],
  launch:  ()=>[[[.35,.1,  130, .06, .12, .05, 2,  1,  .35,  0,   0,   0,   0,   .2,  20,  0,   0,   1,   0,   0,  -1300],0,.6],
                [[1,  .15,  95, 0,  .03, .28, 0,  1,  -.25, 0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],.22,1],
                [[.7, .2,  400, 0,   0,  .18, 4,  1,   0,   0,   0,   0,   0,   .7,  0,   0,   0,   1,   0,   0,  -1500],.22,.7]],
  xbow:    ()=>[[[.8, .12, 190, 0,  .02, .3,  1,  1,  -.08, 0,   0,   0,   0,   0,   0,   0,   0,   1,   .02, 0,   0],0,.8],
                [[.7, .2, 2200, 0,   0,  .03, 4,  1,   0,   0,   0,   0,   0,   .6,  0,   0,   0,   1,   0,   0,   1500],0,1]],
  ballista:()=>[[[1,  .08,  78, 0,  .04, .7,  1,  1,  -.04, 0,   0,   0,   0,   0,   0,   0,   0,   1,   .04, 0,   0],0,.8],
                [[.8, .2, 1800, 0,   0,  .04, 4,  1,   0,   0,   0,   0,   0,   .6,  0,   0,   0,   1,   0,   0,   1200],0,.8],
                [[.8, .2,  260, 0,   0,  .16, 4,  1,   0,   0,   0,   0,   0,   .7,  0,   0,   0,   1,   0,   0,  -1400],0,.8]],
  drum:    ()=>[[[1,  0,    68, 0,  .02, .55, 0,  1,  -.12, 0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,1],
                [[.6, .1,  260, 0,   0,  .22, 4,  1,   0,   0,   0,   0,   0,   .5,  0,   0,   0,   1,   0,   0,  -900],0,.55]],
  coin:    ()=>[[[.6, 0,  1568, 0,  .04, .28, 1,  1,   0,   0,  525, .07,  0,   0,   0,   0,   0,   1,   0,   0,   0],0,1]],
  tick:    ()=>[[[.5, 0,   420, 0,   0,  .035,1,  1,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,1],
                [[.3, 0,  1700, 0,   0,  .012,4,  1,   0,   0,   0,   0,   0,   .3,  0,   0,   0,   1,   0,   0,   1000],0,.6]],
  place:   ()=>[[[.5, .25, 520, 0,   0,  .04, 1,  1,   .6,  0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0],0,1]],
};
// brass for horns and the fanfare: a filtered saw with a sine body, attack and release shaped by ZzFX
function zzBrass(f,dur,g){ return [[[.6,0,f,.07,dur,.22,2,1.3,0,0,0,0,0,0,0,0,0,.85,.12,0,-Math.min(4000,f*7)],0,g],[[.5,0,f*1.004,.09,dur,.25,0,1,0,0,0,0,0,0,0,0,0,.85,.12,0,0],.01,g*.5]]; }
function zzNotes(notes){ const L=[]; for(const [f,at,dur,g] of notes) for(const [p,o,gg] of zzBrass(f,dur,g===undefined?1:g)) L.push([p,at+o,gg]); return L; }
const ZZ_MUSIC={
  hornAdvance:()=>zzNotes([[98,0,.55],[146.8,.62,1.5]]),
  hornWave:   ()=>zzNotes([[110,0,1.3]]),
  hornDefeat: ()=>zzNotes([[110,0,.8],[82.4,.85,1.9]]),
  fanfare:    ()=>{ const G4=392,C5=523.25,E4=329.63,C4=261.63,E5=659.25;
    return [...zzNotes([[G4,0,.12,.8],[G4,.16,.12,.8],[G4,.32,.12,.8],[C5,.48,1.55,.9],[E5,.48,1.55,.45],[G4,.48,1.55,.6],[E4,.48,1.55,.5],[C4,.48,1.55,.6]]),
      ...ZZ.drum().map(([p,o,g])=>[p,o,g*.8]), ...ZZ.drum().map(([p,o,g])=>[p,o+.48,g*1.1])]; },
};
// loudness matched to the original sounds (measured over the loudest 100 ms), so the battle mix keeps its balance
const ZZ_GAIN={clang:1,wood:.75,thud:.9,struck:.8,whoosh:.8,musket:1.15,cannon:.9,impact:1.5,blast:.85,launch:.65,xbow:.85,ballista:.66,drum:.85,coin:.66,tick:.84,place:.61,
  hornAdvance:2.2,hornWave:1.75,hornDefeat:2.3,fanfare:1.05};
