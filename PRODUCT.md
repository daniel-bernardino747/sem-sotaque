# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dev brasileiro, pleno ou sênior, que quer vaga internacional em inglês. Recebe um link pessoal pelo WhatsApp e abre quase sempre no celular. Desconfia de "IA que escreve currículo" e vai entregar dados da própria carreira. No v0 é um Tester, sem login, com uma Sessão por link.

O Daniel (autor) é o segundo usuário: lê sessões, transcrições, PDFs e o funil num painel, no notebook.

## Product Purpose

Tirar o "sotaque brasileiro" do currículo. A pessoa importa o currículo atual, passa por um interrogatório em chat, em português, de 20 a 40 minutos, e recebe um currículo em inglês, em PDF, com o "antes × depois" de cada linha.

## Positioning

Não é "IA que escreve currículo". É um interrogatório que nunca inventa número ("20% de quê?"): todo número do currículo é algo que a pessoa afirmou ou estimou por uma âncora e consegue defender na entrevista, mais as regras de redação aprendidas na marra (`docs/regras-de-redacao.md`).

## Operating Context

- Entrada por link com token (`/s/<token>`), vindo do WhatsApp; a pessoa pode sair e voltar pelo mesmo link e cai onde parou.
- Fluxo: consentimento LGPD → envio do currículo (PDF ou texto) → rascunho do que foi lido → interrogatório (uma pergunta por vez, cobertura em %, pular, terminei) → cabeçalho do currículo → espera da geração → resultado (PDF + antes × depois) → fim (preço de fundador, indicação, opinião).
- "Apagar meus dados" disponível em toda tela, em dois passos.
- Uso longo no celular, com o teclado aberto boa parte do tempo.

## Capabilities and Constraints

- Next.js 16.1.6, CSS puro com custom properties em `src/app/globals.css`; sem Tailwind e sem lib de componentes.
- Mudanças de design não alteram lógica, server actions, rotas nem fluxo.
- O PDF do currículo é um template LaTeX fixo, fora do escopo de design.
- Interface e interrogatório em português; currículo em inglês.
- Vocabulário em `CONTEXT.md` (Tester, Sessão, Corpus, Accomplishment, Metric, Âncora, Cobertura, Linha Original...).
- Mudança de texto segue `docs/regras-de-redacao.md` e é aprovada pelo Daniel antes.

## Brand Commitments

- Nome provisório "sem-sotaque", usado como wordmark nas telas do Tester (o nome final está em aberto; trocá-lo deve ser barato).
- A voz é do Daniel, em primeira pessoa: um mentor técnico direto que leu tudo, não uma startup animada. O produto assume um autor humano visível.
- Proibido: gradiente roxo, glassmorphism, emoji, visual genérico de SaaS de IA.

## Evidence on Hand

- Texto de consentimento versionado em `src/conteudo/consentimento-v*.md`.
- Sessões simuladas com personas inventadas no banco de dev (`npm run simular`, `npm run gerar`).
- Não há depoimentos, clientes nem números de resultado reais para mostrar; nada disso pode ser inventado. Dados de tester nunca vão para material visual.

## Product Principles

1. Seriedade antes de encanto: privacidade e consentimento são legíveis e verificáveis, não letra miúda.
2. Todo número tem origem: a interface mostra de onde vem cada coisa, nunca a enfeita.
3. Uma coisa por vez: a pergunta atual é o conteúdo da tela.
4. O "antes × depois" é a prova do produto.
5. Nada no caminho de quem tem pressa: o PDF e o apagar estão sempre a um toque.

## Accessibility & Inclusion

Contraste WCAG AA em claro e escuro (`prefers-color-scheme`); alvos de toque ≥ 44px; mobile first a partir de 360px; `prefers-reduced-motion` respeitado.
