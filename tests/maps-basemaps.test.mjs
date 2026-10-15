import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const api=await import('../maps/lib/basemap-model.mjs').catch(()=>({}));
import {installBasemaps} from '../maps/web/basemaps.mjs';
test('base INPE usa imagens de 2 m rastreáveis, sem chave, com cobertura dos 32 locais',async()=>{
 assert.equal(typeof api.validateBasemaps,'function');
 const config=JSON.parse(await readFile(new URL('../maps/data/basemaps.json',import.meta.url)));
 api.validateBasemaps(config);
 const points=JSON.parse(await readFile(new URL('../maps/data/rede-servicos/locais.geojson',import.meta.url)));
 assert.equal(config.default,'satellite');
 for(const point of points.features)assert.ok(api.imageryCoverage(config,point.geometry.coordinates),point.properties.codigo);
 assert.equal(api.imageryCoverage(config,[0,0]),false);
 for(const scene of config.scenes){assert.equal(scene.resolutionMeters,2);assert.equal(scene.license,'CC-BY-4.0');assert.ok(!api.imageryTileUrl(scene).includes('token'));}
 for(const bad of ['http://data.inpe.br/a.tif','https://evil.invalid/a.tif','https://data.inpe.br/bdc/data/../secret.tif']){
  const modified=structuredClone(config);modified.scenes[0].asset=bad;assert.throws(()=>api.validateBasemaps(modified));
 }
});
test('cenas de satélite cobrem o limite municipal inteiro e a área interna do nordeste',async()=>{
 const config=JSON.parse(await readFile(new URL('../maps/data/basemaps.json',import.meta.url)));
 const municipality=JSON.parse(await readFile(new URL('../maps/data/rede-servicos/municipio.geojson',import.meta.url)));
 const scene=config.scenes.find(item=>item.id==='CBERS4A_WPM_PCA_RGB321_20260903_204_133');
 assert.ok(scene,'a cena CBERS-4A da órbita 204/133 está configurada');
 assert.equal(scene.asset,'https://data.inpe.br/bdc/data/CB4A-WPM-PCA-FUSED/v001/204/133/2026/9/CBERS4A_WPM_PCA_RGB321_20260903_204_133.tif');
 assert.equal(scene.sourceMetadata,'https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1/items/CBERS4A_WPM_PCA_RGB321_20260903_204_133');
 assert.equal(scene.date,'2026-09-03T00:00:00Z');
 for(const feature of municipality.features){
  const rings=feature.geometry.type==='Polygon'?feature.geometry.coordinates:feature.geometry.coordinates.flat();
  for(const ring of rings)for(const point of ring)assert.ok(api.imageryCoverage(config,point),`vértice municipal fora das cenas: ${point}`);
 }
 const insideRing=(point,ring)=>{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const [xi,yi]=ring[i],[xj,yj]=ring[j];
   if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside;
 };
 const polygons=municipality.features.flatMap(feature=>feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates);
 const extent=municipality.features.reduce((bounds,feature)=>{
  const rings=feature.geometry.type==='Polygon'?feature.geometry.coordinates:feature.geometry.coordinates.flat();
  for(const point of rings[0]){bounds[0]=Math.min(bounds[0],point[0]);bounds[1]=Math.min(bounds[1],point[1]);bounds[2]=Math.max(bounds[2],point[0]);bounds[3]=Math.max(bounds[3],point[1]);}
  return bounds;
 },[Infinity,Infinity,-Infinity,-Infinity]);
 let interiorSamples=0;
 for(let lat=extent[1]+0.01;lat<extent[3];lat+=0.04)for(let lng=extent[0]+0.01;lng<extent[2];lng+=0.04){
  const point=[lng,lat];
  const inMunicipality=polygons.some(rings=>insideRing(point,rings[0])&&!rings.slice(1).some(ring=>insideRing(point,ring)));
  if(inMunicipality){interiorSamples++;assert.ok(api.imageryCoverage(config,point),`interior municipal fora das cenas: ${point}`);}
 }
 assert.ok(interiorSamples>100,'a grade deve testar mais de 100 pontos do interior municipal');
 for(const point of [[-46.4,-15.95],[-46.38,-16],[-46.42,-15.9]])assert.ok(api.imageryCoverage(config,point),`interior do nordeste municipal fora das cenas: ${point}`);
});
test('cobertura rejeita anel inválido e respeita os vazios do polígono',async()=>{
 const config=JSON.parse(await readFile(new URL('../maps/data/basemaps.json',import.meta.url)));
 const bad=structuredClone(config);bad.scenes[0].footprint.coordinates[0][0]=[Infinity,0];
 assert.throws(()=>api.validateBasemaps(bad));
 config.scenes=[{...config.scenes[0],footprint:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]}}];
 assert.equal(api.imageryCoverage(config,[2,2]),false);
 assert.equal(api.imageryCoverage(config,[0.5,0.5]),true);
});
test('vista urbana usa o maior polígono urbanizado e conserva as coordenadas',async()=>{
 const urban=JSON.parse(await readFile(new URL('../maps/data/rede-servicos/urbano.geojson',import.meta.url)));
 const before=structuredClone(urban);
 const bounds=api.urbanExtent(urban);
 assert.ok(bounds[0]>-46.92&&bounds[2]<-46.87);
 assert.ok(bounds[1]>-16.39&&bounds[3]<-16.34);
 assert.deepEqual(urban,before);
});
test('falha do fundo ativo preserva vetores; erro tardio de fundo desativado é ignorado',async()=>{
 const config=JSON.parse(await readFile(new URL('../maps/data/basemaps.json',import.meta.url)));
 const layers=[],active=new Set(),status={dataset:{}},canvas={dataset:{}};
 const buttons=['satellite','streets','plain'].map(id=>({dataset:{mapBase:id},setAttribute(){},addEventListener(){}}));
 const root={querySelector:s=>s==='[data-base-status]'?status:canvas,querySelectorAll:()=>buttons};
 let center={lng:-46.9,lat:-16.36};
 const map={createPane:()=>({style:{}}),hasLayer:l=>active.has(l),removeLayer:l=>active.delete(l),getCenter:()=>center,getBounds:()=>({intersects:bounds=>center.lat>=bounds[0][0]&&center.lat<=bounds[1][0]&&center.lng>=bounds[0][1]&&center.lng<=bounds[1][1]}),on(){}};
 const L={tileLayer:(_url,options)=>{const events={};let loading=false;const layer={options,isLoading:()=>loading,on:(event,fn)=>{events[event]=fn;return layer},addTo:()=>{active.add(layer);return layer},emit:event=>{if(event==='loading')loading=true;if(event==='load')loading=false;events[event]?.();}};layers.push(layer);return layer}};
 const changes=[];const control=installBasemaps({L,map,root,config,onChange:id=>changes.push(id)});
 control.changeBase('streets');
 for(let i=0;i<6;i++)layers[0].emit('tileerror');
 assert.equal(canvas.dataset.basemap,'streets');
 layers.at(-1).emit('loading');layers.at(-1).emit('tileerror');
 assert.match(status.textContent,/trechos/);
 layers.at(-1).emit('load');
 assert.equal(canvas.dataset.basemap,'streets'); // Leaflet still reads the layer's map after firing load.
 await Promise.resolve();
 assert.equal(canvas.dataset.basemap,'plain');
 assert.match(status.textContent,/indisponível/);
 control.changeBase('satellite');
 const visibleScenes=()=>layers.slice(0,-1).filter(layer=>{
  const bounds=layer.options.bounds;
  return center.lat>=bounds[0][0]&&center.lat<=bounds[1][0]&&center.lng>=bounds[0][1]&&center.lng<=bounds[1][1];
 });
 const initialScenes=visibleScenes();
 assert.ok(initialScenes.length>=2);
 for(const layer of initialScenes)layer.emit('loading');
 initialScenes[0].emit('tileload');initialScenes[1].emit('tileerror');
 for(const layer of initialScenes)layer.emit('load');
 await Promise.resolve();
 assert.equal(canvas.dataset.basemap,'satellite');
 assert.match(status.textContent,/trechos/);
 // A later view can fail completely even after earlier tiles loaded successfully.
 for(const layer of initialScenes)layer.emit('loading');
 for(const layer of initialScenes)layer.emit('tileerror');
 for(const layer of initialScenes)layer.emit('load');
 await Promise.resolve();
 assert.equal(canvas.dataset.basemap,'plain');
 control.changeBase('satellite');
 for(const layer of visibleScenes()){layer.emit('loading');layer.emit('tileload');layer.emit('load');}
 center={lng:-46.3,lat:-16.8}; // Only the eastern scene covers this later view.
 const easternScenes=visibleScenes();
 assert.ok(easternScenes.length>0);
 for(const layer of easternScenes)layer.emit('loading');
 for(const layer of easternScenes)layer.emit('tileerror');
 for(const layer of easternScenes)layer.emit('load');
 await Promise.resolve();
 assert.equal(canvas.dataset.basemap,'plain');
});
test('agrupamento reduz sobreposição sem modificar feições e se desfaz na aproximação',()=>{
 assert.equal(typeof api.clusterFeatures,'function');
 const features=[['A',0,0],['B',10,5],['C',100,100]].map(([codigo,x,y])=>({properties:{codigo},geometry:{coordinates:[x,y]}}));
 const before=structuredClone(features);
 const project=f=>({x:f.geometry.coordinates[0],y:f.geometry.coordinates[1]});
 assert.deepEqual(api.clusterFeatures(features,project,14).map(g=>g.map(f=>f.properties.codigo)),[['A','B'],['C']]);
 assert.equal(api.clusterFeatures(features,project,16).length,3);
 assert.deepEqual(api.clusterFeatures([...features].reverse(),project,14),api.clusterFeatures(features,project,14));
 assert.deepEqual(features,before);
});
