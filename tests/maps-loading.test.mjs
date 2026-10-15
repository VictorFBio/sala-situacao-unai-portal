import { test } from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../maps/lib/resource-loader.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('arquivos compartilhados são lidos uma vez por visualizador e falhas permitem tentar novamente', async () => {
  assert.equal(typeof module.createResourceLoader, 'function');
  let calls = 0;
  let fail = true;
  const reader = module.createResourceLoader({ fetcher: async () => {
    calls++;
    return { ok: !fail, json: async () => ({ features: [{ valor: null }] }) };
  }});
  const failures = await Promise.allSettled([reader.read('/camada.json'), reader.read('/camada.json')]);
  assert.ok(failures.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  fail = false;
  const [a, b] = await Promise.all([reader.read('/camada.json'), reader.read('/camada.json')]);
  assert.equal(calls, 2);
  assert.equal(a, b);
  assert.equal((await reader.read('/camada.json')).features[0].valor, null);
  assert.equal(calls, 2);
});

test('pedido que não responde termina por prazo máximo; encerramento cancela o pedido ativo', async () => {
  assert.equal(typeof module.createResourceLoader, 'function');
  const fetcher = (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const timed = module.createResourceLoader({ fetcher, timeoutMs: 15 });
  await assert.rejects(timed.read('/lento.json'), { name: 'TimeoutError' });
  const controller = new AbortController();
  const reader = module.createResourceLoader({ fetcher, signal: controller.signal });
  const pending = reader.read('/camada.json');
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(reader.read('/outra.json'), { name: 'AbortError' });
});

test('erro síncrono do transporte não prende a próxima tentativa no cache', async () => {
  let calls = 0;
  const reader = module.createResourceLoader({ fetcher: () => {
    if (++calls === 1) throw Error('transporte indisponível');
    return { ok: true, json: async () => ({ recuperado: true }) };
  }});
  await assert.rejects(reader.read('/recurso.json'), /transporte/);
  assert.equal((await reader.read('/recurso.json')).recuperado, true);
});
