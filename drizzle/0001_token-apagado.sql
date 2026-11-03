ALTER TABLE "sessoes" ADD COLUMN "token_apagado_sha256" text;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_token_apagado_sha256_unique" UNIQUE("token_apagado_sha256");