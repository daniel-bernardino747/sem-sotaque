CREATE TYPE "public"."forca" AS ENUM('forte', 'medio', 'fraco');--> statement-breakpoint
CREATE TYPE "public"."tipo_affiliation" AS ENUM('emprego', 'graduacao', 'tecnico', 'ensino_medio', 'curso_livre');--> statement-breakpoint
ALTER TYPE "public"."etapa_llm" ADD VALUE 'avaliador';--> statement-breakpoint
CREATE TABLE "decisoes_avaliador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"gatilho" text NOT NULL,
	"assunto" jsonb,
	"decisao" text NOT NULL,
	"motivo" text NOT NULL,
	"cobertura" integer,
	"proximo" jsonb,
	"backend" text NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plano" (
	"sessao_id" uuid PRIMARY KEY NOT NULL,
	"assunto" jsonb,
	"fila" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anotacoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visitados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cobertura" integer DEFAULT 0 NOT NULL,
	"oferta_feita" boolean DEFAULT false NOT NULL,
	"ultimo_checkpoint" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accomplishments" ADD COLUMN "forca" "forca";--> statement-breakpoint
ALTER TABLE "accomplishments" ADD COLUMN "adiado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accomplishments" ADD COLUMN "adiado_voltou" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliations" ADD COLUMN "tipo" "tipo_affiliation" DEFAULT 'emprego' NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliations" ADD COLUMN "ano_conclusao" integer;--> statement-breakpoint
ALTER TABLE "affiliations" ADD COLUMN "cursando" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "recusou_avaliador_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decisoes_avaliador" ADD CONSTRAINT "decisoes_avaliador_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plano" ADD CONSTRAINT "plano_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;