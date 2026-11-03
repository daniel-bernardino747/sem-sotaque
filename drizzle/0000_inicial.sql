CREATE TYPE "public"."estado_sessao" AS ENUM('novo', 'consentiu', 'importou', 'interrogando', 'gerando', 'pronto', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."etapa_llm" AS ENUM('import', 'interrogatorio', 'selecao', 'critico', 'reescrita');--> statement-breakpoint
CREATE TYPE "public"."formato_importacao" AS ENUM('pdf', 'texto', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."importancia" AS ENUM('alta', 'normal', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."origem_metric" AS ENUM('afirmado', 'estimado', 'qualitativo');--> statement-breakpoint
CREATE TYPE "public"."pagaria" AS ENUM('sim', 'nao', 'talvez');--> statement-breakpoint
CREATE TYPE "public"."papel_mensagem" AS ENUM('assistente', 'pessoa', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."tipo_accomplishment" AS ENUM('engineering', 'project', 'education', 'talk', 'open-source', 'writing');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento" AS ENUM('link_aberto', 'consentiu', 'importou', 'primeira_resposta', 'nao_sei', 'pulou', 'terminou', 'pdf_gerado', 'pdf_baixado', 'fundador', 'indicou', 'apagou');--> statement-breakpoint
CREATE TABLE "accomplishments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"affiliation_id" uuid,
	"tipo" "tipo_accomplishment" NOT NULL,
	"enunciado" text NOT NULL,
	"importancia_para_pessoa" "importancia",
	"data" text,
	"pulado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accomplishments_data_mes" CHECK (data ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"organizacao" text NOT NULL,
	"cargo" text NOT NULL,
	"periodo_inicio" text,
	"periodo_fim" text,
	"stack" text[] DEFAULT '{}'::text[] NOT NULL,
	"confidencial" boolean DEFAULT false NOT NULL,
	"descricao_publica" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliations_periodo_inicio_mes" CHECK (periodo_inicio ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "affiliations_periodo_fim_mes" CHECK (periodo_fim ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "affiliations_confidencial_tem_descricao" CHECK (not "affiliations"."confidencial" or coalesce(btrim("affiliations"."descricao_publica"), '') <> '')
);
--> statement-breakpoint
CREATE TABLE "chamadas_llm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid,
	"etapa" "etapa_llm" NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"tokens_cache_leitura" integer DEFAULT 0 NOT NULL,
	"tokens_cache_escrita" integer DEFAULT 0 NOT NULL,
	"custo_usd" numeric(12, 6) NOT NULL,
	"duracao_ms" integer NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"tipo" "tipo_evento" NOT NULL,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fechamento" (
	"sessao_id" uuid PRIMARY KEY NOT NULL,
	"fundador" boolean DEFAULT false NOT NULL,
	"email" text,
	"whatsapp" text,
	"pagaria" "pagaria",
	"pagaria_quanto" text,
	"depoimento" text,
	"depoimento_pode_usar" boolean DEFAULT false NOT NULL,
	"comentario" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"formato" "formato_importacao" NOT NULL,
	"texto_extraido" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"contato" text NOT NULL,
	"virou_tester_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linhas_originais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"affiliation_id" uuid,
	"accomplishment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"papel" "papel_mensagem" NOT NULL,
	"conteudo" text NOT NULL,
	"accomplishment_id" uuid,
	"latencia_ms" integer,
	"marcadores" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accomplishment_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"valores" numeric[] DEFAULT '{}'::numeric[] NOT NULL,
	"origem" "origem_metric" NOT NULL,
	"ancora" text,
	"confirmado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_estimado_tem_ancora" CHECK ("metrics"."origem" <> 'estimado' or "metrics"."ancora" is not null)
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"selection_id" uuid NOT NULL,
	"pdf" "bytea" NOT NULL,
	"medida" jsonb NOT NULL,
	"baixado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"json" jsonb NOT NULL,
	"tentativa" integer DEFAULT 1 NOT NULL,
	"violacoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aprovada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tester_id" uuid,
	"estado" "estado_sessao" DEFAULT 'novo' NOT NULL,
	"consentiu_em" timestamp with time zone,
	"texto_consentimento_versao" text,
	"terminou_interrogatorio_em" timestamp with time zone,
	"apagada_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessoes_tester_id_unique" UNIQUE("tester_id"),
	CONSTRAINT "sessoes_tester_ate_apagar" CHECK ("sessoes"."tester_id" is not null or "sessoes"."apagada_em" is not null)
);
--> statement-breakpoint
CREATE TABLE "testers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"apelido" text NOT NULL,
	"origem" text NOT NULL,
	"indicado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "accomplishments" ADD CONSTRAINT "accomplishments_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accomplishments" ADD CONSTRAINT "accomplishments_affiliation_id_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "public"."affiliations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamadas_llm" ADD CONSTRAINT "chamadas_llm_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fechamento" ADD CONSTRAINT "fechamento_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicacoes" ADD CONSTRAINT "indicacoes_virou_tester_id_testers_id_fk" FOREIGN KEY ("virou_tester_id") REFERENCES "public"."testers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_originais" ADD CONSTRAINT "linhas_originais_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_originais" ADD CONSTRAINT "linhas_originais_affiliation_id_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "public"."affiliations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_originais" ADD CONSTRAINT "linhas_originais_accomplishment_id_accomplishments_id_fk" FOREIGN KEY ("accomplishment_id") REFERENCES "public"."accomplishments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_accomplishment_id_accomplishments_id_fk" FOREIGN KEY ("accomplishment_id") REFERENCES "public"."accomplishments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_accomplishment_id_accomplishments_id_fk" FOREIGN KEY ("accomplishment_id") REFERENCES "public"."accomplishments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_selection_id_selections_id_fk" FOREIGN KEY ("selection_id") REFERENCES "public"."selections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_sessao_id_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_tester_id_testers_id_fk" FOREIGN KEY ("tester_id") REFERENCES "public"."testers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testers" ADD CONSTRAINT "testers_indicado_por_testers_id_fk" FOREIGN KEY ("indicado_por") REFERENCES "public"."testers"("id") ON DELETE set null ON UPDATE no action;