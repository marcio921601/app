# Operação da equipe online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o Diário de Obras em operação compartilhada, começando com a obra piloto e com acesso individual de administrador e Apontador.

**Architecture:** Manter React e Node HTTP, usando a API como autoridade de identidade, autorização e gravação. PostgreSQL no Supabase armazena recursos por obra e diários versionados; Supabase Auth verifica credenciais, com sessões opacas gerenciadas pelo Node. O Render serve o frontend compilado e a API na mesma origem.

**Tech Stack:** Node 24 LTS, JavaScript ESM, React 18, Vite, pg, @supabase/supabase-js, zod; node:test e PGlite para testes determinísticos e Playwright para navegador. O driver pg e um PostgreSQL real são obrigatórios na homologação; PGlite e provedor de identidade simulado são exclusivos dos testes.

**Spec:** `docs/superpowers/specs/2026-10-21-operacao-equipe-online-design.md`, aprovada para avanço pelo responsável em 23/10/2026. Este plano requer revisão antes da execução. Todos os caminhos abaixo são relativos à pasta do projeto `RENDER_DEPLOY_DIARIO_OBRAS_20260630-132656`.

## Global Constraints

- Público inicial: "até 10 usuários em até 3 obras"; iniciar por uma obra.
- Runtime: "Node 24 LTS". Manter npm, ESM e as telas existentes.
- Dependências novas têm versão exata em package.json e lockfile versionado. Conferir procedência e advisories antes de instalar; ferramentas CLI também são fixadas em devDependencies. Consultar o changelog e a documentação atual do Supabase antes da implementação.
- Sessões: "pelo menos 32 bytes", "12 horas sem atividade" e "limite absoluto de 7 dias"; cookie HttpOnly, Secure em produção, SameSite=Lax, Path=/, sem Domain.
- Autenticação: tokens do provedor criptografados no servidor; nenhum token de autenticação no localStorage nem credencial administrativa no frontend.
- Autorização: sessão ausente 401, operação proibida 403, obra não autorizada 404; autor é determinado pelo servidor.
- Apontador: editar apenas diário e produtividade; consultar histórico correspondente; registrar o diário usa permissão de diário, sem editar diretamente ou excluir o histórico.
- Gravação: agrupar após "1 segundo sem digitação"; CAS por versão e conflito 409; preservação do conteúdo pendente; consulta periódica de "até 15 segundos" enquanto visível.
- Dados: um diário por obra e data; IDs estáveis; datas operacionais locais; auditoria UTC exibida em "America/Sao_Paulo".
- Limites: orçamento "5 MiB e 10 mil linhas"; JSON de diário "2 MiB"; validação antes de qualquer gravação parcial.
- Piloto sem lançamentos anteriores ou dados de exemplo. Ler cadastros reais somente de arquivo local restrito fora do código público. Não desenvolver importador legado nesta entrega.
- Recuperação: backup diário com sete dias de retenção, exportação semanal criptografada e cópia antes de migrações relevantes; metas de 24 horas de perda máxima e um dia útil para recuperação, a verificar em ensaio.
- Não criar serviços pagos, publicar dados reais ou enviar convites durante testes. A contratação e o envio de mensagens exigem a autorização aplicável à ação concreta.

## Review Focus

1. Trocar obra/data durante um salvamento não deve enviar nem confirmar conteúdo no registro errado — teste da tarefa 7.
2. Repetir uma requisição cuja resposta se perdeu não deve duplicar diário ou revisão — teste da tarefa 5.
3. Expirar a sessão e entrar com outra conta não deve restaurar nem enviar rascunhos da primeira pessoa — testes das tarefas 2 e 7.
4. Uma base vazia ou uma lista vazia recebida da API não deve ressuscitar obras, profissionais, orçamento ou administrador de exemplo — testes das tarefas 4 e 6.
5. Duas operações administrativas simultâneas não podem remover os dois últimos administradores — teste da tarefa 3.

## Organização da execução e dos arquivos

As tarefas formam uma entrega dependente: servidor protegido, persistência compartilhada, integração das telas e implantação. A camada de API pode ser testada antes das telas; a publicação depende da verificação do conjunto.

A pasta disponível nesta conversa é uma cópia sem checkout Git. Ao executar, aplicar `using-git-worktrees`: reutilizar um checkout apropriado ou clonar `https://github.com/marcio921601/app.git` dentro do workspace em `app-online`, preservar esta especificação e este plano e trabalhar em uma branch de implementação. Comparar o conteúdo remoto com a cópia analisada antes de editar. Não inicializar um repositório sobre os arquivos de entrega nem copiar a pasta `operacao-local` para o código versionado.

| Unidade | Arquivos e responsabilidade |
| --- | --- |
| Inicialização | `server/server.mjs`, `server/app.mjs`, `server/config.mjs`: processo, aplicação testável, configuração e servidor estático. |
| Persistência | `server/db/connection.mjs`, `server/db/migrate.mjs`, arquivo SQL gerado pela CLI em `supabase/migrations/`: driver, transações e esquema privado. |
| Identidade | `server/auth/provider.mjs`, `server/auth/sessions.mjs`, `server/auth/http.mjs`: Supabase, criptografia/sessões, login e recuperação. |
| Acesso e administração | `server/access/permissions.mjs`, `server/admin/users.mjs`: vínculos, perfis, usuários e proteção do último administrador. |
| Recursos de obra | `server/obras/service.mjs`, `server/obras/http.mjs`: obras, profissionais, afastamentos e orçamento. |
| Diário | `shared/diary.mjs`, `server/diarios/service.mjs`, `server/diarios/http.mjs`: cálculos/validação, versões, revisões e contratos HTTP. |
| Integração React | `src/services/backend.js`, `src/services/pendingDrafts.js`, `src/hooks/useSession.js`, `src/hooks/useSharedDiary.js`, `src/hooks/useDiaryApp.js`, `src/App.jsx`: sessão, dados e formulários. |
| Interface | `src/components/auth/AuthScreen.jsx`, `src/components/common/WorkSelector.jsx`, `src/components/common/SaveStatus.jsx`, `src/components/common/ConflictDialog.jsx`, `src/components/sections/AdministrationSection.jsx`: entrada, obra, gravação e administração. |
| Operação | `server/cli/pilot.mjs`, `server/cli/backup.mjs`, `server/cli/restore-check.mjs`, `docs/operacao-online.md`, `render.yaml`: preparação privada e recuperação. |

## Contratos comuns

`Db` fornece `query(sql, params=[]) -> Promise<{rows,rowCount}>`, `transaction(fn: (tx:Db)=>Promise<T>) -> Promise<T>` e `close() -> Promise<void>`. SQL parametrizado; UUIDs são gerados no Node para não exigir extensões nos testes. Transações na produção usam um único cliente adquirido do pool.

`Actor = {id, authUserId, nome, isAdmin}`. `ObraAccess = {obraId, perfil, tabs, editableTabs, canDeleteHistory}`. Os IDs são UUIDs; o código comercial da obra é texto e não é usado como credencial.

`DiaryEnvelope = {id, obraId, data, status, version, updatedAt, payload, summary}`. `DiaryWrite = {expectedVersion, mutationId, changes, register}`; `expectedVersion=0` cria somente se o diário ainda não existe. `mutationId` é um UUID por tentativa lógica e é reutilizado em uma repetição de transporte. `changes` contém apenas campos do formulário autorizados à operação; nunca administração, usuários, perfis, autoria ou IDs de obra substitutos.

Erros têm `{error:{code,message,requestId,details?}}`. Conflito acrescenta o envelope atual autorizado em `details.current`. O cliente preserva `status`, `code` e `details` em `ApiError`. Datas de trabalho seguem YYYY-MM-DD e o dia inicial é calculado em America/Sao_Paulo.

### Task 1: Aplicação testável e banco com esquema privado

**Files:** criar `server/app.mjs`, `server/config.mjs`, `server/db/connection.mjs`, `server/db/migrate.mjs`, `tests/helpers/database.mjs`, `tests/server/schema.test.mjs`; modificar `package.json`, `package-lock.json` e `.gitignore`; criar `.env.example` sem valores reais. A migração SQL fica no caminho exato devolvido por `supabase migration new online`, executado com a CLI fixada em devDependencies depois de consultar `supabase --help` e `supabase migration new --help`; registrar esse caminho no checklist ao executar. Não inventar o prefixo de timestamp do arquivo. Modificar também `server/server.mjs` para compor o processo.

**Interfaces:** produzir `createApp({db,config,authProvider,clock}) -> RequestListener`, `loadConfig(env) -> Config`, `connectDatabase(config) -> Db`, `applyMigrations(db,{directory='supabase/migrations'}={}) -> Promise<void>` e `createTestDb() -> Promise<Db>`. O loader usa os arquivos emitidos pela CLI e controla sua aplicação em app.schema_migrations. No projeto Supabase, conferir também o histórico gerenciado pela plataforma antes de aplicar; não aplicar o mesmo SQL novamente por dois mecanismos.

- [ ] **Step 1: Escrever o teste vermelho** `schema.test.mjs`, com `test('migra uma única vez e recusa diário duplicado')`: aplicar migrações duas vezes, inserir uma obra fictícia e usar `await assert.rejects(db.query('INSERT INTO app.diarios (id,obra_id,data,status,version,payload) VALUES ($1,$2,$3,$4,$5,$6)', [secondId, obraId, '2026-10-23', 'rascunho', 1, {}]))` depois de inserir outro diário para a mesma obra/data; verificar que tabelas da aplicação pertencem a `app`, não a `public`. Gerar IDs com randomUUID e criar os pré-requisitos dentro do próprio teste.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/server/schema.test.mjs`; deve falhar pelo módulo ainda ausente.
- [ ] **Step 3: Implementar as interfaces**, scripts `test`, `test:e2e`, `test:db`, `db:migrate`, `ops:pilot`, `ops:backup`, `ops:restore-check` e Node `>=24 <25`. Criar tabelas `app.users`, `profiles`, `memberships`, `obras`, `profissionais`, `afastamentos`, `orcamento_itens`, `diarios`, `diario_revisoes`, `audit`, `sessions`, `auth_limits`, `security_guard` e `schema_migrations`. `security_guard` tem uma linha usada como trava transacional administrativa. `diarios` tem UNIQUE(obra_id,data); revisões têm UNIQUE(diario_id,mutation_id). Usuários podem permanecer pendentes, com auth_user_id nulo até o convite. Gerar a credencial runtime fora do SQL versionado; conceder privilégios mínimos no esquema privado. Separar liveness `/api/health` e readiness `/api/ready`; remover os antigos handlers globais de JSON, protegendo toda rota de dados até as tarefas seguintes. A inicialização de produção falha se faltar banco, chaves ou provedor; nunca usa simulação automaticamente.
- [ ] **Step 4: Verificar verde** com `node --test tests/server/schema.test.mjs`. Definir o script `test` como `node --test "tests/**/*.test.mjs"`; os testes que exigem serviços externos ficam fora desse padrão e são executados somente por scripts explícitos. Acrescentar asserts de readiness 503 sem banco e ausência de segredo no erro.
- [ ] **Step 5: Commit** somente os arquivos desta tarefa, após conferir o diff e a ausência de valores reais de `.env`.

### Task 2: Login gerenciado e sessão do servidor

**Files:** criar `server/auth/provider.mjs`, `server/auth/sessions.mjs`, `server/auth/http.mjs`, `tests/helpers/identity.mjs`, `tests/server/auth.test.mjs`; modificar `server/app.mjs`.

**Interfaces:** consumir `Db` e `Config`. Produzir `createAuthProvider(config) -> AuthProvider` com `signIn({email,password})`, `refresh(tokens)`, `verifyEmailToken({tokenHash,type})`, `changePassword(tokens,password)`, `recover(email,redirectTo)`, `invite({email,nome,redirectTo})` e `revoke(tokens)`. Produzir `createSession(db,providerSession,{purpose,clock}) -> {cookieValue,csrfToken}`, `requireSession(request) -> {actor,session,csrfToken}` e `endSession(cookieValue)`.

- [ ] **Step 1: Escrever os testes vermelhos** `auth.test.mjs`: `test('login não devolve tokens do provedor')`, `test('logout bloqueia cookie anterior')`, `test('expiração de 12 horas e 7 dias')` e `test('renovação simultânea e logins paralelos não misturam pessoas')`; usar `assert.equal(json.access_token, undefined)`, verificar HttpOnly/SameSite e avançar relógio injetado. `tests/helpers/identity.mjs` fornece provedor falso somente aos testes.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/server/auth.test.mjs`.
- [ ] **Step 3: Implementar as interfaces** e rotas `GET /api/session`, `POST /api/auth/login`, `/logout`, `/recover`, `/password` e `GET /api/auth/confirm`. Gerar 32 bytes aleatórios de sessão, guardar SHA-256 e criptografar tokens com AES-256-GCM e `SESSION_ENCRYPTION_KEY` de 32 bytes. Guardar CSRF aleatório por sessão; devolver somente por `/session`. Validar Origin no login e Origin mais CSRF nas mutações autenticadas. Criar cliente Supabase independente por operação, com persistência automática desativada; não compartilhar sessão de usuário no cliente administrativo. Serializar renovação pela sessão no banco e revogar localmente mesmo se a chamada de logout ao provedor falhar. Rate limits no banco: 10 falhas por IP em 15 minutos, 5 por par IP/e-mail em 15 minutos e 3 pedidos de recuperação por e-mail em uma hora. Recuperação retorna mensagem genérica. Templates de e-mail apontam ao callback com token_hash e tipo invite/recovery; callback valida via verifyOtp e cria sessão limitada a definir senha, nunca atribui perfil pela URL. Depois de definir senha e validar conta/vínculo, trocar por sessão normal. Redigir logs por allowlist, sem cookie, senha, token, corpo de login ou query de recuperação.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2; adicionar testes de CSRF, Origin inválida, cookie adulterado, conta bloqueada, token de e-mail usado duas vezes e confirmação com redirecionamento externo recusado.
- [ ] **Step 5: Commit** dos módulos de autenticação, integração e testes.

### Task 3: Permissões e administração de usuários

**Files:** criar `server/access/permissions.mjs`, `server/admin/users.mjs`, `tests/server/access.test.mjs`; modificar `server/app.mjs`.

**Interfaces:** consumir `Actor`, `Db` e AuthProvider. Produzir `getObraAccess(db,actor,obraId) -> ObraAccess`, `requirePermission(access,module,action) -> void`, `updateUserAccess(db,actor,userId,input)`, `deactivateUser(db,actor,userId)` e `inviteUser(db,actor,input,{send})`.

- [ ] **Step 1: Escrever os testes vermelhos** `test('apontador não administra e não acessa outra obra')`: `assert.equal(response.status,403)` para usuários e 404 para obra alheia. `test('duas desativações preservam um administrador')`: `await Promise.allSettled(...)` e `assert.equal(activeAdminCount,1)`.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/server/access.test.mjs`.
- [ ] **Step 3: Implementar as interfaces** e `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `PUT /api/admin/users/:id/memberships`, `GET/PUT /api/admin/profiles/:id`. Definir as permissões da tabela da especificação no servidor, negando perfis desconhecidos. Usar a trava de `security_guard` na transação que altera/desativa/exclui administradores e ao alterar o perfil administrativo. Desativar encerra sessões. Convites ficam pendentes, vinculados ao ID devolvido pelo provedor; falha de envio não cria uma conta ativa nem amplia acesso. Repetir convite não duplica usuário. Leitura/listagem de obras filtra o conjunto permitido; a escolha de obra permitida independe de permissão de editar seu cadastro. Autoria e isAdmin não aceitam alterações por payload comum.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2, cobrindo perfil adulterado, ação por chamada direta, simulação administrativa sem troca de identidade e falha do provedor no meio de um convite.
- [ ] **Step 5: Commit** de autorização e administração.

### Task 4: Obras e cadastros compartilhados

**Files:** criar `server/obras/service.mjs`, `server/obras/http.mjs`, `tests/server/obras.test.mjs`; modificar `server/app.mjs`.

**Interfaces:** consumir `Db`, `Actor` e autorização. Produzir `listObras(db,actor)`, `getWorkspace(db,actor,obraId) -> {obra,access,profissionais,afastamentos,orcamento}`, `writeMasterRecord(db,actor,{obraId,kind,id,expectedVersion,changes})` e `previewBudget(db,actor,obraId,file) -> {rows,errors}`. `kind` é obra, profissional, afastamento ou itemOrcamento; retorno inclui `version`.

- [ ] **Step 1: Escrever os testes vermelhos** `test('base vazia permanece vazia')`, com `assert.deepEqual(await listObras(db,actor),[])`; `test('cadastro não vaza outra obra nem altera sua versão')` e `test('importação excedente ou inválida não grava parcialmente')`.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/server/obras.test.mjs`.
- [ ] **Step 3: Implementar as interfaces** e rotas `GET /api/obras`, `POST /api/obras`, `PATCH /api/obras/:id`, `GET /api/obras/:id/workspace`; CRUD sob `/api/obras/:id/profissionais`, `/afastamentos` e `/orcamento`. Mutação usa expectedVersion e permite apenas campos da entidade. Arquivar obra/profissional com referências existentes, preservando histórico. Validar vínculos e integridade em transação; conflitos respondem 409. Orçamento aceita upload bruto limitado a 5 MiB, até 10 mil linhas totais, prévia e confirmação da mesma versão por administrador; parsear no servidor e manter XLSX/XLS/CSV. Testar a versão instalada de xlsx contra advisories e usar distribuição oficial corrigida se houver vulnerabilidade aplicável à leitura de arquivos. Validar hierarquia, referências, números finitos e unidades antes do commit integral. Produção não chama buildInitialData ou mergeWithDefaults para preencher listas vazias.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2, cobrindo remoção de profissional já presente em diário, referência cruzada de afastamento e duas edições do mesmo cadastro.
- [ ] **Step 5: Commit** de recursos de obra.

### Task 5: Diário versionado com cálculos e histórico

**Files:** criar `shared/diary.mjs`, `server/diarios/service.mjs`, `server/diarios/http.mjs`, `tests/shared/diary.test.mjs`, `tests/server/diarios.test.mjs`; modificar `server/app.mjs`.

**Interfaces:** produzir `validateDiary(payload,workspace,{register}) -> ValidatedDiary`, `calculateDiary(payload,workspace) -> {atividades,summary}`, `localWorkDate(date,timezone='America/Sao_Paulo') -> string`, `getDiary(db,actor,{obraId,data}) -> DiaryEnvelope|null` e `saveDiary(db,actor,{obraId,data,...DiaryWrite}) -> DiaryEnvelope`. Produzir `listHistory(db,actor,filters)` e `deleteHistory(db,actor,id,{reason,expectedVersion})`.

- [ ] **Step 1: Escrever os testes vermelhos**: cálculo de duas pessoas presentes durante quatro horas e produção 12 resulta em `assert.equal(summary.totalHH,8)` e produtividade 1.5; quantidade por percentual usa o orçamento da obra. Duas gravações com expectedVersion=1 resultam em uma versão 2 e um 409. Repetir mutationId após simular perda da resposta resulta em `assert.equal(revisionCount,1)` e no mesmo envelope confirmado.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/shared/diary.test.mjs tests/server/diarios.test.mjs`.
- [ ] **Step 3: Implementar as interfaces** e `GET/PUT /api/obras/:id/diarios/:data`, `GET /api/historico`, `GET /api/diarios/:id/revisoes`, `DELETE /api/diarios/:id`. Em uma transação: validar permissões de cada seção alterada, reservar mutationId, aplicar CAS, calcular resumo a partir de dados mestres confiáveis, inserir revisão e auditoria. Idempotência exige mesma identidade, recurso e hash de entrada; chave reutilizada com outro conteúdo responde 409. POSTs antigos de estado inteiro deixam de existir. Rascunho pode conter campos textuais incompletos, mas nunca números/referências inválidos; registrar exige os campos obrigatórios do diário. Não confiar em totais, nome da obra, autor ou perfis enviados pelo cliente. Registrar é ação de diário; editar o conteúdo gerencial exige também a permissão gerencial. Ausências, horários HH:mm válidos, término maior que início e alocações simultâneas são verificados contra o dia/obra. Reusar as fórmulas existentes sem somar unidades incompatíveis nos relatórios. Datas iniciais às 01:00 UTC ainda correspondem ao dia anterior em São Paulo.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2, incluindo JSON >2 MiB (413), NaN/Infinity/texto numérico inválido, profissional de outra obra, percentual zero explícito, divisão por zero, diário único e autoria adulterada. Testar também conflito de criação com expectedVersion=0 e UUID de diário pertencente a outra obra.
- [ ] **Step 5: Commit** do diário, validação e cálculos compartilhados.

### Task 6: Entrada autenticada e integração de todos os módulos

**Files:** criar `src/hooks/useSession.js`, `src/hooks/useSharedDiary.js`, `src/components/auth/AuthScreen.jsx`, `src/components/common/WorkSelector.jsx`, `tests/e2e/session.spec.js`; modificar `src/services/backend.js`, `src/hooks/useDiaryApp.js`, `src/App.jsx`, `src/data/defaults.js`, `src/components/sections/MultiobraSection.jsx`, `src/components/sections/HistorySection.jsx`, `src/components/sections/BudgetSection.jsx`, `src/index.css`; criar `playwright.config.js` e `tests/helpers/browser-server.mjs`.

**Interfaces:** produzir `ApiError`, `backendClient.request(path,{method,body,signal,mutationId})`, `useSession() -> {status,user,csrf,login,logout,recover,setPassword}`, `useSharedDiary({session,obraId,date}) -> {workspace,diary,loading,error,reload}`. O cliente envia cookie same-origin, CSRF só nas mutações e AbortSignal; nunca recebe/guarda tokens do provedor.

- [ ] **Step 1: Escrever os testes vermelhos** `test('entra por convite e não por perfil na URL')`, `test('lista vazia não cria exemplos')` e `test('apontador seleciona uma obra autorizada sem editar seu cadastro')`; usar `expect(page.getByText('Administrativo')).not.toBeVisible()` após navegar com `?perfil=gerencia` numa conta Apontador.
- [ ] **Step 2: Confirmar vermelho** com `npx playwright test tests/e2e/session.spec.js`; servidor de teste usa createApp com dependências injetadas, sem variável que habilite autenticação falsa em produção.
- [ ] **Step 3: Implementar as interfaces** e a tela de entrada/recuperação/definição de senha com textos em português. Remover a seleção livre de usuário, os parâmetros de personificação e o bootstrap automático de administrador local. Hidratar o estado existente com dados autorizados, sem chamar o migrador local quando a API devolve array vazio. Gerar IDs novos com crypto.randomUUID, preservando os IDs fornecidos pelo servidor. Manter somente preferências locais identificadas por usuário. O seletor de obra fica no shell, disponível a qualquer pessoa com vínculos; seleção busca os recursos da obra e não exige editar Multiobra. Conectar alterações de obras, cadastros e orçamento às rotas da tarefa 4; conectar consulta de histórico e exclusões às rotas da tarefa 5. Integrar os cálculos compartilhados ao hook sem duplicar suas fórmulas. Manter relatórios e exportações com o formato atual, usando somente dados autorizados. Retirar o botão de enviar o estado inteiro ao backend e a falsa indicação de sincronização baseada apenas no endereço da API.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2; testar sessão ausente, rede indisponível e ausência de chaves administrativas no bundle compilado. Testar telas vazias e acesso direto por URL sem sessão.
- [ ] **Step 5: Commit** da integração de sessão e módulos.

### Task 7: Autosave, conflitos e recuperação do trabalho pendente

**Files:** criar `src/services/pendingDrafts.js`, `src/components/common/SaveStatus.jsx`, `src/components/common/ConflictDialog.jsx`, `tests/e2e/saving.spec.js`, `tests/shared/pending-drafts.test.mjs`; modificar `src/hooks/useSharedDiary.js`, `src/hooks/useDiaryApp.js`, `src/App.jsx`.

**Interfaces:** produzir `pendingDrafts.load({userId,obraId,date})`, `.save(key,{version,changes,mutationId})`, `.remove(key)` e `useSharedDiary().save(changes,{register=false}) -> Promise<DiaryEnvelope>`. Estados de gravação: altered, sending, saved, failed, conflict. Texto visível: Alterado, Enviando, Salvo no servidor, Falha no envio, Conflito.

- [ ] **Step 1: Escrever os testes vermelhos**: atrasar resposta, trocar obra/data e usar `expect(savedSecondWork.payload.observacoes).not.toBe(firstWorkText)`; em dois contextos editar versão igual e exigir conflito no segundo, mantendo seu texto. Expirar sessão, entrar com outro usuário e usar `assert.equal(pendingDrafts.load(otherUserKey),null)`.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/shared/pending-drafts.test.mjs` e `npx playwright test tests/e2e/saving.spec.js`.
- [ ] **Step 3: Implementar as interfaces** com debounce de 1000 ms e fila serial por usuário/obra/data. Capturar a chave do recurso e a versão em cada envio; cancelar leituras obsoletas, mas tratar resposta de gravação incerta com mutationId idempotente. Uma resposta antiga nunca substitui alterações locais feitas depois do início do envio. Suspender autosave em 409, oferecer comparação e reaplicação explícita; em 401 pedir login e preservar pendência isolada. Consultar mudanças a cada 15 s apenas com documento visível, sem substituir formulário sujo. Ao sair, permitir exportar ou descartar pendência e limpar somente o escopo da conta; nunca chamar localStorage.clear(). Falha de armazenamento local é mostrada e preserva o formulário em memória para exportação. Não dizer que salvou antes do ACK.
- [ ] **Step 4: Verificar verde** com ambos os comandos; testar desconexão antes/depois do commit, 401 durante autosave, foco com dados novos, limpeza de conta e edição adicional durante resposta lenta.
- [ ] **Step 5: Commit** de autosave e recuperação.

### Task 8: Administração na interface e regressão dos relatórios

**Files:** modificar `src/components/sections/AdministrationSection.jsx`, `src/components/print/PrintLayout.jsx`, `src/hooks/useDiaryApp.js`, `src/App.jsx`; criar `tests/e2e/administration.spec.js`, `tests/e2e/reports.spec.js`, `tests/fixtures/diary-regression.json` com dados fictícios.

**Interfaces:** consumir APIs das tarefas 3–7. Produzir ações React `inviteUser(input)`, `updateMemberships(userId,memberships)`, `deactivateUser(userId)` e `previewProfile(profileId)`; preview mantém actor autenticado e só restringe a apresentação.

- [ ] **Step 1: Escrever os testes vermelhos**: administrador atribui Apontador à obra de teste, Apontador registra diário sem editar diretamente histórico e falha ao chamar administração; relatório com 8 HH e produção 12 mantém esses resultados no navegador e na impressão. Verificar exportação com somente os registros autorizados.
- [ ] **Step 2: Confirmar vermelho** com `npx playwright test tests/e2e/administration.spec.js tests/e2e/reports.spec.js`.
- [ ] **Step 3: Implementar as ações** substituindo a troca de login por gestão de pessoas e vínculos; simulação não muda identidade nem autor e não envia ações proibidas pelo perfil simulado. Exibir estado pendente do convite e erros de entrega. Ligar registro no histórico à permissão de diário, conforme a especificação. Preservar o layout e as fórmulas dos relatórios; fazer alterações somente para dados vazios, autoria do servidor e seleção autorizada. Nenhum e-mail real vai para fixtures, screenshot de teste ou código público.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2, incluindo leitura do histórico por RH, edição gerencial por Engenheiro, proteção do último administrador e cancelamento do preview.
- [ ] **Step 5: Commit** da administração e ajustes de relatório.

### Task 9: Preparação privada do piloto e recuperação de backup

**Files:** criar `server/cli/pilot.mjs`, `server/cli/backup.mjs`, `server/cli/restore-check.mjs`, `tests/server/operations.test.mjs`, `docs/operacao-online.md`; modificar `.gitignore`.

**Interfaces:** produzir `preparePilot(db,authProvider,record,{apply=false,sendInvites=false}) -> {changes,invites,counts}`, `backupDatabase({outputDir,keyFile}) -> BackupManifest` e `restoreCheck({backupPath,targetDatabaseUrl,keyFile}) -> {counts,checks}`. A CLI recebe `--file` para o JSON privado; fixtures usam apenas endereços .invalid.

- [ ] **Step 1: Escrever os testes vermelhos**: dry-run não muda banco nem envia mensagem; aplicar duas vezes deixa uma obra, duas pessoas pendentes e nenhum diário de exemplo. `assert.equal(provider.invites.length,0)` sem sendInvites. Restaurar uma cópia e comparar contagem/hash; recusar alvo com tabelas operacionais já preenchidas.
- [ ] **Step 2: Confirmar vermelho** com `node --test tests/server/operations.test.mjs`.
- [ ] **Step 3: Implementar as interfaces** com validação estrita do JSON local. Usar código como chave de preparação idempotente, mas nunca substituir usuários/obras existentes sem informar diferenças no dry-run. Município não informado permanece vazio; não inventar cidade, jornada ou profissionais. `--apply` prepara cadastros pendentes; `--send-invites` é uma ação explícita separada, com prévia dos destinatários e autorização humana para envio. Configurar callback e SMTP antes dessa ação. Backup usa pg_dump e criptografia autenticada, com manifesto de data, contagens e checksum; nunca passa senha em argumentos visíveis nem grava dump aberto fora de diretório temporário restrito. Restore exige banco de teste vazio e conferência antes de qualquer troca de conexão. Detectar ausência de pg_dump/pg_restore com instrução para instalar cliente PostgreSQL compatível; testar abstração de processo nos testes e executar ensaio real na tarefa 10. Documentar exportação semanal, retenção e responsáveis operacionais, sem segredos.
- [ ] **Step 4: Verificar verde** com o comando da etapa 2 e `npm run ops:pilot -- --file <caminho-local> --dry-run`, conferindo somente um administrador e um Apontador na obra fornecida, sem executar envio ou publicação. Conferir `git status --short` para garantir exclusão do cadastro privado e backups.
- [ ] **Step 5: Commit** das ferramentas e instruções, nunca do JSON privado.

### Task 10: Homologação real e publicação do piloto

**Files:** modificar `render.yaml`, `README.md`, `RENDER_OPERACIONAL.md`, `.env.example`; criar `tests/integration/postgres.integration.mjs`, `tests/acceptance/concurrent.mjs`, `docs/piloto-aceite.md` e `.github/workflows/checks.yml`.

**Interfaces:** consumir aplicação completa, configurações de serviços e ferramentas operacionais. Produzir URL de homologação, resultado de testes no PostgreSQL real, relatório de concorrência/recuperação e instruções de publicação e reversão.

- [ ] **Step 1: Escrever os testes de integração vermelhos**: migrações em PostgreSQL real, dois clientes atualizando a mesma versão, expiração/renovação concorrente e transação do último administrador. Comparar comportamento do driver pg ao harness local. `concurrent.mjs` usa dez sessões e registra latência, memória e falhas; exige zero perda de atualização e conflitos identificados, sem fixar desempenho ainda não medido.
- [ ] **Step 2: Confirmar a falha de configuração sem credenciais** com `npm run test:db`, definido como `node --test tests/integration/postgres.integration.mjs`; deve informar TEST_DATABASE_URL ausente e não executar contra produção. Um teste pulado não conta como aprovação de integração.
- [ ] **Step 3: Preparar os serviços** somente após as conexões confirmadas: projeto Supabase, esquema privado/usuário runtime, SMTP, callbacks, inscrição pública desativada e serviço Render com rootDir apontando à pasta do projeto, Node 24, build e start aprovados. Documentar o caminho do Blueprint em subpasta. Usar envs separadas DATABASE_URL, MIGRATION_DATABASE_URL, APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY e SESSION_ENCRYPTION_KEY; nenhuma variável VITE contém segredo. Fazer homologação com dados fictícios e testar convite, recuperação e saída reais mediante autorização para mensagens aos destinatários de teste. Recursos pagos dependem de confirmação da contratação. Só então aplicar cadastros privados, executar envio autorizado e publicar a obra piloto.
- [ ] **Step 4: Verificar a entrega**: `npm ci`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:db` e `node tests/acceptance/concurrent.mjs`; verificar HTTPS, /api/health, /api/ready, 401/403/404, nenhuma rota antiga global acessível, nenhum segredo no bundle/logs e restauração real em base separada. Revisar `git diff --check` e o diff completo. Registrar em `docs/piloto-aceite.md` cada resultado e o que depende de ação externa; nunca declarar serviço publicado ou backup recuperado sem URL ou evidência correspondentes.
- [ ] **Step 5: Revisão e integração**: aplicar `requesting-code-review` antes de integrar a branch; corrigir achados e repetir apenas as verificações afetadas. Usar `finishing-a-development-branch` para a forma de entrega escolhida. Após criar qualquer PR, anexá-lo à conversa. Entregar URL e rotina de acesso somente quando o piloto estiver validado.

## Cobertura da especificação e pendências externas

| Exigência | Tarefas |
| --- | --- |
| Login, senha, convite, bloqueio e sessão | 2, 3, 6, 9, 10 |
| Acesso por obra e perfis | 3, 4, 6, 8 |
| Dados compartilhados e recursos separados | 1, 4, 5, 6 |
| Conflitos, falha de rede e autoria | 5, 7 |
| Validação, orçamento e cálculos | 4, 5, 8 |
| Base nova e cadastros reais privados | 4, 6, 9 |
| Retenção, exportação e restauração | 9, 10 |
| Concorrência e regressão dos relatórios | 5, 8, 10 |

As integrações Render e Supabase foram disponibilizadas nesta conversa. As consultas ao workspace do Render e à organização do Supabase foram confirmadas; o responsável escolheu a organização Diário.org. A cotação da integração para criar um projeto nessa organização é US$ 0 por mês, permitindo iniciar a validação no plano gratuito. Essa cotação não inclui os backups de produção do plano Pro previstos na especificação; a contratação ou mudança de plano é uma ação separada. Nenhum serviço de produção foi criado nesta preparação. SMTP e cliente PostgreSQL para ensaio de backup serão configurados na preparação operacional. Município, jornada e lista de profissionais completam o cadastro antes dos primeiros apontamentos; não impedem desenvolver com dados fictícios. Nenhuma dessas dependências autoriza substituir serviços reais por autenticação ou banco de demonstração em produção.

## Referências de implementação

- [Supabase Auth e convites](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).
- [Supabase e sessões no servidor](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Supabase e SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [PGlite para testes do banco](https://pglite.dev/docs/api).
- [Runner de testes do Node](https://nodejs.org/api/test.html).
