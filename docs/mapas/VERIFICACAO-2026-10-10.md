# Verificação local dos Mapas Temáticos

Versão desenvolvida em `expansao/mapas-piloto`, branch `codex/mapas-tematicos`, a partir do portal `1daa8b10b94b56bd5d915358dac77ad1f70f47ed`. A execução foi aprovada para este chat e para teste local. Nenhum pacote foi enviado para hospedagem externa.

## Resultado conferido

- Suíte: 16 testes passaram, incluindo a suíte anterior do portal, derivação real com GDAL, integridade de arquivos, catálogo, filtragem, ausências, segurança da renderização, diferentes bases de URL, pacote de publicação e servidor local.
- Interface: 26 locais de saúde inicialmente; 32 ao ativar proteção social e segurança. Busca por Alvorada e CAIC retorna um local; busca sem correspondência e todos os grupos desativados retornam zero pontos e lista vazia com mensagem.
- Seleção pela lista aproxima o ponto e abre a consulta. Seleção pelo símbolo mostra os mesmos dados. Endereço, bairro, qualidade, observações e período permanecem disponíveis; campo sem conteúdo aparece como “Não informado na fonte”.
- Zoom, roda do mouse, arraste, enquadramentos Município/Sede urbana e camadas territoriais foram exercitados. Foco de teclado visível após navegar do campo de busca para os filtros.
- Tamanhos: 1440 × 1000 e 390 × 844. A largura de conteúdo com barra vertical foi, respectivamente, 1425 e 375 px, sem largura excedente ou rolagem horizontal da página.
- Troca entre dois temas configurados foi exercitada com uma cópia do mesmo conjunto de dados, exclusivamente na saída de teste. Essa configuração temporária foi removida: o catálogo entregue contém um único tema real.
- Falha deliberada do limite municipal: aviso da camada indisponível, 26 pontos e fontes ainda disponíveis. Falha deliberada do Leaflet: aviso de visualizador indisponível, lista original dos 32 locais e metadados acessíveis. Arquivos de teste restaurados.
- Download pelo navegador: `FeatureCollection`, 32 pontos, SHA-256 `643bf976a0fd59b29ee9d9d87af4379e2cd63b7b56ab659d01bbb3c374bcb23e`, idêntico ao GeoJSON preparado.
- Recursos do visualizador vieram de `127.0.0.1`; não há mapas de ruas, CDN, rastreador ou API externa na consulta. Os links de fonte levam aos sites originais somente quando acionados.
- Console sem erros ou avisos na consulta normal. Falhas 404 no registro correspondem às simulações deliberadas.

As capturas estão em `evidencias/computador-1440.png` e `evidencias/celular-390.png`. `evidencias/requisicoes-locais.jsonl` registra as requisições vistas pelo servidor de prévia, incluindo os testes de falha. Essas evidências não são copiadas para a raiz publicada.

## Integração e custo

O preparador existente de Cloudflare e a verificação de links passaram, sem mudança na política do publicador. O pacote local tem 82 arquivos, aproximadamente 12,63 MB no total e maior arquivo de aproximadamente 2,96 MB, dentro dos limites conferidos pelo preparador existente de 20 mil arquivos e 25 MiB por arquivo.

A prévia reutiliza o painel compilado da revisão `2efce396326978d387a4f527d54e1420aefbfa23`; ela não recompila nem representa todas as alterações posteriores do código do painel. Seus cinco JSON foram comparados com a fonte atual e permaneceram idênticos, incluindo `mapa-servicos.json` de SHA-256 `0a036fe9340ef22099051410a9c33efcff90b8ba231d0f2e351e4ac441fba035`. A futura homologação integrada deverá selecionar as revisões concretas no manifesto.

Leaflet 1.9.4 foi incorporado do pacote oficial, com licença BSD-2-Clause e hashes. Não foram acrescentados pacotes npm, chaves de API, contas, serviços pagos ou infraestrutura. Custo adicional desta implementação: zero.

## Decisões de implementação

1. Atributos de arquivos no Git preservam quebras de linha de JSON/GeoJSON e bytes da biblioteca, evitando divergência dos hashes no Windows. Se a escolha precisar mudar, o custo é ajustar os atributos e regenerar as provas de integridade.
2. O renderizador recebe os dados e metadados preparados junto ao catálogo para entregar lista e fontes já no HTML. Se a interface precisar mudar, o custo é adaptar a chamada do renderizador, preservando o catálogo.
3. O pacote público usa `.js` e `.json`; licença e mapa de código também ficam em contêineres JSON. Isso atende à política já existente sem alterar os bytes geográficos. Se essa escolha precisar mudar, o custo é ajustar nomes gerados e rótulos de download; as fontes originais ficam preservadas.

## Limites da entrega

O piloto conserva as referências históricas: endereços de 09/09/2026, limites IBGE 2025 e urbanização IBGE 2019. Não comprova funcionamento atual, cobertura de equipes ou localização de pessoas. Não foram criados indicadores ou temas epidemiológicos sem dados reais. Raster, mapas de calor e animação temporal seguem fora desta versão inicial.

A revisão independente do código será registrada após a análise do conjunto. A prévia funciona enquanto o servidor local estiver em execução; para reabrir, siga `FLUXO-QGIS.md`.
