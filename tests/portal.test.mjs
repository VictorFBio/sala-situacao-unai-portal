import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const api = await import('../scripts/build.mjs').catch(() => ({}));
const panelDir = path.resolve(process.env.PANEL_SOURCE || '../painel');

test('portal gera páginas reais, catálogo com procedência e links na base de homologação', async () => {
  assert.equal(typeof api.buildPortal, 'function', 'gerador do portal ainda não implementado');
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'unai-portal-'));
  try {
    await api.buildPortal({ panelDir, outputDir, basePath: '/homologacao/', revision: 'a'.repeat(40), environment: 'homologacao' });
    for (const route of ['', 'dados', 'sobre', 'mapas-de-saude', 'rede-de-saude', 'boletins', 'analises']) {
      await access(path.join(outputDir, route, 'index.html'));
    }
    const home = await readFile(path.join(outputDir, 'index.html'), 'utf8');
    assert.match(home, /href="\/homologacao\/painel-de-monitoramento\/"/);
    assert.match(home, /Ambiente de homologação/);
    assert.match(home, /Em preparação/);
    assert.doesNotMatch(home, /fonts\.googleapis/);
    const catalogue = await readFile(path.join(outputDir, 'dados/index.html'), 'utf8');
    assert.match(catalogue, /Registro do catálogo original/);
    assert.match(catalogue, /Consultas presentes no pacote/);
    assert.match(catalogue, /Planejada/);
    assert.match(catalogue, /Período/);
    assert.match(catalogue, /Limitações/);
    assert.match(catalogue, /dashboard-data\.json/);
    assert.match(catalogue, /não equivale à validação/);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

test('base do site aceita apenas um caminho normalizado, sem navegação para outra origem', () => {
  assert.equal(typeof api.normalizeBasePath, 'function', 'validação da base ainda não implementada');
  assert.equal(api.normalizeBasePath('/teste'), '/teste/');
  assert.equal(api.normalizeBasePath('/'), '/');
  for (const unsafe of ['https://outro.example/', '//outro.example/', '/../segredo/', '/a/../b/', '/a\\b/', '/a?x=1']) {
    assert.throws(() => api.normalizeBasePath(unsafe));
  }
});

test('links antigos conhecidos vão para o painel e preservam a consulta; âncoras comuns não redirecionam', () => {
  assert.equal(typeof api.legacyDestination, 'function', 'compatibilidade de links ainda não implementada');
  assert.equal(api.legacyDestination('#/aps', '?origem=antigo', '/teste/'), '/teste/painel-de-monitoramento/?origem=antigo#/aps');
  assert.equal(api.legacyDestination('#/mapa', '', '/'), '/painel-de-monitoramento/#/mapa');
  assert.equal(api.legacyDestination('#conteudo', '', '/'), null);
  assert.equal(api.legacyDestination('#/', '', '/'), null);
  assert.equal(api.legacyDestination('#/inexistente', '', '/'), null);
});
