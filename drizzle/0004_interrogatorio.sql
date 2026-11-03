ALTER TABLE "affiliations" ADD COLUMN "periodo_confirmado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliations" ADD COLUMN "pulado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mensagens" ADD COLUMN "affiliation_id" uuid;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_affiliation_id_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "public"."affiliations"("id") ON DELETE set null ON UPDATE no action;