# Bullets: worked pairs

Adapted from `references/bullets.md` of Daniel's `career`. **Every company, person and number here is invented**: these show the shape, never facts to copy.

## The anchor shape

An engineering verb + the system, named by what it does and for whom + where it came from and where it went + the result.

> Rebuilt the seat-allocation engine of a ticketing platform selling ~2 million concert tickets a year, from a single Ruby process into sharded Elixir workers, cutting checkout failures at on-sale peaks from 6% to under 1%.

The verb owns the system; "a ticketing platform selling ~2 million concert tickets a year" says what the employer is; "from → to" is the story; the number closes it.

## Pairs

### A hedge in the verb's place

- **Bad:** Led, while coding, the migration of the scheduling system of a dental clinic network from a desktop app to the web.
- **Good:** Migrated the scheduling system of a dental clinic network with 40 units from a Visual Basic desktop app to a Django and Vue web app.
- **Rule:** leading and coding is owning; scope lives in the object, never in a hedge.

### A verbless result tail

- **Bad:** Rewrote the chargeback rules, alone, with a device fingerprint check: ~R$80k, first quarter.
- **Good:** Blocked ~R$80k of chargebacks in the first quarter with a device fingerprint check the old rules lacked.
- **Rule:** the verb names the result; "alone" is a hedge; a number with no verb reads as nonsense.

### A task opening where a result exists

- **Bad:** Implemented a retry queue for the label printer API, ending lost labels (~12 a week to 0).
- **Good:** Ended lost shipping labels (~12 a week to 0) by putting a retry queue in front of the carrier's label API.
- **Rule:** when the record has a result, the verb is the result; the task is the how.

### A number the record does not hold

- **Bad:** Cut the import time by 89% by moving it to streaming.
- **Good:** Cut the nightly import from 6 hours to 40 minutes by streaming rows instead of loading the whole file.
- **Rule:** 89% is a computation; the record says 6 hours and 40 minutes. Only the record's numbers, as said.

### A count of parts as the result

- **Bad:** Delivered 9 of the 10 modules of the gym's member app in ~10 weeks.
- **Good:** Built the class booking and the waitlist of a gym chain's member app, which frees a spot the moment someone cancels.
- **Rule:** how much was typed is not what it changed; name the parts that were hard.

### An estimate's author on the page

- **Bad:** Cut invoice entry from ~3 min (the client's estimate) to 20 s per invoice.
- **Good:** Cut invoice entry from ~3 min to 20 s per invoice.
- **Rule:** the `~` says it is approximate; who estimated it is an interview answer.

### A client told by its age

- **Bad:** … for a 60-year-old furniture maker.
- **Good:** … for one of Brazil's three largest office-furniture makers.
- **Rule:** the client's weight is why the work matters; its age is the weakest fact.

### A compound title

- **Bad:** Senior Software Engineer & Team Manager
- **Good:** Software Engineer
- **Rule:** no seniority and no management on an engineering résumé.

### A stack line sorted by keyword

- **Bad:** TypeScript, Node.js, React, Jest, AWS, Express, PostgreSQL, Python.
- **Good:** TypeScript, React, Node.js, Express, Python, PostgreSQL, Jest, AWS.
- **Rule:** language → front end → back end → data → tests → delivery and infra.

### A qualitative result told as a number

- **Bad:** Improved the ordering page's usability by 50%.
- **Good:** Stopped phone calls asking whether a bakery chain was open by adding live opening hours to its ordering page.
- **Rule:** when the record has no number, the concrete result is the claim; never invent a figure.
