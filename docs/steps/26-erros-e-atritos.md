# 26: Erros e atritos no uso

## Objetivo

Quando alguém usa o sem-sotaque de verdade, o que quebra e onde a pessoa empaca ficam gravados no banco e aparecem no painel. O ensaio do 09 e do 25 passa a deixar números, e não só lembranças e um log de container que some no redeploy.

## Ler antes

- `src/db/schema.ts`: `eventos`, `chamadas_llm`, `renders`, `sessoes` (`texto_consentimento_versao`)
- `src/db/index.ts`, `apagarSessao`: ele **não apaga a linha da sessão**, só marca `apagada_em` e apaga tabela por tabela
- `src/llm/cliente.ts` (`ErroLlm`) e os `console.error` listados no item 3
- `src/conteudo/privacidade.md`, `src/conteudo/consentimento-v3.md`, `src/conteudo/consentimento.ts` e as notas do passo 22
- As notas e os achados do passo 09 (o loop de 409; o tempo de render que não deu para medir)
- A documentação do Next 16.1.6 instalado sobre `instrumentation.ts` / `onRequestError` e sobre `error.tsx` / `global-error.tsx` (e o `digest`). Confira antes de usar: a API mudou em relação ao que o treino conhece.

## Decisões (grilling de 2026-11-05)

1. **O mapa vem antes do código.** Só se registra um evento que responde a uma pergunta da tabela abaixo. Evento novo entra primeiro na tabela.
2. **Do erro, só a forma, nunca o conteúdo.** Ficam a origem, a classe (`erro.name`), um código conhecido (o `motivo` do `ErroLlm`, o status HTTP), a etapa ou a tela e o `digest` do Next. **Nunca** a mensagem nem o stack: a mensagem do zod e a do modelo trazem texto do currículo e da conversa. Como no `CAMPOS_PERMITIDOS` do encaixa, um campo só vai para o log de propósito: há uma lista de campos permitidos, e um teste confere que um campo fora dela é descartado.
3. **O erro fica ligado à sessão e é apagado com ela.** Ele não vira dado anônimo que sobrevive ao "apagar meus dados". Como o `apagarSessao` não apaga a linha da sessão, um `on delete cascade` não basta: os erros são apagados por um `delete` explícito dentro do `apagarSessao`. Um erro sem sessão (OAuth antes do login, webhook do Stripe) grava `sessao_id` nulo.
4. **90 dias para todo erro**, com ou sem sessão. A limpeza roda sem cron: o `registrarErro` apaga os vencidos de vez em quando (por exemplo, numa chamada a cada 100, ou uma vez por hora por processo).
5. **No `MODO=local`, nada é gravado:** o `registrarErro` só faz o `console.error`, e `/api/erros` dá 404, como o webhook do Stripe. Quem roda o self-host vê o terminal.
6. **O navegador sem sessão não grava:** `/api/erros` sem cookie de sessão responde 204 e descarta. A rota não fica aberta para quem não entrou, e nenhum IP é guardado. Os erros do próprio servidor sem sessão (OAuth, Stripe) continuam gravados.
7. **O `digest`** é gravado nos dois lados: o `onRequestError` grava o erro do servidor com ele, e o `error.tsx` manda o mesmo `digest`. No painel, o erro da tela aponta para o do servidor; no log do container, o `digest` leva à mensagem completa enquanto o log existir. Um erro que nasce no navegador fica só com a classe e a tela.
8. **Consentimento v4:** igual ao v3, com o tipo dos erros na lista "O que fica guardado". Ele vale só para quem aceita a partir de agora. Quem aceitou o v3 **não** reaceita: é avisado pela faixa.
9. **A faixa avisa 7 dias antes.** No deploy entram a política nova, o v4 e a faixa na casa, que diz o que mudou e a data em que passa a valer. Grava erros e atritos de uma sessão quem aceitou o v4 desde o aceite, ou qualquer sessão depois da data. As duas sessões do ensaio, que são novas, gravam desde o primeiro dia.
10. **`turno_ocupado` conta no máximo uma vez a cada 10 s por sessão.** O loop de 409 com reload dispara dezenas de pedidos.

## O mapa

| Evento / dado | Origem | Pergunta que responde |
|---|---|---|
| `erros`, origem `servidor` (`import`, `turno`, `geracao`, `mapa_geracao`, `leitura_vaga`, `oauth`, `stripe`, `checkout`, `cancelar_assinatura`, `requisicao`) | os `console.error` de hoje e o `onRequestError` | Onde quebra em produção, e com que frequência? Quebra sempre na mesma etapa? |
| `erros`, origem `navegador` (`janela`, `promessa`, `limite`), com a tela e o `digest` | `window` e o `error.tsx` / `global-error.tsx` | Quebra no celular de alguém, e em qual tela? Foi o servidor que derrubou a tela? |
| `tentou_de_novo`, com `onde` (`chat`, `resultado`, `curriculo_da_vaga`, `vaga`) | os quatro botões "Tentar de novo" | O "Tentar de novo" resolve, ou a pessoa fica presa tocando nele? |
| `turno_ocupado` | o 409 de `src/app/casa/chat/route.ts` | O loop de 409 com reload (achado do 09) acontece com gente de verdade? Quantas vezes por sessão? |
| `renders.duracao_ms` | o render do PDF | O render fica abaixo de ~10 s em produção? (o "pronto quando" do 09) |
| já existe: `terminou` com `por: 'teto'` | `eventos` | Quantas sessões batem no teto? Só mostrar no painel |
| já existe: `chamadas_llm.erro` | `chamadas_llm` | Que etapa do modelo falha mais? Só mostrar no painel |
| já existe: a última pergunta sem resposta há mais de 24 h | painel | Em que pergunta a pessoa desiste? Nada a fazer |

## Fazer

1. **A tabela `erros`** (migração própria): `id`, `sessao_id` (nulável), `origem`, `onde` (etapa ou tela), `classe`, `codigo` (nulável), `digest` (nulável), `created_at`, com índice em `created_at`. E `renders.duracao_ms` (nulável: os renders antigos não têm).
2. **`registrarErro(...)`**, num módulo só, recebe o erro cru e grava apenas os campos permitidos. No `local`, ou antes da data para uma sessão v3, ele só faz o `console.error`. Se a gravação falhar, segue com um `console.error` e nunca derruba quem chamou. É ele quem roda a limpeza dos 90 dias.
3. **Servidor:** os `console.error` de `src/app/casa/acoes.ts`, `src/app/casa/_chat.ts`, `src/geracao/pipeline.ts`, `src/geracao/segundo-plano.ts`, `src/vaga/index.ts`, `src/conta/rotas-oauth.ts`, `src/app/api/stripe/webhook/route.ts` e `src/llm/cliente.ts` passam também pelo `registrarErro`. O `console.error` fica: o log do container continua útil enquanto existe. O `onRequestError` em `instrumentation.ts` pega o que ninguém tratou, com o `digest`.
4. **Navegador:** um componente cliente no layout da casa escuta `error` e `unhandledrejection`, e o `error.tsx` / `global-error.tsx` mostra uma tela de "deu errado" no tom do app e registra o erro com o `digest`. Todos mandam um `POST /api/erros` com a origem, a classe, a tela e o `digest`. A rota aceita só os campos permitidos, com tamanho máximo; sem cookie de sessão responde 204 sem gravar; com sessão, para de gravar depois de 50 erros por sessão por hora.
5. **Atritos:** `tentou_de_novo` e `turno_ocupado` em `TIPOS_EVENTO` (migração do enum), com os dados da tabela e o limite de 10 s do `turno_ocupado`. Eles seguem a regra dos outros eventos do funil no `apagarSessao`.
6. **Render:** grava `duracao_ms` em `renders`.
7. **`apagarSessao`:** apaga os erros da sessão, explicitamente.
8. **Painel (`/admin`):** uma seção "Erros e atritos" com os erros dos últimos 7 dias agrupados por origem, onde e classe (contagem e última vez, e o erro do servidor ligado pelo `digest`), as sessões com mais erros, a contagem de `tentou_de_novo`, de `turno_ocupado` e de teto, e a mediana e o máximo do render.
9. **A política** (`src/conteudo/privacidade.md`), com o texto aprovado pelo Daniel antes de aplicar e a "Última atualização" trocada:
   - em "O que eu guardo", depois de "Para medir o produto", algo como: **"Para achar o que quebra:** quando algo dá errado, o tipo do erro e a tela ou a etapa em que ele aconteceu, ligados à sua sessão, por 90 dias. Nunca o texto da sua conversa ou do seu currículo."
   - em "Por quanto tempo", "os erros" entra na lista do que o "Apagar meus dados" apaga na hora.
10. **O consentimento v4** (`consentimento-v4.md`, `CONSENTIMENTO_VERSAO = 'v4'`): o v3 com o tipo dos erros na lista "O que fica guardado". O texto vai para o Daniel. O reaceite de uma sessão v1 continua no v2 (`REACEITE_VERSAO`), e uma sessão v3 não reaceita.
11. **A faixa na casa:** diz o que mudou na política e a data em que passa a valer (o deploy mais 7 dias), e some depois da data. O texto e a data vão para o Daniel. A data fica no código, ao lado da versão do consentimento, e é ela que o `registrarErro` confere.
12. **`docs/decisoes.md`:** uma decisão nova com o mapa e a regra "só a forma, nunca o conteúdo".

## Fora do escopo

Sentry ou qualquer serviço externo de erros: o dado não sai do servidor. Alertas por e-mail ou WhatsApp. Gravação de tela. Source map em produção. Contar cliques fora da tabela. O roteiro do ensaio (está no item 5 do 25).

## Pronto quando

- [x] Um teste prova que o `registrarErro` descarta a mensagem, o stack e todo campo fora da lista, mesmo com um erro cuja mensagem traz texto de currículo inventado.
- [x] Um teste prova que o `apagarSessao` apaga os erros da sessão.
- [x] Um teste prova que, no `local`, nada é gravado e `/api/erros` dá 404.
- [x] Um teste prova que uma sessão v3 não grava antes da data e grava depois dela, e que uma sessão v4 grava desde o aceite.
- [x] `POST /api/erros` recusa um corpo fora do formato, descarta sem sessão e para de gravar depois do limite.
- [x] Um erro com mais de 90 dias some na limpeza.
- [ ] Forçar um erro no servidor (o import com um arquivo estragado) e outro no navegador faz os dois aparecerem no painel, com a origem, a tela e, quando houver, o mesmo `digest`.
- [x] Um render novo grava `duracao_ms`, e o painel mostra a mediana.
- [ ] A política, o v4 e a faixa estão no ar com os textos aprovados pelo Daniel, e a data da faixa está anotada nas notas deste passo.
- [x] `npm run typecheck` e `npm test` passam.

## Notas de implementação

**Em andamento: falta a prova em produção.** Os textos e a data foram aprovados pelo Daniel em 2026-11-05, como estão no PR #8, e o merge é do mesmo dia. **Data da faixa: 13 de novembro de 2026** (`ERROS_VALEM_A_PARTIR`, meia-noite de Brasília).

1. **Os textos** (aprovados): o parágrafo novo do `consentimento-v4.md` ("O que fica guardado"), a faixa (`AVISO_DA_POLITICA` em `src/conteudo/consentimento.ts`) e as duas mudanças em `src/conteudo/privacidade.md` ("Para achar o que quebra" e "os erros" no "Apagar meus dados"). A política também cita o "Tentar de novo"; o v4 e a faixa, não. Decidir se citam.
2. **A data da faixa:** `ERROS_VALEM_A_PARTIR = 2026-11-13T03:00Z`, com o deploy em 5/11: 8 dias de aviso.
3. **A prova de ponta a ponta,** em produção: o import com um arquivo que não é PDF e um erro forçado no navegador aparecem no `/admin`, em "Erros e atritos". No `MODO=local` nada é gravado (de propósito), e no dev o login pede o OAuth.

Como ficou:

- **Módulos:** `src/erros/forma.ts` (pura: o erro vira `origem`, `onde`, `classe`, `codigo`, `digest`; `TOKEN` limita classe, código e digest a um token curto), `src/erros/index.ts` (`registrarErro`, que faz o `console.error` com a mensagem e grava só a forma; `registrarForma`; `anotarAtrito`), `src/erros/navegador.ts` (o corpo do `POST /api/erros`), `src/erros/relato.ts` (o lado do navegador, sem import de servidor), `src/erros/requisicao.ts` (o `onRequestError`, chamado de `src/instrumentation.ts` só no runtime `nodejs`) e `src/db/erros.ts` (gravar, limpar, atritos, e o `errosEAtritos` do painel).
- **Quem grava:** `gravaErrosEAtritos(versao, agora)`: o v4 desde o aceite; v1–v3 (e quem ainda não aceitou) a partir de `ERROS_VALEM_A_PARTIR`. A checagem e o insert rodam numa transação com `for share` na sessão, então nada grava depois do `apagarSessao`.
- **Navegador:** a tela vai em `onde` (com o UUID trocado por `[id]`) e o tipo (`janela`, `promessa`, `limite`) em `codigo`. O limite de 50 por hora conta só os erros do navegador. O cliente manda no máximo 10 por carga de página. O listener está na `Moldura` (o layout de fato de `/casa`).
- **`ErroImport` também é gravado** (com o `codigo`: `nao_e_pdf`, `sem_texto`...): é onde a pessoa empaca, e é o "arquivo estragado" do "Pronto quando".
- **O teto de gasto** é gravado pelo cliente do modelo, com `onde` = a etapa e `codigo: 'teto'`; a geração não grava de novo.
- **Chat:** o "Tentar de novo" manda `{ tipo: 'continuar', deNovo: true }`; o 409 de turno ocupado vira `turno_ocupado` (um a cada 10 s, conferido no banco).
- **Painel:** os cartões ("Tentar de novo" por tela, turno ocupado, teto, chamadas do modelo com erro por etapa, render com mediana e máximo), os erros agrupados com o erro do servidor de mesmo `digest`, e as sessões com mais erros. Tudo nos últimos 7 dias.
- **Migrações:** `0017_erros` (tabela, enum `origem_erro`, `renders.duracao_ms`) e `0018_atritos` (os dois valores novos de `tipo_evento`).

## Achados

- O `registrarAtrito` e o limite de 50/h checam e depois inserem: dois pedidos simultâneos podem passar os dois. O efeito é contar um a mais; não vale um lock.
- `src/db/assinaturas.ts` tem um `console.error` (duas assinaturas vivas na mesma conta) fora da lista do item 3: ficou só no log.
