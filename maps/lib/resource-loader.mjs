// Cache restrito à vida deste visualizador; recarregar a página consulta a publicação atual.
export function createResourceLoader({ fetcher = globalThis.fetch, signal, timeoutMs = 15000 } = {}) {
  const cache = new Map();
  const pending = new Map();
  return {
    read(url) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (cache.has(url)) return Promise.resolve(cache.get(url));
      if (pending.has(url)) return pending.get(url);
      const request = new AbortController();
      const abort = () => request.abort(signal.reason);
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => request.abort(new DOMException('Prazo de carregamento excedido', 'TimeoutError')), timeoutMs);
      const operation = (async () => {
        try {
          // Deixa registrar a operação antes que o transporte possa falhar ou ser cancelado.
          await Promise.resolve();
          if (request.signal.aborted) throw request.signal.reason;
          const response = await fetcher(url, { signal: request.signal });
          if (!response.ok) throw Error('Recurso indisponível');
          const data = await response.json();
          if (request.signal.aborted) throw request.signal.reason;
          cache.set(url, data);
          return data;
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          pending.delete(url);
        }
      })();
      pending.set(url, operation);
      return operation;
    }
  };
}
