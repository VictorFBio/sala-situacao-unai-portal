# Portal da Sala de Situação de Saúde de Unaí

Portal institucional estático, separado do painel. Node.js 22 ou posterior, Git e nenhum pacote npm adicional. O portal usa dados públicos do painel apenas para gerar o catálogo; não altera indicadores.

## Instalar e testar

Clone também `VictorFBio/sala-situacao-unai-v2`, instale suas dependências com `npm ci` e mantenha as pastas lado a lado, como `portal` e `painel`. O painel fornece marcas autorizadas e os cinco JSON existentes.

```sh
PANEL_SOURCE=../painel node --test tests/*.test.mjs
node scripts/build.mjs --panel=../painel --revision=COMMIT_COMPLETO_DO_PAINEL --base=/ --environment=homologacao
```

No PowerShell, defina `$env:PANEL_SOURCE='../painel'` antes de `npm test`. A referência precisa conter os 40 caracteres do commit. A saída é `dist/`. Não publique a pasta de trabalho.

## Manutenção

Regra visual: usar a paleta sóbria do painel (azul institucional, branco e cinzas), superfícies planas e cantos retos. Não usar cores ou efeitos neon, brilho ou sombras decorativas. Estados precisam continuar identificados por texto, e o foco de teclado deve permanecer visível. O raio dos componentes do portal é zero.

Páginas e catálogo: `scripts/build.mjs`. Identidade: `shared/v1/portal.css`. Compatibilidade dos links antigos: `shared/v1/routes.js`. Faça alterações por PR, execute testes e selecione o commit aprovado no `modules.json` do publicador. Nenhuma alteração aqui aciona a produção automaticamente.

As áreas Rede, Boletins e Análises aparecem como em preparação. Mapas Temáticos tem página própria e um piloto local da rede de serviços, com Leaflet incluído no pacote, camadas, busca, lista, consultas e fontes. O Busca Saúde existente permanece no painel. Fontes cadastradas e consultas presentes são estados distintos; presença de registros não é validação epidemiológica.

## Mapas Temáticos e QGIS

Consulte [Do QGIS aos Mapas Temáticos](docs/mapas/FLUXO-QGIS.md) para preparar novos temas, exportar os dados públicos, configurar simbologia, registrar ausências e revisar a prévia. O catálogo está em `maps/data/catalogue.json`; cada tema tem sua pasta de camadas e metadados. Não há CDN, serviço de mapas externo ou dependência npm adicional para o visualizador. Custo adicional: zero.

```powershell
npm run preview:mapas -- --panel=../painel --legacy=../painel/dist-ecossistema --port=4174
```

Abra o endereço local exibido no terminal. A saída fica em `.preview/`, fora da fonte e ignorada pelo Git. O preparo confere hashes do painel, links locais e os limites do preparador Cloudflare existente, sem enviar arquivos para a internet. O servidor atende apenas em `127.0.0.1`. Para testes no Windows, crie `.qa-temp/` e aponte `TEMP` e `TMP` para essa pasta, conforme o guia.

## Publicação e recuperação

O publicador reúne este repositório e o painel. A homologação tem endereço separado, aviso visível e `noindex`. A ativação no domínio principal ocorrerá somente após aprovação da versão concreta e após a avaliação de 15/10/2026. Para recuperar uma versão, retorne a referência do portal no manifesto e gere novamente o pacote; consulte o procedimento central no repositório do painel.

## Reprodução municipal e direitos

O código original deste portal usa MIT. Dados, documentos, marcas, imagens e componentes de terceiros mantêm seus próprios direitos. Os logotipos são obtidos do painel, não sublicenciados aqui. Outro município deve substituir identidade, textos, fontes e contatos, revisar os dados e assumir sua governança. Não há backend, cookies analíticos ou formulário de coleta nesta versão.

A assinatura horizontal UnB em `shared/v1/unb-horizontal.jpg` foi obtida do arquivo oficial `as_bas_cor_jpg/as_bas_cor.jpg` em https://marca.unb.br/marca.php, em 08/10/2026. JPEG original preservado, com escala proporcional e área branca no rodapé. A marca mantém seus direitos próprios e não integra a licença MIT.
