CREATE TYPE "public"."origem_erro" AS ENUM('servidor', 'navegador');--> statement-breakpoint
CREATE TABLE "erros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid,
	"origem" "origem_erro" NOT NULL,
	"onde" text NOT NULL,
	"classe" text NOT NULL,
	"codigo" text,
	"digest" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renders" ADD COLUMN "duracao_ms" integer;--> statement-breakpoint
ALTER TABLE "erros" ADD CONSTRAINT "erros_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "erros_created_at" ON "erros" USING btree ("created_at");