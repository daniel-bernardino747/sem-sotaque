CREATE TABLE "geracoes" (
	"sessao_id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"linkedin" text NOT NULL,
	"github" text,
	"local" text NOT NULL,
	"etapa" text,
	"iniciada_em" timestamp with time zone,
	"terminada_em" timestamp with time zone,
	"erro" text,
	"revisar" boolean DEFAULT false NOT NULL,
	"selection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geracoes" ADD CONSTRAINT "geracoes_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geracoes" ADD CONSTRAINT "geracoes_selection_id_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."selections"("id") ON DELETE set null ON UPDATE no action;