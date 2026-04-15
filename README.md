# Armário Checkout — Deploy Railway + FreePay PIX

Loja de armário com checkout PIX integrado à [FreePay](https://freepaybrasil.readme.io).

---

## Estrutura do Projeto

```
armario-checkout/
├── server.js              # Servidor HTTP (entrada principal)
├── package.json
├── railway.json           # Configurações de deploy Railway
├── nixpacks.toml          # Versão do Node.js para Railway
├── .env.example           # Modelo de variáveis de ambiente
├── .gitignore
│
├── api/
│   └── create-pix.js      # Handler da API FreePay (criação de transação PIX)
│
├── checkout/
│   ├── checkout.js        # Estado compartilhado do checkout (localStorage)
│   ├── checkout.css       # Estilos do checkout
│   ├── carrinho.html      # Página do carrinho
│   ├── identificacao.html # Página de identificação do cliente
│   ├── envio.html         # Página de endereço/envio
│   ├── pagamento.html     # Página de seleção de pagamento (chama /api/create-pix)
│   └── pix.html           # Página do QR Code PIX
│
└── armario/               # Página do produto (catálogo)
    └── index.htm
```

---

## Deploy no Railway

### 1. Criar o projeto no Railway

1. Acesse [railway.app](https://railway.app) e crie um novo projeto
2. Selecione **Deploy from GitHub repo** (ou faça upload manual)
3. Conecte o repositório com este projeto

### 2. Configurar as variáveis de ambiente

No painel do Railway, vá em **Settings > Variables** e adicione:

| Variável | Descrição | Obrigatório |
|---|---|---|
| `FREEPAY_PUBLIC_KEY` | Chave pública da FreePay | ✅ Sim |
| `FREEPAY_SECRET_KEY` | Chave secreta da FreePay | ✅ Sim |
| `FREEPAY_POSTBACK_URL` | URL do webhook (ex: `https://seu-app.railway.app/api/freepay-webhook`) | Opcional (detectado automaticamente) |
| `NODE_ENV` | `production` | Recomendado |

> **Onde encontrar as chaves FreePay?**
> Acesse o painel da FreePay → Configurações → Integração → Chaves de API

### 3. Deploy automático

O Railway detecta automaticamente o `package.json` e executa `node server.js`.
O health check é feito em `/health`.

---

## Fluxo do Checkout

```
Produto (armario/index.htm)
    ↓ Clique em "Comprar"
Carrinho (checkout/carrinho.html)
    ↓ Confirmar
Identificação (checkout/identificacao.html)
    ↓ Dados do cliente
Envio (checkout/envio.html)
    ↓ Endereço
Pagamento (checkout/pagamento.html)
    ↓ Clique em "Continuar" → POST /api/create-pix
PIX (checkout/pix.html)
    ↓ QR Code + Código copia-e-cola
```

---

## API FreePay

### `POST /api/create-pix`

**Corpo da requisição:**
```json
{
  "amount": 15000,
  "customer": {
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "11999999999",
    "document": "12345678901"
  },
  "items": [
    {
      "name": "Armário 3 Portas",
      "quantity": 1,
      "unit_price": 15000
    }
  ]
}
```

> **Nota:** `amount` e `unit_price` devem ser em **centavos** (ex: R$ 150,00 = `15000`)

**Resposta de sucesso (200):**
```json
{
  "pixCode": "00020126...",
  "pix_code": "00020126...",
  "pixQrImageUrl": "https://...",
  "transactionId": "abc123",
  "expirationDate": "2026-04-14T15:30:00Z",
  "data": [{
    "id": "abc123",
    "amount": 15000,
    "status": "PENDING",
    "pix": {
      "qr_code": "00020126...",
      "url": "https://...",
      "e2_e": "...",
      "expiration_date": "2026-04-14T15:30:00Z"
    }
  }]
}
```

### `POST /api/freepay-webhook`

Recebe notificações de pagamento da FreePay. Configure a URL no painel da FreePay:
```
https://seu-app.railway.app/api/freepay-webhook
```

### `GET /health`

Health check para o Railway:
```json
{ "ok": true, "service": "armario-checkout", "uptime": 123 }
```

---

## Desenvolvimento Local

```bash
# Instalar dependências (nenhuma necessária — usa apenas Node.js built-in)
# Criar arquivo .env com as credenciais
cp .env.example .env
# Editar .env com suas chaves FreePay

# Iniciar o servidor
node server.js
# Acesse: http://localhost:3000
```
