from pathlib import Path
import bpy,json
O=Path(__file__).resolve().parent
rows=[]
for name in ['Skirt','Body Bottom','Body Top','Leotard Reddit-Safe','Boots_ThighHighs']:
 o=bpy.data.objects[name];row={'object':name,'materials':[]}
 for m in o.data.materials:
  nodes=[]
  if m.use_nodes:
   for n in m.node_tree.nodes:
    vals={}
    for inp in n.inputs:
     if not inp.is_linked and hasattr(inp,'default_value'):
      v=inp.default_value
      try:vals[inp.name]=list(v)
      except TypeError:vals[inp.name]=v if isinstance(v,(int,float,str,bool))else str(v)
    nodes.append({'name':n.name,'type':n.type,'inputs':vals})
  row['materials'].append({'name':m.name,'diffuse':list(m.diffuse_color),'renderMethod':getattr(m,'surface_render_method',None),'nodes':nodes,'links':[{'from':l.from_node.name+'.'+l.from_socket.name,'to':l.to_node.name+'.'+l.to_socket.name}for l in m.node_tree.links]if m.use_nodes else []})
 rows.append(row)
(O/'native-materials.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf8');print([(r['object'],[(m['name'],m['renderMethod'],[(n['type'],n['inputs'].get('Alpha'),n['inputs'].get('Transmission Weight'))for n in m['nodes']if n['type'] in ['BSDF_PRINCIPLED','BSDF_TRANSPARENT','BSDF_GLASS']])for m in r['materials']])for r in rows])
