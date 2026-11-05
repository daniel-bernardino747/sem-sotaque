# 26: Erros e atritos no uso

## Objetivo

Quando alguém usa o sem-sotaque de verdade, o que quebra e onde a pessoa empaca fica gravado no banco e aparece no painel. O ensaio do 09 e do 25 passa a deixar números, e não só lembranças e um log de container que some no redeploy.

## Ler antes

- `src/db/schema.ts`: `eventos`, `chamadas_llm`, `renders`
- `src/llm/cliente.ts` (`ErroLlm`) e os `console.error` listados no item 3
- `src/conteudo/privacidade.md` e as notas do passo 22
- As notas e os achados do passo 09 (o loop de 409; o tempo de render que não deu para medir)
- A documentação do Next 16.1.6 instalado sobre `instrumentation.ts` / `onRequestError` e sobre `error.tsx` / `global-error.tsx`. Confira antes de usar: a API mudou em relação ao que o treino conhece.

## Decisões

1. **O mapa vem antes do código.** Só se registra um evento que responde a uma pergunta da tabela abaixo. Evento novo entra primeiro na tabela.
2. **Do erro, só a forma, nunca o conteúdo.** Ficam a origem, a classe (`erro.name`), um código conhecido (o `motivo` do `ErroLlm`, o status HTTP) e a etapa ou a tela. **Nunca** a mensagem nem o stack: a mensagem do zod e a do modelo trazem texto do currículo e da conversa. Como no `CAMPOS_PERMITIDOS` do encaixa, um campo só vai para o log de propósito: existe uma lista de campos permitidos, e um teste confere que um campo fora dela é descartado.
3. **O erro fica ligado à sessão e é apagado com ela** (`on delete cascade`), como a conversa. Ele não vira dado anônimo que sobrevive ao "apagar meus dados" (decidido pelo Daniel em 2026-11-05; pode mudar depois). Um erro sem sessão (OAuth antes do login, webhook do Stripe, a página de venda) grava `sessao_id` nulo.
4. **A política ganha uma linha** sobre os erros, e "apagar meus dados" passa a citá-los entre o que é apagado.

## O mapa

| Evento / dado | Origem | Pergunta que responde |
|---|---|---|
| `erros`, origem `servidor` (`import`, `turno`, `geracao`, `mapa_geracao`, `leitura_vaga`, `oauth`, `stripe`, `checkout`, `cancelar_assinatura`, `requisicao`) | os `console.error` de hoje e o `onRequestError` | Onde quebra em produção, e com que frequência? Quebra sempre na mesma etapa? |
| `erros`, origem `navegador` (`janela`, `promessa`, `limite`), com a tela | `window` e o `error.tsx` / `global-error.tsx` | Quebra no celular de alguém, e em qual tela? |
| `tentou_de_novo`, com `onde` (`chat`, `resultado`, `curriculo_da_vaga`, `vaga`) | os quatro botões "Tentar de novo" | O "Tentar de novo" resolve, ou a pessoa fica presa tocando nele? |
| `turno_ocupado` | o 409 de `src/app/casa/chat/route.ts` | O loop de 409 com reload (achado do 09) acontece com gente de verdade? Quantas vezes por sessão? |
| `renders.duracao_ms` | o render do PDF | O render fica abaixo de ~10 s em produção? (o "pronto quando" do 09) |
| já existe: `terminou` com `por: 'teto'` | `eventos` | Quantas sessões batem no teto? Só mostrar no painel |
| já existe: `chamadas_llm.erro` | `chamadas_llm` | Que etapa do modelo falha mais? Só mostrar no painel |
| já existe: última pergunta sem resposta há mais de 24 h | painel | Em que pergunta a pessoa desiste? Nada a fazer |

## Fazer

1. **Tabela `erros`** (migração própria): `id`, `sessao_id` (nulável, `on delete cascade`), `origem`, `onde` (etapa ou tela), `classe`, `codigo` (nulável), `created_at`. E `renders.duracao_ms` (nulável: os renders antigos não têm).
2. **`registrarErro(...)`** num módulo só, que recebe o erro cru e grava apenas os campos permitidos. Se a gravação falhar, ela segue com um `console.error` e nunca derruba quem chamou.
3. **Servidor:** os `console.error` de `src/app/casa/acoes.ts`, `src/app/casa/_chat.ts`, `src/geracao/pipeline.ts`, `src/geracao/segundo-plano.ts`, `src/vaga/index.ts`, `src/conta/rotas-oauth.ts`, `src/app/api/stripe/webhook/route.ts` e `src/llm/cliente.ts` passam também por `registrarErro`. O `console.error` fica: o log do container continua útil enquanto ele existe. O `onRequestError` em `instrumentation.ts` pega o que ninguém tratou.
4. **Navegador:** um componente cliente no layout escuta `error` e `unhandledrejection`, e o `error.tsx` / `global-error.tsx` mostra uma tela de "deu errado" no tom do app e registra o erro. Todos mandam um `POST /api/erros` com a origem, a classe e a tela. A rota aceita só os campos permitidos, com tamanho máximo, liga o erro à sessão pelo cookie se houver, e para de gravar depois de 50 erros por sessão por hora (um loop não enche a tabela).
5. **Atritos:** os eventos `tentou_de_novo` e `turno_ocupado` em `TIPOS_EVENTO` (migração do enum), com os dados da tabela.
6. **Render:** grava `duracao_ms` em `renders`.
7. **Painel (`/admin`):** uma seção "Erros e atritos" com os erros dos últimos 7 dias agrupados por origem, onde e classe (contagem e última vez), as sessões com mais erros, a contagem de `tentou_de_novo`, de `turno_ocupado` e de teto, e a mediana e o máximo do render.
8. **A política** (`src/conteudo/privacidade.md`), com o texto aprovado pelo Daniel antes de aplicar e a "Última atualização" trocada:
   - em "O que eu guardo", depois de "Para medir o produto", algo como: **"Para achar o que quebra:** quando algo dá errado, o tipo do erro e a tela ou a etapa em que ele aconteceu, ligados à sua sessão. Nunca o texto da sua conversa ou do seu currículo."
   - em "Por quanto tempo", "os erros" entra na lista do que o "Apagar meus dados" apaga na hora.
   - **o aviso antes de valer:** a seção "Mudanças" da política promete avisar "na sua página antes de valer", e esse aviso ainda não existe. Uma faixa na casa diz o que mudou e a data em que passa a valer, até essa data. O texto e a data vão para o Daniel, e a gravação de erros só liga em produção a partir dela (uma variável ou a própria data no código).
   - confira se o consentimento (v3) ou os termos precisam mudar junto. Se precisarem, **pergunte ao Daniel** antes de mexer na versão do consentimento, porque mudar a versão pede reaceite.
9. **`docs/decisoes.md`:** uma decisão nova com o mapa e a regra "só a forma, nunca o conteúdo".
10. **O passo 09:** o título e as notas param de falar do Railway como produção (hoje é o Coolify, `docs/deploy.md`), e o "Pronto quando" do render aponta para o painel.
11. **O roteiro do ensaio** (`docs/ensaio.md`): o que você e a pessoa próxima fazem, em que ordem, e o que conferir no painel depois de cada etapa (erros, atritos, render, apagar). Ele serve ao item 4 do 09 e ao item 5 do 25.

## Fora do escopo

Sentry ou qualquer serviço externo de erros: o dado não sai do servidor. Alertas por e-mail ou WhatsApp. Gravação de tela. Contar cliques fora da tabela.

## Pronto quando

- [ ] Um teste prova que `registrarErro` descarta a mensagem, o stack e todo campo fora da lista, mesmo com um erro cuja mensagem traz texto de currículo inventado.
- [ ] Um teste prova que apagar a sessão apaga os erros dela.
- [ ] `POST /api/erros` recusa um corpo fora do formato e para de gravar depois do limite.
- [ ] Forçar um erro no servidor (o import com um arquivo estragado) e outro no navegador faz os dois aparecerem no painel, com a origem e a tela certas.
- [ ] Um render novo grava `duracao_ms`, e o painel mostra a mediana.
- [ ] A política nova está no ar com o texto aprovado pelo Daniel e a data trocada, e a faixa da casa avisou antes de a gravação ligar.
- [ ] `npm run typecheck` e `npm test` passam.

## Notas de implementação

(preencher ao terminar)

## Achados

(o que aparecer fora do escopo)
