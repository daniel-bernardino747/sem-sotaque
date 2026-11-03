# The rules of the page

Ported from Daniel's `career` system (the `generate` skill and `references/bullets.md`) and `docs/regras-de-redacao.md`. The résumé is for an **international software engineering role**: a general résumé, or, when a job posting is given, one aimed at it (its rules come after these, and never loosen them). The reader is a tech recruiter abroad who knows nothing of the person's world (not the employer, not the client, not the internal system, not the country) and who stops reading at the first dull or unclear line.

## The rule above all: nothing that is not in the Corpus

- Every bullet tells **one** Accomplishment and cites it in `source`. Compress and rephrase; never add a figure, a technology or a claim the record does not carry.
- **Every number in a bullet is a number of that record's Metrics**, as the person said it. Never compute one (no "90% faster" from "4 hours to 25 minutes"), never round, never borrow a number from another record or from the statement. Years of experience, team sizes and dates are not Metrics: they stay out unless a Metric of that record holds them. A code check refuses any other number.
- An estimate keeps its `~` and **never says who estimated it** ("my estimate", "the client's estimate", "according to"). A number the person stated (`afirmado`) has no `~`, unless the Metric itself writes one.
- A **qualitative** result (a concrete result with no number) only fills: it goes after every bullet with a number in its group, or in Projects.
- A record with no Metric is a draft and never becomes a bullet. The one exception is a `project` record in the Projects section: its line says only what the record says it is and what it is built with, with no number and no outcome.
- How compression turns into fabrication, quietly. Check every line against these:
  - **Widening the attribution.** The record's scope is the person's scope. If a colleague owned a part, the line names the part the person built. But leading and coding is owning: when the person led the team that built a system and coded on it, the line takes the system's verb ("Rebuilt", "Migrated").
  - **Upgrading a word.** "Active" is not "daily use"; "reduced" is not "eliminated". Translate the word the record uses, not a stronger one.
  - **Fusing clauses** the record keeps apart, or crediting a result with several causes to one of them.
  - **Merging records** into one claim, above all in the summary, which has no `source`.
  - **Crediting a record with another's stack.** A technology in a line is in that line's record (or its Affiliation's stack, for the stack line).
  - **Explaining a name from general knowledge.** The explanation of a company or client is a fact too: it comes from the Affiliation's public description or the record, never from what you know of the world.

## The bullet

- **A story, not a task: STAR, opened by a past-tense verb that names the result**, then the number, then the shortest how. "Cut nightly reconciliation from 4 hours to 25 minutes by rewriting it as parallel batches in Go", not "Worked on the reconciliation job".
- **The first bullet of each group is the strongest, a scope anchor:** an engineering verb, the system named by what it does and for whom, where it came from and where it went, and the result.
- **What only this person did.** "Built the front end and the back end", "developed a CRUD", "created REST APIs": every developer has. Name what made the work different (the constraint, the hard part, the decision, the domain) as the record tells it.
- **No name without its meaning.** An employer, a client, an internal system or an acronym means nothing abroad: say what it is, for whom, and how large, as the Corpus says. A client is described by its weight (market share, ranking, reach), never by its age.
- **No hedge in the verb's place:** never "helped to", "assisted", "contributed to", "worked on", "was responsible for", "while coding", "single-handedly", "alone", "as part of a team". The scope lives in the object ("Built the billing API of…"), never in a qualifier.
- **No adjective without what is behind it:** "mission-critical", "robust", "complex", "high-performance", "cutting-edge", "seamless". Say what the record says is behind the word, or drop it.
- **A count of parts is never the result:** "9 of 10 modules", "30 screens", "12 endpoints" say how much was typed, not what it changed.
- **One bullet, one story.** A record gives at most one bullet; two bullets never tell one product. No bullet opens with a bold product label: the sentence tells the product.
- **The record is the scenario; the bullet is one fact of it.** Keep the verb, one number and the shortest how. Two lines per bullet; at most two bullets per group may take three; none takes four. To shorten, rewrite from the STAR skeleton; never shave words until it fits.
- **Engineering only.** A record about managing people stays out; personal qualities and soft skills stay off the page. A tool appears in a bullet only as part of the action; the rest goes to the stack line.
- **Name the engineering pattern** the record carries (batched writes, idempotency keys, a cache in front of the read path, a test gate in CI), not only the result.

## The page

- **Sections: Experience, then Projects (only when Experience and Education leave the page short), then Education, last.** No other section: no skills or "competências" section, no volunteering, no languages.
- **Group by Affiliation:** every bullet of one employer goes under one group, most recent employer first. Within a group, the person's most important records first (the `importância` they gave), qualitative results last.
- **At least three bullets per Experience group** (the stack line does not count), when the Corpus has them. When an Affiliation has fewer records with a result, it has fewer bullets: never invent, never split one record into two.
- **One full page** (97–100% of the usable area), filled with more short bullets from records not yet used, never with longer bullets. When the page spills, cut Projects first, then the least important records. When the Corpus is thin, the page is shorter: **never fill it with prose or invention.**
- **Roles:** the role in English, engineering only. **Never "Manager"** or management, and **no seniority word** ("Junior", "Mid-Level", "Pleno", "Senior", "Staff", "Lead" as a level) in a role, the header headline or the summary. Cut a word from the title; never upgrade or invent one.
- **No availability** anywhere: not remote, not contract, not PJ, not hours, not time zone, not "open to".
- **A confidential Affiliation is never named**, nor any distinctive word of its name: its public description takes the name's place, translated to English.
- **The stack line** closes each Experience group: the technologies of that group's bullets, each present in one of their records or in the Affiliation's stack, no duplicates ("Postgres" and "PostgreSQL"), no vague words ("AI", "Cloud"), **ordered as a request flows**: language → front end → back end → data → tests → delivery and infra. A language used in one layer only sits in that layer.
- The summary is optional: one line of positioning that every record supports, or nothing. It never merges records and never carries a number a Metric does not hold.
