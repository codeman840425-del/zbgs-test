// Editable construction source. Dimensions are metres; no external meshes/textures.
const palette={wood:'#b99770',dark:'#354a48',light:'#eee6d6',green:'#547d50',soil:'#514336',accent:'#b87655'};
const specs=[];
function model(branch,style,label){const m={id:`${branch}-${style}`,branch,label,classification:'independent-construction',parts:[]};specs.push(m);return m;}
function part(m,name,geometry,args,p,material='wood',rotation=[0,0,0],scale=[1,1,1]){m.parts.push({name,geometry,args,position:p,rotation,scale,color:palette[material],roughness:.75});}
const box=(m,n,s,p,c='wood',r)=>part(m,n,'BoxGeometry',s,p,c,r);
const cyl=(m,n,rt,rb,h,p,c='dark',r)=>part(m,n,'CylinderGeometry',[rt,rb,h,16],p,c,r);
const ball=(m,n,r,p,c='green',scale)=>part(m,n,'SphereGeometry',[r,16,10],p,c,[0,0,0],scale);
for(const style of ['trestle','pedestal','cabinet','frame']){
 const m=model('desk',style,({trestle:'双横梁桌',pedestal:'双柱底盘桌',cabinet:'侧柜书桌',frame:'金属框架桌'})[style]);
 box(m,'desktop',[2,.08,1],[0,.8,0]);
 if(style==='trestle')for(const x of [-.78,.78]){box(m,`beam${x}`,[.09,.68,.10],[x,.38,0]);box(m,`foot${x}`,[.15,.08,.85],[x,.04,0]);box(m,`top${x}`,[.15,.08,.85],[x,.72,0]);}
 if(style==='pedestal')for(const x of [-.68,.68]){cyl(m,`post${x}`,.05,.05,.7,[x,.41,0]);box(m,`base${x}`,[.5,.06,.8],[x,.03,0],'dark');}
 if(style==='cabinet'){box(m,'cabinet',[.42,.76,.84],[-.73,.38,0],'light');for(let i=0;i<3;i++){box(m,`drawer${i}`,[.38,.22,.03],[-.73,.14+i*.235,.435]);box(m,`handle${i}`,[.12,.025,.035],[-.73,.14+i*.235,.465],'dark');}for(const z of [-.4,.4])box(m,`leg${z}`,[.06,.76,.06],[.84,.38,z],'dark');}
 if(style==='frame'){for(const x of [-.85,.85])for(const z of [-.4,.4])box(m,`leg${x}${z}`,[.05,.76,.05],[x,.38,z],'dark');for(const x of [-.85,.85])box(m,`lower${x}`,[.05,.05,.85],[x,.08,0],'dark');box(m,'rear',[1.75,.07,.05],[0,.4,-.4],'dark');}
}
for(const style of ['compact','split','retro','console']){
 const m=model('keyboard',style,({compact:'紧凑机械键盘',split:'分体键盘',retro:'圆键复古键盘',console:'带旋钮控制键盘'})[style]);
 const halves=style==='split'?[-.14,.14]:[0];
 for(let j=0;j<halves.length;j++){const x=halves[j],w=style==='split'?.24:.54;box(m,`body${j}`,[w,.025,.16],[x,.0125,0],'dark');
 for(let row=0;row<3;row++)for(let col=0;col<(style==='split'?5:11);col++){const px=x-w/2+.025+col*(style==='split'?.045:.048),pz=-.05+row*.046;if(style==='retro')cyl(m,`key${j}-${row}-${col}`,.016,.016,.012,[px,.031,pz],'light');else box(m,`key${j}-${row}-${col}`,[.034,.012,.031],[px,.031,pz],'light');}}
 if(style==='console'){box(m,'control-deck',[.54,.04,.055],[0,.02,-.105]);for(let i=0;i<3;i++)cyl(m,`knob${i}`,.018,.018,.025,[-.16+i*.16,.052,-.105],'dark');}
 if(style==='compact')box(m,'spacebar',[.22,.012,.025],[0,.031,.065],'accent');
}
for(const style of ['ball','ribbon','broadcast','capsule']){
 const m=model('desk-microphone',style,({ball:'球形桌麦',ribbon:'矩形带式麦克风',broadcast:'横向广播麦克风',capsule:'悬挂胶囊麦克风'})[style]);
 cyl(m,'base',.095,.10,.025,[0,.0125,0]);cyl(m,'stem',.012,.014,.17,[0,.11,0]);
 if(style==='ball'){ball(m,'head',.065,[0,.245,0],'dark');for(let i=0;i<4;i++)box(m,`grille${i}`,[.09,.005,.008],[0,.214+i*.02,.05],'light');}
 if(style==='ribbon'){box(m,'head',[.09,.14,.05],[0,.255,0],'dark');for(let i=0;i<7;i++)box(m,`grille${i}`,[.07,.006,.009],[0,.20+i*.018,.03],'light');}
 if(style==='broadcast'){cyl(m,'body',.043,.043,.15,[0,.245,.015],'dark',[Math.PI/2,0,0]);cyl(m,'grille',.045,.045,.05,[0,.245,.11],'light',[Math.PI/2,0,0]);box(m,'yoke-left',[.015,.12,.03],[-.06,.23,0]);box(m,'yoke-right',[.015,.12,.03],[.06,.23,0]);}
 if(style==='capsule'){cyl(m,'head',.033,.033,.12,[0,.275,0],'light');ball(m,'cap',.033,[0,.335,0],'light');part(m,'shock-ring','TorusGeometry',[.06,.008,8,20],[0,.25,0],'dark',[Math.PI/2,0,0]);for(const x of [-.07,.07])box(m,`fork${x}`,[.012,.13,.015],[x,.23,0]);}
}
for(const style of ['palm','bonsai','cactus','broadleaf']){
 const m=model('plant',style,({palm:'扇叶棕榈',bonsai:'层冠盆景',cactus:'分叉仙人掌',broadleaf:'阔叶盆栽'})[style]);
 cyl(m,'pot',.20,.15,.3,[0,.15,0],'light');cyl(m,'soil',.185,.185,.01,[0,.301,0],'soil');
 if(style==='palm'){cyl(m,'trunk',.025,.04,.65,[0,.63,0]);for(let i=0;i<8;i++){const a=i*Math.PI/4;ball(m,`leaf${i}`,.17,[Math.sin(a)*.18,.96+(i%2)*.06,Math.cos(a)*.18],'green',[.65,.2,1]);}}
 if(style==='bonsai'){cyl(m,'trunk',.035,.055,.4,[0,.5,0]);for(let i=0;i<3;i++)ball(m,`crown${i}`,.2,[(i-1)*.14,.65+i*.09,0],'green',[1,.45,1]);}
 if(style==='cactus'){cyl(m,'trunk',.07,.07,.65,[0,.625,0],'green');ball(m,'tip',.07,[0,.95,0]);for(const x of [-.16,.16]){box(m,`branch${x}`,[.19,.07,.07],[x/2,.62,0],'green');cyl(m,`arm${x}`,.05,.05,.23,[x,.72,0],'green');ball(m,`tip${x}`,.05,[x,.835,0]);}}
 if(style==='broadleaf')for(let i=0;i<7;i++){const a=i*2.4,y=.45+i*.07;cyl(m,`stem${i}`,.008,.008,y-.3,[0,(y+.3)/2,0],'dark');ball(m,`leaf${i}`,.19,[Math.sin(a)*.15,y,Math.cos(a)*.15],'green',[.65,.3,1]);}
}
for(const style of ['triptych','sunburst','relief','woven']){
 const m=model('wall-art',style,({triptych:'三联几何挂画',sunburst:'放射圆盘墙饰',relief:'山形浮雕挂画',woven:'栅格编织墙饰'})[style]);
 if(style==='triptych')for(let i=0;i<3;i++){box(m,`frame${i}`,[.24,.5,.035],[(i-1)*.28,0,.025],'dark');box(m,`canvas${i}`,[.2,.46,.012],[(i-1)*.28,0,.05],'light');ball(m,`motif${i}`,.07,[(i-1)*.28,.06*(i-1),.065],'accent',[1,1,.2]);}
 if(style==='sunburst'){cyl(m,'disc',.20,.20,.04,[0,0,.04],'accent',[Math.PI/2,0,0]);for(let i=0;i<16;i++){const a=i*Math.PI/8;box(m,`ray${i}`,[.025,.16,.025],[Math.sin(a)*.29,Math.cos(a)*.29,.035],'wood',[0,0,-a]);}}
 if(style==='relief'){box(m,'frame',[.8,.5,.035],[0,0,.025],'dark');box(m,'canvas',[.75,.45,.012],[0,0,.05],'light');for(let i=0;i<3;i++)part(m,`mountain${i}`,'ConeGeometry',[.14,.23,3],[.2*(i-1),-.05,.08],i===1?'green':'wood',[0,0,0],[1,1,.25]);}
 if(style==='woven'){for(let i=0;i<9;i++){box(m,`vertical${i}`,[.025,.6,.02],[-.32+i*.08,0,.03],'wood');box(m,`horizontal${i}`,[.7,.025,.02],[0,-.24+i*.06,.055],i%2?'dark':'accent');}}
}
export default specs;
