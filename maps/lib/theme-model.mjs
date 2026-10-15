const idPattern = /^[a-z][a-z0-9-]*$/;
const geometryTypes = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
const colors = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const normalize = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function validateLocalPath(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(value) || value.split('/').some(part => part === '.' || part === '..')) throw Error('Caminho de recurso deve ser local e sem navegação');
  return value;
}

function validateStyle(style = {}) {
  for (const property of ['color', 'fillColor']) if (style[property] && !colors.test(style[property])) throw Error('Cor inválida');
  if (style.symbol && !['circle', 'square', 'cross', 'diamond', 'triangle'].includes(style.symbol)) throw Error('Símbolo inválido');
  if (style.legendSymbol !== undefined && style.legendSymbol !== 'line') throw Error('Símbolo de legenda inválido');
  if (style.radius !== undefined && (!Number.isFinite(style.radius) || style.radius <= 0 || style.radius > 20)) throw Error('Tamanho de símbolo inválido');
  if (style.keepContrast !== undefined && typeof style.keepContrast !== 'boolean') throw Error('Configuração de contraste inválida');
  if (style.field) {
    if (!Array.isArray(style.classes) || !style.classes.length || !colors.test(style.missing?.color) || !style.missing.label) throw Error('Classes e ausência devem estar definidas');
    let previousMax = -Infinity;
    style.classes.forEach((entry, index) => {
      if (!Number.isFinite(entry.min) || (entry.max !== null && (!Number.isFinite(entry.max) || entry.max <= entry.min)) || entry.min < previousMax || !colors.test(entry.color) || !entry.label || (entry.max === null && index !== style.classes.length - 1)) throw Error('Faixas de classificação inválidas');
      previousMax = entry.max ?? Infinity;
    });
  }
}

export function validateCatalogue(catalogue) {
  if (catalogue?.schemaVersion !== 1 || !Array.isArray(catalogue.themes) || !catalogue.themes.length) throw Error('Catálogo de mapas inválido');
  const themeIds = new Set();
  for (const theme of catalogue.themes) {
    if (!idPattern.test(theme.id || '') || themeIds.has(theme.id)) throw Error('Identificador de tema inválido ou duplicado');
    themeIds.add(theme.id);
    if (theme.basemapsPath) validateLocalPath(theme.basemapsPath);
    if (theme.initialView && !['urbano','municipio'].includes(theme.initialView)) throw Error('Enquadramento inválido');
    if (!theme.title || !theme.description || !['piloto-local', 'disponivel'].includes(theme.status) || !theme.layers?.length) throw Error('Tema incompleto');
    validateLocalPath(theme.metadataPath);
    const layerIds = new Set();
    const groups = new Set();
    for (const layer of theme.layers) {
      if (!idPattern.test(layer.id || '') || layerIds.has(layer.id)) throw Error('Identificador de camada inválido ou duplicado');
      layerIds.add(layer.id);
      validateLocalPath(layer.path);
      if (!layer.label || !['points', 'context'].includes(layer.kind) || typeof layer.visible !== 'boolean' || !Array.isArray(layer.geometryTypes) || !layer.geometryTypes.length || layer.geometryTypes.some(type => !geometryTypes.has(type))) throw Error('Camada inválida');
      if (layer.legendLabel !== undefined && typeof layer.legendLabel !== 'string') throw Error('Legenda de camada inválida');
      if (layer.countLabel !== undefined && typeof layer.countLabel !== 'string') throw Error('Unidade de contagem da camada inválida');
      if (layer.kind === 'points') {
        if (layer.geometryTypes.some(type => type !== 'Point')) throw Error('Camadas de pontos consultáveis exigem geometria Point');
        if (!layer.group || groups.has(layer.group)) throw Error('Grupo ausente ou duplicado');
        groups.add(layer.group);
        if (!Array.isArray(layer.popupFields) || layer.popupFields.some(field => !field.field || !field.label)) throw Error('Campos de consulta inválidos');
      }
      validateStyle(layer.style);
    }
    if (theme.temporal) {
      const temporal = theme.temporal;
      const validMonth = value => typeof value === 'string' && /^(0[1-9]|1[0-2])$/.test(value);
      const validPeriod = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(temporal.field || '') || !Array.isArray(temporal.years) || !temporal.years.length || temporal.years.some((year, index) => !Number.isInteger(year) || year < 2000 || year > 2100 || (index && year !== temporal.years[index - 1] + 1)) || !temporal.layerIds?.length || new Set(temporal.layerIds).size !== temporal.layerIds.length || temporal.layerIds.some(id => !layerIds.has(id)) || (temporal.partialYear !== null && (!temporal.years.includes(temporal.partialYear) || temporal.partialYear !== temporal.years.at(-1))) || !temporal.years.includes(temporal.defaultYear) || (temporal.defaultMonth !== 'all' && !validMonth(temporal.defaultMonth)) || !temporal.latestByLayer || temporal.layerIds.some(id => !validPeriod(temporal.latestByLayer[id]) || !temporal.years.includes(Number(temporal.latestByLayer[id].slice(0, 4))))) throw Error('Configuração temporal inválida: confira campo, camadas, anos, mês parcial e períodos disponíveis');
      for (const id of Object.keys(temporal.latestByLayer)) if (!temporal.layerIds.includes(id)) throw Error('Camada sem período temporal correspondente');
    }
    if (theme.comparison) {
      const comparison = theme.comparison;
      const validDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; };
      validateLocalPath(comparison.beforePath);
      validateLocalPath(comparison.afterPath);
      if (comparison.beforePath === comparison.afterPath || !Array.isArray(comparison.bounds) || comparison.bounds.length !== 4 || comparison.bounds.some(value => !Number.isFinite(value)) || comparison.bounds[0] < -180 || comparison.bounds[0] > 180 || comparison.bounds[2] < -180 || comparison.bounds[2] > 180 || comparison.bounds[1] < -90 || comparison.bounds[3] > 90 || comparison.bounds[1] >= comparison.bounds[3] || comparison.bounds[0] >= comparison.bounds[2] || !validDate(comparison.beforeDate) || !validDate(comparison.afterDate) || comparison.beforeDate >= comparison.afterDate || (comparison.eventDate && (!validDate(comparison.eventDate) || comparison.eventDate <= comparison.beforeDate || comparison.eventDate >= comparison.afterDate)) || !comparison.attribution || !comparison.license) throw Error('Comparação de imagens inválida: confira caminhos locais, recorte, datas e atribuição');
    }
  }
  return catalogue;
}

function validatePosition(position) {
  if (!Array.isArray(position) || position.length < 2 || position.some(value => !Number.isFinite(value)) || Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) throw Error('Coordenada deve ser longitude/latitude finita');
}

function sequence(value, minimum, validate) {
  if (!Array.isArray(value) || value.length < minimum) throw Error('Estrutura de geometria inválida');
  value.forEach(validate);
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateGeometry(geometry) {
  const line = coordinates => sequence(coordinates, 2, validatePosition);
  const ring = coordinates => {
    sequence(coordinates, 4, validatePosition);
    const first = coordinates[0], last = coordinates.at(-1);
    if (first.length !== last.length || first.some((value, index) => value !== last[index])) throw Error('Anel de polígono deve estar fechado');
  };
  const polygon = coordinates => sequence(coordinates, 1, ring);
  const validators = { Point: validatePosition, MultiPoint: coordinates => sequence(coordinates, 1, validatePosition), LineString: line, MultiLineString: coordinates => sequence(coordinates, 1, line), Polygon: polygon, MultiPolygon: coordinates => sequence(coordinates, 1, polygon) };
  if (!validators[geometry?.type]) throw Error('Tipo de geometria inválido');
  validators[geometry.type](geometry.coordinates);
}

export function validateLayer(layer, geojson, { temporal } = {}) {
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features) || geojson.crs) throw Error('Camada GeoJSON inválida ou CRS não publicado');
  const codes = new Set();
  for (const feature of geojson.features) {
    if (!layer.geometryTypes.includes(feature.geometry?.type)) throw Error('Tipo de geometria incompatível');
    if (feature.type !== 'Feature' || (feature.properties !== null && (typeof feature.properties !== 'object' || Array.isArray(feature.properties)))) throw Error('Feição inválida');
    validateGeometry(feature.geometry);
    if (layer.kind === 'points') {
      if (feature.geometry.type !== 'Point') throw Error('Pontos consultáveis exigem geometria Point');
      const code = String(feature.properties?.codigo ?? '');
      if (!code || codes.has(code)) throw Error('Identificador de local ausente ou duplicado');
      codes.add(code);
      if (layer.allowedGroups && !layer.allowedGroups.includes(feature.properties.grupo)) throw Error('Grupo não configurado no catálogo');
    }
    if (layer.kind !== 'points' || feature.properties.grupo === layer.group) styleForFeature(feature, layer);
    if (temporal?.layerIds.includes(layer.id)) {
      const period = feature.properties?.[temporal.field];
      const latest = temporal.latestByLayer[layer.id];
      if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !temporal.years.includes(Number(period.slice(0, 4))) || period > latest) throw Error('Período temporal inválido ou posterior ao fim documentado da camada');
      if ((layer.id === 'focos' || Object.hasOwn(feature.properties || {}, 'data_pas')) && (!validIsoDate(feature.properties?.data_pas) || feature.properties.data_pas.slice(0, 7) !== period)) throw Error('Data do foco inválida ou incompatível com o período temporal');
    }
  }
  if (layer.kind === 'points' && geojson.features.length && !geojson.features.some(feature => feature.properties?.grupo === layer.group)) throw Error('Grupo da camada não encontrado nos dados');
  return geojson;
}

export function filterTemporalFeatures(features, temporal, { year, month = 'all' } = {}) {
  const selectedYear = Number(year);
  if (!temporal?.years?.includes(selectedYear) || (month !== 'all' && !/^(0[1-9]|1[0-2])$/.test(String(month)))) return [];
  const prefix = `${selectedYear}-`;
  return features.filter(feature => {
    const period = feature.properties?.[temporal.field];
    return typeof period === 'string' && period.startsWith(prefix) && (month === 'all' || period.slice(5, 7) === String(month));
  });
}

export function collectPointFeatures(theme, datasets) {
  const files = new Map();
  for (const layer of theme.layers.filter(layer => layer.kind === 'points' && datasets.has(layer.id))) files.set(layer.path, datasets.get(layer.id));
  const features = [...files.values()].flatMap(collection => collection.features);
  const codes = new Set();
  for (const feature of features) {
    const code = String(feature.properties.codigo);
    if (codes.has(code)) throw Error('Identificador de local duplicado entre arquivos do tema');
    codes.add(code);
  }
  return features;
}

export function filterFeatures(features, { search = '', groups } = {}) {
  const term = normalize(search.trim());
  return features.filter(feature => {
    const props = feature.properties || {};
    return (!groups || groups.includes(props.grupo)) && (!term || normalize([props.nome, props.bairro, props.endereco].join(' ')).includes(term));
  });
}

export function styleForFeature(feature, layer) {
  const style = layer.style || {};
  if (!style.field) return { ...style };
  const value = feature.properties?.[style.field];
  const entry = Number.isFinite(value) ? style.classes.find(item => value >= item.min && (item.max === null || value < item.max)) : null;
  if (Number.isFinite(value) && !entry) throw Error('Valor numérico fora das faixas de classificação');
  const result = entry || style.missing;
  return { color: result.color, fillColor: result.color, fillOpacity: 0.65, weight: 1.5, classLabel: result.label };
}
