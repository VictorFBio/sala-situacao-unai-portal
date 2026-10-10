import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const api = await import('../scripts/prepare-maps.mjs').catch(() => ({}));
const sourceFile = path.resolve(process.env.PANEL_SOURCE || '../painel', 'public/data/mapa-servicos.json');
const hash = data => createHash('sha256').update(data).digest('hex');
const ogrPath = process.env.OGR_PATH || 'C:/Program Files/QGIS 3.44.8/bin/ogr2ogr.exe';

test('derivação preserva locais, atributos públicos, ausências e origem, com reprojeção conferida', async () => {
  assert.equal(typeof api.prepareMapTheme, 'function', 'preparação de camadas ainda não implementada');
  const before = await readFile(sourceFile);
  const source = JSON.parse(before);
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'unai-map-data-'));
  try {
    const result = await api.prepareMapTheme({ sourceFile, outputDir, ogrPath, preparedAt: '2026-10-10T15:00:00Z' });
    const points = JSON.parse(await readFile(path.join(outputDir, 'locais.geojson'), 'utf8'));
    assert.equal(points.features.length, 32);
    assert.equal(points.crs, undefined);
    assert.deepEqual(points.features.map(f => f.properties.codigo).sort(), source.queries.rede_geografica.rows.map(r => r.codigo).sort());
    for (const row of source.queries.rede_geografica.rows) {
      const feature = points.features.find(f => f.properties.codigo === row.codigo);
      assert.deepEqual(feature.properties, row);
      assert.equal(feature.geometry.type, 'Point');
      assert.ok(feature.geometry.coordinates[0] > -50 && feature.geometry.coordinates[0] < -40);
      assert.ok(feature.geometry.coordinates[1] > -20 && feature.geometry.coordinates[1] < -10);
      assert.equal(feature.properties.telefone, undefined);
    }
    const a01 = points.features.find(f => f.properties.codigo === 'A01');
    assert.ok(Math.abs(a01.geometry.coordinates[0] + 46.902082006867) < 0.000001);
    assert.ok(Math.abs(a01.geometry.coordinates[1] + 16.336028001428) < 0.000001);
    assert.equal(a01.properties.observacao, '');
    assert.equal(result.metadata.source.period, 'Endereços consultados em 09/09/2026');
    assert.equal(result.metadata.preparedAt, '2026-10-10T15:00:00Z');
    assert.deepEqual(result.metadata.counts, { 'UBS / ESF': 18, 'Saúde especializada e gestão': 5, 'Urgência e emergência': 3, 'Proteção social': 4, 'Segurança pública': 2 });
    const proof = JSON.parse(await readFile(path.join(outputDir, 'provenance.json'), 'utf8'));
    assert.equal(proof.source.sha256, hash(before));
    for (const file of proof.files) assert.equal(hash(await readFile(path.join(outputDir, file.path))), file.sha256);
    for (const name of ['municipio', 'urbano', 'municipios', 'estados']) {
      const layer = JSON.parse(await readFile(path.join(outputDir, `${name}.geojson`), 'utf8'));
      assert.ok(layer.features.length > 0);
      assert.equal(layer.crs, undefined);
    }
    assert.deepEqual(await readFile(sourceFile), before);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

test('dados ambíguos ou sem coordenadas finitas impedem a exportação', async () => {
  assert.equal(typeof api.prepareMapTheme, 'function');
  const source = JSON.parse(await readFile(sourceFile, 'utf8'));
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'unai-map-invalid-'));
  try {
    const temporarySource = path.join(outputDir, 'input.json');
    for (const mutation of ['duplicate', 'invalid']) {
      const input = structuredClone(source);
      if (mutation === 'duplicate') input.queries.rede_geografica.rows.push(input.queries.rede_geografica.rows[0]);
      else input.queries.rede_geografica.rows[0].x = null;
      await writeFile(temporarySource, JSON.stringify(input));
      await assert.rejects(api.prepareMapTheme({ sourceFile: temporarySource, outputDir: path.join(outputDir, mutation), ogrPath }), /duplicado|coordenada/i);
    }
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});
