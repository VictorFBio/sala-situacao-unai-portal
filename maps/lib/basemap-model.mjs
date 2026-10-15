import {validateGeometry} from './theme-model.mjs';
const assetPattern=/^https:\/\/data\.inpe\.br\/bdc\/data\/CB4A-WPM-PCA-FUSED\/v\d+\/\d+\/\d+\/\d{4}\/\d{1,2}\/CBERS4A_WPM_PCA_RGB321_\d{8}_\d+_\d+\.tif$/;
export function validateBasemaps(config){
 if(config?.schemaVersion!==1||!['satellite','streets','plain'].includes(config.default)||!Array.isArray(config.scenes)||!config.scenes.length||config.scenes.length>6)throw Error('Bases incompletas');
 const ids=new Set();
 for(const scene of config.scenes){
  if(!assetPattern.test(scene.asset)||ids.has(scene.id)||!/^CBERS4A_WPM_PCA_RGB321_\d{8}_\d+_\d+$/.test(scene.id)||!Number.isFinite(Date.parse(scene.date))||scene.resolutionMeters!==2||scene.license!=='CC-BY-4.0')throw Error('Cena ou origem inválida');
  ids.add(scene.id);
  if(!Array.isArray(scene.bbox)||scene.bbox.length!==4||scene.bbox.some(v=>!Number.isFinite(v))||scene.bbox[0]>=scene.bbox[2]||scene.bbox[1]>=scene.bbox[3]||Math.abs(scene.bbox[0])>180||Math.abs(scene.bbox[2])>180||Math.abs(scene.bbox[1])>90||Math.abs(scene.bbox[3])>90)throw Error('Cobertura inválida');
  if(scene.footprint?.type!=='Polygon'||!scene.footprint.coordinates?.[0]?.length)throw Error('Cobertura ausente');
  validateGeometry(scene.footprint);
 }
 return config;
}
export function imageryTileUrl(scene){return `https://data.inpe.br/bdc/tms/tiles/WebMercatorQuad/{z}/{x}/{y}.png?url=${encodeURIComponent(scene.asset)}`;}
function inside(point,ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){if((ring[i][1]>point[1])!==(ring[j][1]>point[1])&&point[0]<(ring[j][0]-ring[i][0])*(point[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])result=!result;}return result;}
export function imageryCoverage(config,point){return config.scenes.some(scene=>inside(point,scene.footprint.coordinates[0])&&!scene.footprint.coordinates.slice(1).some(ring=>inside(point,ring)));}
// The main urban area comes from the largest IBGE polygon, not from rural settlements.
export function urbanExtent(collection){
 const rings=(collection?.features||[]).flatMap(f=>f.geometry?.type==='Polygon'?[f.geometry.coordinates[0]]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates.map(p=>p[0]):[]);
 const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0));
 const ring=rings.reduce((largest,r)=>!largest||area(r)>area(largest)?r:largest,null);
 if(!ring)return null;
 return [Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];
}
export function clusterFeatures(features,project,zoom){
 const sorted=[...features].sort((a,b)=>String(a.properties.codigo).localeCompare(String(b.properties.codigo)));
 if(zoom>=16)return sorted.map(f=>[f]);
 const groups=[];
 for(const feature of sorted){const p=project(feature);const group=groups.find(g=>{const a=project(g[0]);return Math.hypot(a.x-p.x,a.y-p.y)<34;});if(group)group.push(feature);else groups.push([feature]);}
 return groups;
}
