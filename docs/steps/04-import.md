# 04: Import do currículo e cliente LLM

## Objetivo

A pessoa sobe o PDF do currículo ou cola o texto (ou o "Sobre" e as experiências do LinkedIn). O sistema extrai um **Corpus rascunho**: Affiliations, Accomplishments sem Metric e as Linhas Originais ligadas a eles. É o ponto de partida do interrogatório.

## Ler antes

- Carregue a skill **`claude-api`**: escolha do modelo, tool use, structured output, prompt caching e preços. Não use ID de modelo nem preço de memória
- `CONTEXT.md` (Linha Original, Corpus)
- `../career/.claude/skills/capture/SKILL.md`: como o Daniel transforma um relato em registro (só para entender o formato do registro; o import não interroga)

## Fazer

1. **`src/llm/cliente.ts`:** um wrapper único sobre o `@anthropic-ai/sdk`, usado por todo o resto do app. Toda chamada grava uma linha em `chamadas_llm` (etapa, modelo, tokens, cache, custo em USD calculado por uma tabela de preços em `src/llm/precos.ts`, duração, erro). Suporta streaming e tool use. Timeout e um retry para erro transitório.
2. **Upload:** PDF até 5 MB → `pdftotext -layout` (já está na imagem) → texto. O arquivo não é guardado; só o `texto_extraido` em `importacoes`. PDF escaneado sem texto → mensagem pedindo para colar o texto.
3. **Colar:** uma caixa de texto aceita o currículo ou o LinkedIn.
4. **Extração** (etapa `import`): o modelo recebe o texto e devolve, por tool use com schema validado em zod:
   - affiliations (organização, cargo, período como veio, stack citada);
   - accomplishments rascunho (o enunciado como veio, em PT; se o original está em inglês, o enunciado fica em inglês, e o Corpus aceita os dois);
   - cada linha original, ligada à affiliation e, quando der, a um accomplishment.

   **Não inventa:** sem período → `null`, sem número → nenhuma Metric. Uma linha que vira dois accomplishments fica ligada aos dois.
5. **Tela de resultado do import:** "Encontrei 3 experiências e 14 coisas que você fez" mais a lista curta, e o botão "começar as perguntas". A pessoa não edita nada aqui (edição fica fora do v0); o interrogatório corrige.
6. Estado `importou` e evento `importou` com as contagens.

## Fora do escopo

Interrogar, perguntar o que faltou. Isso é o passo 05.

## Pronto quando

- [x] Três currículos de fixture **inventados** (júnior com pouca coisa, pleno com 3 empregos, um em inglês) em `src/llm/__fixtures__/` geram um Corpus rascunho coerente. Teste de integração marcado para rodar só com `ANTHROPIC_API_KEY` presente
- [x] Nenhum número aparece numa Metric que não esteja no texto original (teste)
- [x] Toda chamada aparece em `chamadas_llm` com custo diferente de zero
- [x] Colar texto e subir PDF chegam ao mesmo resultado para o mesmo currículo

## Notas de implementação

**Estado:** feito. O teste de integração (`ANTHROPIC_API_KEY=... npx vitest run src/import/import.integration.test.ts`; o vitest não lê o `.env`, exporte a chave antes) passou em 2026-10-14 depois do merge com o passo 03: 4 de 4, incluindo o "PDF = texto" (com `pdftotext` 4.00). Foram 5 chamadas ao `claude-opus-5-5`, nenhuma com retry ou erro, todas com custo: 12.733 tokens de entrada, 8.280 de saída, US$ 0,22 no total, ~14 s cada. Import de um currículo custa, então, uns US$ 0,04.

- **Modelo:** `claude-opus-5-5` (`MODELO_PADRAO` em `src/llm/precos.ts`), effort `medium`. É o padrão da skill `claude-api`, e os preços vêm de lá (cache de 2026-10-06). Opus 5.5 recusa `tool_choice` forçado com 400. Por isso a extração usa `tool_choice` auto, `strict: true` no schema e o prompt mandando chamar a tool. Se o modelo responder em texto, o loop pede de novo.
- **`src/llm/cliente.ts`:** `llm().chamar({ etapa, sessaoId, params, aoTexto? })` sempre usa streaming, pelo endpoint beta, com `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Quando os classificadores recusam, a API roda o pedido de novo no modelo que a Anthropic recomenda. O custo soma as tentativas de `usage.iterations`, cada uma no preço do próprio modelo. Um modelo fora da tabela é cobrado como o mais caro, e `erro` diz isso. Recusa final vira `ErroLlm('recusa')`, com a linha gravada.
- **Retry:** o SDK roda com `maxRetries: 0` e timeout de 5 min. O cliente faz um retry só, para erro de conexão, 429 ou 5xx, e só se nenhum texto já tiver ido para a tela. Cada tentativa vira uma linha em `chamadas_llm`. A que falhou antes de a API responder fica com custo 0 e `erro`: nada foi cobrado. "Custo diferente de zero" vale para toda chamada respondida.
- **Teste sem API:** `criarClienteLlm({ sdk, registrar })` recebe um SDK falso (`SdkMinimo`). `extrairCorpus(texto, { sessaoId, cliente })` recebe qualquer `ClienteLlm`. O passo 05 deve seguir o mesmo caminho.
- **Extração (`src/import/extracao.ts`):** uma tool, `registrar_corpus`, com o schema em zod. O JSON Schema sai de `z.toJSONSchema`, sem `pattern` e `minLength`, que o modo strict pode recusar; o zod confere esses dois depois. `conferirExtracao` cobra a extração contra o texto:
  - todo número de enunciado, cargo ou período está no texto (1.200 = 1200 e 2,5 = 2.5);
  - o ano de `periodo_inicio`/`periodo_fim` está no texto, e o mês está no `periodo_original` (por nome PT/EN ou `MM/AAAA`);
  - cada tecnologia da stack aparece como palavra inteira ("Go" não conta dentro de "algo");
  - cada linha original está no texto, ignorando quebra de linha e marcador de bullet;
  - todo ref existe.

  Um problema volta ao modelo como `tool_result` com `is_error`. São três tentativas pagas no pior caso; na terceira falha, o import falha em vez de gravar algo inventado.
- **Metric:** o import não cria nenhuma (o Corpus sai todo rascunho). "Nenhum número numa Metric fora do texto" vale porque nenhum número sai do texto: `conferirExtracao` e o teste de integração garantem isso. Quem cria Metric é o passo 05.
- **Migração `0003_import`** (era `0001`; renumerada no merge com o passo 03, que criou `0001` e `0002`): acrescenta `affiliations.periodo_original` (o período como veio) e `accomplishments.ordem`.
  - O import só preenche `periodo_inicio`/`periodo_fim` quando o texto traz o mês. Com isso, no rascunho, `periodo_fim` null pode ser "atual" ou "não disse": o passo 05 lê `periodo_original` para saber qual e pergunta.
  - `ordem` existe porque um insert numa transação dá o mesmo `created_at` a tudo. `corpusDaSessao` agora ordena por `created_at, ordem, id`, o que mantém a ordem do currículo.
  - Banco local que tenha a `0001_import` antiga aplicada (o `sem_sotaque` de dev desta máquina tem) fica fora de ordem para o migrator: `drop database` e `npm run db:migrate` de novo.
- **`gravarImportacao(sessaoId, { formato, textoExtraido, corpus })`** fica em `src/db` e faz tudo numa transação: importação, affiliations (na ordem), accomplishments, linhas originais, estado `importou` e evento `importou` com `{ formato, affiliations, accomplishments, linhas }`. Só sai de `consentiu`; qualquer outro estado lança `ErroEstadoSessao` sem gravar nada, o que também barra import duplo. Uma linha que vira dois accomplishments é gravada uma vez por accomplishment, já que `linhas_originais` tem um `accomplishment_id` só. Uma linha de affiliation sem accomplishment (ex.: "Stack: Go") fica com `accomplishment_id` null.
- **CONTEXT.md diz que "só o interrogatório escreve" no Corpus.** O import é a outra exceção, pedida por este passo: ele escreve o rascunho uma vez e não mexe mais.
- **Texto (`src/import/texto.ts`):** o PDF vai para um diretório temporário, passa por `pdftotext -layout -enc UTF-8` e é apagado no `finally`. Os dois caminhos saem por `normalizarTexto`. Limites:
  - PDF até 5 MB (`src/import/limites.ts`, usado também no formulário);
  - texto entre 80 e 40.000 caracteres;
  - menos de 80 caracteres num PDF é tratado como escaneado.

  O PDF não é guardado, só o `texto_extraido`. Colar sempre grava `formato: 'texto'`. O enum ainda tem `linkedin`, mas nada na tela distingue os dois.
- **"PDF = texto":** `texto.test.ts` prova, sem modelo, que o texto do `pleno.pdf` tem as mesmas palavras do `pleno.txt` (o PDF só quebra linha em outro lugar). O teste de integração compara affiliations e períodos das duas rodadas, e aceita até 2 accomplishments de diferença: o modelo varia em como quebra os bullets. `scripts/pdf-de-fixture.ts` gera o PDF de um fixture com o Tectonic.
- **Tela:** a rota única do passo 03 (`/s/[token]`). `telaDoEstado` agora manda `consentiu` **e `importou`** para a tela `import` (antes `importou` ia para `chat`): o passo 04 pede uma tela de resultado antes das perguntas.
  - `_telas/importar.tsx` mostra o formulário (`_telas/envio-curriculo.tsx`, cliente) em `consentiu` e o resultado em `importou`. Os estilos estão em `globals.css`, com as variáveis do passo 03 (modo escuro incluso).
  - Actions em `acoes.ts`, no molde do passo 03 (token por `.bind`, `situacaoDoToken` a cada chamada): `enviarCurriculo` (`useActionState`; o erro devolve o texto colado, porque o React 19 limpa o form) e `comecarPerguntas`. Esta chama `iniciarInterrogatorio` (`src/db`): `importou` → `interrogando`, idempotente. Depois disso o link abre a tela `chat`, que o passo 05 preenche.
  - O log de erro usa o id da sessão, nunca o token.
  - `next.config.ts` sobe `experimental.serverActions.bodySizeLimit` para 6 MB (o padrão é 1 MB). A opção foi conferida nos tipos de `node_modules/next/dist/server/config-shared.d.ts`, já que a 16.1.6 não traz docs.
- **Conferido no app**, depois do merge com o passo 03 (`next build && next start`, Playwright headless, 375 px, toque), num banco à parte: `token:new` → consentimento → formulário → texto curto (erro, texto mantido) → PDF escaneado (erro) → recarregar (continua no import) → import gravado por `gravarImportacao` → resultado → "Começar as perguntas" → tela do chat, que continua depois de recarregar. Sem rolagem horizontal. Antes do merge também foi conferida a falha da API sem chave: a linha em `chamadas_llm` e a mensagem para a pessoa.

## Achados

- `isMeasureAvailable` (`src/render`) e `pdftotextDisponivel` (`src/import/texto.ts`) repetem o teste de `pdftotext -v`. Vale juntar quando um terceiro precisar.
- Nenhum fixture tem um bullet que vire dois accomplishments. A ligação dupla só é testada com dados montados à mão (`src/db/index.test.ts`).
- O prompt de import é curto demais para o prompt caching do Opus (mínimo de 4096 tokens), então não usa cache. O passo 05 tem prompt maior e deve usar.
