import { validateCatalogue, filterFeatures, styleForFeature } from '../lib/theme-model.mjs';
import { renderThemeContent, renderLocalList, symbolSvg, mapAttribution } from '../lib/render-page.mjs';
import { loadThemeData } from '../lib/load-theme.mjs';

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw Error('Recurso indisponível');
  return response.json();
}

function consultation(feature, layer, metadata) {
  const properties = feature.properties || {};
  const box = document.createElement('div');
  box.className = 'map-popup';
  const heading = document.createElement('h3');
  heading.textContent = properties.nome || layer.label;
  box.append(heading);
  const group = document.createElement('p');
  group.textContent = properties.grupo || layer.label;
  box.append(group);
  const dl = document.createElement('dl');
  for (const field of layer.popupFields || []) {
    const dt = document.createElement('dt');
    dt.textContent = field.label;
    const dd = document.createElement('dd');
    const value = properties[field.field];
    dd.textContent = value === null || value === undefined || value === '' ? 'Não informado na fonte' : String(value);
    dl.append(dt, dd);
  }
  box.append(dl);
  const note = document.createElement('p');
  note.className = 'popup-source-note';
  note.textContent = metadata.source?.period || 'Consulte a fonte e o período de referência.';
  box.append(note);
  return box;
}

export async function initMapsViewer({ root, catalogue, basePath = '/' }) {
  validateCatalogue(catalogue);
  const mapsBase = `${basePath}mapas-de-saude/`;
  const controller = new AbortController();
  const selector = root.querySelector('[data-map-theme]');
  const fallbacks = JSON.parse(root.querySelector('[data-map-fallbacks]')?.textContent || '{}');
  let map;
  let generation = 0;

  async function loadTheme(id) {
    const thisGeneration = ++generation;
    const theme = catalogue.themes.find(item => item.id === id);
    if (!theme) return;
    if (map) { map.remove(); map = null; }
    const fallback = fallbacks[theme.id] || {};
    root.querySelector('[data-theme-content]').innerHTML = renderThemeContent({ theme, bundle: fallback, mapsBase });
    const initialStatus = root.querySelector('[data-map-status]');
    initialStatus.textContent = 'Carregando as camadas do mapa…';
    let loaded;
    try { loaded = await loadThemeData({ theme, fallback, read: file => fetchJson(mapsBase + file, controller.signal) }); }
    catch { if (thisGeneration === generation) { initialStatus.dataset.state = 'error'; initialStatus.textContent = 'As fontes deste mapa não puderam ser carregadas. Consulte a documentação deste tema abaixo.'; } return; }
    if (controller.signal.aborted || thisGeneration !== generation) return;
    const { metadata, datasets, errors, mapFeatures: allFeatures, documentFeatures } = loaded;
    const L = window.L;
    if (!L) { initialStatus.dataset.state = 'error'; initialStatus.textContent = 'A visualização do mapa está indisponível. Consulte os locais, endereços e fontes na lista abaixo.'; return; }
    root.querySelector('[data-theme-content]').innerHTML = renderThemeContent({ theme, bundle: { metadata, points: { features: documentFeatures } }, mapsBase });
    const canvas = root.querySelector('[data-map-canvas]');
    map = L.map(canvas, { minZoom: 5, maxZoom: 20, zoomControl: true, attributionControl: true });
    map.attributionControl.addAttribution(mapAttribution(metadata));
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    const contextPane = map.createPane('mapContext');
    contextPane.style.zIndex = '300';
    const contexts = new Map();
    const pointLayers = theme.layers.filter(layer => layer.kind === 'points');
    const markerGroup = L.layerGroup().addTo(map);
    const markers = new Map();
    const featureById = new Map(allFeatures.map(feature => [String(feature.properties.codigo), feature]));
    const status = root.querySelector('[data-map-status]');
    const search = root.querySelector('[data-map-search]');
    const list = root.querySelector('[data-map-list]');
    const count = root.querySelector('[data-map-count]');
    const listCount = root.querySelector('[data-list-count]');
    const controls = [...root.querySelectorAll('[data-map-layer]')];
    let selected = null;
    let currentFeatures = allFeatures;

    for (const layer of theme.layers.filter(item => item.kind === 'context' && datasets.has(item.id))) {
      try {
      const drawn = L.geoJSON(datasets.get(layer.id), {
        pane: 'mapContext', style: feature => styleForFeature(feature, layer),
        onEachFeature: (feature, item) => {
          const name = feature.properties?.NM_MUN || feature.properties?.NM_UF || feature.properties?.nome;
          if (name) item.bindTooltip(document.createTextNode(String(name)));
          if (layer.popupFields?.length) {
            item.bindPopup(() => consultation(feature, layer, metadata));
            item.on('click', () => { selected = null; root.querySelector('[data-map-selection]').replaceChildren(consultation(feature, layer, metadata)); });
          }
        }
      });
      contexts.set(layer.id, drawn);
      if (layer.visible) drawn.addTo(map);
      } catch { errors.push(layer.label); }
    }
    const municipality = contexts.get('municipio')?.getBounds();
    const pointBounds = allFeatures.length ? L.latLngBounds(allFeatures.map(feature => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]])) : null;
    const regionalBounds = contexts.get('municipios')?.getBounds();
    const contextBounds = L.latLngBounds([]);
    for (const drawn of contexts.values()) if (drawn.getBounds()?.isValid()) contextBounds.extend(drawn.getBounds());
    const extent = municipality?.isValid() ? municipality : pointBounds?.isValid() ? pointBounds : regionalBounds?.isValid() ? regionalBounds : contextBounds;
    if (extent?.isValid()) { map.fitBounds(extent, { padding: [25, 25], animate: false }); map.setMaxBounds(extent.pad(1)); }
    else map.setView([-16.36, -46.9], 10);

    function setStatus() {
      status.dataset.state = errors.length ? 'error' : 'ready';
      status.textContent = errors.length ? `Camada indisponível: ${[...new Set(errors)].join('; ')}. As demais referências e a lista continuam disponíveis.` : 'Arraste para navegar. Use + e − para aproximar. Selecione um símbolo ou um local na lista.';
    }

    function showSelected(code, move = true) {
      const feature = featureById.get(String(code));
      const marker = markers.get(String(code));
      if (!feature || !marker) return;
      selected = String(code);
      for (const [id, item] of markers) item.getElement()?.classList.toggle('is-selected', id === selected);
      for (const row of list.querySelectorAll('[data-local-id]')) row.classList.toggle('is-selected', row.dataset.localId === selected);
      const layer = pointLayers.find(item => item.group === feature.properties.grupo);
      root.querySelector('[data-map-selection]').replaceChildren(consultation(feature, layer, metadata));
      if (move) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: false });
      marker.openPopup();
    }

    function updatePoints() {
      const groups = pointLayers.filter(layer => controls.find(input => input.dataset.mapLayer === layer.id)?.checked).map(layer => layer.group);
      currentFeatures = filterFeatures(allFeatures, { search: search.value, groups });
      const listedFeatures = filterFeatures(documentFeatures, { search: search.value, groups });
      markerGroup.clearLayers();
      markers.clear();
      for (const feature of currentFeatures) {
        const layer = pointLayers.find(item => item.group === feature.properties.grupo);
        try {
        const style = styleForFeature(feature, layer);
        const marker = L.marker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], {
          icon: L.divIcon({ className: 'map-symbol', html: symbolSvg({ ...layer.style, color: style.color }), iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] }),
          title: feature.properties.nome, alt: feature.properties.nome, keyboard: true
        });
        marker.bindTooltip(document.createTextNode(String(feature.properties.nome)));
        marker.bindPopup(() => consultation(feature, layer, metadata));
        marker.on('click', () => showSelected(feature.properties.codigo, false));
        marker.addTo(markerGroup);
        markers.set(String(feature.properties.codigo), marker);
        } catch { errors.push(layer.label); }
      }
      list.innerHTML = renderLocalList(listedFeatures, theme, true, new Set(markers.keys()));
      const documentCount = listedFeatures.length;
      count.textContent = pointLayers.length ? (documentCount === markers.size ? `${documentCount} ${documentCount === 1 ? 'local' : 'locais'} nos filtros` : `${documentCount} na lista · ${markers.size} no mapa`) : 'Camadas territoriais';
      listCount.textContent = `${documentCount} ${documentCount === 1 ? 'resultado' : 'resultados'}`;
      if (selected && markers.has(selected)) showSelected(selected, false);
      else if (selected) { selected = null; root.querySelector('[data-map-selection]').textContent = 'O local selecionado está fora dos filtros atuais. Escolha outro local na lista ou no mapa.'; }
      setStatus();
    }

    for (const input of controls) {
      const layer = theme.layers.find(layer => layer.id === input.dataset.mapLayer);
      input.disabled = layer.kind === 'points' ? !documentFeatures.some(feature => feature.properties.grupo === layer.group) : !datasets.has(layer.id);
      input.addEventListener('change', () => {
        const drawn = contexts.get(input.dataset.mapLayer);
        if (drawn) { if (input.checked) drawn.addTo(map); else map.removeLayer(drawn); }
        else updatePoints();
      }, { signal: controller.signal });
    }
    search.disabled = !documentFeatures.length;
    search.addEventListener('input', updatePoints, { signal: controller.signal });
    list.addEventListener('click', event => { const button = event.target.closest('[data-select-local]'); if (button) showSelected(button.dataset.selectLocal); }, { signal: controller.signal });
    for (const button of root.querySelectorAll('[data-map-view]')) {
      button.disabled = false;
      button.addEventListener('click', () => {
        const urbanPoints = allFeatures.filter(feature => feature.properties.rural === false);
        const urbanBounds = urbanPoints.length ? L.latLngBounds(urbanPoints.map(feature => [feature.geometry.coordinates[1], feature.geometry.coordinates[0]])).pad(0.15) : contexts.get('urbano')?.getBounds();
        const bounds = button.dataset.mapView === 'urbano' && urbanBounds?.isValid() ? urbanBounds : extent;
        if (bounds?.isValid()) map.fitBounds(bounds, { padding: [25, 25], animate: false });
        for (const view of root.querySelectorAll('[data-map-view]')) view.setAttribute('aria-pressed', String(view === button));
      }, { signal: controller.signal });
    }
    updatePoints();
    map.invalidateSize();
  }

  selector.addEventListener('change', () => loadTheme(selector.value).catch(() => {
    const status = root.querySelector('[data-map-status]');
    status.dataset.state = 'error'; status.textContent = 'Não foi possível abrir este mapa. A lista e as fontes permanecem disponíveis.';
  }), { signal: controller.signal });
  await loadTheme(selector.value);
  return { destroy() { generation++; controller.abort(); map?.remove(); } };
}

const root = document.querySelector('[data-maps-root]');
if (root) {
  const basePath = document.body.dataset.basePath || '/';
  fetchJson(`${basePath}mapas-de-saude/data/catalogue.json`).then(catalogue => initMapsViewer({ root, catalogue, basePath })).catch(() => {
    const status = root.querySelector('[data-map-status]');
    status.dataset.state = 'error'; status.textContent = 'O mapa não pôde ser carregado. Consulte os locais, endereços e fontes na lista abaixo.';
  });
}
