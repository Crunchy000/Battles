/* ================= RENDERING ================= */
/* ---------- math ---------- */
function mat4mul(a,b){ const o=new Float32Array(16); for(let c=0;c<4;c++) for(let r=0;r<4;r++){ let s=0; for(let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; } return o; }
function perspective(fovy,aspect,near,far){ const f=1/Math.tan(fovy/2), nf=1/(near-far); return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,far*nf,-1, 0,0,far*near*nf,0]); }
function lookAt(e,t,u){
  let zx=e[0]-t[0], zy=e[1]-t[1], zz=e[2]-t[2], l=Math.hypot(zx,zy,zz); zx/=l; zy/=l; zz/=l;
  let xx=u[1]*zz-u[2]*zy, xy=u[2]*zx-u[0]*zz, xz=u[0]*zy-u[1]*zx; l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  return {m:new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]), right:[xx,xy,xz], up:[yx,yy,yz], back:[zx,zy,zz]};
}

/* ---------- camera ---------- */
const CAM={tx:0,tz:0,yaw:Math.PI/2,pitch:0.6,dist:150, g:{tx:0,tz:0,yaw:Math.PI/2,pitch:0.6,dist:150}, fov:48*Math.PI/180,
  follow:-1, followT:0, mode:'iso', eye:[0,100,100], right:[1,0,0], up:[0,1,0], fwd:[0,0,-1], vp:new Float32Array(16), aspect:1, W:1, H:1, ty:0};
function camSnap(){ Object.assign(CAM,{tx:CAM.g.tx,tz:CAM.g.tz,yaw:CAM.g.yaw,pitch:CAM.g.pitch,dist:CAM.g.dist}); }
const CAM_MAX=460*MS;
function camClamp(o){ o.tx=clamp(o.tx,X0-20,X1+20); o.tz=clamp(o.tz,Z0-20,Z1+20); o.pitch=clamp(o.pitch,0.12,1.47); o.dist=clamp(o.dist,6,CAM_MAX); }
function camPreset(mode,snap){
  CAM.mode=mode; CAM.follow=-1;
  const portrait=CAM.aspect<0.9;
  const fit=portrait? 1/Math.max(0.45,CAM.aspect*1.25) : 1;
  if(mode==='top') Object.assign(CAM.g,{tx:0,tz:0,yaw:portrait?Math.PI:Math.PI/2,pitch:1.45,dist:portrait?250*MS:205*MS});
  else if(mode==='iso') Object.assign(CAM.g,{tx:portrait?-20:0,tz:0,yaw:portrait?Math.PI-0.42:Math.PI/2+0.42,pitch:0.62,dist:190*Math.min(1.5,fit)});
  else if(mode==='close'){ CAM.follow=-2; CAM.followT=0; Object.assign(CAM.g,{pitch:0.32,dist:22}); }
  camClamp(CAM.g); if(snap) camSnap();
}
function camUpdate(dt){
  if(CAM.follow!==-1){
    CAM.followT-=dt;
    let f=CAM.follow;
    if(f<0 || f>=N || SS[f]!==1 || CAM.followT<=0){ f=pickFollowUnit(); CAM.follow=f; CAM.followT=7; }
    if(f>=0){ CAM.g.tx=PX[f]; CAM.g.tz=PZ[f]; }
    CAM.g.yaw+=dt*0.07;
  }
  const k=1-Math.exp(-dt*7);
  CAM.tx+=(CAM.g.tx-CAM.tx)*k; CAM.tz+=(CAM.g.tz-CAM.tz)*k; CAM.yaw+=angDiff(CAM.yaw,CAM.g.yaw)*k; CAM.pitch+=(CAM.g.pitch-CAM.pitch)*k; CAM.dist+=(CAM.g.dist-CAM.dist)*k;
  computeView();
}
function pickFollowUnit(){
  if(!N) return -2;
  let best=-2, bs=-1;
  for(let n=0;n<40;n++){ const i=(Math.random()*N)|0; if(SS[i]!==1) continue; const s=(TG[i]>=0?2:0)+AT[i]+(UNITS[TY[i]].cls==='cav'?0.5:0)+Math.random(); if(s>bs){ bs=s; best=i; } }
  return best;
}
function computeView(){
  const cp=Math.cos(CAM.pitch), sp=Math.sin(CAM.pitch);
  CAM.ty+=(heightAt(CAM.tx,CAM.tz)-CAM.ty)*0.1;
  const t=[CAM.tx,CAM.ty,CAM.tz], e=[CAM.tx+CAM.dist*cp*Math.cos(CAM.yaw), CAM.ty+CAM.dist*sp, CAM.tz+CAM.dist*cp*Math.sin(CAM.yaw)];
  const v=lookAt(e,t,[0,1,0]);
  const p=perspective(CAM.fov,CAM.aspect,Math.max(0.25,CAM.dist*0.012),Math.max(1400,CAM.dist*7));
  CAM.vp=mat4mul(p,v.m); CAM.eye=e; CAM.right=v.right; CAM.up=v.up; CAM.fwd=[-v.back[0],-v.back[1],-v.back[2]];
}
function screenRay(sx,sy){
  const nx=(sx/CAM.W)*2-1, ny=1-(sy/CAM.H)*2, th=Math.tan(CAM.fov/2);
  let d=[0,0,0]; for(let k=0;k<3;k++) d[k]=CAM.fwd[k]+CAM.right[k]*nx*th*CAM.aspect+CAM.up[k]*ny*th;
  const l=Math.hypot(d[0],d[1],d[2]); d=[d[0]/l,d[1]/l,d[2]/l];
  return {o:CAM.eye,d};
}
function rayPlane(r,h){ if(Math.abs(r.d[1])<1e-6) return null; const t=(h-r.o[1])/r.d[1]; if(t<0) return null; return [r.o[0]+r.d[0]*t, r.o[2]+r.d[2]*t]; }
function groundH(x,z){ return (x>=X0&&x<=X1&&z>=Z0&&z<=Z1)?heightAt(x,z):0; }
function rayGround(r){
  const step=Math.max(0.4,CAM.dist/160); let t=0;
  for(let n=0;n<1200;n++){
    const x=r.o[0]+r.d[0]*t, y=r.o[1]+r.d[1]*t, z=r.o[2]+r.d[2]*t;
    if(y<=groundH(x,z)){
      let a=Math.max(0,t-step), b=t;
      for(let k=0;k<14;k++){ const m=(a+b)/2, mx=r.o[0]+r.d[0]*m, my=r.o[1]+r.d[1]*m, mz=r.o[2]+r.d[2]*m; if(my<=groundH(mx,mz)) b=m; else a=m; }
      return [r.o[0]+r.d[0]*b, r.o[2]+r.d[2]*b];
    }
    t+=step; if(r.d[1]>0 && y>80) break;
  }
  return rayPlane(r,0);
}

/* ---------- mesh builder ---------- */
class MB{
  constructor(){ this.v=[]; this.xf=null; }
  P(p){ return this.xf?this.xf(p):p; }
  tri(a,b,c,m,ctr){
    a=this.P(a); b=this.P(b); c=this.P(c); const C=this.P(ctr);
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; const l=Math.hypot(nx,ny,nz); if(l<1e-9) return; nx/=l; ny/=l; nz/=l;
    const mx=(a[0]+b[0]+c[0])/3-C[0], my=(a[1]+b[1]+c[1])/3-C[1], mz=(a[2]+b[2]+c[2])/3-C[2];
    if(nx*mx+ny*my+nz*mz<0){ nx=-nx; ny=-ny; nz=-nz; }
    const ex=typeof m==='number'?[m]:m;
    for(const p of [a,b,c]) this.v.push(p[0],p[1],p[2],nx,ny,nz,...ex);
  }
  quad(a,b,c,d,m,C){ this.tri(a,b,c,m,C); this.tri(a,c,d,m,C); }
  box(cx,cy,cz,sx,sy,sz,m){
    const x0=cx-sx/2,x1=cx+sx/2,y0=cy-sy/2,y1=cy+sy/2,z0=cz-sz/2,z1=cz+sz/2, C=[cx,cy,cz];
    this.quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],m,C); this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],m,C);
    this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],m,C); this.quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],m,C);
    this.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],m,C); this.quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],m,C);
  }
  prismY(cx,cy,cz,r,h,n,m,r2,rot){
    const top=r2===undefined?r:r2, C=[cx,cy+h*0.4,cz], o=rot||0;
    for(let k=0;k<n;k++){
      const a0=o+k/n*TAU, a1=o+(k+1)/n*TAU;
      const p0=[cx+Math.cos(a0)*r,cy,cz+Math.sin(a0)*r], p1=[cx+Math.cos(a1)*r,cy,cz+Math.sin(a1)*r];
      if(top>1e-4){ const q0=[cx+Math.cos(a0)*top,cy+h,cz+Math.sin(a0)*top], q1=[cx+Math.cos(a1)*top,cy+h,cz+Math.sin(a1)*top]; this.quad(p0,p1,q1,q0,m,C); this.tri([cx,cy+h,cz],q0,q1,m,[cx,cy,cz]); }
      else this.tri(p0,p1,[cx,cy+h,cz],m,C);
      this.tri([cx,cy,cz],p0,p1,m,[cx,cy+h,cz]);
    }
  }
  cyl(cx,cy,cz,r,len,n,m,axis){
    const C=[cx,cy,cz], h=len/2;
    const pt=(a,s)=> axis==='x' ? [cx+s*h, cy+Math.sin(a)*r, cz+Math.cos(a)*r] : [cx+Math.cos(a)*r, cy+Math.sin(a)*r, cz+s*h];
    const cap=s=> axis==='x' ? [cx+s*h,cy,cz] : [cx,cy,cz+s*h];
    for(let k=0;k<n;k++){ const a0=k/n*TAU, a1=(k+1)/n*TAU;
      this.quad(pt(a0,-1),pt(a1,-1),pt(a1,1),pt(a0,1),m,C);
      this.tri(cap(-1),pt(a0,-1),pt(a1,-1),m,cap(1)); this.tri(cap(1),pt(a0,1),pt(a1,1),m,cap(-1)); }
  }
  pyr(cx,cy,cz,sx,h,sz,m){
    const a=[cx-sx/2,cy,cz-sz/2], b=[cx+sx/2,cy,cz-sz/2], c=[cx+sx/2,cy,cz+sz/2], d=[cx-sx/2,cy,cz+sz/2], t=[cx,cy+h,cz], C=[cx,cy+h*0.3,cz];
    this.tri(a,b,t,m,C); this.tri(b,c,t,m,C); this.tri(c,d,t,m,C); this.tri(d,a,t,m,C); this.quad(a,b,c,d,m,C);
  }
  octa(cx,cy,cz,rx,ry,rz,m){
    const C=[cx,cy,cz], px=[cx+rx,cy,cz], nx=[cx-rx,cy,cz], py=[cx,cy+ry,cz], ny=[cx,cy-ry,cz], pz=[cx,cy,cz+rz], nz=[cx,cy,cz-rz];
    for(const [a,b] of [[px,pz],[pz,nx],[nx,nz],[nz,px]]){ this.tri(a,b,py,m,C); this.tri(a,b,ny,m,C); }
  }
  with(xf,fn){ const o=this.xf; this.xf=xf; fn(); this.xf=o; }
}
const rotXAt=(a,py,pz)=>{ const c=Math.cos(a), s=Math.sin(a); return p=>{ const y=p[1]-py, z=p[2]-pz; return [p[0], py+y*c-z*s, pz+y*s+z*c]; }; };
const rotZAt=(a,px,py)=>{ const c=Math.cos(a), s=Math.sin(a); return p=>{ const x=p[0]-px, y=p[1]-py; return [px+x*c-y*s, py+x*s+y*c, p[2]]; }; };

// materials: 0 team, 1 team dark, 2 metal, 3 wood, 4 gold, 5 skin, 6 iron, 7 horse, 8 leather, 9 white
function humanoid(mb,mat,w,h,d){ w=w||0.5; h=h||0.95; d=d||0.34; mb.box(0,h/2,0,w,h,d,mat); mb.box(0,h+0.15,0,0.27,0.27,0.27,5); }
function horse(mb,legMat,bodyMat,big){
  big=big||1;
  mb.box(0,0.92*big,0,0.44*big,0.5*big,1.32*big,bodyMat);
  for(const sx of [-0.15,0.15]) for(const sz of [-0.47,0.47]) mb.box(sx*big,0.34*big,sz*big,0.11,0.68*big,0.11,legMat);
  mb.with(rotXAt(0.5,1.05*big,0.6*big),()=>mb.box(0,1.3*big,0.62*big,0.22,0.55*big,0.28,bodyMat));
  mb.box(0,1.5*big,0.95*big,0.2,0.22,0.46*big,7);
  mb.box(0,1.0*big,-0.72*big,0.08,0.42,0.08,6);
}
function rider(mb,mat,big){ big=big||1; mb.box(0,1.45*big,-0.05,0.38,0.55,0.28,mat); mb.box(0,1.86*big,-0.05,0.24,0.24,0.24,5); for(const s of [-1,1]) mb.box(s*0.25,1.12*big,0.02,0.1,0.36,0.14,mat); }
const MESHDEF={
  sword(mb,lod){ humanoid(mb,0); if(lod) return; mb.box(0,1.32,0,0.31,0.08,0.31,2); mb.box(0,0.5,0,0.53,0.08,0.36,8);
    mb.with(rotXAt(0.55,0.6,0.12),()=>{ mb.box(0.34,0.98,0.12,0.06,0.82,0.07,2); mb.box(0.34,0.58,0.12,0.2,0.05,0.08,4); });
    mb.box(-0.31,0.62,0.06,0.08,0.44,0.44,1); },
  spear(mb,lod){ humanoid(mb,0,0.46,0.92,0.32); mb.with(rotXAt(0.22,0.6,0),()=>{ mb.box(0.3,1.25,0.1,0.05,2.5,0.05,3); if(!lod) mb.pyr(0.3,2.5,0.1,0.11,0.32,0.11,2); }); if(lod) return; mb.prismY(0,1.2,0,0.17,0.22,6,2,0); },
  shield(mb,lod){ humanoid(mb,1); mb.box(0,0.62,0.29,0.82,1.1,0.1,0); if(lod) return; mb.box(0,0.68,0.35,0.16,0.16,0.06,2); mb.box(0,1.32,0,0.31,0.08,0.31,2); mb.box(0,0.62,0.345,0.84,0.06,0.02,4); },
  heavy(mb,lod){ mb.box(0,0.5,0,0.64,1.0,0.46,2); mb.box(0,1.19,0,0.33,0.36,0.33,2); mb.box(0,0.55,0.235,0.4,0.74,0.02,0); if(lod) return;
    for(const s of [-1,1]) mb.box(s*0.37,0.9,0,0.2,0.18,0.48,0); mb.box(0,1.2,0.17,0.2,0.04,0.01,6); mb.box(0,1.42,0,0.05,0.12,0.24,0);
    mb.box(0.42,0.78,0.16,0.06,0.62,0.06,3); mb.box(0.42,1.12,0.16,0.17,0.17,0.17,6); },
  bers(mb,lod){ mb.octa(0,0.66,0,0.36,0.62,0.28,0); mb.box(0,1.38,0,0.26,0.26,0.26,5); if(lod) return;
    for(const s of [-1,1]){ mb.with(rotZAt(-s*0.4,s*0.42,0.5),()=>{ mb.box(s*0.42,0.85,0.1,0.05,0.7,0.05,3); mb.box(s*0.47,1.13,0.1,0.07,0.2,0.26,2); }); mb.with(rotZAt(s*0.5,s*0.1,1.5),()=>mb.box(s*0.18,1.58,0,0.05,0.22,0.05,9)); }
    mb.box(0,1.5,0,0.29,0.06,0.29,8); },
  archer(mb,lod){ mb.prismY(0,0,0,0.36,1.0,6,0,0.15); mb.box(0,1.13,0,0.26,0.26,0.26,5); if(lod) return; mb.pyr(0,1.22,0,0.32,0.3,0.32,1);
    mb.box(-0.32,0.85,0.18,0.05,1.25,0.05,3); mb.box(-0.29,0.85,0.18,0.012,1.15,0.012,9); mb.box(0.13,0.85,-0.2,0.13,0.48,0.13,8); mb.box(0.13,1.13,-0.2,0.11,0.1,0.11,9); },
  xbow(mb,lod){ mb.prismY(0,0,0,0.4,0.95,4,0,0.25,Math.PI/4); mb.box(0,1.1,0,0.26,0.26,0.26,5); mb.box(0.12,0.82,0.3,0.08,0.08,0.64,3); if(lod) return;
    mb.prismY(0,1.22,0,0.27,0.05,8,2); mb.prismY(0,1.25,0,0.15,0.13,8,2); mb.box(0.12,0.82,0.6,0.62,0.05,0.06,2); },
  musket(mb,lod){ mb.prismY(0,0,0,0.31,0.95,6,0); mb.box(0,1.1,0,0.26,0.26,0.26,5); mb.prismY(0,1.22,0,0.34,0.06,3,6,0.34,Math.PI/2); if(lod) return;
    mb.prismY(0,1.27,0,0.16,0.14,6,6); mb.with(rotXAt(-0.4,0.9,0.1),()=>mb.box(0.24,0.9,0.4,0.055,0.055,1.45,6)); mb.box(0,0.62,0.16,0.48,0.07,0.02,9); },
  lcav(mb,lod){ horse(mb,6,7); rider(mb,0); if(lod) return; mb.with(rotXAt(0.7,1.4,0.1),()=>mb.box(0.3,1.68,0.1,0.05,0.72,0.05,2)); mb.box(0,2.02,-0.05,0.26,0.07,0.26,1); },
  hcav(mb,lod){ horse(mb,6,1,1.08); mb.box(0,1.58,-0.05,0.44,0.6,0.32,2); mb.box(0,2.0,-0.05,0.28,0.32,0.28,2); if(lod) return;
    for(const s of [-1,1]) mb.box(s*0.27,1.18,0.02,0.1,0.38,0.15,2); mb.box(0,2.27,-0.05,0.06,0.26,0.3,0); mb.box(-0.27,1.55,0.02,0.06,0.5,0.4,0); mb.box(0,0.8,0,0.5,0.1,1.4,0); },
  lancer(mb,lod){ horse(mb,6,7); mb.box(0,0.8,0,0.5,0.34,1.38,0); rider(mb,0); mb.box(0.27,1.55,0.9,0.06,0.06,2.9,3); if(lod) return;
    mb.box(0.27,1.55,2.42,0.035,0.035,0.28,2); mb.box(0.27,1.7,0.2,0.012,0.22,0.4,9); mb.box(0,2.03,-0.05,0.27,0.12,0.27,2); },
  cata(mb,lod){ mb.box(0,0.42,0,1.3,0.3,2.0,3); mb.with(rotXAt(0.62,0.75,0.3),()=>{ mb.box(0,0.75,-0.3,0.14,0.14,2.2,3); mb.box(0,0.86,-1.32,0.44,0.18,0.44,6); if(!lod) mb.box(0,0.62,0.72,0.5,0.5,0.5,2); });
    if(lod) return; for(const sx of [-0.72,0.72]) for(const sz of [-0.65,0.65]) mb.cyl(sx,0.35,sz,0.35,0.12,8,6,'x');
    for(const s of [-1,1]) mb.box(s*0.42,1.0,0.3,0.12,1.0,0.12,3); mb.box(0,1.45,0.3,0.96,0.12,0.12,3);
    mb.box(0.6,1.25,-0.85,0.05,1.7,0.05,3); mb.box(0.6,1.85,-0.6,0.02,0.4,0.5,0); },
  ballista(mb,lod){ mb.box(0,0.35,0,0.9,0.3,1.3,3); mb.box(0,1.0,0.1,0.16,0.12,1.9,3); mb.box(0,1.0,0.78,1.7,0.1,0.12,3); if(lod) return;
    mb.box(0,0.72,0,0.44,0.42,0.44,0); mb.box(0,1.0,0.58,1.6,0.02,0.02,9); mb.box(0,1.09,0.2,0.06,0.06,1.4,2); mb.box(0,0.62,0.68,0.9,0.5,0.06,0);
    for(const sx of [-0.48,0.48]) for(const sz of [-0.5,0.5]) mb.cyl(sx,0.25,sz,0.25,0.1,8,6,'x'); },
  cannon(mb,lod){ mb.box(0,0.45,-0.15,0.7,0.35,1.3,3); mb.with(rotXAt(-0.1,0.78,0.1),()=>mb.cyl(0,0.8,0.35,0.17,1.8,8,6,'z'));
    for(const s of [-1,1]) mb.cyl(s*0.45,0.45,0.05,0.45,0.12,lod?6:10,3,'x'); if(lod) return;
    mb.box(0,0.25,-0.9,0.3,0.18,0.9,3); mb.with(rotXAt(-0.1,0.78,0.1),()=>mb.cyl(0,0.8,1.2,0.21,0.14,8,6,'z')); mb.box(0,0.64,-0.15,0.72,0.08,1.0,0);
    for(const s of [-1,1]) mb.cyl(s*0.53,0.45,0.05,0.1,0.06,6,6,'x'); },
  mortar(mb,lod){ mb.box(0,0.2,0,1.0,0.4,1.0,3); mb.with(rotXAt(0.6,0.45,0),()=>{ mb.prismY(0,0.3,0,0.33,0.95,8,6,0.3); if(!lod) mb.prismY(0,1.2,0,0.38,0.08,8,6); });
    if(lod) return; mb.box(0,0.42,0,1.02,0.08,1.02,0); },
  cmdr(mb,lod){ humanoid(mb,0,0.56,1.0,0.4); mb.box(-0.34,1.4,-0.1,0.06,2.8,0.06,3); mb.box(-0.34,2.45,-0.48,0.03,0.62,0.72,0); if(lod) return;
    mb.box(0,0.75,0,0.58,0.16,0.42,4); mb.box(0,0.62,-0.23,0.52,0.9,0.05,1); mb.box(0,1.35,0,0.31,0.1,0.31,4);
    for(const sx of [-0.1,0.1]) mb.pyr(sx,1.4,0.1,0.07,0.12,0.07,4); mb.octa(-0.34,2.86,-0.1,0.08,0.12,0.08,4); },
  medic(mb,lod){ humanoid(mb,9,0.48,0.92,0.34); mb.box(0,0.62,0.175,0.09,0.32,0.02,0); mb.box(0,0.66,0.175,0.28,0.09,0.02,0); if(lod) return;
    mb.box(0,1.28,0,0.29,0.1,0.29,0); mb.box(0.3,0.55,0,0.12,0.25,0.22,8); },
  eng(mb,lod){ humanoid(mb,0,0.52,0.92,0.36); mb.box(0,0.72,-0.27,0.4,0.45,0.18,3); if(lod) return;
    mb.box(0,0.45,0.19,0.44,0.55,0.02,8); mb.prismY(0,1.2,0,0.19,0.13,8,4); mb.box(0.34,0.7,0.06,0.05,0.95,0.05,3); mb.box(0.34,0.22,0.06,0.2,0.22,0.03,2); },
  elite(mb,lod){ mb.box(0,0.52,0,0.62,1.05,0.46,0); mb.octa(0,0.82,0.1,0.37,0.35,0.25,4); mb.box(0,1.2,0,0.32,0.34,0.32,4); if(lod) return;
    for(const s of [-1,1]) mb.box(s*0.4,0.95,0,0.22,0.2,0.5,4); mb.box(0,1.49,-0.05,0.06,0.28,0.36,0); mb.box(0,0.6,-0.25,0.56,0.95,0.05,1);
    mb.with(rotXAt(0.35,0.7,0.2),()=>{ mb.box(0.38,1.15,0.2,0.08,1.65,0.08,2); mb.box(0.38,0.6,0.2,0.3,0.06,0.1,4); }); },
};
function buildUnitMeshes(){
  const parts=[], ranges=[]; let off=0;
  for(let t=0;t<NT;t++) for(let lod=0;lod<2;lod++){
    const mb=new MB(); MESHDEF[UNITS[t].id](mb,lod); const cnt=mb.v.length/7;
    parts.push(mb.v); ranges.push({first:off,count:cnt}); off+=cnt; }
  const pm=new MB(); pm.octa(0,0,0,1,1,1,0); parts.push(pm.v); const proj={first:off,count:pm.v.length/7}; off+=proj.count;
  const data=new Float32Array(off*7); let o=0; for(const p of parts){ data.set(p,o); o+=p.length; }
  return {data,ranges,proj};
}

/* ---------- terrain geometry ---------- */
function cellColor(T,k,i,j,noise){
  const des=T.theme==='desert';
  let c;
  switch(k){
    case T_FOREST: c=des?[0.46,0.5,0.28]:[0.26,0.4,0.21]; break;
    case T_WATER: c=[0.2,0.3,0.3]; break;
    case T_FORD: c=[0.4,0.44,0.36]; break;
    case T_ROCK: c=[0.5,0.48,0.46]; break;
    case T_SAND: c=[0.83,0.71,0.48]; break;
    case T_WALL: c=[0.46,0.44,0.41]; break;
    case T_STAKES: c=des?[0.6,0.5,0.34]:[0.43,0.37,0.25]; break;
    case T_ROAD: c=des?[0.72,0.6,0.42]:[0.6,0.54,0.4]; break;
    default: c=des?[0.83,0.71,0.48]:[0.4,0.55,0.28];
  }
  const v=0.93+noise*0.14; return [c[0]*v,c[1]*v,c[2]*v];
}
function hash2(i,j){ let h=(i*374761393+j*668265263)|0; h=(h^(h>>>13))*1274126177|0; return ((h^(h>>>16))>>>0)/4294967296; }
function buildTerrainGeometry(T){
  const VW=TW+1, H=T.h;
  // per-cell colours
  const cc=new Float32Array(TW*TH*3);
  for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){ const c=cellColor(T,T.k[j*TW+i],i,j,hash2(i,j)); cc.set(c,(j*TW+i)*3); }
  const vc=new Float32Array(VW*(TH+1)*3);
  for(let j=0;j<=TH;j++) for(let i=0;i<=TW;i++){
    let r=0,g=0,b=0,n=0;
    for(const [di,dj] of [[-1,-1],[0,-1],[-1,0],[0,0]]){ const ci=i+di, cj=j+dj; if(ci<0||cj<0||ci>=TW||cj>=TH) continue; const o=(cj*TW+ci)*3; r+=cc[o]; g+=cc[o+1]; b+=cc[o+2]; n++; }
    const h=H[j*VW+i], t=0.94+clamp(h*0.022,-0.12,0.2);
    vc[(j*VW+i)*3]=r/n*t; vc[(j*VW+i)*3+1]=g/n*t; vc[(j*VW+i)*3+2]=b/n*t;
  }
  const mb=new MB();
  const V=(i,j)=>[X0+i*TC,H[j*VW+i],Z0+j*TC];
  const C=(i,j)=>[vc[(j*VW+i)*3],vc[(j*VW+i)*3+1],vc[(j*VW+i)*3+2]];
  const out=[];
  const push=(p,n,c)=>out.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2]);
  const triN=(a,b,c)=>{ const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2]; let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx; if(ny<0){nx=-nx;ny=-ny;nz=-nz;} const l=Math.hypot(nx,ny,nz)||1; return [nx/l,ny/l,nz/l]; };
  for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){
    const a=V(i,j), b=V(i+1,j), c=V(i+1,j+1), d=V(i,j+1);
    const ca=C(i,j), cb=C(i+1,j), cc2=C(i+1,j+1), cd=C(i,j+1);
    if((i+j)&1){ let n=triN(a,b,c); push(a,n,ca); push(b,n,cb); push(c,n,cc2); n=triN(a,c,d); push(a,n,ca); push(c,n,cc2); push(d,n,cd); }
    else { let n=triN(a,b,d); push(a,n,ca); push(b,n,cb); push(d,n,cd); n=triN(b,c,d); push(b,n,cb); push(c,n,cc2); push(d,n,cd); }
  }
  // apron
  const des=T.theme==='desert', ap=des?[0.66,0.57,0.4]:[0.33,0.44,0.25], E=900;
  const quadA=(x0,z0,x1,z1)=>{ const n=[0,1,0]; push([x0,0,z0],n,ap); push([x1,0,z0],n,ap); push([x1,0,z1],n,ap); push([x0,0,z0],n,ap); push([x1,0,z1],n,ap); push([x0,0,z1],n,ap); };
  quadA(X0-E,Z0-E,X1+E,Z0); quadA(X0-E,Z1,X1+E,Z1+E); quadA(X0-E,Z0,X0,Z1); quadA(X1,Z0,X1+E,Z1);
  // props
  for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){
    const k=T.k[j*TW+i], x=X0+(i+.5)*TC, z=Z0+(j+.5)*TC, r=hash2(i+11,j+7), h=heightAt(x,z);
    if(k===T_FOREST && r<0.6){
      const s=0.75+hash2(i,j+3)*0.6, jx=(hash2(i+3,j)-.5)*1.2, jz=(hash2(i,j+9)-.5)*1.2, gv=hash2(i+5,j+5);
      const tx=x+jx, tz=z+jz, ty=heightAt(tx,tz);
      mb.prismY(tx,ty,tz,0.17*s,1.0*s,4,[0.34,0.24,0.15]);
      const g=des?[0.36+gv*0.08,0.42+gv*0.06,0.2]:[0.16+gv*0.08,0.33+gv*0.1,0.17+gv*0.04];
      mb.prismY(tx,ty+0.8*s,tz,1.25*s,2.9*s,6,g,0,gv*3);
    } else if(k===T_WALL && T.bld[j*TW+i]===0){
      const sv=0.9+r*0.12, st=[0.6*sv,0.58*sv,0.53*sv];
      mb.box(x,h+1.4,z,2.02,2.8,2.02,st);
      if((i+j)&1) mb.box(x,h+3.0,z,0.9,0.45,0.9,st);
    } else if(T.bld[j*TW+i]>0 && T.bld[j*TW+i]<255){
      const s=T.bld[j*TW+i]*TC, bx=x-TC/2+s/2, bz=z-TC/2+s/2, bh=heightAt(bx,bz);
      mb.box(bx,bh+1.3,bz,s-0.2,2.6,s-0.2,[0.82,0.76,0.64]);
      mb.pyr(bx,bh+2.6,bz,s+0.3,2.2,s+0.3,[0.6,0.3,0.22]);
    } else if(k===T_ROCK && r<0.16){
      const s=0.8+hash2(i,j+1)*1.6; mb.octa(x,h+s*0.4,z,s,s*0.8,s*0.9,[0.52+r*0.3,0.5+r*0.3,0.48+r*0.3]);
    } else if(k===T_STAKES){
      const col=[0.5,0.38,0.24];
      for(let n=0;n<3;n++){ const ox=(n-1)*0.6; mb.with(p=>{ const q=rotXAt(0.7,0,0)(p); return [q[0]+x+ox,q[1]+h,q[2]+z]; },()=>mb.box(0,0.6,0,0.1,1.3,0.1,col)); }
    }
  }
  const props=new Float32Array(mb.v);
  const ground=new Float32Array(out.length+props.length); ground.set(out); ground.set(props,out.length);
  // water surface
  const w=[];
  for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){ const k=T.k[j*TW+i]; if(k!==T_WATER&&k!==T_FORD) continue;
    const x0=X0+i*TC, z0=Z0+j*TC, y=-0.32, n=[0,1,0], c=k===T_WATER?[0.16,0.36,0.44]:[0.3,0.48,0.52];
    const P=(x,z)=>w.push(x,y,z,n[0],n[1],n[2],c[0],c[1],c[2]);
    P(x0,z0); P(x0+TC,z0); P(x0+TC,z0+TC); P(x0,z0); P(x0+TC,z0+TC); P(x0,z0+TC); }
  return {ground, water:new Float32Array(w)};
}
function terrainImage(T){
  const cv=document.createElement('canvas'); cv.width=TW; cv.height=TH;
  const ctx=cv.getContext('2d'), img=ctx.createImageData(TW,TH), VW=TW+1;
  for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){
    const c=cellColor(T,T.k[j*TW+i],i,j,hash2(i,j));
    const hx=T.h[j*VW+i+1]-T.h[j*VW+i], hz=T.h[(j+1)*VW+i]-T.h[j*VW+i]; const sh=clamp(1+(-hx*0.5+hz*0.35)*0.25,0.7,1.25);
    let k2=1; if(T.k[j*TW+i]===T_WALL) k2=1.3;
    const o=(j*TW+i)*4; img.data[o]=clamp(c[0]*sh*k2*255,0,255); img.data[o+1]=clamp(c[1]*sh*k2*255,0,255); img.data[o+2]=clamp(c[2]*sh*k2*255,0,255); img.data[o+3]=255;
  }
  ctx.putImageData(img,0,0); return cv;
}

/* ---------- shared instance building ---------- */
const INST=new Float32Array(MAXU*16);
const PINST=new Float32Array(MAXP*8);
const QINST=new Float32Array(MAXQ*8);
const bucketCount=new Int32Array(NT*2), bucketOff=new Int32Array(NT*2), bucketOf=new Uint8Array(MAXU);
const VIEW={alpha:1, hlGroup:-1, hlUnit:-1, zones:[null,null], time:0};
function buildUnitInstances(){
  bucketCount.fill(0);
  const ex=CAM.eye[0], ez=CAM.eye[2], lod2=Math.pow(Math.max(60,CAM.dist*0.55),2);
  for(let i=0;i<N;i++){ if(SS[i]===3){ bucketOf[i]=255; continue; } const dx=PX[i]-ex, dz=PZ[i]-ez; const b=TY[i]*2+((dx*dx+dz*dz>lod2)?1:0); bucketOf[i]=b; bucketCount[b]++; }
  let s=0; for(let b=0;b<NT*2;b++){ bucketOff[b]=s; s+=bucketCount[b]; }
  const total=s, cur=bucketOff.slice(), a=VIEW.alpha, hg=VIEW.hlGroup, hu=VIEW.hlUnit;
  for(let i=0;i<N;i++){
    const b=bucketOf[i]; if(b===255) continue;
    const o=(cur[b]++)*16, ty=TY[i], u=UNITS[ty];
    INST[o]=OX[i]+(PX[i]-OX[i])*a; INST[o+2]=OZ[i]+(PZ[i]-OZ[i])*a; INST[o+1]=PY[i]; INST[o+3]=FA[i];
    INST[o+4]=TM[i]; INST[o+5]=SS[i]===0?0:Math.min(1,Math.hypot(VX[i],VZ[i])/2.5); INST[o+6]=AT[i]; INST[o+7]=SS[i]===0?DE[i]:0;
    INST[o+8]=FL[i]; INST[o+9]=u.scale; INST[o+10]=(GR[i]===hg||i===hu)?1:0; INST[o+11]=(i*1.618)%6.283;
    INST[o+12]=u.foot; INST[o+13]=SS[i]===2?1:0; INST[o+14]=0; INST[o+15]=0;
  }
  return total;
}
const PW=[0.035,0.045,0.05,0.42,0.07,0.26,0.3], PL=[0.9,0.7,0.6,0.42,1.8,0.26,0.3];
function buildProjInstances(){
  let n=0; const a=VIEW.alpha;
  for(let p=0;p<pHigh;p++){ if(!PRL[p]) continue; const o=n*8;
    PINST[o]=POX[p]+(PRX[p]-POX[p])*a; PINST[o+1]=POY[p]+(PRY[p]-POY[p])*a; PINST[o+2]=POZ[p]+(PRZ[p]-POZ[p])*a; PINST[o+3]=0;
    PINST[o+4]=PRVX[p]; PINST[o+5]=PRVY[p]; PINST[o+6]=PRVZ[p]; PINST[o+7]=PRK[p]; n++; }
  return n;
}
function buildParticleInstances(){
  let n=0;
  for(let q=0;q<MAXQ;q++){ if(QL[q]<=0) continue; const o=n*8, f=QL[q]/QM[q];
    QINST[o]=QX[q]; QINST[o+1]=QY[q]; QINST[o+2]=QZ[q]; QINST[o+3]=QS[q];
    QINST[o+4]=QR[q]; QINST[o+5]=QGc[q]; QINST[o+6]=QB[q]; QINST[o+7]=QA[q]*Math.min(1,f*2.2); n++; }
  return n;
}

/* ---------- WebGPU renderer ---------- */
const WGSL=`
struct U { vp: mat4x4f, cam: vec4f, light: vec4f, team0: vec4f, team1: vec4f, fog: vec4f, zoneA: vec4f, zoneB: vec4f, right: vec4f, up: vec4f, sky: vec4f, hor: vec4f };
@group(0) @binding(0) var<uniform> u: U;
fn fogMix(c: vec3f, wp: vec3f) -> vec3f { let d = distance(wp, u.cam.xyz); let f = 1.0 - exp(-d * u.fog.w); return mix(c, u.fog.rgb, clamp(f*f, 0.0, 0.88)); }
fn lit(base: vec3f, n: vec3f) -> vec3f {
  let L = normalize(u.light.xyz); let diff = max(dot(n, L), 0.0);
  let hemi = mix(vec3f(0.34, 0.31, 0.28), vec3f(0.62, 0.68, 0.78), clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  return base * (hemi * 0.78 + vec3f(1.0, 0.94, 0.84) * diff * 0.8);
}
struct SkyOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vsSky(@builtin(vertex_index) vi: u32) -> SkyOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: SkyOut; o.pos = vec4f(p[vi], 0.9999, 1.0); o.uv = p[vi]; return o;
}
@fragment fn fsSky(i: SkyOut) -> @location(0) vec4f { let t = clamp(i.uv.y * 0.5 + 0.5, 0.0, 1.0); return vec4f(mix(u.hor.rgb, u.sky.rgb, t * t), 1.0); }

struct GOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) c: vec3f };
@vertex fn vsGround(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) c: vec3f) -> GOut { var o: GOut; o.pos = u.vp * vec4f(p, 1.0); o.wp = p; o.n = n; o.c = c; return o; }
fn zoneTint(c: vec3f, wp: vec3f, z: vec4f) -> vec3f {
  let tc = select(u.team0.rgb, u.team1.rgb, z.w > 0.5);
  let inside = step(z.x, wp.x) * step(wp.x, z.y) * step(abs(wp.z), ${Z1.toFixed(1)}) * z.z;
  var o = mix(c, tc, inside * 0.13);
  let e = min(abs(wp.x - z.x), abs(wp.x - z.y));
  return mix(o, tc, (1.0 - smoothstep(0.12, 0.55, e)) * 0.75 * step(abs(wp.z), ${Z1.toFixed(1)}) * z.z);
}
@fragment fn fsGround(i: GOut) -> @location(0) vec4f {
  let gq = i.wp.xz / 10.0;
  let fw = fwidth(gq) * 10.0;
  let g = abs(fract(gq + 0.5) - 0.5) * 10.0;
  let gl = 1.0 - smoothstep(0.0, max(fw.x, fw.y) * 1.3 + 0.06, min(g.x, g.y));
  var c = lit(i.c, normalize(i.n));
  let inField = step(abs(i.wp.x), ${X1.toFixed(1)}) * step(abs(i.wp.z), ${Z1.toFixed(1)});
  let showGrid = max(u.zoneA.z, u.zoneB.z);
  c = mix(c, c * 0.82, gl * 0.5 * showGrid * inField);
  c = zoneTint(c, i.wp, u.zoneA);
  c = zoneTint(c, i.wp, u.zoneB);
  return vec4f(fogMix(c, i.wp), 1.0);
}
@fragment fn fsWater(i: GOut) -> @location(0) vec4f {
  let t = u.cam.w; let v = normalize(u.cam.xyz - i.wp);
  let w = sin(i.wp.x * 0.7 + t * 1.3) * sin(i.wp.z * 0.6 - t * 1.1) + 0.5 * sin(i.wp.x * 1.9 - i.wp.z * 1.3 + t * 2.1);
  let n = normalize(vec3f(w * 0.07, 1.0, w * 0.05));
  let fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  let h = normalize(normalize(u.light.xyz) + v);
  let spec = pow(max(dot(n, h), 0.0), 70.0) * 0.55;
  let c = mix(i.c, vec3f(0.66, 0.78, 0.84), fres * 0.65) + vec3f(spec);
  return vec4f(fogMix(c, i.wp), 0.8);
}

struct UOut { @builtin(position) pos: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) col: vec3f, @location(3) emi: f32 };
fn matColor(m: i32, team: f32) -> vec3f {
  let tc = select(u.team0.rgb, u.team1.rgb, team > 0.5);
  var mats = array<vec3f, 10>(tc, tc * 0.52, vec3f(0.72, 0.75, 0.8), vec3f(0.47, 0.32, 0.19), vec3f(0.95, 0.74, 0.25), vec3f(0.93, 0.8, 0.66), vec3f(0.17, 0.17, 0.19), vec3f(0.5, 0.34, 0.21), vec3f(0.36, 0.25, 0.16), vec3f(0.94, 0.93, 0.89));
  return mats[clamp(m, 0, 9)];
}
@vertex fn vsUnit(@location(0) mp: vec3f, @location(1) mn: vec3f, @location(2) mm: f32, @location(3) a: vec4f, @location(4) b: vec4f, @location(5) c: vec4f, @location(6) d: vec4f) -> UOut {
  let t = u.cam.w; let death = b.w; let mv = b.y; let atk = b.z;
  var p = mp * c.y; var n = mn;
  let w = t * 10.0 + c.w;
  let bob = abs(sin(w)) * 0.09 * mv * (1.0 - death);
  let roll = sin(w) * 0.07 * mv * (1.0 - death) + death * 1.5708;
  let cr = cos(roll); let sr = sin(roll);
  p = vec3f(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z); n = vec3f(n.x * cr - n.y * sr, n.x * sr + n.y * cr, n.z);
  let lunge = sin(clamp(atk, 0.0, 1.0) * 3.14159);
  let pitch = lunge * 0.42 + d.y * 0.25;
  let cp = cos(pitch); let sp = sin(pitch);
  p = vec3f(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp); n = vec3f(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  p.z = p.z + lunge * 0.22 * c.y;
  p.y = p.y + bob + death * 0.26 * c.y;
  let cf = cos(a.w); let sf = sin(a.w);
  let wp = vec3f(sf * p.x + cf * p.z, p.y, -cf * p.x + sf * p.z) + a.xyz;
  let wn = vec3f(sf * n.x + cf * n.z, n.y, -cf * n.x + sf * n.z);
  var col = matColor(i32(mm + 0.5), b.x);
  col = mix(col, col * 0.42 + vec3f(0.05, 0.05, 0.04), death);
  col = mix(col, vec3f(1.0, 0.96, 0.9), c.x * 0.65);
  var o: UOut; o.pos = u.vp * vec4f(wp, 1.0); o.wp = wp; o.n = wn; o.col = col;
  o.emi = c.z * (0.32 + 0.18 * sin(t * 6.0)); return o;
}
@fragment fn fsUnit(i: UOut) -> @location(0) vec4f {
  let n = normalize(i.n); var c = lit(i.col, n);
  let v = normalize(u.cam.xyz - i.wp);
  let rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.18;
  c = c + vec3f(rim) + i.col * i.emi + vec3f(i.emi * 0.25);
  return vec4f(fogMix(c, i.wp), 1.0);
}
@vertex fn vsProj(@location(0) mp: vec3f, @location(1) mn: vec3f, @location(2) mm: f32, @location(3) a: vec4f, @location(4) b: vec4f) -> UOut {
  let k = clamp(i32(b.w + 0.5), 0, 6);
  var W = array<f32, 7>(0.035, 0.045, 0.05, 0.42, 0.07, 0.26, 0.3);
  var L = array<f32, 7>(0.9, 0.7, 0.6, 0.42, 1.8, 0.26, 0.3);
  var C = array<vec3f, 7>(vec3f(0.86, 0.8, 0.68), vec3f(0.3, 0.27, 0.24), vec3f(1.0, 0.92, 0.6), vec3f(0.46, 0.44, 0.41), vec3f(0.52, 0.37, 0.22), vec3f(0.13, 0.13, 0.14), vec3f(0.16, 0.15, 0.15));
  let vl = length(b.xyz);
  var f = vec3f(1.0, 0.0, 0.0); if (vl > 0.0001) { f = b.xyz / vl; }
  var r = cross(f, vec3f(0.0, 1.0, 0.0)); if (length(r) < 0.001) { r = vec3f(1.0, 0.0, 0.0); } r = normalize(r);
  let up = cross(r, f);
  let w = W[k]; let l = L[k] * 0.5;
  let wp = a.xyz + r * mp.x * w + up * mp.y * w + f * mp.z * l;
  let wn = normalize(r * mn.x * l + up * mn.y * l + f * mn.z * w);
  var o: UOut; o.pos = u.vp * vec4f(wp, 1.0); o.wp = wp; o.n = wn; o.col = C[k]; o.emi = select(0.0, 1.3, k == 2); return o;
}
struct SOut { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) a: f32 };
@vertex fn vsShadow(@location(0) q: vec2f, @location(3) a: vec4f, @location(4) b: vec4f, @location(5) c: vec4f, @location(6) d: vec4f) -> SOut {
  let s = d.x * c.y * (1.0 + b.w * 0.5);
  let wp = vec3f(a.x + q.x * s, a.y + 0.07, a.z + q.y * s);
  var o: SOut; o.pos = u.vp * vec4f(wp, 1.0); o.q = q; o.a = 0.34 * (1.0 - b.w * 0.45); return o;
}
@fragment fn fsShadow(i: SOut) -> @location(0) vec4f { let d = length(i.q); return vec4f(0.04, 0.05, 0.03, i.a * (1.0 - smoothstep(0.3, 1.0, d))); }
struct POut { @builtin(position) pos: vec4f, @location(0) q: vec2f, @location(1) c: vec4f, @location(2) wp: vec3f };
@vertex fn vsPart(@location(0) q: vec2f, @location(3) a: vec4f, @location(4) b: vec4f) -> POut {
  let wp = a.xyz + (u.right.xyz * q.x + u.up.xyz * q.y) * a.w;
  var o: POut; o.pos = u.vp * vec4f(wp, 1.0); o.q = q; o.c = b; o.wp = wp; return o;
}
@fragment fn fsPart(i: POut) -> @location(0) vec4f {
  let d = length(i.q); let al = i.c.a * (1.0 - smoothstep(0.2, 1.0, d));
  if (al < 0.004) { discard; }
  return vec4f(fogMix(i.c.rgb, i.wp), al);
}`;

const GPU_R={ok:false};
async function initWebGPU(canvas){
  if(!navigator.gpu) throw new Error('WebGPU is not available in this browser');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter) throw new Error('No WebGPU adapter');
  const device=await adapter.requestDevice();
  const ctx=canvas.getContext('webgpu');
  const format=navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({device,format,alphaMode:'opaque'});
  device.pushErrorScope('validation');
  const mod=device.createShaderModule({code:WGSL});
  const info=await mod.getCompilationInfo(); const errs=info.messages.filter(m=>m.type==='error');
  if(errs.length) throw new Error('Shader: '+errs.map(e=>e.lineNum+': '+e.message).join('; '));
  const ubuf=device.createBuffer({size:256,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const bgl=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
  const layout=device.createPipelineLayout({bindGroupLayouts:[bgl]});
  const bind=device.createBindGroup({layout:bgl,entries:[{binding:0,resource:{buffer:ubuf}}]});
  const SAMPLES=4;
  const blend={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
  const mk=(vs,fs,buffers,opt={})=>device.createRenderPipeline({layout,
    vertex:{module:mod,entryPoint:vs,buffers},
    fragment:{module:mod,entryPoint:fs,targets:[opt.blend?{format,blend}:{format}]},
    primitive:{topology:'triangle-list',cullMode:'none'},
    depthStencil:{format:'depth24plus',depthWriteEnabled:!!opt.write,depthCompare:opt.cmp||'less'},
    multisample:{count:SAMPLES}});
  const gvb={arrayStride:36,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x3'}]};
  const mvb={arrayStride:28,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32'}]};
  const uib={arrayStride:64,stepMode:'instance',attributes:[3,4,5,6].map((l,k)=>({shaderLocation:l,offset:k*16,format:'float32x4'}))};
  const qvb={arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:'float32x2'}]};
  const pib={arrayStride:32,stepMode:'instance',attributes:[{shaderLocation:3,offset:0,format:'float32x4'},{shaderLocation:4,offset:16,format:'float32x4'}]};
  const P={
    sky:mk('vsSky','fsSky',[],{cmp:'always'}),
    ground:mk('vsGround','fsGround',[gvb],{write:true}),
    water:mk('vsGround','fsWater',[gvb],{blend:true}),
    unit:mk('vsUnit','fsUnit',[mvb,uib],{write:true}),
    proj:mk('vsProj','fsUnit',[mvb,pib],{write:true}),
    shadow:mk('vsShadow','fsShadow',[qvb,uib],{blend:true,cmp:'less-equal'}),
    part:mk('vsPart','fsPart',[qvb,pib],{blend:true}),
  };
  const err=await device.popErrorScope();
  if(err) throw new Error('Pipeline: '+err.message);
  const meshes=buildUnitMeshes();
  const meshBuf=device.createBuffer({size:meshes.data.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}); device.queue.writeBuffer(meshBuf,0,meshes.data);
  const quad=new Float32Array([-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]);
  const quadBuf=device.createBuffer({size:quad.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}); device.queue.writeBuffer(quadBuf,0,quad);
  const instBuf=device.createBuffer({size:INST.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  const projBuf=device.createBuffer({size:PINST.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  const partBuf=device.createBuffer({size:QINST.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  Object.assign(GPU_R,{ok:true,device,ctx,format,P,bind,ubuf,meshes,meshBuf,quadBuf,instBuf,projBuf,partBuf,groundBuf:null,groundCount:0,waterBuf:null,waterCount:0,msaa:null,depth:null,w:0,h:0,SAMPLES,ud:new Float32Array(64)});
  device.lost.then(info=>{ GPU_R.ok=false; if(typeof onGpuLost==='function') onGpuLost(info); });
}
function gpuSetTerrain(T){
  if(!GPU_R.ok) return;
  const {device}=GPU_R, geo=buildTerrainGeometry(T);
  if(GPU_R.groundBuf) GPU_R.groundBuf.destroy(); if(GPU_R.waterBuf) GPU_R.waterBuf.destroy();
  GPU_R.groundBuf=device.createBuffer({size:Math.max(64,geo.ground.byteLength),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}); device.queue.writeBuffer(GPU_R.groundBuf,0,geo.ground); GPU_R.groundCount=geo.ground.length/9;
  GPU_R.waterBuf=device.createBuffer({size:Math.max(64,geo.water.byteLength),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}); if(geo.water.length) device.queue.writeBuffer(GPU_R.waterBuf,0,geo.water); GPU_R.waterCount=geo.water.length/9;
}
const SKY={grass:{sky:[0.46,0.62,0.8],hor:[0.78,0.82,0.84],fog:[0.72,0.77,0.8]},desert:{sky:[0.55,0.66,0.8],hor:[0.92,0.84,0.7],fog:[0.88,0.8,0.68]}};
function gpuFrame(canvas){
  const R=GPU_R, {device}=R;
  const w=canvas.width, h=canvas.height;
  if(w!==R.w||h!==R.h||!R.msaa){
    if(R.msaa) R.msaa.destroy(); if(R.depth) R.depth.destroy();
    R.msaa=device.createTexture({size:[w,h],sampleCount:R.SAMPLES,format:R.format,usage:GPUTextureUsage.RENDER_ATTACHMENT});
    R.depth=device.createTexture({size:[w,h],sampleCount:R.SAMPLES,format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});
    R.w=w; R.h=h;
  }
  const s=SKY[TER.theme]||SKY.grass, U=R.ud;
  U.set(CAM.vp,0); U.set([...CAM.eye,VIEW.time],16); U.set([0.45,0.82,0.36,0],20);
  U.set([...TEAMCOL[0],1],24); U.set([...TEAMCOL[1],1],28); U.set([...s.fog,0.0021/MS],32);
  const za=VIEW.zones[0], zb=VIEW.zones[1];
  U.set(za?[za[0],za[1],1,0]:[0,0,0,0],36); U.set(zb?[zb[0],zb[1],1,1]:[0,0,0,0],40);
  U.set([...CAM.right,0],44); U.set([...CAM.up,0],48); U.set([...s.sky,1],52); U.set([...s.hor,1],56);
  device.queue.writeBuffer(R.ubuf,0,U);
  const nu=buildUnitInstances(); if(nu) device.queue.writeBuffer(R.instBuf,0,INST,0,nu*16);
  const np=buildProjInstances(); if(np) device.queue.writeBuffer(R.projBuf,0,PINST,0,np*8);
  const nq=buildParticleInstances(); if(nq) device.queue.writeBuffer(R.partBuf,0,QINST,0,nq*8);
  const enc=device.createCommandEncoder();
  const pass=enc.beginRenderPass({colorAttachments:[{view:R.msaa.createView(),resolveTarget:R.ctx.getCurrentTexture().createView(),loadOp:'clear',storeOp:'discard',clearValue:{r:s.fog[0],g:s.fog[1],b:s.fog[2],a:1}}],
    depthStencilAttachment:{view:R.depth.createView(),depthLoadOp:'clear',depthClearValue:1,depthStoreOp:'discard'}});
  pass.setBindGroup(0,R.bind);
  pass.setPipeline(R.P.sky); pass.draw(3);
  if(R.groundCount){ pass.setPipeline(R.P.ground); pass.setVertexBuffer(0,R.groundBuf); pass.draw(R.groundCount); }
  if(nu){
    pass.setPipeline(R.P.unit); pass.setVertexBuffer(0,R.meshBuf); pass.setVertexBuffer(1,R.instBuf);
    for(let b=0;b<NT*2;b++){ const c=bucketCount[b]; if(!c) continue; const rg=R.meshes.ranges[b]; pass.draw(rg.count,c,rg.first,bucketOff[b]); }
    pass.setPipeline(R.P.shadow); pass.setVertexBuffer(0,R.quadBuf); pass.setVertexBuffer(1,R.instBuf); pass.draw(6,nu);
  }
  if(np){ pass.setPipeline(R.P.proj); pass.setVertexBuffer(0,R.meshBuf); pass.setVertexBuffer(1,R.projBuf); pass.draw(R.meshes.proj.count,np,R.meshes.proj.first,0); }
  if(R.waterCount){ pass.setPipeline(R.P.water); pass.setVertexBuffer(0,R.waterBuf); pass.draw(R.waterCount); }
  if(nq){ pass.setPipeline(R.P.part); pass.setVertexBuffer(0,R.quadBuf); pass.setVertexBuffer(1,R.partBuf); pass.draw(6,nq); }
  pass.end(); device.queue.submit([enc.finish()]);
  return nu;
}

/* ---------- Canvas 2D fallback (top-down tactical view) ---------- */
const R2D={ctx:null,img:null};
function r2dSetTerrain(T){ R2D.img=terrainImage(T); }
function r2dFrame(canvas){
  const ctx=R2D.ctx||(R2D.ctx=canvas.getContext('2d')); const W=canvas.width, H=canvas.height;
  const s=H/(CAM.dist*0.9+20), sy=Math.sin(CAM.yaw), cy=Math.cos(CAM.yaw), tx=CAM.tx, tz=CAM.tz;
  const sk=SKY[TER.theme]||SKY.grass;
  ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=`rgb(${sk.fog.map(v=>v*200|0).join(',')})`; ctx.fillRect(0,0,W,H);
  const toS=(x,z)=>[W/2+s*((x-tx)*sy-(z-tz)*cy), H/2+s*((x-tx)*cy+(z-tz)*sy)];
  const o=toS(X0,Z0);
  ctx.setTransform(TC*s*sy, TC*s*cy, -TC*s*cy, TC*s*sy, o[0], o[1]);
  ctx.imageSmoothingEnabled=true; if(R2D.img) ctx.drawImage(R2D.img,0,0);
  const za=VIEW.zones[0], zb=VIEW.zones[1];
  for(const [z,t] of [[za,0],[zb,1]]) if(z){ ctx.fillStyle=t?'rgba(220,70,55,0.12)':'rgba(70,115,230,0.12)'; ctx.fillRect((z[0]-X0)/TC,0,(z[1]-z[0])/TC,TH); }
  ctx.setTransform(1,0,0,1,0,0);
  const a=VIEW.alpha, cols=[['#3f73e6','#1d3a80','#8fb0ff'],['#e2483b','#7a231c','#ffb0a6']];
  const sz=Math.max(1.6,s*0.9);
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<N;i++){
      const st=SS[i]; if(st===3) continue; if((st===0)!==(pass===0)) continue;
      const x=OX[i]+(PX[i]-OX[i])*a, z=OZ[i]+(PZ[i]-OZ[i])*a; const p=toS(x,z); if(p[0]<-10||p[1]<-10||p[0]>W+10||p[1]>H+10) continue;
      const u=UNITS[TY[i]], r=sz*u.foot*1.4;
      ctx.fillStyle= st===0 ? 'rgba(40,36,30,0.35)' : (FL[i]>0.5?'#fff':(GR[i]===VIEW.hlGroup||i===VIEW.hlUnit)?cols[TM[i]][2]:cols[TM[i]][st===2?1:0]);
      if(s>5 && st!==0){ ctx.beginPath(); if(u.cls==='rng'){ ctx.moveTo(p[0],p[1]-r); ctx.lineTo(p[0]+r,p[1]+r); ctx.lineTo(p[0]-r,p[1]+r); } else if(u.cls==='cav'){ ctx.ellipse(p[0],p[1],r*1.2,r*0.7,FA[i]-CAM.yaw,0,TAU); } else if(u.cls==='sie'){ ctx.rect(p[0]-r,p[1]-r,r*2,r*2); } else ctx.arc(p[0],p[1],r,0,TAU); ctx.fill(); }
      else ctx.fillRect(p[0]-r,p[1]-r,r*2,r*2);
    }
  }
  ctx.strokeStyle='rgba(60,50,40,0.7)'; ctx.lineWidth=Math.max(1,s*0.08);
  for(let p=0;p<pHigh;p++){ if(!PRL[p]) continue; const q=toS(PRX[p],PRZ[p]), q2=toS(PRX[p]-PRVX[p]*0.04,PRZ[p]-PRVZ[p]*0.04); ctx.beginPath(); ctx.moveTo(q[0],q[1]); ctx.lineTo(q2[0],q2[1]); ctx.stroke(); }
  for(let q=0;q<MAXQ;q++){ if(QL[q]<=0||QS[q]<0.8) continue; const p=toS(QX[q],QZ[q]); ctx.fillStyle=`rgba(${QR[q]*255|0},${QGc[q]*255|0},${QB[q]*255|0},${QA[q]*0.5*QL[q]/QM[q]})`; ctx.beginPath(); ctx.arc(p[0],p[1],QS[q]*s*0.6,0,TAU); ctx.fill(); }
}
