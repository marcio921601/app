# Render Web Services - operacional

## Pasta fonte

Use esta pasta como fonte do deploy:

`zip_check_ENTREGA_DIARIO_OBRAS_2026-05-04`

Nao envie `node_modules`, `dist`, logs ou `server/data/diarios.json` para o repositorio.

## Deploy recomendado

1. Crie um repositorio GitHub para o projeto.
2. Envie os arquivos desta pasta para o repositorio.
3. No Render, escolha `New +` > `Blueprint`.
4. Conecte o repositorio.
5. Confirme o servico `diario-obras-itauba` lido do `render.yaml`.
6. Aguarde o deploy e abra a URL gerada pelo Render.

## Configuracao equivalente manual

Se preferir criar como Web Service manual:

- Runtime: `Node`
- Build Command: `npm ci && npm run build`
- Start Command: `npm run start`
- Health Check Path: `/api/health`
- Environment Variable: `NODE_VERSION=20.19.0`

## Persistencia

O app salva dados no navegador por `localStorage`, o que preserva o uso individual por usuario/browser.

Para persistir os dados da API Node no servidor:

1. Anexe um Persistent Disk ao Web Service.
2. Use Mount Path: `/var/data`
3. Configure Environment Variable: `DATA_DIR=/var/data`

Sem Persistent Disk, o JSON da API pode ser perdido em redeploy/restart. Para uso multiusuario real, o proximo passo recomendado e banco gerenciado, como Postgres.

## Validacoes locais ja feitas

- `npm ci`
- `npm run build`
- `npm run start` com `PORT`
- `/api/health`
- `POST /api/diarios/draft` usando `DATA_DIR`
