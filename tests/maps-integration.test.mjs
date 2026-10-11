import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { buildPortal } from '../scripts/build.mjs';
import { pathToFileURL } from 'node:url';
const { validateBuildOutput } = await import(pathToFileURL(path.resolve(process.env.PANEL_SOURCE || '../painel', 'scripts/publication-policy.mjs')).href);
const preview = await import('../scripts/preview-maps.mjs').catch(() => ({}));

test('pacote de mapas respeita o publicador existente e preserva os dados GeoJSON', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'unai-maps-integrated-'));
  try {
    await buildPortal({ panelDir: path.resolve(process.env.PANEL_SOURCE || '../painel'), outputDir, revision: 'a'.repeat(40) });
    await validateBuildOutput(outputDir);
    const maps = path.join(outputDir, 'mapas-de-saude');
    const catalogue = JSON.parse(await readFile(path.join(maps, 'data/catalogue.json'), 'utf8'));
    for (const layer of catalogue.themes[0].layers) {
      const geojson = JSON.parse(await readFile(path.join(maps, layer.path), 'utf8'));
      assert.equal(geojson.type, 'FeatureCollection');
    }
    const pointsPath = catalogue.themes[0].layers.find(layer => layer.kind === 'points').path;
    const html = await readFile(path.join(maps, 'index.html'), 'utf8');
    assert.match(html, /locais\.json" download>Locais mapeados · GeoJSON/);
    const actual = await readFile(path.join(maps, pointsPath));
    assert.deepEqual(actual, await readFile(new URL('../maps/data/rede-servicos/locais.geojson', import.meta.url)));
    await access(path.join(maps, 'web/viewer.js'));
    await access(path.join(maps, 'lib/theme-model.js'));
    const version = JSON.parse(await readFile(path.join(maps, 'vendor/leaflet/version.json'), 'utf8'));
    for (const file of version.files) assert.equal(createHash('sha256').update(await readFile(path.join(maps, 'vendor/leaflet', file.path))).digest('hex'), file.sha256);
    const license = JSON.parse(await readFile(path.join(maps, 'vendor/leaflet/license.json'), 'utf8'));
    assert.ok(license.text.includes('Redistribution'));
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

test('servidor de prévia atende recursos locais com MIME correto e bloqueia caminhos proibidos', async () => {
  assert.equal(typeof preview.startPreviewServer, 'function');
  const root = await mkdtemp(path.join(os.tmpdir(), 'unai-map-server-'));
  let running;
  const requests = [];
  try {
    await writeFile(path.join(root, 'index.html'), '<h1>Prévia</h1>');
    await writeFile(path.join(root, 'viewer.js'), 'export const local = true;');
    await writeFile(path.join(root, 'data.json'), '{"type":"FeatureCollection","features":[]}');
    await writeFile(path.join(root, '.env'), 'nunca servir');
    running = await preview.startPreviewServer(root, { port: 0, onRequest: record => requests.push(record) });
    assert.equal((await fetch(running.url)).status, 200);
    assert.match((await fetch(running.url + 'viewer.js')).headers.get('content-type'), /javascript/);
    assert.equal((await (await fetch(running.url + 'data.json')).json()).type, 'FeatureCollection');
    assert.equal((await fetch(running.url + '.env')).status, 404);
    assert.equal((await fetch(running.url + '..%2fsecret')).status, 404);
    assert.equal((await fetch(running.url + '%zz')).status, 400);
    assert.ok(requests.some(record => record.pathname === '/data.json' && record.status === 200));
  } finally { await running?.close(); await rm(root, { recursive: true, force: true }); }
});
