# Implantação do serviço

## Fonte e homologação

Repositório: `marcio921601/app`. Branch de implementação: `feat/operacao-online-obra30`.

- Blueprint path: `RENDER_DEPLOY_DIARIO_OBRAS_20260630-132656/render.yaml`.
- Root directory: `RENDER_DEPLOY_DIARIO_OBRAS_20260630-132656` (relativo à raiz Git).
- Runtime: Node 24.15.0; build `npm ci --include=dev && npm run build`; start `npm start`.
- Readiness: `/api/ready`, que consulta o banco; liveness: `/api/health`.
- Plano `free` para homologação; deploy automático desabilitado. Não sincronizar Blueprint em um serviço existente sem conferir nome, branch e diferenças.

O arquivo precisa estar publicado na branch remota para o Render lê-lo. Validar com Render CLI 2.7+: `render blueprints validate render.yaml --output json`, autenticado no workspace correto. A validação do esquema JSON é uma verificação estrutural; não substitui essa validação de plataforma.

## Preparar o banco

1. Inspecionar tabelas e históricos no Supabase antes de aplicar migrações. O aplicativo usa `app.schema_migrations`; não aplicar novamente por um segundo mecanismo.
2. Usar `MIGRATION_DATABASE_URL` apenas no ambiente privado do operador, executar `npm run db:migrate` e conferir checksums.
3. Criar uma credencial PostgreSQL exclusiva do processo web. Conceder CONNECT no banco, USAGE no esquema `app`, SELECT em `app.schema_migrations` e SELECT/INSERT/UPDATE/DELETE nas demais tabelas operacionais. Não conceder CREATE no esquema, propriedade, superuser, BYPASSRLS ou acesso administrativo ao Auth.
4. Revogar acesso de PUBLIC ao esquema. `anon` e `authenticated` não recebem grants no esquema `app`; o acesso ocorre pela API Node. Testar operações com a credencial runtime antes de publicá-la.
5. Preferir conexão/pooler de sessão compatível com IPv4 no Render. Usar TLS com validação do certificado; configurar `DATABASE_CA` se necessário. Não desativar a validação para contornar certificado.

## Variáveis no Render

Preencher os campos `sync: false` no painel seguro:

| Variável | Conteúdo |
| --- | --- |
| APP_ORIGIN | Origem HTTPS exata do serviço, sem caminho |
| DATABASE_URL | Credencial runtime PostgreSQL |
| SUPABASE_URL | URL do projeto correto |
| SUPABASE_PUBLISHABLE_KEY | Chave publicável do projeto |
| SUPABASE_SECRET_KEY | Chave administrativa, usada apenas no Node |
| SESSION_ENCRYPTION_KEY | 32 bytes aleatórios codificados em base64 |

`NODE_ENV=production` e `NODE_VERSION=24.15.0` estão no Blueprint. O Render define PORT. O serviço web não recebe a credencial de migração. Não usar variáveis VITE para segredos. Guardar a chave de sessão no cofre da equipe; perdê-la invalida o uso dos tokens já criptografados.

## Autenticação e e-mail

Desabilitar inscrição pública no Supabase Auth. Configurar Site URL e lista de redirecionamentos estrita com a origem HTTPS. Os templates de convite e recuperação precisam apontar a `/api/auth/confirm?token_hash={{ .TokenHash }}&type=invite` ou `type=recovery` nessa origem.

SMTP: fornecedor de envio, domínio verificado e credencial configurada somente no painel do Supabase. O serviço padrão de testes do Supabase não libera os convites para a equipe. Sem SMTP, manter pessoas pendentes e não informar que o acesso está pronto. Resend é uma opção de homologação; consultar limites atuais e verificar domínio antes de adotar.

No Render, a conexão do socket vem do proxy. Antes de liberar produção, confirmar a cadeia de proxies e definir o tratamento confiável do IP de origem no limitador; não confiar cegamente em um cabeçalho enviado pelo cliente. Enquanto isso, o limite por IP usa o socket e pode ser compartilhado entre usuários.

## Aceite, publicação e reversão

1. Executar CI e o ensaio de backup/restauração em banco separado. Configurar backup diário com sete dias e exportação semanal criptografada. O backup do esquema app não inclui Supabase Auth.
2. Homologar com dados fictícios: HTTPS, login, convite/recuperação reais autorizados, logout, 401/403/404 e gravação de duas sessões da mesma versão.
3. Inspecionar somente logs permitidos (requestId, status e duração); nunca imprimir cookies, senha, URL de recuperação, tokens ou connection strings.
4. Aplicar cadastro privado primeiro com `ops:pilot -- --file <arquivo-privado> --dry-run`. Conferir conflitos; `--apply` prepara pessoas pendentes. Envio é separado e exige confirmação dos destinatários.
5. Liberar uso após registrar todas as evidências em `docs/piloto-aceite.md`.

Reversão do código: implantar o commit anterior validado e verificar compatibilidade do esquema. Não reverter SQL destrutivamente nem trocar a conexão para um restore sem ensaio e decisão do responsável. Durante incidente, preservar banco e pendências locais e restringir gravações antes de restaurar.
