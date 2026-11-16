import {createScaledCompany} from './space.js';
import {prepareCompanyChange} from './document.js';

const streaming=stations=>({name:'直播间',purpose:'streaming',stations});
const rest=()=>({name:'休息室',purpose:'rest',sofaVersion:1});
const work=()=>({name:'工作室',purpose:'work',furniture:'desk-chair'});
export const scaleInputs={
  single:{id:'single-company',name:'单间屋',scale:'single-room',floors:[{rooms:[streaming(2)]}]},
  rental:{id:'rental-company',name:'整套出租屋',scale:'rental-home',floors:[{rooms:[streaming(2),work(),rest(1)]}]},
  flat:{id:'flat-company',name:'整租平层',scale:'leased-floor',floors:[{rooms:[streaming(2),streaming(1),work(),rest(1),work(),streaming(2),work(),rest(2),work(),work()]}]},
  twoFloors:{id:'two-floor-company',name:'两层不同布局',scale:'building',floorLayouts:['parallel','turned'],floors:[{name:'一层',rooms:[streaming(2),rest(1)]},{name:'二层',rooms:[rest(2),streaming(2)]}]},
  building:{id:'building-company',name:'整栋大楼 · 部分配置',scale:'building',floorLayouts:['parallel','turned'],floors:Array.from({length:5},(_,index)=>({name:`${index+1}层`,rooms:[streaming(2),rest(index%2+1),work()]}))},
};
export const createScaleExamples=(catalog,templates)=>Object.fromEntries(Object.entries(scaleInputs).map(([key,input])=>{
  let document=createScaledCompany(input,catalog,templates);
  const sofas=document.nodes.filter(n=>n.resource?.id==='lounge-sofa');
  const operations=sofas.filter((n,index)=>index%2===1).map(n=>({type:'replace-resource',id:n.id,resource:{id:'timber-sofa',version:1}}));
  if(operations.length)document=prepareCompanyChange(document,operations,{catalog,templates}).document;
  return [key,document];
}));
