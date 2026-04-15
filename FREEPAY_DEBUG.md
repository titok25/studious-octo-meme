# Diagnóstico do Erro "Feature is disabled" - Freepay Brasil

## Erro Observado
```
Status: 400 Bad Request
Mensagem: Feature is disabled
```

## Possíveis Causas

### 1. **Conta Freepay não ativada para PIX**
- Sua conta pode estar em modo teste ou não ter PIX habilitado
- **Solução:** Entre em contato com suporte@freepaybrasil.com para ativar PIX

### 2. **Chaves de API incorretas ou expiradas**
- As variáveis `FREEPAY_PUBLIC_KEY` e `FREEPAY_SECRET_KEY` podem estar erradas
- **Solução:** Verifique as credenciais no painel Freepay

### 3. **Formato do payload inválido**
- Alguns campos podem estar faltando ou em formato errado

## Payload Mínimo Testado

```json
{
  "payment_method": "pix",
  "amount": 1500,
  "postback_url": "https://seu-dominio.com/api/freepay-webhook",
  "customer": {
    "name": "Cliente Teste",
    "email": "teste@email.com",
    "phone": "11999999999",
    "document": {
      "type": "cpf",
      "number": "12345678901"
    }
  },
  "items": [
    {
      "name": "Produto Teste",
      "quantity": 1,
      "unit_price": 1500
    }
  ],
  "metadata": {}
}
```

## Como Testar via cURL

```bash
curl -X POST https://api.freepaybrasil.com/v1/payment-transaction/create \
  -H "Authorization: Basic $(echo -n 'SEU_PUBLIC_KEY:SEU_SECRET_KEY' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": "pix",
    "amount": 1500,
    "postback_url": "https://seu-dominio.com/api/freepay-webhook",
    "customer": {
      "name": "Teste",
      "email": "teste@email.com",
      "phone": "11999999999",
      "document": {
        "type": "cpf",
        "number": "12345678901"
      }
    },
    "items": [{
      "name": "Teste",
      "quantity": 1,
      "unit_price": 1500
    }],
    "metadata": {}
  }'
```

## Logs do Railway

Para verificar os logs detalhados:

```bash
# No Railway, acesse a seção Logs do seu serviço
# Procure por mensagens como:
# - "fpPayload to send:" (mostra o payload enviado)
# - "freepay response status:" (mostra a resposta)
```

## Próximos Passos

1. **Teste local:** Execute o cURL acima com suas credenciais reais
2. **Verifique a conta:** Confirme que PIX está ativado no painel Freepay
3. **Contate suporte:** Se o erro persistir, abra um ticket com Freepay incluindo:
   - O payload exato enviado (veja nos logs)
   - A resposta exata recebida
   - Seu ID de conta

## Referência
- Documentação: https://freepaybrasil.readme.io/reference/createpaymenttransaction
- Status codes: https://freepaybrasil.readme.io/docs/status-codes
