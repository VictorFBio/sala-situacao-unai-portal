import { validateLayer, collectPointFeatures } from './theme-model.mjs';

// The document is a separate fallback for each theme, even when map files fail.
export async function loadThemeData({ theme, fallback = {}, read }) {
  const cache = new Map();
  const errors = [];
  const datasets = new Map();
  const allowedGroups = theme.layers.filter(layer => layer.kind === 'points').map(layer => layer.group);
  const get = file => { if (!cache.has(file)) cache.set(file, read(file)); return cache.get(file); };
  // Attach failure handling immediately, before waiting for slower layers.
  const metadataPromise = get(theme.metadataPath).catch(() => { errors.push('Registro de fontes'); return fallback.metadata; });
  await Promise.all(theme.layers.map(async layer => {
    try { datasets.set(layer.id, validateLayer({ ...layer, allowedGroups }, await get(layer.path))); }
    catch (error) { if (error.name !== 'AbortError') errors.push(layer.label); }
  }));
  const metadata = await metadataPromise;
  if (!metadata) throw Error('Fontes do tema selecionado indisponíveis');
  let mapFeatures;
  try { mapFeatures = collectPointFeatures(theme, datasets); }
  catch {
    errors.push('Identificadores de locais');
    for (const layer of theme.layers.filter(layer => layer.kind === 'points')) datasets.delete(layer.id);
    mapFeatures = [];
  }
  return { metadata, datasets, errors: [...new Set(errors)], mapFeatures, documentFeatures: fallback.points?.features || mapFeatures };
}
