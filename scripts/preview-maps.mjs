import { createServer } from 'node:http';
import { readFile, stat, realpath, mkdir, cp, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { buildPortal } from './build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataNames = ['dashboard-data.json', 'fontes.json', 'imagem-satelite.json', 'indicadores-resumo.json', 'mapa-servicos.json'];
const within = (parent, child) => { const rel = path.relative(parent, child); return !rel || (!rel.startsWith('..') && !path.isAbsolute(rel)); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2' };

export async function startPreviewServer(directory, { port = 4174, onRequest = () => {} } = {}) {
  directory = await realpath(directory);
  const server = createServer(async (request, response) => {
    response.once('finish', () => onRequest({ pathname: (request.url || '/').split('?')[0], method: request.method, status: response.statusCode }));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = code => { response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(code === 400 ? 'Endereço inválido' : 'Página não encontrada'); };
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent((request.url || '/').split('?')[0]); } catch { fail(400); return; }
    if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) { fail(404); return; }
    try {
      let file = path.resolve(directory, '.' + pathname);
      if (!within(directory, file)) { fail(404); return; }
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      file = await realpath(file);
      if (!within(directory, file) || !(await stat(file)).isFile() || !mime[path.extname(file)]) { fail(404); return; }
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Content-Length': bytes.length });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { fail(404); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}

export async function preparePreview({ panelDir, legacyDir }) {
  panelDir = await realpath(panelDir);
  legacyDir = await realpath(legacyDir);
  const legacyInfo = JSON.parse(await readFile(path.join(legacyDir, 'build-info.json'), 'utf8'));
  const panelRevision = legacyInfo.modules?.find(module => module.id === 'painel')?.revision;
  if (!/^[a-f0-9]{40}$/.test(panelRevision || '')) throw Error('Pacote existente sem referência do painel');
  const dataHashes = {};
  for (const name of dataNames) {
    const sourceHash = hash(await readFile(path.join(panelDir, 'public/data', name)));
    const packagedHash = hash(await readFile(path.join(legacyDir, 'painel-de-monitoramento/data', name)));
    if (sourceHash !== packagedHash || packagedHash !== legacyInfo.dataHashes?.[name]) throw Error(`Pacote e fonte divergem: ${name}`);
    dataHashes[name] = sourceHash;
  }
  const previewRoot = path.join(root, '.preview', randomUUID());
  const portalDir = path.join(previewRoot, 'portal');
  const outputDir = path.join(previewRoot, 'ecossistema');
  const cloudflareDir = path.join(previewRoot, 'cloudflare');
  // All generated files stay in a unique directory inside this checkout.
  if (!within(path.join(root, '.preview'), previewRoot)) throw Error('Saída de prévia inválida');
  await mkdir(previewRoot, { recursive: true });
  const result = await buildPortal({ panelDir, outputDir: portalDir, revision: panelRevision, environment: 'homologacao' });
  await cp(legacyDir, outputDir, { recursive: true, filter: source => !['_headers', '_redirects'].includes(path.basename(source)) });
  await cp(portalDir, outputDir, { recursive: true });
  for (const name of dataNames) if (hash(await readFile(path.join(outputDir, 'painel-de-monitoramento/data', name))) !== dataHashes[name] || result.hashes[name] !== dataHashes[name]) throw Error(`Dados alterados na prévia: ${name}`);
  const info = { ...legacyInfo, environment: 'homologacao', basePath: '/', builtAt: new Date().toISOString(), dataHashes, localPreview: { portalSource: root, compiledPanelRevision: panelRevision, note: 'Prévia local com portal em revisão; painel compilado existente copiado sem alteração.' } };
  delete info.hosting;
  await writeFile(path.join(outputDir, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  const { prepareCloudflare } = await import(pathToFileURL(path.join(panelDir, 'scripts/prepare-cloudflare.mjs')).href);
  const verification = await prepareCloudflare({ source: outputDir, output: cloudflareDir });
  return { directory: cloudflareDir, dataHashes, panelRevision, verification };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(value => { const index = value.indexOf('='); if (!value.startsWith('--') || index < 3) throw Error('Use --opcao=valor'); return [value.slice(2, index), value.slice(index + 1)]; }));
  const port = Number(args.port || 4174);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Porta inválida');
  const prepared = await preparePreview({ panelDir: path.resolve(args.panel || '../painel'), legacyDir: path.resolve(args.legacy || '../painel/dist-ecossistema') });
  const auditFile = path.join(path.dirname(prepared.directory), 'requests.jsonl');
  await writeFile(auditFile, '');
  const running = await startPreviewServer(prepared.directory, { port, onRequest: record => appendFile(auditFile, JSON.stringify(record) + '\n').catch(error => console.error('Falha no registro local:', error.message)) });
  console.log(JSON.stringify({ ...prepared, auditFile, url: running.url + 'mapas-de-saude/' }, null, 2));
  console.log('Prévia somente neste computador. Encerre com Ctrl+C.');
}
