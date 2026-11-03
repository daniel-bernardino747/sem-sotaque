-- The plan of the general conversation keeps its row (vaga_id null); each Vaga gets its own (step 16).
ALTER TABLE "plano" DROP CONSTRAINT "plano_pkey";--> statement-breakpoint
ALTER TABLE "decisoes_avaliador" ADD COLUMN "vaga_id" uuid;--> statement-breakpoint
ALTER TABLE "mensagens" ADD COLUMN "vaga_id" uuid;--> statement-breakpoint
ALTER TABLE "plano" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "plano" ADD COLUMN "vaga_id" uuid;--> statement-breakpoint
ALTER TABLE "decisoes_avaliador" ADD CONSTRAINT "decisoes_avaliador_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano" ADD CONSTRAINT "plano_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano" ADD CONSTRAINT "plano_sessao_vaga" UNIQUE NULLS NOT DISTINCT("sessao_id","vaga_id");