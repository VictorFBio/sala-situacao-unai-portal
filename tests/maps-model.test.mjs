import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const api = await import('../maps/lib/theme-model.mjs').catch(() => ({}));
const loadCatalogue = async () => JSON.parse(await readFile(new URL('../maps/data/catalogue.json', import.meta.url), 'utf8'));
const loadPoints = async () => JSON.parse(await readFile(new URL('../maps/data/rede-servicos/locais.geojson', import.meta.url), 'utf8'));

test('catálogo distingue camadas iniciais de saúde das referências e permite outro tema configurado', async () => {
  assert.equal(typeof api.validateCatalogue, 'function');
  const catalogue = await loadCatalogue();
  api.validateCatalogue(catalogue);
  assert.equal(catalogue.themes.length, 1);
  const layers = catalogue.themes[0].layers.filter(l => l.kind === 'points');
  assert.deepEqual(layers.filter(l => l.visible).map(l => l.group), ['UBS / ESF', 'Saúde especializada e gestão', 'Urgência e emergência']);
  assert.equal(layers.filter(l => !l.visible).length, 2);
  const second = structuredClone(catalogue.themes[0]);
  second.id = 'teste-configuracao';
  const expanded = { schemaVersion: 1, themes: [...catalogue.themes, second] };
  assert.equal(api.validateCatalogue(expanded).themes.length, 2);
});

test('busca normaliza acentos e filtros preservam locais distintos e resultado vazio', async () => {
  assert.equal(typeof api.filterFeatures, 'function');
  const { features } = await loadPoints();
  const initial = api.filterFeatures(features, { groups: ['UBS / ESF', 'Saúde especializada e gestão', 'Urgência e emergência'], search: '' });
  assert.equal(initial.length, 26);
  assert.equal(api.filterFeatures(features, { groups: ['UBS / ESF'], search: 'alvorada' })[0].properties.codigo, 'A01');
  assert.equal(api.filterFeatures(features, { groups: ['UBS / ESF'], search: 'CAIC' })[0].properties.codigo, 'A04');
  assert.equal(api.filterFeatures(features, { groups: [], search: '' }).length, 0);
  assert.equal(api.filterFeatures(features, { search: 'nenhum local com este nome' }).length, 0);
  const fixture = [{ properties: { codigo: 'x', nome: 'Saúde São José', bairro: 'Água' } }];
  assert.equal(api.filterFeatures(fixture, { search: 'agua' }).length, 1);
});

test('catálogo recusa recursos externos, traversal e identificadores duplicados', async () => {
  assert.equal(typeof api.validateCatalogue, 'function');
  for (const unsafe of ['https://example.org/data.geojson', '../data.geojson', '/data.geojson', 'data/%2e%2e/a.geojson', 'data\\a.geojson']) {
    const catalogue = await loadCatalogue();
    catalogue.themes[0].layers[0].path = unsafe;
    assert.throws(() => api.validateCatalogue(catalogue), /caminho|local/i);
  }
  const duplicate = await loadCatalogue();
  duplicate.themes.push(structuredClone(duplicate.themes[0]));
  assert.throws(() => api.validateCatalogue(duplicate), /duplicado/i);
});

test('geometria incompatível e grupo não declarado são rejeitados antes de desenhar', async () => {
  assert.equal(typeof api.validateLayer, 'function');
  const catalogue = await loadCatalogue();
  const layer = catalogue.themes[0].layers.find(l => l.kind === 'points');
  const geojson = await loadPoints();
  const allowedGroups = catalogue.themes[0].layers.filter(l => l.kind === 'points').map(l => l.group);
  api.validateLayer({ ...layer, allowedGroups }, geojson);
  const wrong = structuredClone(geojson);
  wrong.features[0].geometry.type = 'LineString';
  assert.throws(() => api.validateLayer({ ...layer, allowedGroups }, wrong), /geometria/i);
  const unknown = structuredClone(geojson);
  unknown.features[0].properties.grupo = 'Grupo não declarado';
  assert.throws(() => api.validateLayer({ ...layer, allowedGroups }, unknown), /grupo/i);
  const projected = structuredClone(geojson);
  projected.features[0].geometry.coordinates = [296805, 8192945];
  assert.throws(() => api.validateLayer({ ...layer, allowedGroups }, projected), /coordenada/i);
});

test('classes respeitam fronteiras e dados ausentes nunca são convertidos em zero', () => {
  assert.equal(typeof api.styleForFeature, 'function');
  const layer = { style: { field: 'valor', classes: [{ min: 0, max: 10, color: '#08588e', label: '0 a <10' }, { min: 10, max: null, color: '#b8493e', label: '10 ou mais' }], missing: { color: '#b8bec8', label: 'Sem informação' } } };
  assert.equal(api.styleForFeature({ properties: { valor: 0 } }, layer).fillColor, '#08588e');
  assert.equal(api.styleForFeature({ properties: { valor: 10 } }, layer).fillColor, '#b8493e');
  for (const value of [null, undefined, '', '0']) assert.equal(api.styleForFeature({ properties: { valor: value } }, layer).fillColor, '#b8bec8');
});
