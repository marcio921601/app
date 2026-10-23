# Diário de Obras Itaúba

Aplicação compartilhada para obras, diário, produtividade, orçamento, histórico e relatórios. React compila para arquivos estáticos; o processo Node serve esses arquivos e a API na mesma origem. Os dados ficam em PostgreSQL, no esquema privado `app`.

## Entrada e permissões

O servidor valida a senha no Supabase Auth e emite uma sessão opaca em cookie HttpOnly, SameSite=Lax e Secure em produção. O navegador não recebe tokens do Supabase. Tokens ficam criptografados no banco; autorizações são consultadas no banco em cada requisição. Sessões expiram após 12 horas sem atividade ou sete dias absolutos.

Administrador gerencia pessoas e vínculos. Cada vínculo define a obra e o perfil; Apontador edita diário e produtividade e consulta seu histórico. O servidor aplica as permissões mesmo em chamadas diretas. Convites e recuperação exigem SMTP configurado e templates com o callback da API.

## Desenvolvimento

Requer Node 24 e PostgreSQL/Supabase Auth configurados. Nesta pasta:

1. Execute `npm ci`.
2. Copie `.env.example` para `.env` privado e preencha as configurações reais do ambiente de desenvolvimento. Gere uma chave aleatória de sessão com 32 bytes em base64.
3. Execute `npm run db:migrate` com a credencial do operador.
4. Execute `npm run dev:all`: navegador em `http://localhost:5173`, API interna em 3001. `APP_ORIGIN` precisa corresponder à origem do navegador.

Para servir um build local, execute `npm run build`, ajuste `APP_ORIGIN=http://localhost:3000` e `PORT=3000`, depois `npm start`. Configuração ausente impede a inicialização. Dados vazios permanecem vazios. Rascunhos pendentes no navegador ficam isolados por conta, obra e data; a confirmação de gravação depende da resposta da API.

## Validação

- `npm test`: testes determinísticos com PGlite e provedor simulado somente nos testes.
- `npm run build` e `npm run test:e2e`: compilação e testes de navegador.
- `npm run test:db`: PostgreSQL real com driver pg; exige `TEST_DATABASE_URL`, banco `itauba_test_*` e `TEST_DATABASE_IS_DISPOSABLE=1`. O banco de testes é truncado; nunca configure produção. Local sem TLS: `TEST_DATABASE_SSL=false`.
- `node tests/acceptance/concurrent.mjs`: dez sessões HTTP sobre PostgreSQL real, conflitos, reaplicação explícita e autoria. Usa o mesmo banco descartável e identidade simulada exclusivamente no harness.

## Implantação e operação

O Blueprint fica em `RENDER_DEPLOY_DIARIO_OBRAS_20260630-132656/render.yaml` relativamente à raiz Git. Seu `rootDir` aponta para esta pasta. Consulte [implantação](RENDER_OPERACIONAL.md), [rotina operacional](docs/operacao-online.md) e [evidências de aceite](docs/piloto-aceite.md).

O plano gratuito definido no Blueprint é para homologação. A liberação da operação depende de SMTP, teste real de convite/recuperação, validação HTTPS e backups de produção com retenção aprovada. Não há dados de obras ou destinatários reais no repositório.
