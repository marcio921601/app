# Operação do Diário de Obras para equipe online

Data: 21 de outubro de 2026. Situação: especificação para revisão do responsável pelo aplicativo.

## Objetivo e escopo do piloto

Disponibilizar o Diário de Obras para uma equipe de até 10 usuários em até 3 obras, com acesso pela internet e dados compartilhados entre celular e computador. O desenho aprovado mantém as telas em React, a API em Node e adota PostgreSQL e autenticação gerenciada do Supabase. O Render hospeda a aplicação.

O piloto começa em uma obra, com pessoas de perfis diferentes. O responsável informou que não existem lançamentos anteriores: a preparação inicial parte de uma base nova e utiliza apenas os cadastros reais fornecidos. Dados de exemplo do código não são importados para a produção. A liberação das demais obras depende da conferência do cadastro, dos testes de acesso, da gravação simultânea e de uma restauração de backup. Os dados reais de cadastro são entradas de implantação; sua ausência não impede desenvolver e testar com dados fictícios.

O uso inicial inclui cadastro de obras e profissionais, presença, atividades, produtividade, orçamento, histórico e relatórios existentes. Aprovação formal de diários, anexos e operação offline completa ficam para uma evolução posterior. Uma falha de conexão deve preservar o conteúdo em edição e indicar claramente que o servidor ainda não confirmou a gravação.

## Comportamento atual que será substituído

O aplicativo restaura o estado inteiro do navegador, incluindo usuários, permissões e usuário selecionado. A instalação inicial seleciona o administrador. A troca de identidade também pode ocorrer por parâmetros de URL. As permissões são verificadas no React, enquanto a API aceita leituras e gravações sem autenticação e mantém um rascunho global em JSON.

Na operação compartilhada, a API será a autoridade sobre identidade, acesso e dados. A identidade autenticada não será obtida de IDs ou perfis enviados pelo navegador. O servidor determinará o autor de cada alteração. Os dados de um navegador não poderão substituir toda a base central.

## Arquitetura e responsabilidades

| Componente | Responsabilidade |
| --- | --- |
| React existente | Formulários, relatórios, seleção de obra autorizada e apresentação do estado de salvamento. |
| API Node no Render | Login, sessão, permissões, validação, operações por registro, versões e histórico de alterações. |
| Supabase Auth | Verificação de credenciais, convites e recuperação de senha. |
| PostgreSQL no Supabase | Obras, usuários da aplicação, vínculos de acesso, cadastros, diários, orçamento, sessões e auditoria. |
| Serviço SMTP configurado | Entrega dos convites e das mensagens de recuperação de senha. |

O navegador acessa a API Node na mesma origem da aplicação. A API utiliza conexões TLS com o banco e com o serviço de autenticação. As tabelas da aplicação ficam em um esquema privado, sem exposição direta pela API de dados do Supabase. A credencial usada pela API recebe somente as permissões necessárias; alterações de estrutura usam uma credencial separada.

Uma instância Node é o ponto de partida do piloto. A implantação recebe medições de memória, erros e duração das requisições para orientar o dimensionamento. O aceite inclui um ensaio com até 10 sessões concorrentes nos fluxos principais; a quantidade de usuários cadastrados, isoladamente, não estabelece a capacidade real.

## Login e sessões

O administrador cadastra pessoas e libera suas obras. O acesso público permite entrar e recuperar a senha; criar contas e atribuir permissões exige acesso administrativo. O cadastro inicial do primeiro administrador ocorre por um procedimento de implantação executado pelo responsável, com e-mail verificado. Os usuários de exemplo do código não se tornam contas reais automaticamente.

O Node intermedeia o login com Supabase Auth. Após validar as credenciais, gera um identificador de sessão aleatório de pelo menos 32 bytes e envia um cookie opaco com HttpOnly, Secure em produção, SameSite=Lax, Path=/ e sem Domain. O navegador não recebe os tokens de acesso ou renovação do provedor para armazenamento em localStorage.

A aplicação armazena o hash do identificador da sessão no banco. Os tokens do provedor necessários à renovação ficam criptografados no servidor com chave de ambiente, separados dos registros operacionais. Cada sessão tem expiração inicial de 12 horas sem atividade e limite absoluto de 7 dias. A renovação dos tokens é coordenada por sessão para evitar renovações simultâneas conflitantes.

Toda requisição protegida verifica a sessão, a situação ativa do usuário e suas permissões atuais no banco. Sair encerra a sessão local no servidor e solicita a revogação correspondente ao provedor. Desativar um usuário invalida suas sessões. A expiração ou falha de renovação exige novo login, preservando o conteúdo ainda não enviado para recuperação após autenticação.

As operações autenticadas que alteram dados exigem token contra falsificação de requisições, além de verificar a origem. O login também valida a origem. As respostas de autenticação usam mensagens que não revelam se um e-mail está cadastrado e limites de tentativas por IP e identificador. Segredos não são registrados em logs nem incluídos no pacote React.

O envio de e-mails usa SMTP configurado para um remetente autorizado. O SMTP padrão do Supabase não atende aos convites de produção para destinatários arbitrários.

## Permissões por obra

Cada pessoa possui uma conta individual. Um vínculo entre usuário, obra e perfil define o acesso operacional. Um administrador global gerencia obras, pessoas e vínculos. As permissões iniciais usam os perfis do aplicativo, restringindo a edição do Apontador aos módulos de diário e produtividade, conforme a escolha de acesso confirmada para o piloto:

| Perfil | Acesso inicial |
| --- | --- |
| Administrativo | Todos os módulos; gestão de usuários, obras e permissões; exclusões com registro de autoria. |
| Engenheiro | Consulta e edição de cadastros, diário, produtividade, gerencial e histórico nas obras vinculadas; consulta do dashboard. |
| Apontador | Consulta e edição de diário e produtividade nas obras vinculadas; consulta do histórico correspondente, sem edição direta ou exclusão. |
| RH | Consulta e edição dos cadastros nas obras vinculadas; consulta do histórico. |

A ação de registrar um diário no histórico é uma operação do módulo de diário e exige a permissão de editar diário. Ela cria ou atualiza a revisão daquele registro, sem conceder edição direta de outros registros do histórico. A exclusão do histórico exige uma permissão específica, inicialmente concedida ao administrador. A API verifica o acesso à obra e à operação em todas as rotas, inclusive exportações, histórico, orçamento e importações. Uma requisição sem sessão recebe 401; uma operação sem permissão recebe 403; a consulta direta a uma obra não autorizada responde 404 para não revelar sua existência.

O modo de visualizar como outro perfil permanece uma simulação administrativa. Ele não troca a identidade autenticada, não amplia privilégios e não altera a autoria de operações. O servidor impede remover ou desativar o último administrador ativo. A recuperação de cadastro não recria automaticamente um administrador a partir de dados do navegador.

## Organização dos dados

| Entidade | Regras principais |
| --- | --- |
| Usuários | ID interno, ID do Supabase Auth, nome e situação. E-mail e credenciais são administrados pelo provedor de autenticação. |
| Perfis e vínculos com obras | Permissões por operação e vínculo explícito entre pessoa e obra. |
| Obras | ID estável, código, nome, cliente, local, responsável e situação. Renomear a obra não muda seu ID. |
| Profissionais e afastamentos | IDs estáveis, vínculo com obra e períodos de afastamento validados. |
| Itens de orçamento | Vínculo com obra, referência, hierarquia, unidade, quantidades e valores. |
| Diários | ID estável, obra, data operacional, situação, conteúdo, versão, autor e datas de criação e atualização. |
| Revisões do diário | Versão anterior, conteúdo, autor autenticado, instante e descrição da alteração. |
| Auditoria | Eventos de acesso administrativo e alteração de dados, incluindo exclusões e importações. |
| Importações | Origem, hash do arquivo, mapeamentos, resultado da conferência e registros importados. |
| Sessões | Hash do identificador, usuário, expirações e material de autenticação criptografado. |

Para o piloto, há um diário atual por obra e data, compatível com a busca atual do histórico. Edições geram revisões do mesmo diário. A situação inicial é rascunho; a ação de salvar no histórico passa o diário para registrado. Alterações posteriores de um diário registrado geram revisões, sem criar outro diário para a mesma obra e data. O conteúdo de presença, atividades, produção e resumo usa a estrutura existente em JSONB por diário, com validação no servidor. Isso preserva o formato dos relatórios sem manter um único documento para toda a aplicação.

Datas de trabalho são armazenadas como datas sem conversão implícita para UTC. Instantes de auditoria são armazenados em UTC e exibidos em America/Sao_Paulo. A data inicial dos formulários segue o dia local. As preferências de obra selecionada e filtros ficam por pessoa ou dispositivo e não integram o conteúdo compartilhado do diário.

## Leitura e gravação compartilhadas

Depois do login, o aplicativo carrega somente as obras e os dados autorizados. Selecionar uma obra carrega seus cadastros, orçamento e diários. As requisições operam sobre recursos identificados por ID e não aceitam substituição completa do estado do aplicativo.

As mudanças do formulário são agrupadas após 1 segundo sem digitação e enviadas com a versão lida. O servidor valida o conteúdo e atualiza o registro somente se essa versão ainda for a atual. A atualização e a revisão de auditoria são gravadas na mesma transação. Um conflito responde 409 com a indicação de que existe uma versão mais recente; a interface mantém a edição local e permite comparar antes de reaplicar as alterações.

A interface apresenta os estados alterado, enviando, salvo no servidor, falha no envio e conflito. Uma confirmação depende da resposta do servidor. O conteúdo pendente deve ser preservado localmente em chave separada por usuário, obra e data; a restauração exige autenticação compatível e não envia dados automaticamente ao entrar em outra conta. Ao sair, o aplicativo informa sobre conteúdo pendente e permite exportá-lo ou descartá-lo antes de limpar a cópia local daquela conta.

As listas são atualizadas ao recuperar o foco e por consulta periódica de até 15 segundos quando estiverem visíveis. Após uma gravação, a própria tela usa a versão retornada pelo servidor. O piloto não depende de edição colaborativa caractere a caractere.

O servidor valida referências de obra e profissional, datas, campos obrigatórios, números finitos, quantidades, horários e sobreposição de alocação de profissionais. Arquivos de orçamento têm limite inicial de 5 MiB e 10 mil linhas, prévia de importação e relatório de inconsistências. O corpo JSON de um diário tem limite de 2 MiB. Exceder esses limites gera uma mensagem específica, sem gravar conteúdo parcial.

## Migração dos dados existentes

Na implantação inicial confirmada, não há lançamentos para migrar. A primeira entrega começa com os cadastros reais fornecidos e não inclui desenvolver uma ferramenta de migração de lançamentos legados. O procedimento abaixo se aplica caso uma base anterior seja identificada durante a preparação ou seja incorporada posteriormente; nesse caso, a importação e sua ferramenta são planejadas antes de incorporar a base. Uma importação só ocorre após sua conferência pelo responsável.

1. Identificar os computadores, navegadores e endereços em que o aplicativo já foi utilizado. O armazenamento local é específico de cada origem e navegador.
2. Exportar o JSON de cada base e preservar uma cópia original antes de qualquer mudança. Bases da API atual também são copiadas antes da migração.
3. Importar em uma área de conferência, validando o formato e identificando obras e datas repetidas. O hash da origem e o mapeamento de IDs impedem repetir a mesma importação.
4. Mapear os registros para IDs estáveis de obra. Se duas bases contiverem versões diferentes do mesmo diário, o responsável escolhe a versão vigente; as demais ficam preservadas como revisões de origem identificada. Nenhuma base substitui a outra silenciosamente.
5. Conferir quantidades de obras, profissionais, diários, itens de orçamento e valores totais. Comparar relatórios representativos com os originais.
6. Cadastrar as pessoas reais e enviar convites. Os nomes de autoria legados são preservados como informação importada, sem serem tratados como identidade autenticada comprovada.
7. Liberar a obra piloto após a conferência. Novos registros passam a ser feitos na base central; o legado preservado serve para recuperação e comparação.

## Implantação e recuperação

O serviço Render usa a pasta RENDER_DEPLOY_DIARIO_OBRAS_20260630-132656, build npm ci && npm run build e inicialização npm run start. O runtime será atualizado do Node 20 para Node 24 LTS, validando as dependências antes da implantação. O teste de implantação inclui a raiz do serviço e o caminho do Blueprint, pois o projeto está em uma subpasta do repositório.

As configurações de servidor incluem origem pública, conexão TLS com o banco, endereço do Supabase, credencial administrativa restrita ao servidor, chave de criptografia das sessões e parâmetros de sessão. Os valores são configurados no ambiente da hospedagem. Migrações de banco são versionadas e executadas antes de liberar a versão compatível da aplicação.

O endpoint /api/health informa que o processo responde; um endpoint separado de prontidão verifica o banco sem expor detalhes da conexão. Logs registram identificador da requisição, erro e duração, com ocultação de credenciais e conteúdo sensível. Antes da produção, uma implantação de teste separada usa contas e dados fictícios.

O Supabase Pro oferece backups diários com retenção de sete dias. O procedimento operacional acrescenta uma exportação semanal criptografada, sob guarda do administrador, e uma cópia antes de migrações ou atualizações relevantes. Uma restauração ocorre em base separada, com conferência antes de mudar a conexão de produção. A meta inicial é perder no máximo 24 horas de dados e restabelecer o serviço em até um dia útil; o ensaio de restauração verifica a viabilidade dessas metas.

A referência inicial de produção é US$ 7 mensais para o serviço Render e US$ 25 mensais para um projeto Supabase Pro com a instância Micro coberta pelos créditos incluídos. A soma de US$ 32 mensais não inclui domínio, SMTP, ambiente adicional de teste, impostos, câmbio, recursos adicionais ou consumo excedente. A contratação permanece uma ação separada da preparação técnica.

## Dados para cadastrar a obra piloto

Para o primeiro cadastro, o responsável fornece nome ou código da obra, cidade e UF, cliente e responsável operacional. Informa também nome e e-mail do administrador e, para cada usuário, nome, e-mail, função e obras autorizadas. As pessoas definem suas senhas pelo convite individual.

Antes de iniciar os lançamentos, são cadastrados profissionais, funções, jornada padrão e orçamento da obra, caso o módulo de orçamento seja utilizado. Datas previstas e demais dados do cabeçalho completam os relatórios. A existência de dados anteriores deve ser informada para organizar a exportação de todas as bases.

Os nomes, códigos e valores reais são mantidos em cadastro ou arquivo de implantação restrito; não são incluídos em fixtures públicas nem no código-fonte. O piloto usa o endereço disponibilizado pela hospedagem; um domínio próprio pode ser configurado posteriormente.

## Critérios de aceite

| Verificação | Resultado exigido |
| --- | --- |
| Login, convite e recuperação | Uma pessoa convidada entra, altera a senha e recupera o acesso pelo e-mail configurado. |
| Bloqueio e saída | Sessões encerradas ou de usuário bloqueado deixam de acessar a API. |
| Acesso por obra | Alterar IDs na URL ou no corpo não dá acesso a outra obra nem a funções administrativas. |
| Compartilhamento | Um registro confirmado em um dispositivo aparece para outro usuário autorizado. |
| Edição simultânea | Duas sessões editam a mesma versão; a primeira grava e a segunda recebe conflito sem perder a edição local. |
| Falha de conexão | A tela mantém o conteúdo pendente e não informa que foi salvo no servidor. |
| Validação | Horários, quantidades e referências inválidos são recusados também por chamadas diretas à API. |
| Base inicial | A produção começa sem lançamentos e sem dados de exemplo. Se uma base legada for incorporada posteriormente, sua importação repetida não duplica registros e os totais conferem com as origens aprovadas. |
| Autoria | O servidor grava o autor autenticado e preserva separadamente as autorias importadas. |
| Recuperação | Um backup é restaurado em base separada e seus dados são conferidos. |
| Operação concorrente | Até 10 sessões executam leitura e gravação sem perda de dados; o ensaio registra latência, memória e falhas. |
| Regressão funcional | Presença, atividades, produtividade, orçamento, histórico e relatórios mantêm os resultados conferidos do aplicativo atual. |

## Referências

- [Repositório analisado e revisão de referência](https://github.com/marcio921601/app/tree/5e4267a09756da6bf5aae301318b89f4eecee041).
- [OWASP sobre autorização por requisição](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- [OWASP sobre gerenciamento de sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [Supabase sobre sessões e renovação](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Supabase sobre SMTP de produção](https://supabase.com/docs/guides/auth/auth-smtp).
- [Preços e backups incluídos do Supabase](https://supabase.com/pricing).
- [Preços do Render](https://render.com/pricing).
- [Configuração de serviços no Render](https://render.com/docs/blueprint-spec).
- [Versões suportadas do Node](https://nodejs.org/en/about/previous-releases).
