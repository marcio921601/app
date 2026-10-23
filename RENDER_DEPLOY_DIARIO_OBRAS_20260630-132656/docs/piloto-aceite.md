# Aceite do piloto

Data: 23/10/2026. Estado: **em homologação; operação da equipe ainda não liberada**.

## Evidências observadas

| Verificação | Resultado |
| --- | --- |
| Instalação e compilação atuais | npm ci e npm run build aprovados com Node 24.15.0 |
| Testes determinísticos atuais | 56/56 aprovados, incluindo oito testes de regressão da revisão |
| Navegador atual | 20/20 aprovados, incluindo restauração explícita de diário |
| Build com NODE_ENV=production | npm ci --include=dev e build aprovados; a instalação sem include=dev reproduziu a ausência do Vite |
| PostgreSQL 17.11 real, driver pg | Migração idempotente/esquema privado, CAS em dois pools, renovação/expiração de sessão e proteção do último administrador: 5/5 |
| Falta de TEST_DATABASE_URL | Falha explícita, nenhum teste pulado e sem fallback para produção |
| Dez sessões HTTP, banco real local | 1 ACK inicial e 9 conflitos; 9 reaplicações explícitas; 10 revisões, 10 autores, 0 erros inesperados e repetição idempotente |
| Latência local, 19 gravações após correções | p50 107,16 ms, p95/máxima 223,68 ms; RSS Node 66→80 MiB. Não representa latência ou capacidade do Render |
| Backup e restauração reais | PostgreSQL 17.11, pg_dump/pg_restore, AES-GCM; contagens e hashes iguais em banco separado; 1.031 ms; origem America/Sao_Paulo e alvo UTC |
| Cadastro privado, dry-run | 2 pessoas planejadas, 1 administrador, 0 obras/diários existentes, 0 conflitos; sem gravação de dados reais nem envio |
| Dependências após atualização | npm audit: 0 vulnerabilidades; Vite 8.3.5 e plugin React 6.1.2 |
| Supabase | Projeto gratuito criado em Diário.org, região São Paulo, status inicial ACTIVE_HEALTHY |
| Banco hospedado | 2 migrações aplicadas em app, 4 perfis, 0 usuários/obras/diários; anon/authenticated sem USAGE; advisor de segurança sem lints |
| Perfil runtime | Permissões de tabela preparadas; sem superuser, BYPASSRLS, CREATE no app ou UPDATE em migrações. Ainda NOLOGIN; conexão runtime real depende de credencial segura |
| Cadastro público | Desativado no painel com confirmação específica do responsável |
| Blueprint | Estrutura aprovada pelo JSON Schema oficial draft 2020-12; validação de plataforma ainda depende de login Render |

No ensaio de restauração foram conferidas todas as 14 tabelas: 2 pessoas fictícias, 4 perfis, 1 obra fictícia, 1 vínculo, 1 auditoria e 2 migrações; as demais tabelas operacionais estavam vazias. Esse ensaio comprova o mecanismo de exportação do app; não comprova restauração de Supabase Auth, backup diário gerenciado nem recuperação na infraestrutura de produção.

Os testes HTTP com PostgreSQL usam o provedor falso do harness, exclusivamente nos testes. Eles não comprovam entrega SMTP ou autenticação hospedada.

## Pendências de liberação

- Revisão independente identificou oito problemas; todos reproduzidos e corrigidos, com suíte completa aprovada. Detalhes em `revisao-2026-10-23.md`.
- Ativar e validar credencial runtime com privilégios mínimos; configurar chaves no ambiente seguro. O executor SQL do conector não permite SET ROLE para esse papel; a inspeção de grants não substitui uma conexão autenticada real.
- Configurar SMTP e domínio de envio; Resend gratuito aprovado, acesso ao DNS confirmado, criação/entrada da conta em andamento.
- Configurar callbacks/templates e validar convite, senha e recuperação reais com destinatários autorizados.
- Validar Blueprint com acesso autenticado ao Render. O CLI 2.31.0 foi obtido da distribuição oficial com hash conferido; a execução parou por falta de login do CLI.
- Publicar homologação e registrar URL HTTPS, health/ready, limites por IP atrás do proxy e verificação externa de acesso.
- Aprovar contratação quando necessária e validar backup diário com sete dias de retenção. O projeto gratuito atual não cumpre sozinho essa exigência.
- Só depois preparar o cadastro privado e liberar o piloto; município, jornada e profissionais serão completados pelo responsável antes dos apontamentos.

URL operacional: **ainda não disponível**. Nenhum convite real enviado.
