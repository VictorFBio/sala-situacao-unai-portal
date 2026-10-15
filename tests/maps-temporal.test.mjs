import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as model from '../maps/lib/theme-model.mjs';
import * as renderer from '../maps/lib/render-page.mjs';

const catalogue = JSON.parse(await readFile(new URL('../maps/data/catalogue.json', import.meta.url), 'utf8'));

test('filtro temporal permite ano completo, mês específico e períodos vazios sem inventar registros', () => {
  assert.equal(typeof model.filterTemporalFeatures, 'function');
  const temporal = { field: 'periodo', years: [2025, 2026] };
  const features = [
    { properties: { periodo: '2025-08' } },
    { properties: { periodo: '2025-09' } },
    { properties: { periodo: '2026-01' } },
    { properties: { sem_periodo: true } }
  ];
  assert.deepEqual(model.filterTemporalFeatures(features, temporal, { year: 2025, month: 'all' }), features.slice(0, 2));
  assert.deepEqual(model.filterTemporalFeatures(features, temporal, { year: 2025, month: '09' }), [features[1]]);
  assert.deepEqual(model.filterTemporalFeatures(features, temporal, { year: 2026, month: '02' }), []);
});

test('catálogo valida anos, mês inicial e identifica explicitamente o ano parcial', () => {
  const themed = structuredClone(catalogue);
  const valid = { field: 'periodo', years: [2020, 2021, 2022, 2023, 2024, 2025, 2026], partialYear: 2026, defaultYear: 2025, defaultMonth: 'all', layerIds: ['municipio'], latestByLayer: { municipio: '2026-09' } };
  themed.themes[0].temporal = valid;
  assert.equal(model.validateCatalogue(themed).themes[0].temporal.partialYear, 2026);
  for (const temporal of [
    { ...valid, years: [2020, 2022], partialYear: 2022, latestByLayer: { municipio: '2022-12' } },
    { ...valid, years: [2020, 2021], partialYear: 2022, defaultYear: 2021, latestByLayer: { municipio: '2022-12' } },
    { ...valid, years: [2020, 2021], partialYear: 2021, defaultYear: 2021, defaultMonth: '13', latestByLayer: { municipio: '2021-12' } }
  ]) {
    const invalid = structuredClone(themed);
    invalid.themes[0].temporal = temporal;
    assert.throws(() => model.validateCatalogue(invalid), /temporal|período|ano|mês/i);
  }
});

test('tema temporal mostra seletores de ano e mês e sinaliza a série parcial', async () => {
  const themed = structuredClone(catalogue.themes[0]);
  themed.id = 'queimadas';
  themed.temporal = { field: 'periodo', years: [2020, 2021, 2022, 2023, 2024, 2025, 2026], partialYear: 2026, defaultYear: 2025, defaultMonth: 'all', layerIds: ['municipio'], latestByLayer: { municipio: '2026-09' } };
  const html = renderer.renderThemeContent({ theme: themed, bundle: { metadata: { unit: 'Detecções orbitais por período' } }, mapsBase: '/mapas-de-saude/' });
  assert.match(html, /data-map-year/);
  assert.match(html, /data-map-month/);
  assert.match(html, /2026[^<]{0,20}parcial/i);
});

test('camada temporal não aceita meses inválidos nem dados posteriores ao período declarado', () => {
  const layer = { id: 'focos', kind: 'context', geometryTypes: ['Point'], style: { color: '#c43d2f' } };
  const temporal = { field: 'periodo', years: [2025, 2026], partialYear: 2026, defaultYear: 2025, defaultMonth: 'all', layerIds: ['focos'], latestByLayer: { focos: '2026-09' } };
  const feature = (period, data_pas = `${period}-15`) => ({ type: 'Feature', properties: { periodo: period, data_pas }, geometry: { type: 'Point', coordinates: [-46.9, -16.3] } });
  assert.doesNotThrow(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [feature('2026-09')] }, { temporal }));
  assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [feature('2026-10')] }, { temporal }), /período temporal/i);
  assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [feature('2026-13')] }, { temporal }), /período temporal/i);
  assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [feature('2026-02', '2026-02-31')] }, { temporal }), /data|data_pas/i);
  assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [feature('2026-02', '2026-03-01')] }, { temporal }), /data|data_pas|período temporal/i);
  assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [feature('2026-02', null)] }, { temporal }), /data|data_pas/i);
});

test('preparação das queimadas usa limite municipal IBGE original e registra fonte dos serviços', async () => {
  const script = await readFile(new URL('../scripts/prepare-queimadas.py', import.meta.url), 'utf8');
  const metadata = JSON.parse(await readFile(new URL('../maps/data/queimadas/metadata.json', import.meta.url), 'utf8'));
  assert.match(script, /ibge2025.*MG_Municipios_2025\.shp/s);
  assert.doesNotMatch(script, /maps"\s*\/\s*"data"\s*\/\s*"rede-servicos"\s*\/\s*"municipio\.geojson/);
  assert.match(script, /boundary_properties\s*=\s*\{[\s\S]*?as_plain\(boundary_feature\.attribute/);
  assert.match(script, /write_geojson\("municipio\.geojson",\s*\[feature_json\(boundary_geometry, boundary_properties\)\]\)/);
  assert.doesNotMatch(script, /shutil\.copyfile\(BOUNDARY_PATH, OUTPUT \/ "municipio\.geojson"\)/);
  assert.ok(metadata.contextSource.links.some(link => /Prefeitura de Unaí/i.test(link.label)));
  assert.match(metadata.contextSource.boundaryArchiveSha256, /^[A-F0-9]{64}$/);
  assert.match(metadata.contextSource.period, /09\/09\/2026/);
});

test('extratos municipais publicados têm períodos coerentes com a janela declarada', async () => {
  const theme = catalogue.themes.find(item => item.id === 'queimadas');
  assert.ok(theme);
  for (const id of theme.temporal.layerIds) {
    const layer = theme.layers.find(item => item.id === id);
    const dataName = id === 'focos' ? 'focos.geojson' : 'area-queimada.geojson';
    const geojson = JSON.parse(await readFile(new URL(`../maps/data/queimadas/${dataName}`, import.meta.url), 'utf8'));
    assert.ok(geojson.features.length > 0);
    assert.doesNotThrow(() => model.validateLayer(layer, geojson, { temporal: theme.temporal }));
  }
  const focusData = JSON.parse(await readFile(new URL('../maps/data/queimadas/focos.geojson', import.meta.url), 'utf8'));
  assert.ok(focusData.features.every(feature => /^\d{4}-\d{2}-\d{2}$/.test(feature.properties.data_pas) && feature.properties.periodo === feature.properties.data_pas.slice(0, 7)));
});

test('comparação de imagens exige arquivos locais e datas e controles aparecem no tema', async () => {
  const theme = structuredClone(catalogue.themes.find(item => item.id === 'queimadas'));
  assert.ok(theme.comparison);
  const metadata = JSON.parse(await readFile(new URL('../maps/data/queimadas/metadata.json', import.meta.url), 'utf8'));
  const html = renderer.renderThemeContent({ theme, bundle: { metadata }, mapsBase: '/mapas-de-saude/' });
  assert.match(html, /data-comparison-toggle/);
  assert.match(html, /data-comparison-slider/);
  assert.match(html, /data-map-view="piloto"/);
  assert.match(html, /comparacao-antes\.jpg/);
  assert.match(html, /CC-BY-4\.0/);
  assert.match(html, /Licenças e condições de uso/);
  assert.match(html, /licença padronizada não foi confirmada/i);
  assert.match(html, /cobertura de nuvens não foi quantificada/i);
  assert.match(html, /map-legend-line/);
  assert.match(renderer.mapAttribution(metadata), /CC-BY-4\.0/);
  for (const change of [
    config => { config.beforePath = 'https://example.org/before.jpg'; },
    config => { config.bounds = [-47, -17, -48, -16]; },
    config => { config.afterDate = config.beforeDate; },
    config => { config.eventDate = '2026-09-03'; }
  ]) {
    const invalid = structuredClone(catalogue);
    change(invalid.themes.find(item => item.id === 'queimadas').comparison);
    assert.throws(() => model.validateCatalogue(invalid), /comparação|caminho/i);
  }
});
