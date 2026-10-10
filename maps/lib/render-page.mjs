import { validateCatalogue } from './theme-model.mjs';

export const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escapeText(url.href) : ''; } catch { return ''; } };
const absent = value => value === null || value === undefined || value === '' ? 'Não informado na fonte' : String(value);

export function symbolSvg(style = {}) {
  const color = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(style.color || '') ? style.color : '#08588e';
  const shapes = { circle: '<circle cx="10" cy="10" r="7"/>', square: '<rect x="3" y="3" width="14" height="14" rx="1"/>', cross: '<path d="M7 2H13V7H18V13H13V18H7V13H2V7H7Z"/>', diamond: '<path d="M10 1L19 10L10 19L1 10Z"/>', triangle: '<path d="M10 2L19 18H1Z"/>' };
  return `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="${color}" stroke="white" stroke-width="1.5">${shapes[style.symbol] || shapes.circle}</svg>`;
}

export function mapAttribution(metadata = {}) {
  const sources = [...new Set([metadata.source?.label, metadata.contextSource?.label].filter(Boolean))];
  return 'Fontes: ' + escapeText(sources.join(' · ') || 'consulte a procedência do tema');
}

export function renderLocalList(features, theme, enabled = false, mappedIds = null) {
  if (!features.length) return '<li class="empty-result">Nenhum local encontrado com estes filtros.</li>';
  return [...features].sort((a, b) => String(a.properties.nome).localeCompare(String(b.properties.nome), 'pt-BR')).map(feature => {
    const props = feature.properties;
    const layer = theme.layers.find(item => item.kind === 'points' && item.group === props.grupo);
    const fields = layer?.popupFields || [];
    const unavailable = enabled && mappedIds && !mappedIds.has(String(props.codigo));
    return `<li class="local-item" data-local-id="${escapeText(props.codigo)}"><div class="local-top">${symbolSvg(layer?.style)}<div><button type="button" data-select-local="${escapeText(props.codigo)}" ${enabled && !unavailable ? '' : 'disabled'}>${escapeText(absent(props.nome))}</button><p>${escapeText(props.grupo)}</p></div></div><p class="local-address">${escapeText(absent(props.endereco))}</p>${unavailable ? '<p class="local-unavailable">Representação no mapa indisponível. Os dados deste local continuam acessíveis.</p>' : ''}<details><summary>Dados deste local</summary><dl>${fields.map(field => `<dt>${escapeText(field.label)}</dt><dd>${escapeText(absent(props[field.field]))}</dd>`).join('')}</dl></details></li>`;
  }).join('');
}

function metadataMarkup(metadata = {}, theme, mapsBase) {
  const source = metadata.source || {};
  const context = metadata.contextSource || {};
  const links = [...(source.links || []), ...(context.links || [])];
  const uniqueLinks = [...new Map(links.filter(link => safeUrl(link.href)).map(link => [link.href, link])).values()];
  const datasetPaths = [...new Set(theme.layers.map(layer => layer.path))];
  return `<section class="maps-provenance" aria-labelledby="map-source-heading"><div><p class="eyebrow">Procedência e interpretação</p><h2 id="map-source-heading">Leia o mapa com contexto</h2><dl><dt>Fonte principal</dt><dd>${escapeText(absent(source.label))}</dd><dt>Período de referência</dt><dd>${escapeText(absent(source.period))}</dd><dt>Cartografia</dt><dd>${escapeText(absent(context.period))}</dd><dt>O que está contado</dt><dd>${escapeText(absent(metadata.unit))}</dd></dl></div><div><h3>Limitações da fonte</h3><ul>${(metadata.limitations || []).map(note => `<li>${escapeText(note)}</li>`).join('')}</ul><div class="maps-source-links">${uniqueLinks.map(link => `<a href="${safeUrl(link.href)}" target="_blank" rel="noopener noreferrer">${escapeText(link.label || 'Consultar fonte')} ↗</a>`).join('')}</div><details class="maps-downloads"><summary>Baixar camadas e metadados</summary><ul>${datasetPaths.map(file => `<li><a href="${mapsBase}${escapeText(file)}" download>${/\/locais\.(?:geojson|json)$/.test(file) ? 'Locais mapeados · GeoJSON' : escapeText(theme.layers.find(layer => layer.path === file).label) + ' · GeoJSON'}</a></li>`).join('')}<li><a href="${mapsBase}${escapeText(theme.metadataPath)}" download>Fontes, períodos e limitações · JSON</a></li></ul><p>Os downloads contêm a base completa, independentemente dos filtros da consulta.</p></details></div></section>`;
}

export function renderThemeContent({ theme, bundle = {}, mapsBase }) {
  const features = bundle.points?.features || [];
  const groups = theme.layers.filter(layer => layer.kind === 'points');
  const contexts = theme.layers.filter(layer => layer.kind === 'context');
  const hasPoints = groups.length > 0;
  const legend = groups.map(layer => `<span>${symbolSvg(layer.style)}${escapeText(layer.label)}</span>`).join('');
  const thematicLegend = theme.layers.filter(layer => layer.style?.field).map(layer => `<div><strong>${escapeText(layer.label)}</strong>${[...layer.style.classes, layer.style.missing].map(entry => `<span><i style="background:${entry.color}"></i>${escapeText(entry.label)}</span>`).join('')}</div>`).join('');
  return `<div class="map-intro"><div><span class="status planned">${theme.status === 'piloto-local' ? 'Piloto local para revisão' : 'Disponível'}</span><h2>${escapeText(theme.title)}</h2><p>${escapeText(theme.description)}</p></div><p class="map-unit-note">${escapeText(bundle.metadata?.unit || "Consulte a unidade e as limitações do tema.")}</p></div>
<div class="maps-workspace"><aside class="maps-controls" aria-label="Filtros e camadas do mapa">${hasPoints ? '<label for="map-search">Buscar local ou bairro</label>' : ''}<input id="map-search" type="search" placeholder="Ex.: Alvorada, CAIC" data-map-search disabled ${hasPoints ? '' : 'hidden'}><fieldset ${hasPoints ? '' : 'hidden'}><legend>${hasPoints ? "Rede e serviços" : ""}</legend>${groups.map(layer => `<label class="map-layer-choice">${symbolSvg(layer.style)}<input type="checkbox" data-map-layer="${layer.id}" ${layer.visible ? 'checked' : ''} disabled><span>${escapeText(layer.label)}</span><small>${features.filter(feature => feature.properties.grupo === layer.group).length}</small></label>`).join('')}</fieldset><details class="context-controls" open><summary>Cartografia de referência</summary><fieldset><legend class="visually-hidden">Camadas territoriais</legend>${contexts.map(layer => `<label class="map-context-choice"><input type="checkbox" data-map-layer="${layer.id}" ${layer.visible ? 'checked' : ''} disabled><span>${escapeText(layer.label)}</span></label>`).join('')}</fieldset></details><p class="map-controls-note">Ative ou desative as camadas para combinar as referências.</p></aside><div class="map-main"><div class="map-toolbar"><div class="map-views" role="group" aria-label="Enquadramento do mapa"><button type="button" data-map-view="municipio" aria-pressed="true" disabled>${theme.layers.some(layer => layer.id === "municipio") ? "Município" : "Enquadrar camadas"}</button><button type="button" data-map-view="urbano" aria-pressed="false" disabled ${hasPoints || theme.layers.some(layer => layer.id === "urbano") ? '' : 'hidden'}>Sede urbana</button></div><span data-map-count aria-live="polite">${hasPoints ? features.length + " locais na base" : "Camadas territoriais"}</span></div><div class="map-canvas" data-map-canvas aria-label="Mapa interativo de Unaí" tabindex="0"></div><p class="map-status" data-map-status role="status">Carregando o mapa. A lista e as fontes estão disponíveis abaixo.</p><div class="map-legend" aria-label="Legenda do mapa">${legend}${thematicLegend}</div></div></div>
<noscript><p class="notice">O mapa interativo precisa de JavaScript. Consulte todos os locais, endereços e observações na lista abaixo.</p></noscript>
<div class="maps-results ${hasPoints ? '' : 'maps-results-territory'}"><section class="map-results-list" ${hasPoints ? '' : 'hidden'}><div class="results-heading"><h2>${hasPoints ? "Locais encontrados" : ""}</h2><span data-list-count>${features.length} locais cadastrados</span></div><p class="small">A lista acompanha os filtros. Abra os dados de um local ou selecione seu nome para vê-lo no mapa.</p><ul class="local-list" data-map-list>${hasPoints ? renderLocalList(features, theme) : ''}</ul></section><section class="map-selection" aria-labelledby="selected-heading"><p class="eyebrow">${hasPoints ? "Consulta do local" : "Consulta da feição"}</p><h2 id="selected-heading">${hasPoints ? "Local selecionado" : "Consulta territorial"}</h2><div data-map-selection><p>${hasPoints ? "Selecione um símbolo no mapa ou o nome de um local na lista para consultar seus dados." : "Selecione uma feição no mapa para consultar seus atributos, quando disponíveis."}</p></div><div class="map-selection-note">${escapeText(bundle.metadata?.unit || "Consulte a unidade, a fonte e o período de referência.")}</div></section></div>
${metadataMarkup(bundle.metadata, theme, mapsBase)}`;
}

export function renderMapsPage({ catalogue, basePath, themeBundles = {} }) {
  validateCatalogue(catalogue);
  const mapsBase = `${basePath}mapas-de-saude/`;
  const first = catalogue.themes[0];
  const fallbacks = JSON.stringify(themeBundles).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<div class="wrap page-heading"><p class="eyebrow">Saúde pública e território</p><h1>Mapas Temáticos</h1><p class="lead">Explore o território de Unaí por meio de mapas, camadas e informações com fonte e período de referência.</p></div><div class="wrap maps-page" data-maps-root><section class="maps-catalogue" aria-label="Catálogo de mapas"><div><label for="map-theme">Escolha um mapa</label><select id="map-theme" data-map-theme>${catalogue.themes.map(theme => `<option value="${theme.id}">${escapeText(theme.title)}</option>`).join('')}</select></div><p>${catalogue.themes.length} ${catalogue.themes.length === 1 ? 'mapa disponível' : 'mapas disponíveis'}<br><span>Novos temas serão incluídos após revisão das fontes.</span></p></section><div data-theme-content>${renderThemeContent({ theme: first, bundle: themeBundles[first.id], mapsBase })}</div><script type="application/json" data-map-fallbacks>${fallbacks}</script><p class="maps-panel-link">O Busca Saúde também permanece disponível no <a href="${basePath}painel-de-monitoramento/#/mapa">Painel de Monitoramento</a>.</p></div>`;
}
