// Editable construction source for architecture and floor-surface display resources.
// Every design keeps its branch mounting envelope. Geometry changes are structural.
const color={base:'#c8b79f',dark:'#59645e',light:'#e8dfcf',accent:'#9c7857',glass:'#b8d9d2',green:'#789977'};
const designs=[];
function model(branch,style,label){const m={id:`${branch}-${style}`,branch,label,classification:'independent-construction',parts:[]};designs.push(m);return m;}
function part(m,name,geometry,args,position,material='base',rotation=[0,0,0],scale=[1,1,1]){
  const localPosition=[...position];
  if(m.branch==='window-panel')localPosition[2]+=0.05;
  m.parts.push({name,geometry,args,position:localPosition,rotation,scale,color:color[material],roughness:.78});
}
const box=(m,n,size,p,mat='base',r)=>part(m,n,'BoxGeometry',size,p,mat,r);
const cyl=(m,n,rt,rb,h,p,mat='dark',r)=>part(m,n,'CylinderGeometry',[rt,rb,h,16],p,mat,r);

for(const style of ['grid','plank','tile','herringbone']){
  const m=model('floor-panel',style,{grid:'细格地板',plank:'长条地板',tile:'四格地砖',herringbone:'人字拼地板'}[style]);
  box(m,'floor-base',[1,.008,1],[0,.004,0],'base');
  if(style==='grid'){
    for(const x of [-.25,0,.25])box(m,`grid-x-${x}`,[.012,.002,1],[x,.009,0],'dark');
    for(const z of [-.25,0,.25])box(m,`grid-z-${z}`,[1,.002,.012],[0,.009,z],'dark');
  }
  if(style==='plank')for(let i=0;i<5;i++)box(m,`plank-${i}`,[.18,.002,.94],[-.4+i*.2,.009,0],i%2?'light':'accent');
  if(style==='tile')for(const x of [-.25,.25])for(const z of [-.25,.25])box(m,`tile-${x}-${z}`,[.47,.002,.47],[x,.009,z],'light');
  if(style==='herringbone')for(let i=0;i<3;i++){
    const z=-.28+i*.28;
    box(m,`chevron-left-${i}`,[.22,.002,.04],[-.11,.009,z],'accent',[0,.55,0]);
    box(m,`chevron-right-${i}`,[.22,.002,.04],[.11,.009,z],'light',[0,-.55,0]);
  }
}

for(const style of ['slat','brick','panel','ribbed']){
  const m=model('wall-panel',style,{slat:'竖向木格墙板',brick:'横向砖缝墙板',panel:'分格墙板',ribbed:'竖向凸棱墙板'}[style]);
  box(m,'wall-base',[1,2.8,.04],[0,1.4,.02],'base');
  if(style==='slat')for(let i=0;i<7;i++)box(m,`slat-${i}`,[.055,2.62,.01],[-.42+i*.14,1.4,.045],'accent');
  if(style==='brick'){
    for(let i=0;i<7;i++)box(m,`course-${i}`,[1,.018,.01],[0,.25+i*.4,.045],'light');
    for(let row=0;row<7;row++)for(const x of [-.25,.25])box(m,`joint-${row}-${x}`,[.018,.38,.01],[x+(row%2?.125:-.125),.2+row*.4,.045],'light');
  }
  if(style==='panel')for(const x of [-.3,0,.3]){box(m,`panel-post-${x}`,[.035,2.62,.01],[x,1.4,.045],'dark');box(m,`panel-cap-${x}`,[.23,.035,.01],[x,1.32,.045],'accent');}
  if(style==='ribbed')for(let i=0;i<9;i++)box(m,`rib-${i}`,[.035,2.65,.01],[-.44+i*.11,1.4,.045],'dark');
}

function doorBase(m){
  box(m,'left-jamb',[.15,2.2,.1],[-.775,1.1,.05],'base');
  box(m,'right-jamb',[.15,2.2,.1],[.775,1.1,.05],'base');
  box(m,'header',[1.7,.2,.1],[0,2.3,.05],'base');
}
for(const style of ['plain','stepped','inset','crown']){
  const m=model('door-frame',style,{plain:'直线门框',stepped:'阶梯门框',inset:'内嵌门框',crown:'冠饰门框'}[style]);
  doorBase(m);
  if(style==='stepped')for(const x of [-.72,.72])box(m,`step-${x}`,[.11,.08,.1],[x,2.36,.05],'accent');
  if(style==='inset'){box(m,'left-trim',[.045,2.1,.02],[-.73,1.1,.09],'dark');box(m,'right-trim',[.045,2.1,.02],[.73,1.1,.09],'dark');box(m,'top-trim',[1.36,.045,.02],[0,2.24,.09],'dark');}
  if(style==='crown'){box(m,'crown-center',[.5,.1,.1],[0,2.35,.05],'accent');for(const x of [-.55,.55])box(m,`crown-wing-${x}`,[.35,.06,.1],[x,2.35,.05],'accent');}
}

function windowFrame(m){
  box(m,'frame-top',[.9,.08,.1],[0,.36,0],'dark');box(m,'frame-bottom',[.9,.08,.1],[0,-.36,0],'dark');
  box(m,'frame-left',[.08,.64,.1],[-.41,0,0],'dark');box(m,'frame-right',[.08,.64,.1],[.41,0,0],'dark');
}
for(const style of ['cross','lattice','slat','round']){
  const m=model('window-panel',style,{cross:'十字分格窗',lattice:'菱格窗',slat:'横向百叶窗',round:'圆形内窗'}[style]);
  windowFrame(m);
  if(style==='cross'){box(m,'pane',[.72,.56,.035],[0,0,.018],'glass');box(m,'mullion-v',[.035,.56,.04],[0,0,.03],'dark');box(m,'mullion-h',[.72,.035,.04],[0,0,.03],'dark');}
  if(style==='lattice'){box(m,'pane',[.72,.56,.035],[0,0,.018],'glass');for(const x of [-.18,0,.18])box(m,`lattice-v-${x}`,[.025,.58,.04],[x,0,.03],'accent',[0,0,.35]);for(const y of [-.18,0,.18])box(m,`lattice-h-${y}`,[.74,.025,.04],[0,y,.03],'accent',[0,0,-.35]);}
  if(style==='slat'){for(let i=0;i<6;i++)box(m,`slat-${i}`,[.72,.06,.04],[0,-.27+i*.108,.03],i%2?'glass':'light');}
  if(style==='round'){box(m,'backing',[.82,.72,.035],[0,0,.018],'light');cyl(m,'round-pane',.30,.30,.035,[0,0,.02],'glass',[Math.PI/2,0,0]);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(m,`round-ray-${i}`,[.02,.34,.04],[Math.sin(a)*.14,Math.cos(a)*.14,.02],'accent',[0,0,-a]);}}
}

for(const style of ['border','inset','stripe','medallion']){
  const m=model('rug',style,{border:'边框地毯',inset:'嵌套方毯',stripe:'条纹地毯',medallion:'中心纹章地毯'}[style]);
  box(m,'rug-base',[1.6,.006,1.1],[0,.003,0],'base');
  if(style==='border'){box(m,'border-front',[1.5,.004,.035],[0,.008,.50],'accent');box(m,'border-back',[1.5,.004,.035],[0,.008,-.50],'accent');box(m,'border-left',[.035,.004,.96],[-.75,.008,0],'accent');box(m,'border-right',[.035,.004,.96],[.75,.008,0],'accent');}
  if(style==='inset'){box(m,'inner',[1.2,.004,.7],[0,.008,0],'light');box(m,'inner-edge',[1.0,.004,.04],[0,.008,.32],'dark');}
  if(style==='stripe')for(let i=0;i<6;i++)box(m,`stripe-${i}`,[1.48,.004,.06],[0,.008,-.36+i*.145],i%2?'accent':'light');
  if(style==='medallion'){box(m,'medallion-cross-x',[.7,.004,.08],[0,.008,0],'accent');box(m,'medallion-cross-z',[.08,.004,.7],[0,.008,0],'accent');for(const x of [-.3,.3])for(const z of [-.22,.22])box(m,`medallion-${x}-${z}`,[.14,.004,.14],[x,.008,z],'light');}
}

export default designs;
