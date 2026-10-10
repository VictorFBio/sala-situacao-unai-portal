import { readFile, writeFile, mkdir, mkdtemp, rm, rename, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateGeometry } from '../maps/lib/theme-model.mjs';

const execute = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fields = ['codigo', 'nome', 'grupo', 'endereco', 'bairro', 'observacao', 'rural', 'x', 'y', 'qualidade_geocodificacao'];
const contexts = ['municipio', 'urbano', 'municipios', 'estados'];

export async function prepareMapTheme({ sourceFile, outputDir, ogrPath = process.env.OGR_PATH || 'C:/Program Files/QGIS 3.44.8/bin/ogr2ogr.exe', preparedAt = new Date().toISOString() }) {
  sourceFile = path.resolve(sourceFile);
  outputDir = path.resolve(outputDir);
  const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const inside = (parent, child) => { const relative = path.relative(parent, child); return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative)); };
  if (inside(outputDir, sourceFile) || inside(outputDir, projectRoot) || outputDir === path.parse(outputDir).root || !Number.isFinite(Date.parse(preparedAt))) throw Error('Destino ou data de preparação inválidos');
  try {
    const info = await lstat(outputDir);
    if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Destino precisa ser uma pasta regular');
    const expected = new Set(['locais.geojson', ...contexts.map(name => name + '.geojson'), 'metadata.json', 'provenance.json']);
    if ((await readdir(outputDir)).some(name => !expected.has(name))) throw Error('Destino contém arquivos que não pertencem à derivação');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await readFile(sourceFile);
  const data = JSON.parse(bytes);
  const points = data.queries?.rede_geografica;
  const context = data.queries?.mapa_contexto;
  if (!Array.isArray(points?.rows) || !points.rows.length || !Array.isArray(context?.rows)) throw Error('Consultas geográficas ausentes');
  const codes = new Set();
  const counts = {};
  for (const row of points.rows) {
    if (!row.codigo || codes.has(row.codigo)) throw Error('Código de local ausente ou duplicado');
    codes.add(row.codigo);
    if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) throw Error(`Coordenada inválida: ${row.codigo}`);
    if (!row.grupo || Object.keys(row).some(key => !fields.includes(key))) throw Error('Atributos públicos ou grupo inválidos');
    counts[row.grupo] = (counts[row.grupo] || 0) + 1;
  }
  const collections = [{ name: 'locais', data: { type: 'FeatureCollection', features: points.rows.map(row => ({ type: 'Feature', properties: row, geometry: { type: 'Point', coordinates: [row.x, row.y] } })) } }];
  for (const name of contexts) {
    const layer = context.rows.find(row => row.camada === name);
    if (!layer || !String(layer.crs).includes('31983')) throw Error(`CRS de contexto ausente ou incompatível: ${name}`);
    const geojson = typeof layer.geometria === 'string' ? JSON.parse(layer.geometria) : layer.geometria;
    if (geojson?.type !== 'FeatureCollection' || !geojson.features?.length) throw Error(`Geometria ausente: ${name}`);
    collections.push({ name, data: geojson });
  }
  const parent = path.dirname(outputDir);
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(path.join(parent, '.preparo-'));
  const previous = path.join(parent, '.preparo-anterior-' + randomUUID());
  if (path.dirname(stage) !== parent || path.dirname(previous) !== parent || !inside(parent, stage) || !inside(parent, previous)) throw Error('Pasta temporária fora do destino autorizado');
  const published = path.join(stage, 'published');
  await mkdir(published);
  try {
    const files = [];
    for (const layer of collections) {
      const input = path.join(stage, `${layer.name}-utm.geojson`);
      const output = path.join(published, `${layer.name}.geojson`);
      await writeFile(input, JSON.stringify(layer.data));
      await execute(ogrPath, ['-f', 'GeoJSON', output, input, '-s_srs', 'EPSG:31983', '-t_srs', 'EPSG:4326', '-lco', 'RFC7946=YES'], {
        windowsHide: true,
        env: { ...process.env, PROJ_DATA: process.env.PROJ_DATA || 'C:/Program Files/QGIS 3.44.8/share/proj', GDAL_DATA: process.env.GDAL_DATA || 'C:/Program Files/QGIS 3.44.8/apps/gdal/share/gdal' }
      });
      const transformed = JSON.parse(await readFile(output, 'utf8'));
      if (transformed.features.length !== layer.data.features.length || transformed.crs) throw Error('Reprojeção alterou a contagem ou manteve o CRS de origem');
      for (const feature of transformed.features) validateGeometry(feature.geometry);
      const raw = await readFile(output);
      files.push({ path: `${layer.name}.geojson`, sha256: sha(raw), bytes: raw.length, features: transformed.features.length });
    }
    const metadata = {
      schemaVersion: 1, id: 'rede-servicos', title: 'Rede de saúde e serviços de referência',
      preparedAt, sourceCrs: 'EPSG:31983', publicationCrs: 'EPSG:4326',
      source: points.source, contextSource: context.source, counts,
      unit: 'Local público mapeado; não equivale a equipe, paciente ou área de cobertura.',
      method: 'Derivação do arquivo público do painel; GDAL/PROJ, de SIRGAS 2000 / UTM 23S para longitude/latitude WGS84; sem nova geocodificação.',
      limitations: [...(points.source?.assumptions || []), ...(context.source?.assumptions || [])]
    };
    await writeFile(path.join(published, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
    const metadataBytes = await readFile(path.join(published, 'metadata.json'));
    files.push({ path: 'metadata.json', sha256: sha(metadataBytes), bytes: metadataBytes.length });
    if (sha(await readFile(sourceFile)) !== sha(bytes)) throw Error('Origem mudou durante a preparação; rever a derivação');
    await writeFile(path.join(published, 'provenance.json'), JSON.stringify({ schemaVersion: 1, preparedAt, source: { file: 'mapa-servicos.json', sha256: sha(bytes) }, transformation: { from: 'EPSG:31983', to: 'EPSG:4326', tool: 'GDAL/PROJ' }, counts, files }, null, 2) + '\n');
    let moved = false;
    try { await rename(outputDir, previous); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(published, outputDir); } catch (error) { if (moved) await rename(previous, outputDir); throw error; }
    if (moved) await rm(previous, { recursive: true, force: true });
    return { metadata, files };
  } finally { await rm(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => { const index = arg.indexOf('='); if (index < 3) throw Error('Use --opcao=valor'); return [arg.slice(2, index), arg.slice(index + 1)]; }));
  if (!args.source) throw Error('Arquivo --source obrigatório');
  const result = await prepareMapTheme({ sourceFile: args.source, outputDir: args.out || 'maps/data/rede-servicos', ogrPath: args.ogr });
  console.log(JSON.stringify({ points: Object.values(result.metadata.counts).reduce((a, b) => a + b, 0), files: result.files.length, output: args.out || 'maps/data/rede-servicos' }));
}
