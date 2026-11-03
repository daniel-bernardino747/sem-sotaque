CREATE TYPE "public"."provedor" AS ENUM('github', 'google');--> statement-breakpoint
CREATE TABLE "acessos" (
	"token_sha256" text PRIMARY KEY NOT NULL,
	"conta_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" "provedor" NOT NULL,
	"id_no_provedor" text NOT NULL,
	"email" text,
	"nome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_provedor_id_no_provedor" UNIQUE("provedor","id_no_provedor")
);
--> statement-breakpoint
ALTER TABLE "testers" ADD COLUMN "conta_id" uuid;--> statement-breakpoint
ALTER TABLE "acessos" ADD CONSTRAINT "acessos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testers" ADD CONSTRAINT "testers_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testers" ADD CONSTRAINT "testers_conta_id_unique" UNIQUE("conta_id");