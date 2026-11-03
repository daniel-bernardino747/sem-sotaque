-- Step 14, written by hand: the drizzle diff cannot change the primary key of
-- a table with rows. One generation per session becomes one row per
-- generation (a Version), the header the person typed moves to `cabecalhos`,
-- each selection gets its generation, and the Corpus gets `atualizado_em`.

-- The header: one per session, copied from the generation that held it.
CREATE TABLE "cabecalhos" (
	"sessao_id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"linkedin" text NOT NULL,
	"github" text,
	"local" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cabecalhos" ADD CONSTRAINT "cabecalhos_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "cabecalhos" ("sessao_id", "nome", "email", "linkedin", "github", "local", "created_at", "atualizado_em")
	SELECT "sessao_id", "nome", "email", "linkedin", "github", "local", "created_at", "created_at" FROM "geracoes";--> statement-breakpoint

-- The generations: their own id, and the one that exists is version 1.
ALTER TABLE "geracoes" DROP CONSTRAINT "geracoes_pkey";--> statement-breakpoint
ALTER TABLE "geracoes" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "geracoes" ADD PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "geracoes" ADD COLUMN "versao" integer;--> statement-breakpoint
UPDATE "geracoes" SET "versao" = 1;--> statement-breakpoint
ALTER TABLE "geracoes" ALTER COLUMN "versao" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "geracoes_sessao_versao" ON "geracoes" USING btree ("sessao_id","versao");--> statement-breakpoint
ALTER TABLE "geracoes" DROP COLUMN "nome";--> statement-breakpoint
ALTER TABLE "geracoes" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "geracoes" DROP COLUMN "linkedin";--> statement-breakpoint
ALTER TABLE "geracoes" DROP COLUMN "github";--> statement-breakpoint
ALTER TABLE "geracoes" DROP COLUMN "local";--> statement-breakpoint

-- Every attempt so far belongs to its session's one generation.
ALTER TABLE "selections" ADD COLUMN "geracao_id" uuid;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_geracao_id_geracoes_id_fk" FOREIGN KEY ("geracao_id") REFERENCES "public"."geracoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "selections" AS s SET "geracao_id" = g."id" FROM "geracoes" AS g WHERE g."sessao_id" = s."sessao_id";--> statement-breakpoint

-- "Seu Corpus mudou": what is there now counts as changed when it was created,
-- so no session that already has a résumé sees the warning for nothing.
ALTER TABLE "accomplishments" ADD COLUMN "atualizado_em" timestamp with time zone;--> statement-breakpoint
UPDATE "accomplishments" SET "atualizado_em" = "created_at";--> statement-breakpoint
ALTER TABLE "accomplishments" ALTER COLUMN "atualizado_em" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "accomplishments" ALTER COLUMN "atualizado_em" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliations" ADD COLUMN "atualizado_em" timestamp with time zone;--> statement-breakpoint
UPDATE "affiliations" SET "atualizado_em" = "created_at";--> statement-breakpoint
ALTER TABLE "affiliations" ALTER COLUMN "atualizado_em" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "affiliations" ALTER COLUMN "atualizado_em" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "metrics" ADD COLUMN "atualizado_em" timestamp with time zone;--> statement-breakpoint
UPDATE "metrics" SET "atualizado_em" = "created_at";--> statement-breakpoint
ALTER TABLE "metrics" ALTER COLUMN "atualizado_em" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "metrics" ALTER COLUMN "atualizado_em" SET NOT NULL;
