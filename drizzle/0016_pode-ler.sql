ALTER TABLE "sessoes" ADD COLUMN "pode_ler_em" timestamp with time zone;--> statement-breakpoint
-- Consent v1 and v2 said Daniel reads everything (step 22): those sessions stay readable, from when they accepted.
UPDATE "sessoes" SET "pode_ler_em" = "consentiu_em" WHERE "texto_consentimento_versao" IN ('v1', 'v2') AND "apagada_em" IS NULL;
