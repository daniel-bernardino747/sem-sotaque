# 15: A vaga entra

## Objetivo

A pessoa toca "Achei uma vaga", cola o texto da vaga e sai com a vaga lida: empresa e cargo confirmados, o aviso de língua quando a vaga é em português e o checklist das lacunas ("já usei" / "não usei"). Ainda não há conversa sobre as lacunas (passo 16) nem currículo (passo 17).

## Ler antes

- `docs/decisoes.md`, "Parte 2", e `CONTEXT.md` (Vaga, Requisito, Lacuna)
- As notas do passo 14 (rotas, `tela.ts`, gerações com histórico)
- A skill `generate` do `../career` (só leitura): como ela guarda a vaga, cruza com o Corpus e pergunta pelas tecnologias que nenhum registro cobre
- `src/llm/cliente.ts`, `src/llm/precos.ts` e um prompt de etapa existente (`src/geracao/prompt-selecao.md`) para o padrão de chamada com JSON estruturado
- `src/conteudo/consentimento.ts`, `consentimento-v2.md` e o componente de re-aceite (`_telas/reconsentimento.tsx`)
- `apagarSessao` em `src/db/index.ts` e o teste que varre `sessao_id`
- A documentação do Next 16.1.6 instalado sobre segmentos dinâmicos aninhados (`/vagas/[id]`) e `notFound()`

## Decisões (grilling de 2026-10-26/27)

1. **A vaga entra como texto colado** (P8), mais empresa, cargo e link opcionais. O link é guardado e **nunca buscado**.
2. **Uma chamada só, a "leitura da vaga"** (P24), logo depois de colar:
   - **entrada:** o texto da vaga e o Corpus compacto (cada Accomplishment com id, a stack por Affiliation, a lista de rascunhos);
   - **saída, JSON estruturado:** empresa, cargo e senioridade; a língua da vaga; os requisitos, cada um "obrigatório" ou "desejável", com os `accomplishment_id` que já o cobrem ou marcado como lacuna; até 5 rascunhos relevantes, com o motivo de cada um;
   - **o código valida** todo id citado contra o Corpus; id inválido vira lacuna;
   - **modelo:** `MODELO_PADRAO`. Trocar de modelo exige carregar a skill `claude-api` antes;
   - **custo** em `chamadas_llm`, com o `vaga_id` (etapa nova `leitura_vaga`).
3. **A pessoa confirma empresa e cargo** na mesma tela do checklist (P8). Corrigir o cargo não refaz a leitura: os requisitos saem da vaga, não do nome do cargo.
4. **O checklist das lacunas** (P9): cada lacuna marcada "já usei" ou "não usei". "Não usei" fica gravado na vaga. "Já usei" vira Assunto do chat da vaga no passo 16; neste passo ele só fica gravado.
5. **Vaga em português** (P16): o currículo sai sempre em inglês, e a tela avisa antes de gerar.
6. **Consentimento das vagas** (P19): um item novo "Vagas" (o texto da vaga e o que sai dele são guardados, passam pela API da Anthropic e podem ser apagados). É pedido **no primeiro "Achei uma vaga"**, com o componente de re-aceite. O texto de entrada continua o v2 para todo mundo; o item das vagas é um aceite à parte, não uma troca de `CONSENTIMENTO_VERSAO` (que hoje decide o avaliador, `consentimento.ts:10,20`). Quem disser não segue com tudo, menos as vagas, e o próximo toque em "Achei uma vaga" pergunta de novo. **O texto vai para o Daniel antes de aplicar.**
7. **Limites** (P15): 10 vagas por sessão (uma coluna `limite_vagas` na sessão, que o painel aumenta no passo 19). No limite, a tela mostra a mensagem de WhatsApp para o Daniel.
   - **O teto de gasto por sessão** (`TETO_SESSAO_PADRAO_USD = 3`, mais `MARGEM_GERACAO_USD = 1` para a geração, `src/llm/cliente.ts:118-121`) não comporta 10 vagas × 3 gerações. **Cada vaga criada soma um orçamento próprio ao teto** (hipótese: US$ 2 por vaga, a corrigir pelo custo medido no passo 19), e `leitura_vaga` entra nas etapas que usam a margem. Uma conversa geral retomada numa sessão cara continua presa ao teto de hoje.
8. **Apagar** (P21). **A linha da vaga nunca é apagada, é esvaziada**, como a de `sessoes`: texto, empresa, cargo e link viram nulos e `apagada_em` é gravado. Assim o funil por vaga e o custo por vaga sobrevivem (hoje `apagarSessao` guarda só os tipos distintos de evento, `src/db/index.ts:446-451`, e três vagas virariam uma).
   - "Apagar meus dados" esvazia todas as vagas e apaga os requisitos e tudo o que vier delas;
   - "Apagar esta vaga" existe na página da vaga, em qualquer status, e faz o mesmo para uma vaga;
   - todo evento de vaga leva `{ vaga_id }` em `dados`; `chamadas_llm.vaga_id` **não** é `set null`;
   - **apagar não devolve cota:** a vaga esvaziada continua contando para o limite de 10.
9. **Rotas** (P23): `/s/<token>/vagas/nova` (colar; aqui o v3 é pedido) e `/s/<token>/vagas/<id>` (a vaga, que anda pelos estágios dela). Uma vaga de outra sessão dá **404**, nunca 403.
10. **"Achei uma vaga" habilita** quando a Cobertura passa de 70% ou existe um currículo geral (decisão 3 do passo 14).

## Fazer

1. **Migração:** a tabela `vagas` (sessão, texto, empresa, cargo, link, senioridade, língua, estágio, status de candidatura reservado para o passo 18, `apagada_em`), a tabela `requisitos` (vaga, **`sessao_id`**, texto, obrigatório/desejável, `accomplishment_ids`, lacuna, resposta "já usei"/"não usei"), `vaga_id` em `chamadas_llm`, `limite_vagas`, `vagas_consentiu_em` e `recusou_vagas_em` na sessão, a etapa `leitura_vaga` no enum e os eventos novos (`vaga_criada`, `vaga_apagada`, com `{ vaga_id }`). Revise o SQL gerado. Toda tabela nova com conteúdo leva `sessao_id`, para o teste que varre a coluna (`src/db/index.test.ts:280-288`) enxergá-la.
2. **O cliente LLM leva a vaga:** `PedidoLlm` e `LinhaChamada` ganham `vagaId` (`src/llm/cliente.ts:31-43`), no backend da API e no da assinatura; o teto soma o orçamento das vagas (decisão 7).
3. **`apagarSessao`** esvazia as vagas e apaga os requisitos; o teste que varre `sessao_id` passa. `apagarVaga` faz o mesmo para uma vaga e deixa o evento.
4. **A leitura da vaga** em `src/vaga/` (prompt em `.md`, como as outras etapas), com o JSON validado por schema, a validação dos ids e testes com vagas inventadas e um Corpus inventado.
5. **O consentimento das vagas** em `src/conteudo/` (arquivo novo, imutável como os outros), uma função do banco que grava `vagas_consentiu_em` ou `recusou_vagas_em` (o `reaceitarConsentimento` de hoje só serve para `interrogando` + v1, `src/db/index.ts:167-171`) e a tela de aceite em `/vagas/nova`.
6. **As telas:** colar a vaga; confirmar empresa e cargo, aviso de língua e checklist; o limite atingido; "Apagar esta vaga". O texto novo segue `docs/regras-de-redacao.md` e vai para o Daniel antes de aplicar.
7. **A casa:** "Achei uma vaga" habilitada pela regra da decisão 10.

## Fora do escopo

O chat da vaga (passo 16), o currículo da vaga e o mapa (17), os status de candidatura (18), o painel (19). Buscar o link da vaga.

## Pronto quando

- [x] Uma sessão com Cobertura acima de 70% cria uma vaga a partir de um texto inventado, aceita o item das vagas, confirma empresa e cargo e marca o checklist; recarregar a página mantém tudo.
- [x] A leitura grava o custo em `chamadas_llm` com o `vaga_id` (ou "custo não medido" pela assinatura).
- [x] Um id inventado na saída do modelo vira lacuna (teste).
- [x] Uma vaga em português mostra o aviso.
- [x] Quem recusa o item das vagas não cria vaga e continua com a conversa e o currículo geral.
- [x] A 11ª vaga mostra a mensagem do limite, mesmo com vagas apagadas no meio.
- [x] `/vagas/<id>` de outra sessão dá 404.
- [x] "Apagar meus dados" não deixa nenhum texto, empresa, cargo ou link de vaga no banco, e o custo continua ligado à vaga esvaziada (teste).
- [x] Uma sessão com 10 vagas não bate no teto de gasto ao ler a 10ª (teste com o cliente falso).
- [x] `npm run typecheck` e `npm test` passam.
- [x] Desenvolvido com `LLM_BACKEND=assinatura`. Qualquer rodada contra a API vai antes para o Daniel, com o custo estimado.

## Notas de implementação

- **Migração:** `0010_vaga-entra.sql`, gerada pelo drizzle-kit e revisada (só criações e `ADD VALUE` nos enums). Tabelas `vagas` e `requisitos`; enums `lingua_vaga`, `estagio_vaga` (`lendo`, `leitura_falhou`, `lida`, `confirmada`; os passos 16–17 acrescentam os seguintes), `status_candidatura` (coluna `vagas.candidatura`, reservada para o 18, default `preparando`), `tipo_requisito`, `resposta_lacuna`; `chamadas_llm.vaga_id` (FK sem `on delete`: a vaga nunca é apagada); na sessão, `limite_vagas` (10), `vagas_consentiu_em`, `recusou_vagas_em` e **`vagas_liberadas_em`** (fora da lista do passo: é o portão que "não fecha depois de aberto", decisão 3 do 14). Os rascunhos relevantes da leitura ficam em `vagas.rascunhos` (jsonb `[{ accomplishmentId, motivo }]`), esvaziado junto.
- **Banco:** `src/db/vagas.ts` (exportado por `@/db`): `vagasLiberadas` (grava `vagas_liberadas_em` na primeira vez que a Cobertura passa de 70% ou existe geração entregue), `responderConsentimentoVagas`, `criarVaga` (trava a linha da sessão; `recusada` sem aceite, `limite` contando as esvaziadas), `vagaDaSessao` (null para outra sessão, vaga esvaziada ou id que não é uuid → a rota dá 404), `gravarLeitura` (uma vez; só preenche empresa/cargo que a pessoa deixou em branco; lacuna = requisito sem id), `confirmarVaga`, `apagarVaga`. `apagarSessao` esvazia as vagas (com um `vaga_apagada` para cada uma ainda viva), apaga os requisitos e **mantém os eventos `vaga_criada`/`vaga_apagada`**; os outros eventos somem como antes. O teste da varredura de `sessao_id` agora espera `{ eventos: 3, vagas: 1 }` depois de apagar.
- **Cliente LLM:** `PedidoLlm.vagaId` e `LinhaChamada.vagaId` (o Jev grava `vagaId: null`; **o passo 16 precisa passar a vaga ao Jev** na conversa da vaga). O teto de uma chamada **com `vagaId`** é `teto + margem (se etapa de geração ou leitura_vaga) + ORCAMENTO_POR_VAGA_USD (2) × vagas criadas` (dep `vagasCriadas`). Chamada sem vaga continua só com o teto.
- **Leitura:** `src/vaga/leitura.ts` + `prompt-leitura.md` (em inglês, como os da geração; os requisitos saem nas palavras da vaga, o `motivo` dos rascunhos em português). O Corpus vai com refs (`ac3`, de `Refs`): Affiliation com período e stack, os registros (com Metric) e os rascunhos à parte; nome confidencial nunca aparece. Só registro cobre requisito; rascunho, pulado ou Affiliation citados viram nada; até 5 rascunhos. `src/vaga/index.ts` roda a leitura em segundo plano (`garantirLeitura`, como `segundo-plano.ts`); a página `/vagas/<id>` recarrega a cada 3 s enquanto `lendo` e reinicia uma leitura que morreu com o processo. Falha → `leitura_falhou` com "Tentar de novo".
- **Rotas:** `/s/<token>/vagas/nova` (aceite das vagas → limite → colar) e `/s/<token>/vagas/<id>` (`params` como Promise, `notFound()`). Ações em `acoes.ts`: `responderVagas`, `colarVaga`, `lerDeNovo`, `confirmarVaga` (redirect com `?salvo=1`), `apagarVaga`. O link colado só aceita `http(s)://` (`src/vaga/entrada.ts`). O número do WhatsApp do Daniel saiu de `src/app/page.tsx` para `src/app/whatsapp.ts` (hoje `src/app/contato.ts`, lido de `CONTATO_WHATSAPP`).
- **Casa:** "Achei uma vaga" vira a ação prata quando liberada, e "Continuar a conversa" passa a vazada (uma prata por vez). A seção Candidaturas lista as vagas vivas (cargo, empresa · estágio) com link para cada uma, até o passo 18 trocar por candidaturas.
- **Textos:** o aceite das vagas e os textos da casa, de `/vagas/nova` e de `/vagas/<id>` foram aprovados pelo Daniel em 2026-10-28 como estavam.
- **Verificação:** dev com `LLM_BACKEND=assinatura` e as chaves pagas em branco, Chrome headless a 360 px por CDP (a extensão do Chrome não estava conectada; script descartável no scratchpad), na sessão simulada inventada `sabe-os-numeros` (81%): aceite → colar vaga inventada em português → leitura (≈11 s, `chamadas_llm` com `vaga_id`, modelo `assinatura:claude-opus-5-5`, custo 0) → aviso de língua → checklist marcado e cargo corrigido → recarregar manteve tudo → a casa lista a vaga "Conferida". Página do limite com `limite_vagas = 1` (voltei para 10). Recusa na sessão inventada "Fulana" (passo 12): volta para a casa com a conversa e o currículo, o próximo toque pergunta de novo, nenhuma vaga criada. Sem rolagem lateral em nenhuma tela. Nenhuma chamada paga.

## Achados

- **O teto da conversa geral numa sessão com vagas:** o gasto das vagas entra em `gastoDaSessao`, então uma sessão que gastou US$ 3 em vagas fica sem conversa geral (é o que a decisão 7 aceita, mas vai acontecer cedo: com ~US$ 1,50 por vaga, duas vagas bastam). Talvez o teto geral deva descontar o gasto com `vaga_id`.
- **A versão do aceite das vagas não fica gravada** (só `vagas_consentiu_em`); hoje o texto é `vagas-v1` (`CONSENTIMENTO_VAGAS_VERSAO`). Um texto novo vai precisar de uma coluna de versão.
- **O aceite das vagas não gera evento**, então o funil não conta quem aceitou ou recusou; as colunas têm a data.
- **`src/db/painel.test.ts` passou do tempo (5 s) uma vez** na suíte cheia e passa sozinho e na rodada seguinte: carga, não este passo.
- **A leitura não confere o texto do requisito contra a vaga** (um requisito inventado passaria); só os ids são conferidos, como pede a decisão 2.
