const plate={width:.12,height:.2,depth:.018};
const material=(color,roughness=.72)=>({color,roughness});
const box=(id,parameters,position,rotation=[0,0,0],color='#d6d9d0',roughness=.72)=>({id,geometry:'BoxGeometry',parameters,position,rotation,color,roughness});
const cylinder=(id,radius,depth,position,rotation=[Math.PI/2,0,0],color='#263432',roughness=.6)=>({id,geometry:'CylinderGeometry',parameters:[radius,radius,depth,24],position,rotation,color,roughness});
const led=(position)=>box('status-led',[.014,.012,.006],position,[0,0,0],'#6bd2ad',.35);

export const designs=[
  {id:'outlet-single',label:'单插座面板',parts:[
    box('back-plate',[plate.width,plate.height,plate.depth],[0,0,.009],[0,0,0],'#d6d9d0'),
    cylinder('socket-ring-a',.026,.012,[0,.035,.025]),
    cylinder('socket-ring-b',.026,.012,[0,-.035,.025]),
    box('slot-a',[.003,.025,.003],[-.009,.035,.033],[0,0,.18],'#1d2523'),
    box('slot-b',[.003,.025,.003],[.009,.035,.033],[0,0,-.18],'#1d2523'),
    box('slot-c',[.003,.025,.003],[-.009,-.035,.033],[0,0,.18],'#1d2523'),
    box('slot-d',[.003,.025,.003],[.009,-.035,.033],[0,0,-.18],'#1d2523'),
    led([.045,-.072,.026])
  ],method:'paired round socket apertures'},
  {id:'outlet-multi',label:'多孔插座面板',parts:[
    box('back-plate',[plate.width,plate.height,plate.depth],[0,0,.009],[0,0,0],'#c7d0cb'),
    box('upper-panel',[.084,.054,.012],[0,.052,.026],[0,0,0],'#eef1e8'),
    box('lower-panel',[.084,.054,.012],[0,-.052,.026],[0,0,0],'#eef1e8'),
    cylinder('upper-left',.017,.012,[-.022,.052,.034]), cylinder('upper-right',.017,.012,[.022,.052,.034]),
    cylinder('lower-left',.017,.012,[-.022,-.052,.034]), cylinder('lower-right',.017,.012,[.022,-.052,.034]),
    led([.045,0,.026]), led([-.045,0,.026])
  ],method:'four-port framed panel'},
  {id:'switch-rocker',label:'翘板开关面板',parts:[
    box('back-plate',[plate.width,plate.height,plate.depth],[0,0,.009],[0,0,0],'#d9d4c9'),
    box('rocker',[.072,.112,.018],[0,0,.028],[0,0,.08],'#f0eee5',.46),
    box('rocker-seam',[.006,.096,.004],[0,0,.038],[0,0,.08],'#7a8178',.62),
    led([.043,0,.034])
  ],method:'single raised rocker'},
  {id:'control-panel',label:'墙面控制面板',parts:[
    box('back-plate',[plate.width,plate.height,plate.depth],[0,0,.009],[0,0,0],'#b9c7c1'),
    box('inset',[.088,.15,.012],[0,0,.026],[0,0,0],'#263b38',.58),
    box('key-top',[.046,.026,.012],[0,.045,.034],[0,0,0],'#d8dfd4',.42),
    box('key-mid',[.046,.026,.012],[0,0,.034],[0,0,0],'#d8dfd4',.42),
    box('key-bottom',[.046,.026,.012],[0,-.045,.034],[0,0,0],'#d8dfd4',.42),
    led([0,.075,.035]), led([0,-.075,.035])
  ],method:'three-key control surface'}
];

export const commonMaterialSlots=['construction','status'];
