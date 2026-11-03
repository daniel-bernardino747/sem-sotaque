# 20: Contas

## Objetivo

A pessoa entra com GitHub ou Google, e a conta passa a ser a dona de tudo o que hoje pende do token (Sessão, Corpus, gerações, vagas). O link `/s/<token>` deixa de ser a chave.

## Ler antes

- `docs/decisoes.md`, "Parte 3" (Q11, Q14, Q15, Q22), e `CONTEXT.md` (Tester, Sessão)
- `src/db/schema.ts` (`testers`, `sessoes`), as rotas em `src/app/s/[token]/` e o `exigirAdmin` do `/admin`
- **A documentação do Next 16 instalado** (`node_modules/next/dist/docs/`, se houver, ou a da versão): middleware/proxy, cookies, server actions. Ela mudou em relação ao treino
- A documentação da biblioteca de auth escolhida, na versão instalada

## Decisões (grilling de 2026-10-28)

1. **GitHub e Google, OAuth**, sem magic link e sem senha (Q14).
2. **A conta substitui o token** (Q15). As rotas vão para trás do login. Um link `/s/<token>` antigo, sem conta vinculada, pede o login e vincula o Tester à conta; depois disso o link só redireciona para o login.
3. **A biblioteca de auth** fica a critério da janela (Auth.js, Better Auth ou à mão com `arctic`/`oslo`), conferida contra o Next 16. Registre a escolha e o porquê nas notas.
4. **Domínio:** `semsotaque.teamdbsolutions.com` (Q22). Os callbacks do OAuth de produção usam ele; em dev, `localhost:3000`.

## Fazer

1. **Migração:** `contas` (provedor, id no provedor, e-mail, nome, criada em) e `testers.conta_id` (nulável, único). Uma conta tem um Tester.
2. **O login:** as duas rotas de OAuth, a sessão por cookie (httpOnly, `secure` em produção, `sameSite=lax`) e "Sair".
3. **As rotas novas** atrás do login, com a mesma árvore de hoje (casa, `/conversa`, `/curriculo`, `/vagas/nova`, `/vagas/<id>`, os PDFs). Sem conta, redireciona para `/entrar`. A checagem fica em cada página e ação, como o `exigirAdmin`, não só num middleware.
4. **A vinculação:** `/s/<token>` sem conta pede o login e grava `conta_id`; com conta, redireciona para a rota nova. Um token já vinculado a outra conta dá 404. Primeiro acesso sem token cria o Tester da conta.
5. **`apagarSessao`** passa a apagar a conta também (a linha de `contas` some; o Tester fica anonimizado como hoje).
6. **O texto novo** (`/entrar`, "Sair", a tela de vincular) segue `docs/regras-de-redacao.md` e vai para o Daniel antes de aplicar.
7. **As variáveis novas** em `docs/deploy.md` e no `.env.example`.

## Fora do escopo

Pagamento e paywall (passo 21). `MODO=local` (passo 23). Magic link. Várias contas por pessoa.

## Pronto quando

- [x] Entrar com GitHub e com Google funciona em dev, e "Sair" encerra a sessão.
- [x] Uma rota de vaga sem login redireciona para `/entrar`; a vaga de outra conta dá 404 (teste).
- [x] Um `/s/<token>` antigo vincula na primeira vez e redireciona depois; o mesmo token não vincula a uma segunda conta (teste).
- [x] Apagar os dados apaga a conta (teste).
- [x] `npm run typecheck` e `npm test` passam.

## Notas de implementação

- **Branch e PR:** `daniel-bernardino747/issue-10-passo-20-contas` (a do worktree), em commits de teste → código, com PR para a `main`.
- **A biblioteca: à mão, com `arctic` 3.7.0** (só os clientes OAuth; `src/conta/oauth.ts`). Auth.js e Better Auth trazem o próprio schema e a própria sessão, e o painel já tinha o molde de cookie + checagem por página (`exigirAdmin`). Com o `arctic`, a conta e os logins são duas tabelas nossas e cabem no `apagarSessao`. O Google usa PKCE; o GitHub, só `state`. O e-mail privado do GitHub vem de `/user/emails` (o primário verificado).
- **Migração:** `0013_contas.sql` (gerada). `contas` (provedor `github|google`, `id_no_provedor`, e-mail, nome; único por provedor + id), `acessos` (o SHA-256 do cookie, a conta com `on delete cascade`, `expira_em`) e `testers.conta_id` (nulável, único, **sem** `on delete`: a conta só sai junto com o Tester, no `apagarSessao`). Rodei no banco de dev.
- **O cookie:** `sem_sotaque_conta`, httpOnly, `sameSite=lax`, `secure` em produção, 30 dias, `path=/`. Guarda um valor aleatório; o banco só o hash, então "Sair" e "Apagar" encerram no servidor. Não precisa de `AUTH_SECRET` (saiu do `.env.example`). O OAuth usa um segundo cookie, `sem_sotaque_oauth` (10 min), com `state`, verifier e o token a vincular.
- **Rotas:** a árvore foi para **`/casa`** (`/casa`, `/casa/conversa`, `/casa/curriculo`, `/casa/pdf`, `/casa/vagas/nova`, `/casa/vagas/<id>` com a conversa e o PDF dela, os `chat` e o `fim`). `/entrar`, `/api/auth/<provedor>` (ida), `/api/auth/callback/<provedor>` (volta), `/s/<token>/entrar/<provedor>` (a ida que leva o token), `/apagado`. Os cabeçalhos privados (no-referrer, noindex, no-store) valem para todas; `/api/auth/` e `/s/` ficam fora do log do `next dev`.
- **A checagem** fica em cada página, ação e rota, como o `exigirAdmin`: `contaAtual()` e `sessaoAtual()` em `src/conta/servidor.ts` (o passo 23 entra por aí), `sessaoDaRota()`/`vagaDaRota()` em `src/app/casa/_sessao.ts` (sem login → `/entrar`; antes do consentimento → `/casa`; vaga de outra conta → 404) e `sessaoDaAcao()` em `acoes.ts`. As ações perderam o `token` do `.bind`. Chat e `fim` sem login dão 401.
- **O banco** (`src/db/contas.ts`): `entrar(perfil, { vincular })` faz o upsert da conta (que trava a linha: dois logins ao mesmo tempo criam um Tester só), vincula ou cria o Tester (`origem: 'conta'`, apelido = nome, e-mail ou provedor) e cria o Acesso. Devolve `entrou`, `link_invalido` (token desconhecido ou apagado) ou `link_de_outra_conta`; nos dois últimos nada é gravado. Duas contas disputando o mesmo token: `for update` no tester, uma ganha. `situacaoDoLink(token, contaId)` decide o `/s/<token>`: `vincular`, `casa`, `entrar`, `apagado` ou `nao_existe` (desconhecido ou de outra conta, o mesmo 404). `situacaoDoToken` saiu. Os erros dessas funções não levam o token.
- **Conta que entrou antes pelo `/entrar` e depois abre o link antigo:** se a sessão dela ainda está em `novo` (nada aceito, nada dito), ela é apagada e o Tester do link entra no lugar. Se já começou, fica a dela e o link continua livre (ver Achados).
- **`apagarSessao`** apaga o Tester (como antes) e depois a conta; os acessos vão em cascata. A ação limpa o cookie e manda para `/apagado`.
- **Callback em produção:** `urlDeRetorno` exige `APP_URL` com `NODE_ENV=production` (atrás do proxy, a origem da requisição é interna).
- **Testes:** `src/db/contas.test.ts` (conta, vinculação, disputa, apagar), `src/conta/rotas.test.ts` (rotas atrás do login, vaga de outra conta → 404, com `next/headers` falso), `src/conta/rotas-oauth.test.ts` (ida e volta do OAuth, com o perfil do provedor falso) e `src/conta/oauth.test.ts`. `npm test`: 435 testes, 4 pulados; `npm run typecheck` e `npm run build` passam.
- **Verificação:** com o `next start` na 3005 e uma conta criada por script: `/casa` e `/casa/vagas/<x>` sem login → 307 `/entrar`; com o cookie, a casa abre com "Sair"; `/s/<token>` livre mostra a tela de vincular com os dois botões; `/s/nada` → 404; a ida para o GitHub sai com `state` e o cookie do OAuth; o callback sem cookie → `/entrar?erro=1`. Na 3000 (com o `.env` do Daniel), a ida para o Google sai com `redirect_uri=http://localhost:3000/api/auth/callback/google` e PKCE. O login de ponta a ponta com GitHub e com Google, e o "Sair", o Daniel testou em `localhost:3000/entrar` em 2026-11-03 (a extensão do Chrome não estava conectada nesta janela).
- **A tela de entrar** (pedido do Daniel depois do teste): `.entrar` é uma placa estreita (30rem) e centrada, do tamanho do conteúdo, como `.apagado`; os dois botões têm o mesmo peso, com a marca de cada provedor (o G do Google num disco branco). Vale também para a tela do link antigo.
- **Textos aprovados pelo Daniel em 2026-11-03:**
  - `/entrar`: "Entrar"; "Entre com o GitHub ou com o Google. Não peço senha e não mando e-mail."; "Entrar com GitHub" / "Entrar com Google"; "Não deu para entrar. Tente de novo."; "Este link já é de outra conta. Entre com a conta que você usou da primeira vez.";
  - o link antigo: "Agora o seu link pede uma conta" + "Para guardar o que você já me contou, entre com o GitHub ou com o Google. Da próxima vez, é só entrar: este link não abre mais nada sozinho.";
  - "Sair" no rodapé;
  - os que falavam do link: "Pode parar e voltar quando quiser"; "se fechar, é só entrar de novo"; "e a sua conta sai junto" (no apagar); "A sua conta saiu junto." (em `/apagado`; um link do v0 apagado antes das contas continua dizendo "Este link não abre mais nada.").

## Achados

- **Não suba o 20 sem o 21.** Qualquer pessoa que entrar pelo `/entrar` ganha uma sessão e gasta a API; o paywall é o passo 21.
- **Quem tem o link antigo leva a sessão.** O token continua valendo como prova até o primeiro login: um link do v0 que vazou (encaminhado no WhatsApp) é vinculado por quem entrar primeiro por ele, e a dona de verdade cai em "Este link já é de outra conta". É o desenho da decisão 2; a mensagem do passo 25 aos testers pode pedir que entrem logo.
- **Conta que já começou e abre um link antigo livre:** entra na própria casa e o link fica sem vínculo, sem aviso. Juntar duas sessões fica fora do v0; hoje o Daniel resolve à mão.
- **Os textos de consentimento** (`consentimento-v1.md`/`v2.md`) ainda dizem "o mesmo número que te mandou este link". São versionados: o passo 22 escreve a versão nova.
- **A home pública** (`/`) não tem "Entrar" e ainda oferece "Perdi o meu link" pelo WhatsApp. Fica para a página de venda do passo 25.
- **`acessos` vencidos** não são apagados; só deixam de valer. Uma limpeza periódica fica para depois.
- **`token:new` e o painel** continuam gerando `/s/<token>`, que agora é um convite que vincula no primeiro login.
- **O bloco do Stripe** que já estava no `.env.example` (sem commit) ficou de fora deste passo, para o 21.
