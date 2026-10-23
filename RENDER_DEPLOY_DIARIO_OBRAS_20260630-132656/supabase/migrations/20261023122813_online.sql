CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
CREATE TABLE app.users (
 id uuid PRIMARY KEY, auth_user_id uuid UNIQUE, email text NOT NULL UNIQUE CHECK(email=lower(email)),
 nome text NOT NULL, cargo text NOT NULL DEFAULT '', is_admin boolean NOT NULL DEFAULT false,
 ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','blocked')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.profiles (
 id text PRIMARY KEY,label text NOT NULL,tabs jsonb NOT NULL DEFAULT '[]',
 editable_tabs jsonb NOT NULL DEFAULT '[]',dashboard_widgets jsonb NOT NULL DEFAULT '[]',
 can_delete_history boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1
);
CREATE TABLE app.obras (
 id uuid PRIMARY KEY,codigo text NOT NULL UNIQUE,nome text NOT NULL CHECK(length(trim(nome))>0),
 cliente text NOT NULL DEFAULT '',local text NOT NULL DEFAULT '',responsavel text NOT NULL DEFAULT '',prazo text NOT NULL DEFAULT '',
 archived boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.memberships (
 user_id uuid NOT NULL REFERENCES app.users(id),obra_id uuid NOT NULL REFERENCES app.obras(id),
 perfil text NOT NULL REFERENCES app.profiles(id),PRIMARY KEY(user_id,obra_id)
);
CREATE INDEX memberships_obra_idx ON app.memberships(obra_id);
CREATE TABLE app.profissionais (
 id uuid PRIMARY KEY,obra_id uuid NOT NULL REFERENCES app.obras(id),payload jsonb NOT NULL DEFAULT '{}',
 ativo boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1 CHECK(version>0),UNIQUE(id,obra_id)
);
CREATE INDEX profissionais_obra_idx ON app.profissionais(obra_id);
CREATE TABLE app.afastamentos (
 id uuid PRIMARY KEY,obra_id uuid NOT NULL REFERENCES app.obras(id),profissional_id uuid NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1 CHECK(version>0),
 FOREIGN KEY(profissional_id,obra_id) REFERENCES app.profissionais(id,obra_id)
);
CREATE INDEX afastamentos_obra_idx ON app.afastamentos(obra_id);
CREATE TABLE app.orcamento_itens (
 id uuid PRIMARY KEY,obra_id uuid NOT NULL REFERENCES app.obras(id),referencia text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1 CHECK(version>0),UNIQUE(obra_id,referencia)
);
CREATE TABLE app.diarios (
 id uuid PRIMARY KEY,obra_id uuid NOT NULL REFERENCES app.obras(id),data date NOT NULL,
 status text NOT NULL DEFAULT 'rascunho' CHECK(status IN('rascunho','registrado')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),payload jsonb NOT NULL DEFAULT '{}',summary jsonb NOT NULL DEFAULT '{}',
 created_by uuid REFERENCES app.users(id),updated_by uuid REFERENCES app.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz,
 UNIQUE(obra_id,data)
);
CREATE TABLE app.diario_revisoes (
 id uuid PRIMARY KEY,diario_id uuid NOT NULL REFERENCES app.diarios(id),version integer NOT NULL,
 mutation_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES app.users(id),input_hash text NOT NULL,
 content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(diario_id,mutation_id),UNIQUE(diario_id,version)
);
CREATE TABLE app.audit (
 id uuid PRIMARY KEY,actor_id uuid REFERENCES app.users(id),entity text NOT NULL,entity_id text NOT NULL,
 operation text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON app.audit(entity,entity_id,created_at);
CREATE TABLE app.sessions (
 hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES app.users(id),tokens_encrypted text NOT NULL,csrf_token text NOT NULL,
 purpose text NOT NULL DEFAULT 'normal' CHECK(purpose IN('normal','setup')),
 created_at timestamptz NOT NULL,last_seen timestamptz NOT NULL,expires_at timestamptz NOT NULL,absolute_expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON app.sessions(user_id);
CREATE INDEX sessions_expiry_idx ON app.sessions(expires_at);
CREATE TABLE app.auth_limits (key text PRIMARY KEY,count integer NOT NULL DEFAULT 0,started_at timestamptz NOT NULL);
CREATE TABLE app.security_guard (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO app.security_guard(id) VALUES(1);
INSERT INTO app.profiles(id,label,tabs,editable_tabs,dashboard_widgets,can_delete_history) VALUES
('gerencia','Administrativo','["multiobra","cadastros","diario","produtividade","gerencial","dashboard","historico","orcamento","administracao"]','["multiobra","cadastros","diario","produtividade","gerencial","dashboard","historico","orcamento","administracao"]','["resumo","evolucao","servicos","orcamento","tabelaOrcamento"]',true),
('engenheiro','Engenheiro','["cadastros","diario","produtividade","gerencial","dashboard","historico"]','["cadastros","diario","produtividade","gerencial","historico"]','["resumo","evolucao","servicos","orcamento","tabelaOrcamento"]',false),
('apontador','Apontador','["diario","produtividade","historico"]','["diario","produtividade"]','["resumo","servicos"]',false),
('rh','RH','["cadastros","historico"]','["cadastros"]','["resumo"]',false);
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
