# 01: Fundação (app, render e Docker)

## Objetivo

Um app Next.js 16 + TypeScript que renderiza uma Selection de exemplo em PDF **dentro do container Docker** (o mesmo que vai para o Railway), e mede esse PDF com o `measure-resume.py`.

## Ler antes

- `CLAUDE.md`, `docs/decisoes.md` (decisão 13)
- `../career/src/render/document.ts` e `../career/src/render/resume.ts`: o render (Selection → LaTeX → Tectonic). O módulo foi feito autossuficiente de propósito: depende só da Selection, nunca do loader do Corpus
- `../career/src/render/resume.test.ts` e `../career/src/render/__fixtures__/sample-selection.json`
- `../career/scripts/measure-resume.py`: página, preenchimento, linhas por bullet, órfãs (usa `pdftotext -layout` e `pypdf`)
- `../personal-website/package.json` e o `Dockerfile` de lá, como referência de versão e de imagem

## Fazer

1. Criar o app Next.js 16 (App Router, TypeScript, sem Tailwind obrigatório: decida pelo mais simples) com `vitest`. Use a mesma versão de Next do `personal-website`.
2. Copiar para `src/render/`: `document.ts`, `resume.ts`, `resume.test.ts` e a fixture `sample-selection.json`. **Não** copiar `letter.ts`, `weight-check.ts` (depende de Weight do Daniel) nem nada de `src/corpus/` e `src/resume/`. Ajustar imports. A nota de licença Apache-2.0 do template (Celio B Junior) fica.
3. Copiar `measure-resume.py` para `scripts/` e ajustar os caminhos padrão: ele recebe a Selection e o PDF por argumento, sem depender de `generated/`. Ele precisa sair com JSON (flag `--json`) para o pipeline do passo 06 ler: páginas, preenchimento %, linhas por bullet por grupo, órfãs, violações.
4. `src/render/index.ts`: uma função `renderResume(selection) → { pdf: Buffer, medida }` que escreve num diretório temporário, compila com Tectonic, roda o `measure-resume.py --json` e apaga o temporário. Nada fica em disco.
5. `Dockerfile` multi-stage: Node (LTS) + Tectonic + `poppler-utils` (pdftotext) + Python 3 com `pypdf`. **Aquecer o cache do Tectonic no build**, compilando a fixture uma vez, para que o primeiro render em produção não baixe pacotes nem fontes (o template usa `lmroman10` via `fontspec`).
6. `docker-compose.yml` para desenvolvimento: o app e um Postgres 16 (o banco é usado a partir do passo 02).
7. `.env.example` com as variáveis previstas: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN`, `APP_URL`.
8. Preencher "Comandos" no `CLAUDE.md`.

## Fora do escopo

Banco, LLM, telas, autenticação.

## Pronto quando

- [x] `npm test` passa, incluindo os testes de render copiados. Fora do container, eles podem pular se não houver Tectonic, como no `career`
- [x] `docker compose run app npm run render:fixture` gera o PDF da fixture e imprime a medida em JSON
- [x] Um segundo render dentro de um container recém-criado da mesma imagem não baixa nada (cache aquecido) e leva poucos segundos. Anote o tempo
- [x] `npm run build` passa

## Notas de implementação

- **Next 16.1.6** (a do `personal-website`), App Router, sem Tailwind: só `src/app/layout.tsx` e uma `page.tsx` placeholder. O `node_modules/next` dessa versão não traz `dist/docs`; nada de API do framework foi usado além do `next.config.ts` vazio.
- **Sem `output: 'standalone'`**: a imagem roda `npm start` sobre o build completo, porque a mesma imagem precisa do `tsx` para `npm run render:fixture`. Imagem maior, um caminho só. Rever no passo 09 se o tamanho pesar.
- **`renderResume(selection)`** (`src/render/index.ts`) devolve `{ pdf: Buffer, medida }`. `medida` tem `pages`, `fill` (%), `groups` (`{ section, group, lines[] }`), `orphans` (`{ group, source, line }`) e `problems` (strings). Regra de página quebrada **não** é erro: vem em `problems`. Erro (`RenderError`) é Selection malformada (antes de escrever qualquer coisa), Tectonic falhando ou medida que não roda. O temporário (`sem-sotaque-render-*`) é apagado no `finally`.
- **`measure-resume.py`** agora recebe `<selection.json> <resume.pdf>` por posição. Com `--json` imprime um objeto e sai 0 mesmo com violações (é dado para o pipeline); sem `--json`, o relatório humano e saída 1 se houver violação, como no `career`.
- Python: `PYTHON` (padrão `python3`; `python` no Windows) pode ser sobrescrito por env. O script é `scripts/measure-resume.py` a partir do cwd (raiz do repo em dev, `/app` na imagem). A saída do script é validada com zod (`medidaSchema`): se o formato mudar, o render lança `RenderError` em vez de passar um objeto torto.
- `.gitattributes` força LF: o `Dockerfile` e o `.py` vão para Linux, e o checkout no Windows os trocaria para CRLF.
- `pdftotext -v` sai com código 99 de propósito; `isMeasureAvailable` só considera ausente quando o binário não existe.
- **Tectonic 0.16.9**, o mesmo da máquina do Daniel, binário musl da release do GitHub. O fixture dá `fill 42.3%` local e no container: as quebras de linha batem. Trocar a versão pode mexer nas quebras, que é o que a medida lê.
- **Cache**: `TECTONIC_CACHE_DIR=/app/.cache/tectonic`, dono `node`. O `RUN npm run render:fixture` no build baixa tudo (~125 s no build).
- **Tempo do segundo render** num container novo, com `--network none` (prova de que nada é baixado): 4,1 s a 8,0 s no Docker Desktop do Windows (inclui o boot do `tsx`). Local no Windows: ~5,5 s.
- O `docker-compose.yml` não monta o código: o app roda o que está na imagem. Para desenvolver, `npm run dev` no host e `docker compose up db`.

## Achados

- `renderResume` valida a Selection e o `renderSelectionToPdf` copiado valida de novo. Redundante e barato; ficou para não mexer no módulo copiado.
- As mensagens de `problems` e de `RenderError` estão em inglês. Servem ao desenvolvedor; se o painel (passo 08) for mostrar `problems`, traduzir ou mapear.

- `compileTex` (copiado do `career`) usa `execFileSync`: um render bloqueia o event loop do servidor por alguns segundos. Aceitável para o v0 com poucos testers; se o passo 06 rodar render dentro de uma request concorrente, vale trocar por `execFile` assíncrono.
- O campo de rastreio do bullet na Selection se chama `source`, enquanto o `CLAUDE.md` fala em `accomplishment_id`. O passo 06 decide se renomeia (e sobe `SELECTION_VERSION`) ou se só documenta que `source` é o `accomplishment_id`.
- O npm 11 avisa que `esbuild` e `sharp` têm install scripts não aprovados (`allowScripts`). Não quebrou nada (o `tsx` roda, o build passa), mas pode valer `npm approve-scripts` antes do deploy.
