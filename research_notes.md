# Notas de investigação

## Verificação da nova index

A página `/home/ubuntu/work/armario/index.html` abriu corretamente com o cabeçalho amarelo, a área de busca, o catálogo inicial e o card do armário vinculado para `armario/index.htm`.

## Documentação Freepay Brasil

URL consultada: <https://freepaybrasil.readme.io/reference/introdu%C3%A7%C3%A3o>

### Pontos confirmados na página de introdução

- A API segue padrão REST e responde em JSON.
- A autenticação deve ser enviada com **Basic Auth**.
- O header `authorization` precisa usar o formato `Basic Base64(PUBLIC_KEY:SECRET_KEY)`.
- A própria introdução mostra o endpoint base de criação em `https://api.freepaybrasil.com/v1/payment-transaction/create`.
- A documentação indica que as credenciais devem ser obtidas na área **Credenciais API** do painel.

### Hipótese inicial

O backend extraído em `api/create-pix.js` já usa `Basic ${base64(publicKey:secretKey)}` e chama `https://api.freepaybrasil.com/v1/payment-transaction/create`, então a falha no Railway provavelmente está em um destes pontos:

1. Variáveis de ambiente ausentes ou com nome incorreto no deploy.
2. Payload enviado pelo frontend incompatível com o formato esperado pela API.
3. Resposta da Freepay chegando em um formato diferente do que o frontend lê.
4. Possível ausência de `postback_url` ou outro campo exigido no ambiente hospedado.

## Conclusão da investigação no Railway

### Causa mais provável da falha ao gerar PIX

A principal causa encontrada é estrutural: o projeto só tinha o arquivo `api/create-pix.js`, no estilo de função serverless, mas **não havia `package.json`, `server.js`, `Procfile` ou outra estrutura de backend para o Railway executar**. Em outras palavras, no deploy do Railway a rota `/api/create-pix` provavelmente não existia como função ativa, porque Railway não interpreta automaticamente a pasta `api/` como Vercel faz.

### Evidências no projeto

- Na raiz existia apenas `./api/create-pix.js` como backend.
- Não existia `package.json` na raiz antes do ajuste.
- Não existia servidor HTTP para servir o site e encaminhar `/api/create-pix`.

### Ajustes aplicados

1. Foi criado `server.js` para o Railway servir os arquivos estáticos e expor:
   - `/api/create-pix`
   - `/api/freepay-webhook`
   - `/api/health`
2. Foi criado `package.json` com `start: node server.js`.
3. O backend `api/create-pix.js` foi reforçado para:
   - aceitar aliases de variáveis de ambiente;
   - sempre montar `postback_url`, com fallback para a própria URL pública do Railway;
   - enviar `Accept: application/json`;
   - sempre montar `metadata`, já que a documentação marca esse campo como obrigatório;
   - normalizar melhor o retorno do PIX.
4. O frontend `checkout/pagamento.html` foi ajustado para aceitar mais formatos de resposta e mostrar o erro devolvido pela API.

### Variáveis recomendadas no Railway

- `FREEPAY_PUBLIC_KEY`
- `FREEPAY_SECRET_KEY`
- `FREEPAY_POSTBACK_URL` (opcional após o ajuste, mas recomendado explicitamente)

### Observação importante

Mesmo com o fallback automático de `postback_url`, o ideal é configurar manualmente no Railway uma URL pública estável, por exemplo:

`https://SEU-DOMINIO.up.railway.app/api/freepay-webhook`

### Teste local realizado

O novo servidor foi iniciado localmente com sucesso e respondeu em `http://127.0.0.1:3000/api/health` com status OK, confirmando que a estrutura agora está pronta para o modelo de deploy do Railway.
