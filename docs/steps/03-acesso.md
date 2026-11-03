# 03: Acesso (token, consentimento, apagar)

## Objetivo

O Daniel gera um link por tester; a pessoa abre o link, lê e aceita o consentimento, e pode apagar tudo a qualquer momento.

## Ler antes

- `docs/decisoes.md` ("LGPD no v0")
- `src/db/` (passo 02)

## Fazer

1. **`npm run token:new -- "<apelido>" --origem "<grupo>" [--indicado-por <token>]`**: cria o tester e imprime o link `APP_URL/s/<token>`.
2. **`/s/[token]`:** token inválido → 404 genérico, sem dizer se existiu. Sessão apagada → página "seus dados foram apagados". Grava o evento `link_aberto` na primeira vez.
3. **Tela de consentimento** (antes de qualquer outra coisa). O texto, curto e em PT, versionado em `src/conteudo/consentimento-v1.md`, diz:
   - o que é guardado (o currículo, as respostas, o currículo gerado, os tempos de resposta);
   - que o Daniel lê tudo para melhorar a ferramenta;
   - que o conteúdo passa pela API da Anthropic para gerar perguntas e o currículo;
   - que nada é usado em post, demo ou material de divulgação sem pedir de novo;
   - que dá para apagar tudo a qualquer momento, pelo botão ou pelo WhatsApp do Daniel, e que ele apaga em até 24 h.

   Um checkbox obrigatório mais o botão "começar". Grava `consentiu_em`, a versão do texto e o evento `consentiu`.
4. **"Apagar meus dados"** visível em toda tela da sessão (rodapé). Confirmação em duas etapas, sem diálogo nativo do navegador; chama `apagarSessao`.
5. **Navegação por estado:** a rota da sessão leva a pessoa para a tela do estado em que ela está (consentimento, import, chat, resultado). Fechar a aba e voltar pelo link cai no mesmo lugar.
6. Telas desta etapa: só a de consentimento e a de "apagado". As outras são placeholders que os passos 04–07 preenchem.

## Fora do escopo

Import, chat, admin. Login: não existe no v0, e o token **é** a credencial.

## Pronto quando

- [x] Fluxo testado: gerar token → abrir → aceitar → recarregar e continuar no mesmo estado → apagar → abrir de novo e ver "apagado"
- [x] Token inválido e token apagado não vazam se a sessão existe
- [x] O token não aparece em log de servidor nem em analytics (confira os logs do Next)
- [x] Funciona em celular (a maioria vai abrir pelo link do WhatsApp)

## Notas de implementação

- **Uma rota só:** `src/app/s/[token]/page.tsx` resolve o token e escolhe a tela por `telaDoEstado(estado)` (`src/sessao/tela.ts`): `novo` → consentimento, `consentiu` → import, `importou`/`interrogando` → chat, `gerando`/`pronto`/`encerrado` → resultado. Não há sub-rota por tela nem redirect: o passo 04 troca o placeholder `EmConstrucao` de `import` pelo componente dele, e assim por diante (`src/app/s/[token]/_telas/`). Toda mudança de estado acaba em `redirect('/s/<token>')` e a página mostra a tela nova.
- **Server actions** em `src/app/s/[token]/acoes.ts` recebem o token por `.bind` e revalidam com `situacaoDoToken` a cada chamada; nunca confiam num `sessaoId` vindo do cliente. Ação nova de uma tela segue o mesmo molde.
- **"Apagado" sem guardar o token:** `apagarSessao` grava o SHA-256 do token em `sessoes.token_apagado_sha256` (migração `0001_token-apagado.sql`) antes de apagar a linha de `testers`. `situacaoDoToken(token)` devolve `{ tipo: 'ativa', tester, sessao }`, `{ tipo: 'apagada' }` ou `null` (404 genérico, `src/app/not-found.tsx`). Quem tem o link sabe que ele existiu, e mais ninguém tem o link.
- **Funções novas em `src/db`:** `situacaoDoToken`, `registrarAbertura` e `registrarConsentimento(sessaoId, versao)` (só move de `novo`; reenviar o formulário não muda nada). Testes em `src/db/acesso.test.ts`. `EstadoSessao` (o tipo) agora mora em `schema.ts`.
- **`link_aberto` é gravado pelo navegador, não pelo render:** o componente `Abertura` chama a action `abriuOLink` num `useEffect`. Motivo: o WhatsApp busca o link para desenhar o preview quando o Daniel cola a mensagem, e isso contaria como "abriu" antes de a pessoa abrir. Conferido: um `fetch` com user-agent do WhatsApp não grava nada; o Chrome grava uma vez em dois carregamentos. No banco, o índice único parcial `eventos_link_aberto_uma_vez` (migração `0002_link-aberto-uma-vez.sql`) com `on conflict do nothing` segura abas simultâneas, e o insert lê `sessoes ... for share` e exige `apagada_em is null`, então não sobra `link_aberto` depois de um `apagarSessao` concorrente.
- **Consentimento:** texto em `src/conteudo/consentimento-v1.md` (parágrafos e `**negrito**`, lidos por `paragrafos()`, sem lib de Markdown), versão em `CONSENTIMENTO_VERSAO`. Texto novo = arquivo novo `-v2.md` e constante nova; nunca editar um texto que alguém já aceitou. O WhatsApp do Daniel aparece como "o mesmo número que te mandou este link", para o número não ir para o git.
- **Token fora dos logs:** `next.config.ts` tira `/s/*` do log de requisições do `next dev` (`logging.incomingRequests.ignore`); o `next start` não loga requisição. `sessaoPorToken` troca o erro do Drizzle (que traz os params, isto é, o token) por um sem params, só com o código e a mensagem do Postgres (teste com NUL no token; pela URL, `%00` já dá 404 no Next antes de chegar ao banco). `/s/*` sai com `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` e `Cache-Control: private, no-store`. Não há analytics.
- **Verificado no navegador:** Chrome headless (playwright-core fora do repo) em viewport de iPhone (375 px, touch), contra `next dev` e contra `next build && next start`: gerar → abrir → começar sem marcar (bloqueado) → aceitar → recarregar → nova aba → apagar (cancelar e depois confirmar) → abrir num contexto limpo ("apagados") → token inválido (404). Sem rolagem horizontal; os logs não têm o token.
- `vitest.config.ts` ganhou o alias `@` → `src` (o mesmo do `tsconfig`).

## Achados

- **Conflito com o passo 04 (rodando em paralelo):** os dois branches criaram uma `drizzle/0001_*`. Quem fizer merge por último precisa apagar a sua migração e o snapshot, rodar `npm run db:generate` de novo em cima da do outro e reaplicar. Os bancos locais também se misturam: o migrator do Drizzle pula uma migração cujo `when` é mais antigo que a última aplicada, e o worktree do 04 recriou o `sem_sotaque_test` com a migração dele. Este passo testou com `TEST_DATABASE_URL=.../sem_sotaque_passo03`. Depois do merge, `drop database sem_sotaque_test` (e, se preciso, o de dev) e migre de novo.
- `textoDoConsentimento` lê o `.md` de `process.cwd()/src/conteudo` a cada render. Funciona porque a imagem leva o build inteiro; se um dia for `output: 'standalone'`, o arquivo precisa entrar no tracing (`outputFileTracingIncludes`).

- **Para o passo 09 (não verificado):** o proxy do Railway deve registrar o caminho de cada requisição nos HTTP logs dele, e aí o token aparece lá. Confirmar; se for o caso, ver se dá para desligar ou restringir quem lê esses logs; senão, anotar no texto de consentimento ou mudar o link para `/s#<token>` (fragmento não vai ao servidor), o que exige trocar a rota por uma leitura no cliente.
- **Para o passo 08:** o evento `link_aberto` também some no `apagarSessao` (todos os eventos menos `apagou` somem). Mesmo achado do passo 02.
- O `npm run token:new -- ... --indicado-por <token>` só aceita token de Tester ativo; quem apagou os dados não pode mais ser apontado como quem indicou.
