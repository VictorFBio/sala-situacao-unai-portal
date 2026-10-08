import { mkdir, readFile, writeFile, copyFile, lstat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeBasePath, legacyDestination } from '../shared/v1/routes.js';
export { normalizeBasePath, legacyDestination };

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const styleVersion = createHash('sha256').update(await readFile(path.join(root,'shared/v1/portal.css'))).digest('hex').slice(0,12);
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? escape(url.href) : ''; } catch { return ''; } };

const contributors = [
  { name: 'João Victor Fernandes Valente Dos Santos', role: 'Residente em Gestão da Atenção Primária à Saúde' },
  { name: 'Kamilla Quixabeira dos Santos', role: 'Residente em Gestão da Atenção Primária à Saúde' },
  { name: 'Maria Eduarda Leal de Carvalho Santos', role: 'Residente em Gestão da Atenção Primária à Saúde' },
  { name: 'Roberta Vitória Azevedo do Amaral', role: 'Residente em Gestão da Vigilância em Saúde' },
  { name: 'Sabrinna Silva Rego', role: 'Residente em Gestão da Vigilância em Saúde' },
  { name: 'Maria Clara de Melo Mendes', role: 'Residente em Gestão da Vigilância em Saúde' }
];
const creditsMarkup = `<div class="wrap footer-credits"><section aria-labelledby="elaboracao-tecnica"><h2 id="elaboracao-tecnica">Elaboração técnica e autoria</h2><p><strong>${escape(contributors[0].name)}</strong><br>${escape(contributors[0].role)}</p></section><section aria-labelledby="autoria-revisao"><h2 id="autoria-revisao">Autores e revisores de dados</h2><ul>${contributors.map(person=>`<li><strong>${escape(person.name)}</strong> — ${escape(person.role)}</li>`).join('')}</ul></section></div>`;

const modules = [
  { slug: 'painel-de-monitoramento', label: 'Painel de Monitoramento', kind: 'Disponível', text: 'Indicadores, séries históricas e produção assistencial, com fontes, períodos e notas metodológicas.', tag: 'Indicadores de saúde' },
  { slug: 'mapas-de-saude', label: 'Mapas de Saúde', kind: 'Acesso ao mapa atual', text: 'Cartografia municipal e consulta da localização dos serviços. O Busca Saúde já está disponível no painel.', tag: 'Território e localização' },
  { slug: 'rede-de-saude', label: 'Rede de Saúde', kind: 'Em preparação', text: 'Um diretório de estabelecimentos, equipes e serviços, ampliado a partir de informações públicas revisadas.', tag: 'Serviços e atendimento' },
  { slug: 'boletins', label: 'Boletins e Relatórios', kind: 'Em preparação', text: 'Boletins epidemiológicos, informes e documentos técnicos, com identificação da versão e do período.', tag: 'Publicações' },
  { slug: 'dados', label: 'Catálogo de Dados', kind: 'Disponível', text: 'Conheça as fontes, os arquivos presentes e as limitações das informações utilizadas no painel.', tag: 'Fontes e metodologia' },
  { slug: 'analises', label: 'Análises', kind: 'Em preparação', text: 'Estudos epidemiológicos e territoriais para apoiar a interpretação dos dados e o planejamento em saúde.', tag: 'Estudos e evidências' }
];

function pageTemplate({ title, content, basePath, active = '', environment }) {
  const href = slug => `${basePath}${slug ? slug + '/' : ''}`;
  const nav = [['', 'Início'], ['painel-de-monitoramento', 'Painel'], ['mapas-de-saude', 'Mapas'], ['rede-de-saude', 'Rede de Saúde'], ['boletins', 'Boletins'], ['dados', 'Dados'], ['analises', 'Análises'], ['sobre', 'Sobre']];
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Sala de Situação de Saúde de Unaí: dados públicos agregados, indicadores, cartografia e informações sobre os serviços."><meta name="theme-color" content="#08588e">${environment === 'homologacao' ? '<meta name="robots" content="noindex,nofollow">' : ''}<title>${escape(title)} · Sala de Situação de Unaí</title><link rel="icon" href="${basePath}_comum/v1/sus.png"><link rel="stylesheet" href="${basePath}_comum/v1/portal.css?v=${styleVersion}"><script type="module" src="${basePath}_comum/v1/portal.js"></script></head>
<body data-base-path="${basePath}"><a class="skip" href="#conteudo">Pular para o conteúdo</a>
${environment === 'homologacao' ? '<aside class="preview-banner" aria-label="Ambiente de homologação"><strong>Ambiente de homologação</strong><span>Versão para revisão. O painel publicado permanece no endereço principal.</span></aside>' : ''}
<header class="header"><div class="wrap brand-row"><a class="brands" href="${href('')}" aria-label="Sala de Situação de Saúde de Unaí — início"><img src="${basePath}_comum/v1/unai.png" alt="Prefeitura de Unaí" width="115" height="44"><span class="brand-divider" aria-hidden="true"></span><img src="${basePath}_comum/v1/sus.png" alt="SUS" width="69" height="44"></a><div class="brand-title"><strong>Sala de Situação de Saúde</strong><span>Secretaria Municipal de Saúde · Unaí, MG</span></div><span class="public-label">Informação pública em saúde</span></div><nav class="wrap nav" aria-label="Navegação do portal">${nav.map(([slug,label]) => `<a href="${href(slug)}" ${slug === active ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav></header>
<main id="conteudo" tabindex="-1">${content}</main>
<footer class="footer"><div class="wrap footer-grid"><div><strong>Sala de Situação de Saúde de Unaí</strong><p>Iniciativa técnica das Residências Multiprofissionais em Gestão da APS e Vigilância em Saúde da Universidade de Brasília - UnB, em cooperação com a Secretaria Municipal de Saúde de Unaí - MG.</p><img class="footer-unb" src="${basePath}_comum/v1/unb-horizontal.jpg" alt="Universidade de Brasília - UnB" loading="lazy"></div><div><strong>Transparência</strong><a href="${href('dados')}">Fontes e metodologias</a><a href="${href('sobre')}#governanca">Governança e privacidade</a></div><div><strong>Acesso às informações</strong><a href="${href('painel-de-monitoramento')}">Painel de Monitoramento</a><a href="https://www.prefeituraunai.mg.gov.br/" target="_blank" rel="noopener noreferrer">Portal da Prefeitura ↗</a></div></div>${creditsMarkup}<div class="wrap footer-bottom">Dados públicos agregados. Consulte a fonte, o período e as condições de uso de cada conjunto.</div></footer></body></html>`;
}

function sectionHeading(title, intro, eyebrow = 'Sala de Situação de Saúde de Unaí') {
  return `<div class="wrap page-heading"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="lead">${intro}</p></div>`;
}

export async function buildPortal(options) {
  const output=path.resolve(options.outputDir);
  if(output===root||output===path.parse(output).root||!path.relative(output,root).startsWith('..')) throw new Error('Saída não pode substituir o código do portal');
  try {if((await lstat(output)).isSymbolicLink()) throw new Error('Saída simbólica proibida');} catch(error) {if(error.code!=='ENOENT') throw error;}
  const stage=path.join(path.dirname(output),`.portal-build-${randomUUID()}`);
  const previous=path.join(path.dirname(output),`.portal-previous-${randomUUID()}`);
  try {
    const result=await generatePortal({...options,outputDir:stage});
    let moved=false;
    try {await rename(output,previous);moved=true;} catch(error) {if(error.code!=='ENOENT') throw error;}
    try {await rename(stage,output);} catch(error) {if(moved) await rename(previous,output);throw error;}
    if(moved) await rm(previous,{recursive:true,force:true});
    return result;
  } finally {await rm(stage,{recursive:true,force:true});}
}

async function generatePortal({ panelDir, outputDir, basePath = '/', revision, environment = 'homologacao' }) {
  basePath = normalizeBasePath(basePath);
  if (!['homologacao', 'producao'].includes(environment)) throw new Error('Ambiente inválido');
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Commit do painel obrigatório');
  const href = slug => `${basePath}${slug}/`;
  const inputFiles = ['dashboard-data.json', 'fontes.json', 'imagem-satelite.json', 'indicadores-resumo.json', 'mapa-servicos.json'];
  const inputs = {};
  const hashes = {};
  for (const name of inputFiles) {
    const raw = await readFile(path.join(panelDir, 'public/data', name));
    inputs[name] = JSON.parse(raw.toString('utf8'));
    hashes[name] = createHash('sha256').update(raw).digest('hex');
  }
  const dashboard = inputs['dashboard-data.json'];
  const catalogue = inputs['fontes.json'];
  if (!dashboard.queries || !Array.isArray(catalogue.fontes)) throw new Error('Dados de catálogo inválidos');
  const assetsDir = path.join(outputDir, '_comum/v1');
  await mkdir(assetsDir, { recursive: true });
  await copyFile(path.join(panelDir, 'public/assets/prefeitura-unai-recorte.png'), path.join(assetsDir, 'unai.png'));
  await copyFile(path.join(panelDir, 'public/assets/sus-recorte.png'), path.join(assetsDir, 'sus.png'));
  await copyFile(path.join(root, 'shared/v1/unb-horizontal.jpg'), path.join(assetsDir, 'unb-horizontal.jpg'));
  for (const name of ['portal.css', 'portal.js', 'routes.js']) await copyFile(path.join(root, 'shared/v1', name), path.join(assetsDir, name));
  const pages = new Map();
  pages.set('', { title: 'Portal', content: `<section class="hero"><div class="wrap hero-grid"><div><p class="eyebrow">Inteligência em saúde pública · Unaí, Minas Gerais</p><h1>Informação para cuidar.<br><span>Evidências para planejar.</span></h1><p class="lead">A Sala de Situação reúne ferramentas para compreender a saúde do município, consultar serviços e apoiar as decisões na gestão do SUS.</p><div class="actions"><a class="button" href="${href('painel-de-monitoramento')}">Acessar o Painel de Monitoramento <span aria-hidden="true">↗</span></a><a class="text-link" href="${href('sobre')}">Conheça o projeto →</a></div></div><aside class="hero-note"><span class="note-mark" aria-hidden="true">+</span><p class="eyebrow">Uma sala, várias ferramentas</p><h2>Saúde, território<br>e informação pública.</h2><p>Indicadores, mapas, fontes e publicações em um ambiente de consulta integrado.</p><a href="${href('dados')}">Consultar as fontes →</a></aside></div></section><section class="principles"><div class="wrap principles-grid"><div><strong>Dados agregados</strong><span>Informações públicas com recorte municipal</span></div><div><strong>Fontes e períodos</strong><span>Contexto para interpretar cada informação</span></div><div><strong>Expansão gradual</strong><span>Novas ferramentas com disponibilidade explícita</span></div></div></section><section class="wrap tools" aria-labelledby="ferramentas"><div class="section-head"><div><p class="eyebrow">Explore o ecossistema</p><h2 id="ferramentas">Ferramentas da Sala de Situação</h2></div><p>Comece pelo painel ou escolha uma área de interesse.</p></div><div class="cards">${modules.map((m,i) => `<article class="card"><div class="card-top"><span class="card-number" aria-hidden="true">0${i+1}</span><span class="status ${m.kind === 'Em preparação' ? 'planned' : 'available'}">${m.kind}</span></div><p class="card-tag">${m.tag}</p><h3>${m.label}</h3><p>${m.text}</p><a href="${href(m.slug)}">${m.kind === 'Em preparação' ? 'Conhecer a proposta' : 'Acessar'} <span aria-hidden="true">→</span><span class="sr-only"> ${m.label}</span></a></article>`).join('')}</div></section><section class="wrap transparency"><div><p class="eyebrow">Transparência e interpretação</p><h2>Cada dado precisa de contexto.</h2><p>Fonte, período, unidade e limitações fazem parte da informação. Dados ausentes não são apresentados como zero.</p></div><a class="button secondary" href="${href('dados')}">Conhecer o catálogo →</a></section>` });

  const legacyStates = { carregada: 'Carregada no cadastro', planejada: 'Planejada no cadastro' };
  const queryEntries = Object.entries(dashboard.queries).filter(([,q]) => q && Array.isArray(q.rows));
  const sourcesHtml = catalogue.fontes.map(f => `<article class="source-card" data-filter-item><div class="source-head"><h3>${escape(f.fonte)}</h3><span class="status planned">${escape(legacyStates[f.status] || 'Estado não informado')}</span></div><p>${escape(f.dominio)} · ${escape(f.sistema)}</p>${safeUrl(f.url) ? `<a href="${safeUrl(f.url)}" target="_blank" rel="noopener noreferrer">Consultar fonte original ↗</a>` : ''}<p class="small">Recortes previstos: ${escape((f.recortes_previstos || []).join('; '))}.</p></article>`).join('');
  const queriesHtml = queryEntries.map(([id,q]) => {
    const source = q.source || {};
    return `<details class="query" data-filter-item><summary><span>${escape(source.label || id)}</span><code>${escape(id)}</code></summary><dl><dt>Disponibilidade</dt><dd>${q.rows.length ? 'Registros presentes no pacote do painel' : 'Sem registros publicados nesta consulta'}</dd><dt>Período</dt><dd>${escape(source.period || 'Não informado no arquivo')}</dd><dt>Extração registrada</dt><dd>${escape(source.executedAt || 'Não informada no arquivo')}</dd><dt>Recorte</dt><dd>${escape((source.filters || []).join('; ') || 'Não informado no arquivo')}</dd><dt>Limitações</dt><dd>${escape((source.assumptions || []).join(' ') || 'Não informadas no arquivo; consultar a fonte')}</dd></dl>${(source.links || []).filter(l=>safeUrl(l.href)).map(l=>`<a href="${safeUrl(l.href)}" target="_blank" rel="noopener noreferrer">${escape(l.label || 'Fonte original')} ↗</a>`).join(' ')}</details>`;
  }).join('');
  pages.set('dados', { title: 'Catálogo de Dados', content: `${sectionHeading('Catálogo de Dados', 'Fontes, disponibilidade e metodologias das informações presentes na Sala de Situação.')}<div class="wrap page-body"><aside class="notice"><strong>Arquivo presente não equivale à validação da fonte.</strong><p>Este catálogo descreve o pacote do painel. O cadastro original e as consultas publicadas são apresentados separadamente: um estado “planejada” no cadastro não substitui a evidência de cada consulta. A coleta automática não está implementada.</p></aside><label class="search-label" for="busca-fontes">Buscar fonte ou assunto</label><input id="busca-fontes" type="search" placeholder="Ex.: IBGE, mortalidade, atenção primária" data-catalogue-search><p class="small" data-search-result aria-live="polite"></p><h2>Arquivos disponíveis</h2><p>Arquivos públicos que já alimentam o painel. Os downloads preservam os dados e os metadados do pacote selecionado.</p><ul class="downloads">${inputFiles.map(name=>`<li><a href="${href('painel-de-monitoramento')}data/${name}" download>${name}</a><span>JSON · agregado público</span></li>`).join('')}<li><a href="${href('dados')}catalogo-publicacao.json" download>Catálogo de publicação</a><span>JSON · procedência e SHA-256</span></li></ul><h2>Registro do catálogo original</h2><p>Estado preservado conforme o arquivo de origem, sem corrigir divergências silenciosamente.</p><div class="sources">${sourcesHtml}</div><h2>Consultas presentes no pacote</h2><p>Abra uma consulta para conferir período, recorte e limitações. Presença de registros não comprova atualização contínua ou completude.</p><div>${queriesHtml}</div></div>` });
  pages.set('sobre', { title: 'Sobre o projeto', content: `${sectionHeading('Sobre a Sala de Situação', 'Um ecossistema de inteligência em saúde pública para apoiar a consulta, a análise e o planejamento municipal.')}<div class="wrap page-body prose"><h2>Propósito</h2><p>Organizar e comunicar informações epidemiológicas, assistenciais, demográficas e territoriais de Unaí. O portal reúne ferramentas independentes, com acesso e identidade institucional consistentes.</p><h2>Quem pode utilizar</h2><p>Gestores, profissionais de saúde, pesquisadores e cidadãos interessados em informações públicas do município.</p><h2>O que já está disponível</h2><p>O Painel de Monitoramento reúne os eixos de Atenção Primária, Atenção Especializada, Vigilância em Saúde e Gestão e População. Inclui também o Busca Saúde, com cartografia e consulta dos serviços.</p><h2 id="governanca">Governança e privacidade</h2><p>O conteúdo destinado à publicação é público e agregado. Novas bases precisam passar por revisão de procedência, período, limitações e risco de identificação, inclusive em recortes pequenos.</p><p>O portal não oferece cadastro de pacientes, envio de dados de saúde ou acesso a informações restritas. A hospedagem pode tratar metadados técnicos de acesso, como endereço IP. As condições do fornecedor também se aplicam.</p><p>Responsabilidade institucional pela aprovação de novas publicações, contato e procedimento de continuidade: em definição. Não foram criados contatos administrativos sem confirmação.</p><h2>Atualização</h2><p>As atualizações ocorrem por pacotes revisados. A data de publicação da aplicação não corresponde necessariamente ao período dos indicadores. Consulte as fontes e notas de cada conjunto.</p><h2>Condições de uso</h2><p>Consulte as licenças dos dados e documentos nas fontes originais. Marcas da Prefeitura e do SUS não integram a licença de software e devem ter seu uso autorizado. As ferramentas apoiam a análise; não substituem a validação técnica e institucional.</p><a class="button" href="${href('painel-de-monitoramento')}">Consultar o painel →</a></div>` });
  const future = {
    'mapas-de-saude': { title: 'Mapas de Saúde', intro: 'Localização dos serviços e informações territoriais para compreender a rede municipal.', body: `<span class="status available">Busca Saúde disponível no painel</span><h2>Consulte a cartografia existente</h2><p>O Busca Saúde oferece busca de locais, enquadramentos municipal e urbano, camadas de referência e imagens históricas de satélite.</p><a class="button" href="${href('painel-de-monitoramento')}#/mapa">Abrir o Busca Saúde →</a><h2>Próximas camadas</h2><p>Indicadores territoriais e áreas de abrangência poderão ser incorporados após validação das fontes. Limites de equipes não serão apresentados como vigentes sem referência documental. Localizações aproximadas permanecem identificadas.</p>` },
    'rede-de-saude': { title: 'Rede de Saúde', intro: 'Informações públicas sobre estabelecimentos e serviços municipais.', body: `<span class="status planned">Em preparação</span><h2>Um diretório com informações revisadas</h2><p>O módulo independente reunirá estabelecimentos, serviços, equipes e informações de atendimento. Endereços, contatos e horários dependerão de confirmação pelas referências institucionais.</p><p>Você já pode consultar os locais mapeados no Busca Saúde. Eles não representam a totalidade dos estabelecimentos cadastrados no CNES.</p><a class="button" href="${href('painel-de-monitoramento')}#/mapa">Consultar os locais mapeados →</a>` },
    'boletins': { title: 'Boletins e Relatórios', intro: 'Publicações técnicas com fonte, período e identificação da versão.', body: `<span class="status planned">Em preparação</span><h2>Publicações aprovadas aparecerão aqui</h2><p>Nenhum boletim foi incluído nesta primeira versão. Novos documentos terão revisão de conteúdo e metadados antes de serem disponibilizados.</p><p>O espaço receberá boletins epidemiológicos, informes e relatórios de situação com acesso ao arquivo público.</p>` },
    'analises': { title: 'Análises', intro: 'Estudos epidemiológicos e territoriais para interpretar as informações de saúde.', body: `<span class="status planned">Em preparação</span><h2>Estudos com método e limitações explícitos</h2><p>Nenhuma análise independente foi incluída nesta primeira versão. Os estudos publicados deverão informar objetivo, fonte, período, recorte, método e limitações.</p><a class="text-link" href="${href('dados')}">Conhecer as fontes disponíveis →</a>` }
  };
  for (const [slug,p] of Object.entries(future)) pages.set(slug, { title:p.title, content:`${sectionHeading(p.title,p.intro)}<div class="wrap page-body prose">${p.body}</div>` });
  for (const [slug,p] of pages) {
    const target = path.join(outputDir,slug);
    await mkdir(target,{recursive:true});
    await writeFile(path.join(target,'index.html'),pageTemplate({...p,basePath,active:slug,environment}));
  }
  await writeFile(path.join(outputDir,'404.html'),pageTemplate({title:'Página não encontrada',basePath,environment,content:`${sectionHeading('Página não encontrada','O endereço solicitado não corresponde a uma página disponível.')}<div class="wrap page-body"><a class="button" href="${basePath}">Voltar ao portal →</a></div>`}));
  await writeFile(path.join(outputDir,'dados/catalogo-publicacao.json'),JSON.stringify({schemaVersion:1,municipio:'Unaí (MG)',codigoIbge:'3170404',panelRevision:revision,availabilityNote:'Presença no pacote não equivale à validação ou atualização da fonte.',files:inputFiles.map(name=>({path:`painel-de-monitoramento/data/${name}`,sha256:hashes[name]})),originalCatalogue:catalogue.fontes,queries:queryEntries.map(([id,q])=>({id,availability:q.rows.length?'registros-presentes':'sem-registros',source:q.source||{}}))},null,2)+'\n');
  return { pages:pages.size, hashes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).replace(/^--/,''),x.slice(i+1)];}));
  if (!args.panel || !args.revision) throw new Error('Uso: node scripts/build.mjs --panel=CAMINHO --revision=SHA [--base=/] [--out=dist]');
  const result=await buildPortal({panelDir:path.resolve(args.panel),outputDir:path.resolve(args.out||'dist'),basePath:args.base||'/',revision:args.revision,environment:args.environment||'homologacao'});
  console.log(JSON.stringify({pages:result.pages,output:args.out||'dist'}));
}
