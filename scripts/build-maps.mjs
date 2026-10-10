import { readFile, writeFile, copyFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const publicName = name => name.replace(/\.geojson$/, '.json').replace(/\.mjs$/, '.js').replace(/\.map$/, '.map.json');

export async function buildMapsAssets({ sourceDir, outputDir, catalogue }) {
  const published = structuredClone(catalogue);
  for (const theme of published.themes) for (const layer of theme.layers) layer.path = publicName(layer.path);
  async function copyArea(area, relative = '') {
    const source = path.join(sourceDir, area, relative);
    const target = path.join(outputDir, area, relative);
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw Error('Link simbólico proibido na área de mapas');
      if (entry.isDirectory()) { await copyArea(area, path.join(relative, entry.name)); continue; }
      const input = path.join(source, entry.name);
      const output = path.join(target, publicName(entry.name));
      if (area === 'data' && relative === '' && entry.name === 'catalogue.json') continue;
      if (entry.name.endsWith('.mjs')) {
        const text = (await readFile(input, 'utf8')).replace(/\.mjs(['"])/g, '.js$1');
        await writeFile(output, text);
      } else if (entry.name === 'provenance.json') {
        const proof = JSON.parse(await readFile(input, 'utf8'));
        for (const file of proof.files) file.path = publicName(file.path);
        await writeFile(output, JSON.stringify(proof, null, 2) + '\n');
      } else await copyFile(input, output);
    }
  }
  for (const area of ['data', 'lib', 'web']) await copyArea(area);
  await writeFile(path.join(outputDir, 'data/catalogue.json'), JSON.stringify(published, null, 2) + '\n');
  const sourceVendor = path.join(sourceDir, 'vendor/leaflet');
  const targetVendor = path.join(outputDir, 'vendor/leaflet');
  await mkdir(path.join(targetVendor, 'images'), { recursive: true });
  const version = JSON.parse(await readFile(path.join(sourceVendor, 'version.json'), 'utf8'));
  const files = [];
  for (const file of version.files) {
    const outputName = file.path === 'LICENSE' ? 'license.json' : publicName(file.path);
    let bytes = await readFile(path.join(sourceVendor, file.path));
    if (file.path === 'LICENSE') bytes = Buffer.from(JSON.stringify({ license: version.license, text: bytes.toString('utf8') }, null, 2) + '\n');
    if (file.path === 'leaflet.js') bytes = Buffer.from(bytes.toString('utf8').replace('sourceMappingURL=leaflet.js.map', 'sourceMappingURL=leaflet.js.map.json'));
    await writeFile(path.join(targetVendor, outputName), bytes);
    files.push({ path: outputName, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(path.join(targetVendor, 'version.json'), JSON.stringify({ ...version, sourceFiles: version.files, files }, null, 2) + '\n');
  return published;
}
