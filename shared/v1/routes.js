export function normalizeBasePath(value = '/') {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*\/?$/.test(value)) throw new Error('Base do site inválida');
  return value.endsWith('/') ? value : `${value}/`;
}
export function legacyDestination(hash, search = '', basePath = '/') {
  const known = ['#/aps', '#/hospitalar', '#/vigilancia', '#/gestao', '#/mapa', '#/fontes'];
  return known.includes(hash) ? `${normalizeBasePath(basePath)}painel-de-monitoramento/${search}${hash}` : null;
}
