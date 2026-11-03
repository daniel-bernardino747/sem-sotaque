-- A Vaga's résumé (step 17): its Versions are numbered per Vaga, the general résumé's per session (vaga_id null).
ALTER TYPE "public"."etapa_llm" ADD VALUE 'mapa_vaga';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'vaga_gerada';--> statement-breakpoint
DROP INDEX "geracoes_sessao_versao";--> statement-breakpoint
ALTER TABLE "geracoes" ADD COLUMN "vaga_id" uuid;--> statement-breakpoint
ALTER TABLE "geracoes" ADD COLUMN "mapa" jsonb;--> statement-breakpoint
ALTER TABLE "geracoes" ADD COLUMN "perguntas_entrevista" jsonb;--> statement-breakpoint
ALTER TABLE "geracoes" ADD CONSTRAINT "geracoes_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geracoes" ADD CONSTRAINT "geracoes_sessao_vaga_versao" UNIQUE NULLS NOT DISTINCT("sessao_id","vaga_id","versao");