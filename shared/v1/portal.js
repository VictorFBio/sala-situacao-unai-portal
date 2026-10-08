import { legacyDestination } from './routes.js';
const base = document.body.dataset.basePath;
const destination = legacyDestination(location.hash, location.search, base);
if (location.pathname === base && destination) {
  location.replace(destination);
}
const search = document.querySelector('[data-catalogue-search]');
if (search) {
  const items = [...document.querySelectorAll('[data-filter-item]')];
  const result = document.querySelector('[data-search-result]');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  search.addEventListener('input', () => {
    const term = normalize(search.value.trim());
    let visible = 0;
    for (const item of items) {
      item.hidden = !normalize(item.textContent).includes(term);
      if (!item.hidden) visible++;
    }
    result.textContent = term ? `${visible} itens encontrados no catálogo e nas consultas.` : '';
  });
}
