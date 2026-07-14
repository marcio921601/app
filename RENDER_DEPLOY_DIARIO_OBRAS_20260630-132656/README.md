# Diario de Obras Itauba

Aplicacao React para diario de obra com:

- multiobra
- diario operacional
- produtividade com HH e un/HH
- orcamento vinculado
- dashboard
- historico
- relatorio gerencial padrao Itauba

## Estrutura

- `src/App.jsx`: shell principal e composicao das abas
- `src/hooks/useDiaryApp.js`: estado central, calculos, persistencia e acoes
- `src/services/storage.js`: persistencia local com backup e migracao de compatibilidade
- `src/services/backend.js`: camada pronta para integrar API
- `src/components/sections/`: uma aba por modulo funcional
- `src/components/print/PrintLayout.jsx`: relatorio de impressao/PDF

## Compatibilidade

- chave de armazenamento preservada: `diario-obra-app-v6-itauba`
- estrutura principal de dados mantida
- fallback local ativo mesmo sem backend

## Proximos passos sugeridos

1. Instalar dependencias com `npm install`
2. Rodar frontend + API Node com `npm run dev:all`
3. Para build de producao: `npm run build`
4. Para subir em Node depois do build: `npm run start`
5. Se quiser apontar para outra API, configure `VITE_API_BASE_URL`

## Fluxo Node.js

- `npm run dev:all`
  - API Node em `http://localhost:3001`
  - App React em `http://localhost:5173`
- `npm run start`
  - sobe o servidor Node
  - serve a API em `/api`
  - serve o front compilado de `dist`

## Deploy no Render Web Services

O projeto esta pronto para subir como Web Service Node no Render.

### Opcao com Blueprint

Use o arquivo `render.yaml` na raiz do projeto:

- build command: `npm ci && npm run build`
- start command: `npm run start`
- health check: `/api/health`
- runtime: Node.js

Fluxo:

1. Envie este projeto para um repositorio Git.
2. No Render, crie um novo Blueprint usando o repositorio.
3. Confirme o servico `diario-obras-itauba`.
4. Depois do deploy, abra a URL `.onrender.com` gerada.

### Opcao manual

Crie um Web Service no Render apontando para o repositorio e configure:

- Runtime: `Node`
- Build Command: `npm ci && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/api/health`
- Environment Variable: `NODE_VERSION=20.19.0`

### Persistencia dos dados

O app continua salvando no navegador com `localStorage`, entao o uso individual permanece preservado no proprio browser.

A API Node salva rascunhos e snapshots em JSON. Em hospedagem, o filesystem padrao do Render e temporario; se quiser persistir esses arquivos no servidor entre redeploys/restarts, anexe um Persistent Disk e configure:

- Mount path: `/var/data`
- Environment Variable: `DATA_DIR=/var/data`

Para uso multiusuario real, a melhor evolucao continua sendo trocar esse JSON por banco gerenciado, como Postgres.
