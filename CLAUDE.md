# sem-sotaque

Uma ferramenta para dev brasileiro aplicar para vaga internacional: um interrogatório em português que nunca inventa número, e um currículo em inglês. Código aberto (AGPL-3.0). O porquê está em `docs/decisoes.md`, o vocabulário em `CONTEXT.md` e as regras de redação em `docs/regras-de-redacao.md`. Como contribuir: `CONTRIBUTING.md`.

## Como trabalhar aqui

A implementação é feita **um passo por janela**. Ao abrir uma sessão:

1. Leia `docs/steps/README.md` e pegue o primeiro passo `pendente` cujas dependências estejam `feito`. Se a issue ou quem pediu o trabalho disse qual passo fazer, faça esse.
2. Leia o arquivo do passo inteiro, mais o que ele manda ler antes.
3. Faça **só** o que o passo pede. O que aparecer fora do escopo vai para "Achados" no fim do arquivo do passo.
4. Feche quando todos os itens de "Pronto quando" passarem. Marque `feito` no `docs/steps/README.md` e escreva em "Notas de implementação", no arquivo do passo, o que a próxima janela precisa saber (decisões, desvios, comandos).
5. Um PR por passo, contra a `main`.

## Regras

- **Dado de pessoa real nunca vai para o git:** nem PDF, nem transcrição, nem dump de banco. Fixtures de teste usam pessoas inventadas.
- **O modelo nunca escreve LaTeX.** Ele produz uma Selection JSON, e o template fixo renderiza (`docs/decisoes.md`, decisão 14).
- **Nenhum número sem origem.** Toda Metric tem `origem` e, se estimada, a `ancora`. Todo bullet cita o seu `accomplishment_id`.
- **IDs de modelo e preços:** carregue a skill `claude-api` antes de escolher um modelo ou de escrever a tabela de custo. Nunca de memória.
- **Chamada paga ao modelo** (`simular`, `gerar`, o teste de integração do import): diga o custo estimado antes de rodar. No dia a dia, escolha a assinatura do Claude na Configuração do `MODO=local`.
- **Next.js 16:** confira a documentação da versão instalada antes de usar uma API do framework. Ela mudou em relação ao que o treino conhece.
- Interface e interrogatório em **português**; currículo em **inglês**.

## Comandos

- `npm run dev` / `npm run build` / `npm start`: o app Next.js
- `docker compose up -d db` + `MODO=local npm run dev` (com `docker compose stop app`: o container ocupa a 3000 e usa a API), e em "Configuração", no rodapé, a assinatura do Claude (`claude -p`, logado no host) ou a do ChatGPT (`codex exec`, experimental): o app local sem gastar API (passo 28). A escolha fica no banco e vale também para `simular` e `gerar`. Só no `MODO=local` (no `hospedado`, padrão, a tela dá 404 e o caminho é sempre a API), e as chamadas ficam com "custo não medido" no painel
- `docker compose -f docker-compose.local.yml up`: o self-host (`MODO=local`, migrações na subida), só pela `ANTHROPIC_API_KEY` do `.env`. No `local`, a casa abre em `localhost:3000` sem login; landing, `/entrar` e o OAuth vão para `/casa`, e `/admin` dá 404. Atenção: `MODO=local` no dev também desliga o login
- `npm test`: vitest. Os testes que compilam PDF pulam se faltar Tectonic, Python com `pypdf` ou `pdftotext`; os do banco pulam se não houver Postgres (`docker compose up -d db`). Eles usam o banco `sem_sotaque_test` (ou `TEST_DATABASE_URL`), criado e migrado sozinho
- `npm run typecheck`: `tsc --noEmit`
- `npm run db:migrate`: aplica as migrações de `drizzle/` em `DATABASE_URL` (lê o `.env` se existir). Em dev: `DATABASE_URL=postgres://sem_sotaque:sem_sotaque@localhost:5432/sem_sotaque`
- `npm run token:new -- "<apelido>" --origem "<grupo>" [--indicado-por <token>]`: cria um Tester e imprime o link `APP_URL/s/<token>` (lê o `.env`; sem `APP_URL`, usa `localhost:3000`)
- `npm run db:generate`: gera uma migração SQL nova em `drizzle/` a partir do diff de `src/db/schema.ts`. Revise o SQL e commite junto
- `ANTHROPIC_API_KEY=... npx vitest run src/import/import.integration.test.ts`: o import contra o modelo de verdade (gasta: uma extração por fixture, mais o PDF). Sem a chave, o `npm test` pula esse arquivo
- `npm run simular -- <sabe-os-numeros|nao-sei|uma-palavra> [--turnos N] [--sem-jev]`: uma persona inventada (`scripts/personas.ts`) contra o interrogatório real, no banco de dev; transcrição, checagens e custo em `storage/simulacoes/` (gasta ~US$ 1 por persona)
- `npm run gerar -- <persona> [--sessao <id>] [--de-novo]`: a geração real (seleção, checagens, crítico, reescritas, PDF) na última sessão simulada da persona, no banco de dev; PDF e relatório em `storage/geracoes/` (gasta ~US$ 0,10–0,40 por persona)
- `npx tsx scripts/pdf-de-fixture.ts src/llm/__fixtures__/<x>.txt`: gera o PDF de um fixture inventado com o Tectonic, para o teste "PDF = texto"
- `npm run render:fixture [-- --out x.pdf]`: renderiza a Selection de exemplo e imprime tempo, tamanho e a medida em JSON
- `python scripts/measure-resume.py <selection.json> <resume.pdf> [--json]`: mede um PDF contra as regras de página
- `docker compose build app`: a imagem que vai para produção (aquece o cache do Tectonic no build, ~2 min)
- `docker compose run --rm app npm run render:fixture`: o render dentro do container
- `docker compose up`: app em `localhost:3000` e Postgres 16 em `localhost:5432`
