CREATE TYPE "public"."caminho_modelo" AS ENUM('api', 'assinatura_claude', 'assinatura_chatgpt');--> statement-breakpoint
CREATE TABLE "configuracao" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"caminho_modelo" "caminho_modelo" DEFAULT 'api' NOT NULL,
	"modelo_codex" text,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracao_uma_linha" CHECK ("configuracao"."id")
);
