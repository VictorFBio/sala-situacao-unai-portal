import {validateBasemaps,imageryTileUrl,imageryCoverage} from '../lib/basemap-model.mjs';
export function installBasemaps({L,map,root,config,onChange}){
 validateBasemaps(config);
 const status=root.querySelector('[data-base-status]');
 const buttons=[...root.querySelectorAll('[data-map-base]')];
 const imagePane=map.createPane('imageryBase');imagePane.style.zIndex='210';imagePane.style.pointerEvents='none';
 const attribution='<a href="https://data.inpe.br/dados/cbers-4a/" target="_blank" rel="noopener noreferrer">INPE · CBERS-4A/WPM · 2 m · CC BY 4.0</a>';
 // Oldest below newest; transparent scene edges reveal the overlapping scene.
 const imagery=config.scenes.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(scene=>L.tileLayer(imageryTileUrl(scene),{pane:'imageryBase',minZoom:5,maxNativeZoom:16,maxZoom:19,bounds:[[scene.bbox[1],scene.bbox[0]],[scene.bbox[3],scene.bbox[2]]],attribution,updateWhenIdle:true,keepBuffer:0,detectRetina:false}));
 const streets=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',updateWhenIdle:true,keepBuffer:0});
 let current='plain',warning='';
 const batches=new Map([...imagery,streets].map(layer=>[layer,{loaded:0,failed:0}]));
 const dates=[...new Set(config.scenes.map(s=>s.date.slice(0,10)))].sort().map(d=>d.split('-').reverse().join('/'));
 function explain(){
  status.dataset.state=warning?'error':'ready';
  const center=map.getCenter();
  status.textContent=warning||(current==='satellite'?`CBERS-4A · imagem fusionada de 2 m · ${dates.join(' e ')}. ${imageryCoverage(config,[center.lng,center.lat])?'':'Centro da vista fora das cenas selecionadas. '}Imagem histórica; a aproximação acima do detalhe original amplia os pixels.`:current==='streets'?'Ruas e nomes: OpenStreetMap. Cartografia colaborativa; não confirma a localização dos serviços.':'Cartografia simples. Camadas e consulta de locais permanecem disponíveis sem o fundo externo.');
 }
 function changeBase(id){
  if(!['satellite','streets','plain'].includes(id))return;
  for(const layer of [...imagery,streets])if(map.hasLayer(layer))map.removeLayer(layer);
  current=id;warning='';
  for(const layer of batches.keys())batches.set(layer,{loaded:0,failed:0});
  if(id==='satellite')for(const layer of imagery)layer.addTo(map);
  if(id==='streets')streets.addTo(map);
  root.querySelector('[data-map-canvas]').dataset.basemap=id;
  for(const button of buttons){button.disabled=false;button.setAttribute('aria-pressed',String(button.dataset.mapBase===id));}
  onChange(id);explain();
 }
 for(const layer of [...imagery,streets]){
  layer.on('loading',()=>{if(map.hasLayer(layer))batches.set(layer,{loaded:0,failed:0});});
  layer.on('tileload',()=>{if(map.hasLayer(layer))batches.get(layer).loaded++;});
  layer.on('tileerror',()=>{
   if(!map.hasLayer(layer)||current==='plain')return;
   batches.get(layer).failed++;
   warning='Alguns trechos do fundo não carregaram. As imagens disponíveis e as camadas continuam visíveis. Tente novamente pelo botão do fundo.';explain();
  });
  layer.on('load',()=>{
   if(!map.hasLayer(layer)||current==='plain')return;
   const active=[...batches.keys()].filter(item=>map.hasLayer(item)&&(!item.options.bounds||map.getBounds().intersects(item.options.bounds)));
   if(active.some(item=>item.isLoading()))return;
   const loaded=active.reduce((total,item)=>total+batches.get(item).loaded,0);
   const failed=active.reduce((total,item)=>total+batches.get(item).failed,0);
   if(failed&&!loaded){const missing=current==='satellite'?'satélite':'ruas';changeBase('plain');warning=`O fundo de ${missing} está indisponível. A cartografia simples foi ativada; pontos, polígonos e consulta permanecem disponíveis. Você pode tentar novamente pelo botão do fundo.`;}
   else if(!failed)warning='';
   explain();
  });
 }
 for(const button of buttons)button.addEventListener('click',()=>changeBase(button.dataset.mapBase));
 map.on('moveend',explain);
 changeBase(config.default);
 return {changeBase};
}
