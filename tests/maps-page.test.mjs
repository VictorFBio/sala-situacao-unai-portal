import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { buildPortal } from '../scripts/build.mjs';

const renderer = await import('../maps/lib/render-page.mjs').catch(() => ({}));
const panelDir = path.resolve(process.env.PANEL_SOURCE || '../painel');

test('página própria inclui camadas locais, lista acessível, metadados e downloads em diferentes bases', async () => {
  for (const basePath of ['/', '/homologacao/']) {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), 'unai-maps-page-'));
    try {
      await buildPortal({ panelDir, outputDir, basePath, revision: 'a'.repeat(40) });
      const html = await readFile(path.join(outputDir, 'mapas-de-saude/index.html'), 'utf8');
      assert.match(html, /data-maps-root/);
      assert.match(html, /Mapas Temáticos/);
      assert.match(html, /Rede de saúde e serviços de referência/);
      assert.match(html, /ESF Alvorada/);
      assert.match(html, /09\/09\/2026/);
      assert.match(html, /geocodificadas/);
      assert.match(html, /noscript/);
      assert.match(html, /data-local-id="A01"/);
      assert.match(html, /download/);
      assert.ok(html.includes(`${basePath}mapas-de-saude/vendor/leaflet/leaflet.js`));
      assert.ok(html.includes(`${basePath}mapas-de-saude/web/viewer.js`));
      assert.ok(html.includes(`${basePath}mapas-de-saude/data/rede-servicos/locais.json`));
      const resources = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
      assert.ok(!resources.some(url => /unpkg|jsdelivr|tile\.openstreetmap|mapbox/i.test(url)));
      for (const file of ['web/viewer.js', 'web/maps.css', 'lib/theme-model.js', 'data/catalogue.json', 'data/rede-servicos/locais.json', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/leaflet/license.json', 'vendor/leaflet/version.json']) await access(path.join(outputDir, 'mapas-de-saude', file));
      const home = await readFile(path.join(outputDir, 'index.html'), 'utf8');
      assert.match(home, /Mapas Temáticos/);
      assert.doesNotMatch(home, /leaflet\.js/);
    } finally { await rm(outputDir, { recursive: true, force: true }); }
  }
});

test('renderização de dados de locais escapa conteúdo HTML e mantém consulta sem script', async () => {
  assert.equal(typeof renderer.renderMapsPage, 'function');
  const catalogue = JSON.parse(await readFile(new URL('../maps/data/catalogue.json', import.meta.url), 'utf8'));
  const metadata = JSON.parse(await readFile(new URL('../maps/data/rede-servicos/metadata.json', import.meta.url), 'utf8'));
  const points = JSON.parse(await readFile(new URL('../maps/data/rede-servicos/locais.geojson', import.meta.url), 'utf8'));
  points.features[0].properties.nome = '<img src=x onerror=alert(1)>';
  points.features[0].properties.observacao = '<script>alert(1)</script>';
  const html = renderer.renderMapsPage({ catalogue, basePath: '/', themeBundles: { 'rede-servicos': { metadata, points } } });
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<img src=x') && !html.includes('<script>alert(1)</script>'));
  assert.equal([...html.matchAll(/data-local-id=/g)].length, 32);
});

test('biblioteca local tem versão fixada, licença e hashes conferíveis', async () => {
  const vendor = new URL('../maps/vendor/leaflet/', import.meta.url);
  const version = JSON.parse(await readFile(new URL('version.json', vendor), 'utf8'));
  assert.equal(version.version, '1.9.4');
  for (const file of version.files) {
    const hash = createHash('sha256').update(await readFile(new URL(file.path, vendor))).digest('hex');
    assert.equal(hash, file.sha256);
  }
  assert.ok((await readFile(new URL('LICENSE', vendor), 'utf8')).includes('Redistribution'));
});
