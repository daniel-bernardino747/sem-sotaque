# 11: Menos chamadas por sessão

## Objetivo

O interrogatório custa ~85–90% do que o produto gasta numa sessão (rodadas pagas do passo 10, 2026-10-21: o import é uma chamada, ~US$ 0,05; o Jev, ~US$ 0,001). O custo vem do número de chamadas ao questionador: ~2 por turno (37 em 19 turnos na `cv-forte`, 56 em 29 na `sabe-os-numeros`), e o bloco de cada empresa, que é formulário, gasta turnos de modelo (~14 de 53 na `uma-palavra`). Este passo tira chamadas sem tirar o que a conversa ganha com o modelo.

## Ler antes

- `src/interrogatorio/turno.ts`, `ferramentas.ts`, `estado.ts` e `prompt.md`
- `src/avaliador/index.ts` (o checkpoint de affiliation) e `plano.ts` (`objetivoDoAssunto`)
- Notas do passo 10
- As transcrições das rodadas de 2026-10-21 em `storage/simulacoes/` (fora do git)

## Decisões (2026-10-21, com o Daniel)

1. **O bloco da empresa sai sem modelo.** As perguntas de período, "o que a empresa faz" e "o nome pode aparecer?", e o ano da formação, são de template. A resposta é lida por regra (mês, ano, sim/não, "ainda estou lá"). O que a regra não entende, ou uma resposta longa (que pode trazer outra coisa), passa para o questionador, que segue o assunto do jeito de hoje.
2. **"Não sei" e "pular" por regra, antes do modelo.** Resposta curta que é só "não sei", "sei lá", "não lembro"... vem marcada `nao_sei` no servidor; o segundo seguido no assunto dispara o checkpoint antes do modelo. "Pula", "próxima" sozinhos valem como o botão "pular esta". As ferramentas `marcar_nao_sei` e `marcar_pulado` ficam para o que a regra não pega.
3. **Uma chamada por turno.** O questionador escreve a pergunta na mesma resposta em que chama as ferramentas. Se nada for recusado e o assunto não mudar, o servidor grava e não chama de volta.
4. **A oferta de parar mostra o que ficou pendente** (muda a decisão 7 do passo 10). Abaixo da oferta, até 4 accomplishments da fila, na ordem dela (do mais forte), cada um com a linha do currículo e a empresa, mais o botão "Parar e gerar meu currículo". Parar encerra como o "terminei". Escolher um volta àquele assunto: a pessoa vê a escolha como fala dela, o questionador abre o assunto, e a oferta não volta. Escrever livre continua valendo, lido como hoje.
5. **Fora deste passo:**
   - **Modelo mais barato no questionador:** fica para testes de qualidade com outros modelos, mais tarde.
   - **Contexto menor:** já é o do passo 10 (só as mensagens desde que o assunto abriu).
   - **Transição fixa ("Anotei, a gente volta nisso"):** sai na mesma resposta da pergunta, então não economiza chamada.

## Fazer

1. `src/interrogatorio/bloco.ts`: a próxima pergunta do bloco a partir do que falta na Affiliation, e a leitura da resposta (ou "não entendi").
2. O turno usa o bloco num assunto de affiliation até a regra não entender; aí entra o questionador.
3. A regra de "não sei" e "pular" no registro da fala, e o gatilho antes do modelo.
4. O turno de uma chamada só, e o `prompt.md` dizendo para escrever a pergunta junto com as ferramentas.
5. As opções da oferta: `opcoesDaOferta` e `escolherAssunto` no avaliador, a entrada `escolher` no turno e na rota, e os botões no chat.
6. Rodar as 4 personas e comparar com 2026-10-21: chamadas por turno, turnos, custo, checagens.

## Pronto quando

- [x] O bloco de empresa e o ano da formação saem sem chamada ao modelo quando a resposta é simples, testado com respostas de verdade das transcrições (sem dado de tester: frases inventadas no mesmo formato).
- [x] Uma resposta que a regra não entende passa para o questionador, sem perder a fala.
- [x] "sei lá" duas vezes seguidas dispara o checkpoint sem chamar o modelo para marcar.
- [x] Um turno sem recusa e sem troca de assunto faz uma chamada ao questionador.
- [x] A oferta lista até 4 pendentes; escolher um faz a próxima pergunta ser sobre ele, e "Parar" encerra.
- [ ] **Pendente** (ver as notas): as 4 personas passam as checagens, com menos chamadas por turno e custo por sessão menor que em 2026-10-21. O Daniel aprova o gasto antes de rodar.

## Notas de implementação

**Estado:** fechado em 2026-10-21 com uma pendência, por decisão do Daniel ("pode subir assim mesmo, anote a pendência"). PR #2.

**Pendência:** o último item de "Pronto quando" não passou.
- A checagem "uma pergunta por mensagem" falhou na `cv-forte` (um falso positivo, "o que acontecia com quem estava pagando?") e na `uma-palavra` (falsos positivos e uma mensagem com dois "?" de verdade). O falso positivo do "quem" que abre oração está corrigido em `maisDeUmaPergunta`, com teste, mas nenhuma rodada paga rodou depois da correção. Falta rodar de novo `uma-palavra` e `cv-forte` (~US$ 1,30 com a persona) e ver se a mensagem com dois "?" ainda passa pela reescrita.
- A `nao-sei` não ficou mais barata (US$ 0,28 contra 0,26). Os turnos com mais de uma chamada são troca de assunto no meio do turno: o modelo escreve a pergunta junto com `registrar_metric`, o avaliador troca, e a pergunta escrita é descartada. Ela quase não tem bloco de empresa. Desvio aceito.
- Os botões da oferta foram vistos só como HTML do servidor local (sessão inventada no banco de dev, parada na oferta): "Parar e gerar meu currículo" e os 4 pendentes com a empresa. O clique num pendente não foi exercitado contra o modelo; está coberto pelo teste do turno.

**O que entrou** (branch `ticket/11-custo-por-sessao`, empilhada na do passo 10):

- `src/interrogatorio/bloco.ts`: `perguntaDoBloco(af, feitos)` e `lerResposta(af, passo, fala)`. Passos: `confirmar` (o currículo já tem os meses), `inicio`, `fim`, `descricao`, `nome`; na formação, `ano`. Meses só por nome inteiro ou `MM/AAAA` (o `mesesEscritos` do import casa por prefixo: "mais" vira maio). Entrada e saída na mesma fala são lidas juntas. Resposta acima de 12 palavras (40 na descrição) vai para o questionador. O texto evita o gênero da empresa: "Antes de deixar X para trás", "nunca ouviu falar de X".
- O estado do bloco fica no próprio `Assunto` (`bloco: { feitos, pendente, modelo }`, no jsonb do `plano`, sem migração). `modelo: true` quando a regra não entendeu: dali em diante o questionador tem o assunto. O fim do bloco chama o checkpoint com o gatilho novo `bloco`, que sempre troca. Enquanto o bloco é da regra, os gatilhos `perguntas` e `nao_sei` não rodam.
- `src/interrogatorio/falas.ts`: `ehNaoSei` (até 8 palavras, só "não sei" e enchimento) e `ehPular` (a fala inteira é "pula", "próxima"...). O `marcar_nao_sei` do modelo numa fala já marcada não dispara de novo.
- Uma chamada por turno: o turno só chama o modelo de volta se uma ferramenta foi recusada (a pergunta escrita é descartada), se ainda não há pergunta, ou se o assunto mudou. O `prompt.md` pede a pergunta junto com as ferramentas.
- A oferta de parar: `opcoesDaOferta` e `escolherAssunto` no avaliador (decisão `escolheu`, backend `pessoa`, fora da contagem de checkpoints), a entrada `escolher` no turno e na rota, os botões em `chat.tsx`. Os botões não foram vistos num navegador: a extensão do Chrome estava desconectada.

**Correções que as rodadas pagas pediram** (cada uma com teste antes):

- Um resultado dito e não gravado segura o assunto, qualquer que seja a decisão do Jev (menos se a pessoa pulou). O checkpoint de "2 perguntas" roda antes do questionador ler a resposta, e a `cv-forte` perdia o "900 → 120 ms".
- A resposta à oferta é lida como anotação: o Jev diz se cita um registro existente (que vira o próximo assunto), algo novo ou nada. Antes, toda menção virava registro novo, e a `sabe-os-numeros` duplicou os "relatórios de frete".
- A segunda sugestão de `concluir_assunto` num registro que já tem resultado troca o assunto (a `uma-palavra` gastou 4 turnos assim).
- `maisDeUmaPergunta`: um "quem" que abre oração ("com quem pagava", "pra quem acompanhava") não é outra pergunta. O falso positivo falhava a checagem do `simular` e gastava uma reescrita.

**Rodadas de 2026-10-21** (produto, sem a persona; "antes" é a rodada da manhã, já com o passo 10):

| persona | antes | depois | chamadas ao questionador por turno |
|---|---|---|---|
| `cv-forte` | 19 turnos, US$ 0,43 | 12 turnos, US$ 0,24 | ~1,9 → 1,50 |
| `sabe-os-numeros` | 29 turnos, US$ 0,65 | 29 turnos, US$ 0,45 | ~1,9 → 1,07 |
| `nao-sei` | 14 turnos, US$ 0,26 | 15 turnos, US$ 0,28 | ~1,5 → 1,40 |
| `uma-palavra` | 53 turnos, US$ 0,78 | 45 turnos, US$ 0,45 | ~1,6 → 0,98 |

A `cv-forte` da tabela rodou com todas as correções menos a do "quem". As outras três rodaram antes da correção do `concluir` e do "quem"; a `cv-forte` e a `sabe-os-numeros`, antes da correção da oferta. O Jev não falhou em nenhuma; custa ~US$ 0,001 por sessão.

## Achados

- `src/db/painel.test.ts` ("groups the anchors and finds the last question of a stopped session") falhou uma vez na suíte completa e passou na seguinte, sem mudança. Intermitente, de antes deste passo.
- A `uma-palavra` ainda escreve uma mensagem com dois "?" de verdade ("4 horas fazendo o quê? ... o que esse serviço fazia?"), mesmo depois da reescrita única. Vale ver se a reescrita está acontecendo nesse caminho.
- O modelo às vezes fecha um assunto com uma frase sem pergunta ("Beleza, esse já tem o número que importa."), o que gasta um turno da pessoa.
