CREATE TYPE "public"."estagio_vaga" AS ENUM('lendo', 'leitura_falhou', 'lida', 'confirmada');--> statement-breakpoint
CREATE TYPE "public"."lingua_vaga" AS ENUM('en', 'pt', 'outra');--> statement-breakpoint
CREATE TYPE "public"."resposta_lacuna" AS ENUM('ja_usei', 'nao_usei');--> statement-breakpoint
CREATE TYPE "public"."status_candidatura" AS ENUM('preparando', 'enviei', 'em_entrevista', 'proposta', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."tipo_requisito" AS ENUM('obrigatorio', 'desejavel');--> statement-breakpoint
ALTER TYPE "public"."etapa_llm" ADD VALUE 'leitura_vaga';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'vaga_criada';--> statement-breakpoint
ALTER TYPE "public"."tipo_evento" ADD VALUE 'vaga_apagada';--> statement-breakpoint
CREATE TABLE "requisitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaga_id" uuid NOT NULL,
	"sessao_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"tipo" "tipo_requisito" NOT NULL,
	"accomplishment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"lacuna" boolean NOT NULL,
	"resposta" "resposta_lacuna",
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vagas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"texto" text,
	"empresa" text,
	"cargo" text,
	"link" text,
	"senioridade" text,
	"lingua" "lingua_vaga",
	"estagio" "estagio_vaga" DEFAULT 'lendo' NOT NULL,
	"candidatura" "status_candidatura" DEFAULT 'preparando' NOT NULL,
	"rascunhos" jsonb,
	"apagada_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chamadas_llm" ADD COLUMN "vaga_id" uuid;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "limite_vagas" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "vagas_consentiu_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "recusou_vagas_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "vagas_liberadas_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requisitos" ADD CONSTRAINT "requisitos_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitos" ADD CONSTRAINT "requisitos_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamadas_llm" ADD CONSTRAINT "chamadas_llm_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE no action ON UPDATE no action;