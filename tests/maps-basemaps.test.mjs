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
 assert.equal(canvas.dataset.basemap,'plain');
 assert.match(status.textContent,/indisponível/);
 control.changeBase('satellite');
 for(const layer of layers.slice(0,3))layer.emit('loading');
 layers[0].emit('tileload');layers[1].emit('tileerror');
 for(const layer of layers.slice(0,3))layer.emit('load');
 assert.equal(canvas.dataset.basemap,'satellite');
 assert.match(status.textContent,/trechos/);
 // A later view can fail completely even after earlier tiles loaded successfully.
 for(const layer of layers.slice(0,3))layer.emit('loading');
 for(const layer of layers.slice(0,3))layer.emit('tileerror');
 for(const layer of layers.slice(0,3))layer.emit('load');
 assert.equal(canvas.dataset.basemap,'plain');
 control.changeBase('satellite');layers[1].emit('loading');layers[1].emit('tileload');layers[1].emit('load');
 center={lng:-46.3,lat:-16.8}; // Only the eastern scene covers this later view.
 layers[0].emit('loading');layers[0].emit('tileerror');layers[0].emit('load');
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
