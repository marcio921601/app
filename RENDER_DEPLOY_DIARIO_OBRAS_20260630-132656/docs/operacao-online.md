# Operação do Diário de Obras

## Preparação do ambiente

Use Node 24 e PostgreSQL 17 ou cliente compatível com a versão do banco. Instale as dependências com `npm ci`, execute `npm test`, `npm run build` e `npm run test:e2e`. A aplicação usa a API Node na mesma origem do navegador.

Copie `.env.example` para um arquivo privado e configure:

| Variável | Uso |
| --- | --- |
| APP_ORIGIN | Origem HTTPS exata do aplicativo, sem caminho. |
| DATABASE_URL | Conexão do usuário runtime, com acesso às tabelas de app e sem permissão de criar ou remover estruturas. |
| MIGRATION_DATABASE_URL | Conexão administrativa usada somente nas ferramentas de implantação. Não entregar ao navegador nem manter no serviço runtime. |
| DATABASE_CA | Certificado CA em PEM, quando necessário ao driver Node. TLS valida o certificado do servidor. |
| SUPABASE_URL | Endereço do projeto Supabase. |
| SUPABASE_PUBLISHABLE_KEY | Chave pública usada pelo servidor ao validar credenciais individuais. |
| SUPABASE_SECRET_KEY | Chave administrativa, somente no servidor, para convites e revogação. |
| SESSION_ENCRYPTION_KEY | 32 bytes aleatórios codificados em base64. Manter uma cópia privada para recuperação das sessões. |

Não configurar segredos em variáveis VITE. O processo falha se faltar configuração obrigatória; não existe modo de autenticação de demonstração em produção. `DATABASE_SSL=false` serve apenas ao banco local de testes e é recusado pelo servidor de produção.

Aplicar as migrações com a conexão administrativa e `npm run db:migrate` antes de iniciar `npm start`. O loader verifica checksums e não reaplica arquivos já registrados. Conferir também o histórico de migrações do Supabase para não aplicar o SQL por dois mecanismos. O usuário runtime recebe USAGE no esquema app e somente as operações necessárias nas tabelas, sem ser dono do esquema; schema_migrations requer apenas leitura. As tabelas não devem ser expostas à Data API nem concedidas a anon/authenticated.

## Autenticação e e-mail

Desativar a inscrição pública no Supabase. Configurar Site URL igual a APP_ORIGIN e somente os redirecionamentos necessários ao aplicativo. O domínio e o remetente do serviço SMTP precisam ser verificados antes do envio.

Configurar os links dos templates de convite e recuperação para o callback do Node:

    {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=invite
    {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery

O callback valida e consome o token no provedor, cria uma sessão limitada e abre a definição de senha. Não usar parâmetros de perfil, ID de pessoa ou redirecionamento externo como autorização. Nenhuma senha inicial é gravada no cadastro privado.

O SMTP padrão do Supabase não substitui um serviço de envio verificado para a equipe. Validar convite e recuperação com destinatários de teste autorizados antes de convidar pessoas reais. O operador deve configurar credenciais no painel seguro do provedor; não incluir senhas de e-mail em mensagens, commits ou documentação.

## Cadastro privado do piloto

Manter o JSON de implantação fora do repositório, em diretório com acesso restrito. A ferramenta aceita somente os campos documentados abaixo; endereços do exemplo são fictícios.

    {
      "obra": {"codigo":"PILOTO-TESTE","nome":"Obra fictícia","cliente":"Cliente fictício","responsavel":"Pessoa responsável","municipio":"","uf":"PR"},
      "administrador": {"nome":"Admin fictício","email":"admin@example.invalid"},
      "usuarios": [{"nome":"Pessoa fictícia","email":"pessoa@example.invalid","cargo":"Assistente","perfil":"apontador","obras":["PILOTO-TESTE"]}]
    }

Conferir a prévia:

    npm run ops:pilot -- --file <cadastro-privado.json> --dry-run

Depois da conferência, preparar cadastros pendentes:

    npm run ops:pilot -- --file <cadastro-privado.json> --apply

A execução é idempotente por código da obra e e-mail. Divergências aparecem na prévia e impedem sobrescrita automática. Município não informado fica vazio. A ferramenta não cria profissionais, jornadas, orçamento ou lançamentos de exemplo.

O envio é separado da preparação. Somente depois da configuração SMTP, homologação e autorização humana para os destinatários:

    npm run ops:pilot -- --file <cadastro-privado.json> --apply --send-invites --confirm-recipients <hash-da-previa>

O hash confirma a lista de e-mails apresentada na prévia. Ele não concede autorização de envio por conta própria. Erros mantêm a conta pendente; nenhuma falha de entrega ativa um usuário. O administrador poderá gerir vínculos individuais pela aba Logins.

## Uso diário

Cada pessoa entra com seu e-mail e senha. O seletor de obra apresenta apenas obras autorizadas. Cadastros usam o botão Salvar de cada linha. O diário envia as alterações após um segundo sem edição e informa Salvo no servidor somente depois da confirmação.

Em caso de falha de rede, manter a tela aberta e usar Tentar salvar. Uma repetição de transporte preserva a identificação da operação para evitar duplicação. Conflitos exigem comparar as versões; reaplicar altera apenas os campos editados. Ao retornar à conta, uma edição pendente pode ser restaurada ou exportada. Ao sair, exportar ou descartar o conteúdo ainda não confirmado.

O perfil Apontador edita diário e produtividade, registra o diário no histórico e consulta o histórico das obras vinculadas. Administração de pessoas exige administrador global. A simulação de perfil restringe a apresentação e mantém a identidade autenticada.

Se um diário excluído precisar voltar, um usuário com permissão de excluir histórico abre a obra/data e tenta salvar sua edição. O conflito informa que houve exclusão e oferece **Restaurar e reaplicar minhas alterações**. A confirmação explícita usa a versão atual, registra auditoria e conserva as revisões anteriores. Perfis sem essa permissão devem solicitar a restauração ao administrador; não há recriação silenciosa após exclusão.

## Backup e recuperação

O responsável operacional deve verificar os backups gerenciados do provedor diariamente, conservar pelo menos sete dias conforme o plano contratado e registrar falhas. A contratação desses recursos é separada da preparação do código.

Além do backup gerenciado, gerar semanalmente e antes de migrações uma cópia criptografada do esquema app. O administrador mantém o arquivo e a chave em locais separados. A cópia contém dados operacionais, usuários da aplicação, vínculos, revisões e sessões criptografadas. Não inclui o esquema Auth do Supabase, configurações do provedor, SMTP ou variáveis de ambiente: a recuperação completa depende também do backup gerenciado e das configurações guardadas.

Criar uma chave aleatória de 32 bytes em arquivo privado, com acesso apenas ao operador. Usar BACKUP_DATABASE_URL ou MIGRATION_DATABASE_URL. O processo passa a senha do banco somente pelo ambiente do cliente, nunca pela linha de comando. Configurar PG_DUMP_PATH e PG_RESTORE_PATH quando os executáveis não estiverem no PATH, e PGSSLROOTCERT com o arquivo CA apropriado para conexão remota.

    npm run ops:backup -- --output-dir <diretorio-privado> --key-file <chave-privada>

O pg_dump usa um snapshot consistente com as contagens e hashes. O conteúdo é criptografado diretamente no fluxo com AES-256-GCM, sem dump aberto em disco. O manifesto contém checksum e autenticação por chave; guardar manifesto e arquivo criptografado juntos.

Para ensaiar uma restauração, criar um banco de teste vazio e independente. Definir explicitamente RESTORE_DATABASE_URL. A ferramenta recusa a origem e qualquer alvo que já possua tabelas app, sem remover dados.

    npm run ops:restore-check -- --backup <manifesto.json> --key-file <chave-privada> --target-confirm-empty

O arquivo inteiro é autenticado antes de alimentar pg_restore. A restauração usa uma transação, e a conferência compara contagens e hashes de todas as tabelas. Preservar qualquer alvo divergente para análise. Nunca trocar a conexão de produção automaticamente depois do ensaio.

A restauração de app não ativa contas em outro projeto Auth. Recuperar o provedor pelo procedimento suportado do Supabase e conferir as identidades antes de liberar o acesso. Registrar data, versão, contagens, duração do ensaio e responsável. RPO de 24 horas e RTO de um dia útil são metas sujeitas ao backup contratado e ao ensaio documentado.

## Verificações de implantação

GET /api/health verifica o processo. GET /api/ready consulta o banco e não expõe a conexão. Uma API de dados sem sessão responde 401; operação proibida, 403; obra não autorizada, 404. Logs registram somente ID da requisição, status e duração.

Antes de liberar uma atualização, guardar a cópia anterior, conferir migrações e testar os fluxos principais. Reverter o serviço para o commit anterior somente se o esquema permanecer compatível; quando houver incompatibilidade, restaurar primeiro em ambiente separado e planejar a troca com o responsável.
