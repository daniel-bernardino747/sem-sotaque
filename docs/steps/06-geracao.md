# 06: Geração (Selection, checagens, crítico, PDF)

## Objetivo

Do Corpus interrogado, gerar o **currículo geral em inglês**: Selection → checagens determinísticas → crítico → render → medida, reescrevendo até passar. Na tela, o "antes × depois" de cada bullet e o PDF, **direto para a pessoa**.

## Ler antes

- **`../career/.claude/skills/generate/SKILL.md`** e **`../career/.claude/skills/generate/references/bullets.md`**: a fonte principal do prompt de seleção e do crítico. O v0 gera o currículo **geral**, sem vaga: onde a skill fala da vaga, use o brief "currículo geral para vaga internacional de engenharia de software"
- **`docs/regras-de-redacao.md`**: cada regra e a sua garantia. Toda linha marcada **código** vira uma checagem aqui
- `src/render/` (passo 01): o schema da Selection (`SELECTION_VERSION`) e a medida JSON
- Skill **`claude-api`**

## Fazer

1. **Seleção** (etapa `selecao`): o modelo recebe o Corpus da sessão (affiliations com `descricao_publica`, accomplishments com enunciado e metrics com origem) e as regras, e devolve uma Selection por tool use, validada pelo schema do render. Cada bullet carrega `source` = `accomplishment_id`. Cabeçalho: nome e contato, que a pessoa informa na tela de resultado antes de gerar (nome, e-mail, LinkedIn, GitHub opcional, cidade/país). Não pede disponibilidade.
2. **Checagens determinísticas** em `src/geracao/checagens.ts`, uma função por regra **código**, cada uma com teste unitário de caso ruim e caso bom:
   - número do bullet ⊂ `valores` das metrics do `source`, aceitando `~` e unidades;
   - origem `qualitativo` só em Projects ou como último bullet do grupo;
   - nenhuma atribuição de estimativa;
   - nenhum hedge, nem adjetivo vazio da lista;
   - no máximo um bullet por `source`; `label` só na stack line;
   - nenhuma contagem de partes como resultado;
   - nenhum "Manager" e nenhuma senioridade no cargo, cabeçalho ou resumo;
   - nenhuma disponibilidade;
   - período mês/ano;
   - ordem e nomes das seções; ≥ 3 bullets por grupo de Experience;
   - affiliation `confidencial` nunca pelo nome: a `descricao_publica` no lugar.
3. **Crítico** (etapa `critico`): um modelo **de contexto limpo** (sem o histórico da seleção) recebe só o currículo renderizado em texto e faz três passes, como no `generate`: o recrutador que não sabe nada, as regras e a prosa. Devolve violações estruturadas.
4. **Render + medida** (passo 01): página, preenchimento 97–100%, linhas por bullet, órfãs.
5. **Laço:** violação de checagem, crítico ou medida → reescrita (etapa `reescrita`) só das linhas afetadas, com as violações listadas → as checagens rodam de novo → o crítico relê **as linhas alteradas**. Limite de tentativas (ex.: 4). Cada tentativa é uma linha em `selections` com as `violacoes`.
   - **Pouca história** (`docs/decisoes.md`, "Em aberto"): se o Corpus não enche a página sem inventar, aceite o preenchimento menor, grave `violacoes.preenchimento_insuficiente` e **não** encha com prosa. Nunca invente para preencher.
   - Esgotado o limite: entrega a melhor tentativa e marca a sessão para o Daniel revisar no painel.
6. **Tela de resultado:**
   - o "antes × depois": cada bullet novo ao lado da(s) Linha(s) Original(is) do mesmo `accomplishment_id`. Bullet sem linha original aparece como "novo: veio das suas respostas";
   - o PDF embutido e o botão de baixar (evento `pdf_baixado`);
   - um aviso curto: "versão de teste; se algo estiver errado, me conta".
7. A geração roda em segundo plano depois do "terminei" (leva dezenas de segundos), com uma tela de espera que diz o que está acontecendo ("conferindo cada número…"). Estado `gerando` → `pronto`, evento `pdf_gerado`.

## Fora do escopo

Currículo por vaga, PT, cover letter. Editar bullet à mão.

## Pronto quando

- [x] As três personas simuladas do passo 05 geram PDF de uma página, com zero violação de checagem determinística (ou `preenchimento_insuficiente` declarado para o júnior). As três declararam `preenchimento_insuficiente`, não só o júnior (ver notas)
- [x] Teste: um bullet com número que não está na fonte é barrado e reescrito (`src/geracao/pipeline.test.ts`)
- [x] Teste: affiliation confidencial nunca aparece pelo nome no PDF (`pdftotext` + busca, mesmo arquivo)
- [x] O Daniel leu os três PDFs com o "antes × depois" e aprovou (2026-10-14)
- [x] Custo e tempo médios da geração anotados nas notas

## Notas de implementação

**Estado:** feito. O Daniel aprovou os três PDFs em 2026-10-14 (`storage/geracoes/`, fora do git).

**Custo e tempo** (2026-10-14, `claude-opus-5-5`, effort `medium` nas três etapas, `npm run gerar`):

| Persona | Tentativas | Aprovada | Preenchimento | Custo | Tempo |
|---|---|---|---|---|---|
| sabe-os-numeros | 4 | não (revisar) | 56% | US$ 0,41 | 166 s |
| nao-sei | 1 | sim | 50% | US$ 0,12 | 33 s |
| uma-palavra | 3 | sim | 43% | US$ 0,20 | 91 s |

**Média: US$ 0,24 e 97 s por geração.**

- A `sabe-os-numeros` rodou antes da correção do aceite de página curta (abaixo). A entregue não tinha violação determinística; só a página curta bloqueava. Sem ela, a média das outras duas é US$ 0,16 e 62 s.
- Por chamada: seleção US$ 0,05–0,09 (16–31 s), crítico ~US$ 0,045 (13–18 s), reescrita ~US$ 0,05 (10–15 s).
- Com o interrogatório (passo 05, US$ 0,91), a sessão inteira fica perto de **US$ 1,15**.

- **As três páginas ficaram curtas (43–56%)** porque os Corpus simulados são pequenos: depois do interrogatório, as personas têm de 3 a 6 registros com resultado. Nenhuma foi enchida com prosa. É o "Em aberto" das decisões (pouca história), que aparece também em quem não é júnior.
- **O fluxo (`src/geracao/pipeline.ts`):** seleção → checagens → render + medida → crítico → reescrita só das linhas com problema → checagens → render → crítico só nas linhas alteradas. O limite é `LIMITE_TENTATIVAS = 4`, e cada tentativa é uma linha em `selections` (com o `renders` dela). Esgotado o limite, entrega a de menor peso (checagem 1000, medida 100, crítico `alta` 1) e marca `geracoes.revisar`.
- **O que bloqueia:**
  - toda checagem determinística;
  - toda regra de página da medida, menos a página curta aceita;
  - todo problema `alta` do crítico que a reescrita não corrigiu nem respondeu com `manter` ("o Corpus não tem como").

  `baixa` fica só registrado.
- **`selections.violacoes` é um objeto** (`Violacoes` em `pipeline.ts`): `checagens`, `medida`, `critico`, `notas`, `preenchimento_insuficiente: { fill, motivo }` e `mantidas`. `notas` registra o grupo com menos de 3 bullets quando o Corpus não tem mais. O default da coluna continua `'[]'`.
- **O modelo nunca vê id do banco.** Escreve com refs (`af1`, `ac3`), as mesmas `Refs` do interrogatório, e cada linha do rascunho tem id (`b3`, `g1.role`, `summary`). Assim uma violação acha a linha, e a reescrita manda patches (`trocar`, `remover`, `adicionar`, `manter`; `src/geracao/rascunho.ts`).
- **A Selection é montada pelo código:**
  - o cabeçalho vem do formulário;
  - o período vem da affiliation: mês/ano, `Present` só com período confirmado, nada se faltar o mês;
  - a stack line é a última entrada do grupo;
  - `source` = `accomplishment_id`. **O campo continua `source`**, sem subir `SELECTION_VERSION` (achado do passo 01).
- **O crítico lê o currículo em texto com os ids** (`textoComIds`, gerado da Selection), e não o `pdftotext`: assim aponta linhas, e não trechos. Ele não vê o Corpus: é o único prompt sem `<corpus>`, e o teste confere isso.
- **Página curta:** é problema só enquanto houver registro com resultado fora da página. Vira `preenchimento_insuficiente` em três casos:
  - não sobra nenhum registro;
  - a reescrita responde `manter` em `pagina`;
  - a reescrita, pedida para encher, não adiciona nada. Isso vale numa rodada sem violação de checagem, ou em duas seguidas.

  O terceiro caso corrige o defeito da primeira rodada: o modelo respondeu `manter` em `g1` ("o único registro sobrando é de mentoria, gestão"), e a página bloqueou as 4 tentativas.
- **Decisões nas checagens (`src/geracao/checagens.ts`):**
  - "qualitativo só como último bullet": os qualitativos ficam **depois** de todo bullet com número no grupo. Um grupo só de qualitativos (o júnior) passa.
  - "≥ 3 bullets": quando a affiliation não tem outro registro com resultado, vira nota, não violação.
  - Número: cada número escrito tem leituras ("1,200" = 1200 ou 1,2; "50k" = 50 e 50.000), e basta uma estar nos `valores` das metrics da fonte. Dígito colado em letra é nome ("S3", "p95"). "one" por extenso não conta, porque é artigo. A stack line não é checada, e o resumo é checado contra todos os valores do Corpus.
  - Além da lista do passo, `fonte`: o `source` existe e não é rascunho; projeto sem metric só entra em Projects.
  - Confidencial: o nome inteiro e cada palavra distintiva dele (≥ 3 letras, fora de uma lista de genéricas como "banco" e "brasil"), sem acento nem caixa. O nome confidencial **nem vai para o modelo**: a descrição do Corpus mostra só `[CONFIDENCIAL]` e a descrição pública.
- **Cabeçalho:** a pessoa digita nome, e-mail, LinkedIn, GitHub opcional e "cidade, país" na tela de resultado (`lerCabecalho`). Disponibilidade no campo de cidade é recusada ali, porque o modelo não teria como corrigir o que ela digitou. Tudo fica na tabela nova `geracoes` (migração `0005_geracao`), que entrou no `apagarSessao`.
- **Segundo plano (`segundo-plano.ts`):** o envio do cabeçalho chama `garantirGeracao`, que dispara `gerarCurriculo` sem esperar. Um `Set` em memória garante uma execução por sessão, como a `trava.ts`.
  - A tela de espera dá `router.refresh()` a cada 3 s e mostra `geracoes.etapa`.
  - Abrir a página em `gerando`, sem execução rodando e sem erro, recomeça a geração. Isso cobre o restart do servidor.
  - Uma falha grava `erro` e mostra "Tentar de novo".
  - `gravarTentativa` recusa gravar se a sessão foi apagada no meio.
- **Render assíncrono:** `renderResume` agora usa `compileTexAsync` (novo em `document.ts`), porque o `execFileSync` travava o servidor uns 5 s por tentativa. O teste do render espera (`expect.poll`) os temporários de outros arquivos de teste sumirem.
- **Tela de resultado:**
  - mostra "versão de teste" e, quando é o caso, o aviso de página curta;
  - o PDF sai por `GET /s/[token]/pdf`; `?baixar=1` grava `pdf_baixado` e `renders.baixado_em`;
  - o antes × depois junta por `accomplishment_id`; bullet sem linha original aparece como "Novo: veio das suas respostas";
  - **em tela de toque o PDF não é embutido**, porque o celular deixa o `<object>` em branco. Aparece "Abrir o PDF", que usa o leitor do aparelho.
- **Conferido no Chrome headless** a 375 px e a 1280 px: formulário → espera → falha (chave inválida de propósito, sem gasto) → "tentar de novo" → resultado. Sem rolagem horizontal; PDF de token desconhecido dá 404; o log não tem token. O headless não tem leitor de PDF, então o embed no desktop não foi visto renderizado.
- **Prompts** em `src/geracao/`: `regras.md` (as regras, em inglês) e `exemplos.md` (os pares do `bullets.md`, com **fatos inventados e diferentes dos das personas**, para não contaminar a simulação). Os dois entram em `prompt-selecao.md`, `prompt-critico.md` e `prompt-reescrita.md`. O prompt fixo usa cache (≥ 512 tokens).
- **Script:** `npm run gerar -- <persona> [--sessao <id>] [--de-novo]` roda a geração real na última sessão simulada da persona (banco de dev), com cabeçalho inventado. Salva o PDF e o relatório em `storage/geracoes/`: tentativas, violações, custo e tempo por etapa, antes × depois e texto do PDF. Sai com 1 se o entregue tem violação determinística ou passa de uma página.

## Achados

- **Número de versão conta como número** ("Java 17", "Python 3", "HTTP/2", "24/7"): um bullet com isso é barrado e reescrito. O prompt já manda ferramenta para a stack line. Se aparecer em teste real, ensinar a checagem a ignorar número colado a uma tecnologia.
- **`~` em número afirmado** é regra só de prompt (a reescrita escreveu "~4 h" para um número que a pessoa sabia). Uma checagem precisaria saber, por número, a origem da metric e se o texto dela já tem `~`.
- **"≥ 3 bullets" contra "gestão fica fora":** a checagem conta como disponível qualquer registro com resultado, inclusive um de gestão que o modelo não deve usar. Se a affiliation só tem isso sobrando, o grupo fica bloqueado até o limite. Não aconteceu nas três personas.
- **`garantirGeracao` roda na renderização da página**: cada polling de 3 s faz uma leitura de `geracoes`. Com mais de uma instância no Railway, trocar o `Set` por advisory lock, como na trava do passo 05.
- **O crítico pergunta o que o Corpus não tem** ("o que é Pix?", "quantos boletos?"), e a reescrita responde `manter`, o que está certo. São candidatas ao interrogatório e à prep de entrevista. Hoje ficam só em `violacoes.mantidas` e `critico`; o painel (passo 08) pode mostrá-las.
- **Para o passo 08:** `geracoes.revisar` marca a sessão para revisão; `selections` guarda, por sessão, o histórico das tentativas com o que cada uma violou; e `custoDaSessao` já separa `selecao`, `critico` e `reescrita`.
