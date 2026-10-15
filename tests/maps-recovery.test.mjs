import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as model from '../maps/lib/theme-model.mjs';
import * as renderer from '../maps/lib/render-page.mjs';
const { renderMapsPage, renderLocalList } = renderer;
import { prepareMapTheme } from '../scripts/prepare-maps.mjs';
import { startPreviewServer } from '../scripts/preview-maps.mjs';
const loading = await import('../maps/lib/load-theme.mjs').catch(() => ({}));
const assets = await import('../scripts/build-maps.mjs');
const catalogue = JSON.parse(await readFile(new URL('../maps/data/catalogue.json', import.meta.url), 'utf8'));
const points = JSON.parse(await readFile(new URL('../maps/data/rede-servicos/locais.geojson', import.meta.url), 'utf8'));
const metadata = JSON.parse(await readFile(new URL('../maps/data/rede-servicos/metadata.json', import.meta.url), 'utf8'));

test('falhas parciais conservam o conjunto documental e falha de fontes usa o próprio tema', async () => {
  assert.equal(typeof loading.loadThemeData, 'function');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'map-recovery-'));
  let server;
  try {
    const theme = structuredClone(catalogue.themes[0]);
    theme.layers = theme.layers.filter(layer => layer.kind === 'points');
    for (const layer of theme.layers) {
      layer.path = layer.id + '.json';
      if (layer.id !== 'especializada') await writeFile(path.join(temporary, layer.path), JSON.stringify({ type: 'FeatureCollection', features: points.features.filter(feature => feature.properties.grupo === layer.group) }));
    }
    theme.metadataPath = 'missing-metadata.json';
    const fallback = { metadata: { ...metadata, source: { label: 'Fonte do tema B', period: 'Período do tema B' } }, points };
    server = await startPreviewServer(temporary, { port: 0 });
    const result = await loading.loadThemeData({ theme, fallback, read: async file => {
      const response = await fetch(server.url + file);
      if (!response.ok) throw Error('Indisponível');
      return response.json();
    } });
    assert.equal(result.documentFeatures.length, 32);
    assert.equal(result.mapFeatures.length, 27);
    assert.equal(result.metadata.source.period, 'Período do tema B');
    assert.ok(result.errors.includes('Saúde especializada e gestão'));
    const mappedIds = new Set(result.mapFeatures.map(feature => String(feature.properties.codigo)));
    const html = renderLocalList(result.documentFeatures, theme, true, mappedIds);
    assert.equal([...html.matchAll(/data-local-id=/g)].length, 32);
    assert.match(html, /Representação no mapa indisponível/);
    const completeFailure = await loading.loadThemeData({ theme, fallback, read: async () => { throw Error('Falha'); } });
    assert.equal(completeFailure.documentFeatures.length, 32);
    assert.equal(completeFailure.mapFeatures.length, 0);
    assert.equal(completeFailure.metadata.source.period, 'Período do tema B');
  } finally { await server?.close(); await rm(temporary, { recursive: true, force: true }); }
});

test('fallback de cada tema é publicado no HTML com conteúdo seguro e fonte territorial própria', () => {
  const second = structuredClone(catalogue.themes[0]);
  second.id = 'territorio'; second.title = 'Território';
  second.layers = second.layers.filter(layer => layer.kind === 'context');
  const html = renderMapsPage({ catalogue: { schemaVersion: 1, themes: [catalogue.themes[0], second] }, basePath: '/', themeBundles: {
    'rede-servicos': { metadata, points }, territorio: { metadata: { source: { label: '<script>Fonte B</script>', period: 'Período B' }, unit: 'Áreas territoriais' }, points: { features: [] } }
  } });
  const encoded = html.match(/<script type="application\/json" data-map-fallbacks>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(encoded, 'fallback de todos os temas precisa estar no documento');
  assert.doesNotMatch(encoded, /<script>/);
  assert.equal(JSON.parse(encoded).territorio.metadata.source.period, 'Período B');
});

test('estrutura geométrica inválida e geometria sem suporte em pontos são rejeitadas', () => {
  const layer = { kind: 'context', geometryTypes: ['Point', 'LineString', 'Polygon', 'MultiPolygon'] };
  for (const geometry of [
    { type: 'Point', coordinates: [[-46.9, -16.3]] },
    { type: 'LineString', coordinates: [[-46.9, -16.3]] },
    { type: 'Polygon', coordinates: [[[-47, -16], [-46, -16], [-46, -15], [-47, -15]]] },
    { type: 'MultiPolygon', coordinates: [[[-46.9, -16.3]]] }
  ]) assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] }), /geometria|posição|coordenada|anel/i);
  const bad = structuredClone(catalogue);
  bad.themes[0].layers.find(layer => layer.kind === 'points').geometryTypes = ['MultiPoint'];
  assert.throws(() => model.validateCatalogue(bad), /Point|pontos/i);
});

test('códigos são únicos em todos os arquivos do tema, com deduplicação dos arquivos compartilhados', () => {
  assert.equal(typeof model.collectPointFeatures, 'function');
  const theme = catalogue.themes[0];
  const shared = new Map(theme.layers.filter(layer => layer.kind === 'points').map(layer => [layer.id, points]));
  assert.equal(model.collectPointFeatures(theme, shared).length, 32);
  const two = structuredClone(theme);
  two.layers = two.layers.filter(layer => layer.kind === 'points').slice(0, 2);
  two.layers.forEach((layer, index) => { layer.path = `arquivo-${index}.json`; });
  const datasets = new Map(two.layers.map(layer => [layer.id, { type: 'FeatureCollection', features: [{ ...points.features[0], properties: { ...points.features[0].properties, grupo: layer.group } }] }]));
  assert.throws(() => model.collectPointFeatures(two, datasets), /duplicado/i);
});

test('valor numérico fora das classes e lacunas não viram ausência', () => {
  const layer = { kind: 'context', geometryTypes: ['Point'], style: { field: 'valor', classes: [{ min: 0, max: 10, color: '#08588e', label: 'Baixa' }, { min: 20, max: null, color: '#b8493e', label: 'Alta' }], missing: { color: '#ccc', label: 'Sem informação' } } };
  assert.throws(() => model.styleForFeature({ properties: { valor: 12 } }, layer), /faixa|classe/i);
  assert.throws(() => model.validateLayer(layer, { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { valor: 12 }, geometry: { type: 'Point', coordinates: [-46.9, -16.3] } }] }), /faixa|classe/i);
  assert.equal(model.styleForFeature({ properties: { valor: null } }, layer).classLabel, 'Sem informação');
});

test('falha durante nova preparação preserva integralmente o conjunto anterior', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'map-atomic-'));
  try {
    const source = JSON.parse(await readFile(path.resolve(process.env.PANEL_SOURCE || '../painel', 'public/data/mapa-servicos.json'), 'utf8'));
    const sourceFile = path.join(temporary, 'source.json');
    const outputDir = path.join(temporary, 'prepared');
    await writeFile(sourceFile, JSON.stringify(source));
    await prepareMapTheme({ sourceFile, outputDir });
    const names = ['locais.geojson', 'municipio.geojson', 'urbano.geojson', 'municipios.geojson', 'estados.geojson', 'metadata.json', 'provenance.json'];
    const before = await Promise.all(names.map(name => readFile(path.join(outputDir, name))));
    source.queries.rede_geografica.rows[0].nome = 'Alteração que não pode vazar';
    const context = source.queries.mapa_contexto.rows.find(row => row.camada === 'municipio');
    context.geometria = { type: 'FeatureCollection', features: [{ type: 'TipoInvalido' }] };
    await writeFile(sourceFile, JSON.stringify(source));
    await assert.rejects(prepareMapTheme({ sourceFile, outputDir }));
    for (const [index, name] of names.entries()) assert.deepEqual(await readFile(path.join(outputDir, name)), before[index], name);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('atribuição usa as fontes do tema e consulta territorial não anuncia rede ou equipes', () => {
  assert.equal(typeof renderer.mapAttribution, 'function');
  assert.match(renderer.mapAttribution({ source: { label: 'Fonte municipal' } }), /Fonte municipal/);
  assert.doesNotMatch(renderer.mapAttribution({ source: { label: 'Fonte municipal' } }), /IBGE/);
  assert.doesNotMatch(renderer.mapAttribution({ source: { label: '<img src=x>' } }), /<img/);
  const theme = structuredClone(catalogue.themes[0]);
  theme.layers = theme.layers.filter(layer => layer.kind === 'context');
  const html = renderer.renderThemeContent({ theme, bundle: { metadata: { unit: 'Áreas territoriais' } }, mapsBase: '/mapas-de-saude/' });
  assert.doesNotMatch(html, /Rede e serviços|funcionamento atual|Local selecionado|Locais encontrados/);
  assert.match(html, /Áreas territoriais/);
});

test('provas declaradas divergentes impedem empacotar dados geográficos', async () => {
  assert.equal(typeof assets.verifyThemeProvenance, 'function');
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'map-proof-'));
  try {
    await mkdir(path.join(temporary, 'data'), { recursive: true });
    await cp(new URL('../maps/data/rede-servicos', import.meta.url), path.join(temporary, 'data/rede-servicos'), { recursive: true });
    await assets.verifyThemeProvenance(temporary, catalogue.themes[0]);
    await writeFile(path.join(temporary, 'data/rede-servicos/locais.geojson'), JSON.stringify({ ...points, features: points.features.slice(1) }));
    await assert.rejects(assets.verifyThemeProvenance(temporary, catalogue.themes[0]), /hash|integridade|prova/i);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
