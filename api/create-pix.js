/**
 * /api/create-pix
 * Handler de criação de transação PIX via FreePay
 * Documentação: https://freepaybrasil.readme.io/reference/createpaymenttransaction
 *
 * Estrutura da resposta FreePay (200):
 * {
 *   "data": [{
 *     "id": "...",
 *     "amount": 1500,
 *     "payment_method": "pix",
 *     "status": "PENDING",
 *     "pix": {
 *       "qr_code": "...",        <-- código copia e cola (EMV)
 *       "url": "...",            <-- URL da imagem do QR Code
 *       "e2_e": "...",           <-- end-to-end ID
 *       "expiration_date": "..."
 *     }
 *   }]
 * }
 */
module.exports = async function (req, res) {
  try {
    console.log('[create-pix] invocado:', req.method);

    if (req.method === 'GET') return res.status(200).json({ ok: true });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    const body = req.body || {};
    console.log('[create-pix] body recebido:', JSON.stringify(body));

    // ── Credenciais ──────────────────────────────────────────────────────────
    const publicKey = process.env.FREEPAY_PUBLIC_KEY
      || process.env.PUBLIC_KEY
      || process.env.FREEPAY_API_PUBLIC_KEY;
    const secretKey = process.env.FREEPAY_SECRET_KEY
      || process.env.SECRET_KEY
      || process.env.FREEPAY_API_SECRET_KEY;

    if (!publicKey || !secretKey) {
      console.error('[create-pix] Chaves FreePay ausentes nas variáveis de ambiente');
      return res.status(500).json({
        error: 'freepay_keys_missing',
        message: 'Configure FREEPAY_PUBLIC_KEY e FREEPAY_SECRET_KEY nas variáveis de ambiente.'
      });
    }

    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');

    // ── Postback URL ─────────────────────────────────────────────────────────
    const forwardedProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const autoPostbackUrl = host ? `${forwardedProto}://${host}/api/freepay-webhook` : null;
    const postbackUrl = process.env.FREEPAY_POSTBACK_URL || autoPostbackUrl;

    if (!postbackUrl) {
      console.error('[create-pix] postback_url nao pôde ser determinado');
      return res.status(500).json({
        error: 'freepay_postback_missing',
        message: 'Configure FREEPAY_POSTBACK_URL nas variáveis de ambiente.'
      });
    }

    // ── Normalização do valor (centavos inteiro) ──────────────────────────────
    const parseMoneyToCents = (v) => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 100);
      if (typeof v === 'string') {
        const cleaned = v.replace(/[^0-9,.]/g, '').replace(',', '.');
        const parsed = Number(cleaned);
        if (!Number.isNaN(parsed) && parsed > 0) return Math.round(parsed * 100);
      }
      return null;
    };

    // ── Cálculo do amount ─────────────────────────────────────────────────────
    let amountCents = null;

    if (Array.isArray(body.items) && body.items.length > 0) {
      // Calcular a partir dos itens
      let sum = 0;
      for (const it of body.items) {
        const unitCents = parseMoneyToCents(it.unit_price) || 0;
        const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
        sum += unitCents * qty;
      }
      if (sum > 0) amountCents = sum;
      console.log('[create-pix] amount calculado dos itens:', amountCents, 'centavos');
    }

    // Fallback para amount direto se itens não forneceram valor
    if (!amountCents) {
      amountCents = parseMoneyToCents(body.amount)
        || parseMoneyToCents(body.total)
        || parseMoneyToCents(body.valor)
        || parseMoneyToCents(body.value);
    }

    if (!amountCents || amountCents <= 0) {
      console.error('[create-pix] amount inválido:', body.amount, 'body:', JSON.stringify(body));
      return res.status(400).json({
        error: 'invalid_amount',
        message: 'Valor do pagamento inválido ou ausente.'
      });
    }

    // ── Normalização do customer ──────────────────────────────────────────────
    if (!body.customer) {
      return res.status(400).json({
        error: 'customer_missing',
        message: 'Dados do cliente são obrigatórios.'
      });
    }

    const rawDoc = String(body.customer.document || body.customer.cpf || '').replace(/\D/g, '');
    const rawPhone = String(body.customer.phone || '').replace(/\D/g, '');

    // Formatar telefone no formato E.164 (+5511999999999) conforme exigido pela FreePay
    let formattedPhone = rawPhone;
    if (formattedPhone && !formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }
    if (formattedPhone && !formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }
    if (!formattedPhone || formattedPhone.length < 10) {
      formattedPhone = '+5511999999999'; // fallback
    }

    const customer = {
      name: String(body.customer.name || 'Cliente').trim(),
      email: String(body.customer.email || 'cliente@example.com').trim(),
      phone: formattedPhone,
      document: {
        type: rawDoc.length === 14 ? 'cnpj' : 'cpf',
        number: rawDoc || '00000000000'
      }
    };

    console.log('[create-pix] customer normalizado:', JSON.stringify(customer));

    // ── Normalização dos itens ────────────────────────────────────────────────
    // IMPORTANTE: O campo 'title' deve estar DENTRO de cada item, não no nível raiz
    let items = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      items = body.items.map(it => ({
        title: String(it.name || it.title || 'Produto').substring(0, 100),
        quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
        unit_price: parseMoneyToCents(it.unit_price) || amountCents,
        tangible: it.tangible !== false  // Padrão: true (produto físico)
      }));
    } else {
      items = [{
        title: String(body.productName || body.name || 'Produto').substring(0, 100),
        quantity: 1,
        unit_price: amountCents,
        tangible: true
      }];
    }

    // ── Montagem do payload FreePay ───────────────────────────────────────────
    // Preparar metadata com informações úteis (obrigatório na FreePay)
    // Não pode ser um objeto vazio {}
    const metadata = {
      checkout_id: `checkout_${Date.now()}`,
      items_count: items.length,
      customer_name: customer.name
    };

    // Montar o payload conforme a documentação da FreePay
    // IMPORTANTE: 'title' vai DENTRO de cada item, não no nível raiz
    const fpPayload = {
      payment_method: 'pix',
      amount: amountCents,
      postback_url: postbackUrl,
      customer,
      items,
      metadata
    };

    console.log('[create-pix] === ENVIANDO PARA FREEPAY ===');
    console.log('[create-pix] items:', JSON.stringify(items));
    console.log('[create-pix] metadata:', JSON.stringify(metadata));
    console.log('[create-pix] payload:', JSON.stringify(fpPayload, null, 2));

    // ── Chamada à API FreePay ─────────────────────────────────────────────────
    const _fetch = (typeof fetch !== 'undefined') ? fetch
      : (global && global.fetch) ? global.fetch
      : null;

    if (!_fetch) {
      console.error('[create-pix] fetch não disponível no ambiente Node.js');
      return res.status(500).json({ error: 'fetch_unavailable' });
    }

    const fpResp = await _fetch('https://api.freepaybrasil.com/v1/payment-transaction/create', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(fpPayload)
    });

    const rawText = await fpResp.text();
    console.log('[create-pix] === RESPOSTA FREEPAY ===');
    console.log('[create-pix] status HTTP:', fpResp.status);
    console.log('[create-pix] body:', rawText);

    let fpJson;
    try {
      fpJson = JSON.parse(rawText);
    } catch (e) {
      fpJson = { raw: rawText };
    }

    // ── Erro da FreePay ───────────────────────────────────────────────────────
    if (fpResp.status >= 400) {
      console.error('[create-pix] Erro da FreePay:', fpResp.status, JSON.stringify(fpJson));
      return res.status(fpResp.status).json({
        error: 'freepay_error',
        message: fpJson.message || fpJson.error || 'Erro ao criar transação PIX.',
        detail: fpJson,
        _debug: { payload_sent: fpPayload }
      });
    }

    // ── Normalização da resposta para o frontend ──────────────────────────────
    // Estrutura da FreePay:
    // { "data": [{ "id": "...", "amount": 1500, "pix": { "qr_code": "...", "url": "...", "e2_e": "...", "expiration_date": "..." } }] }
    const dataArr = Array.isArray(fpJson.data) ? fpJson.data : (fpJson.data ? [fpJson.data] : []);
    const txData = dataArr.length > 0 ? dataArr[0] : (fpJson || {});
    const pixObj = (txData && txData.pix) ? txData.pix : {};

    // Extrair o código PIX copia-e-cola (campo qr_code na doc)
    const pixCode = pixObj.qr_code
      || pixObj.qrcode
      || pixObj.code
      || pixObj.payload
      || txData.qr_code
      || fpJson.qr_code
      || null;

    // URL da imagem do QR Code (campo url na doc)
    const pixQrImageUrl = pixObj.url
      || txData.qr_code_url
      || fpJson.qr_code_url
      || null;

    const transactionId = (txData && txData.id) ? txData.id : (fpJson.id || null);
    const calculatedAmount = (txData && txData.amount != null) ? txData.amount : amountCents;
    const expirationDate = pixObj.expiration_date || null;
    const e2e = pixObj.e2_e || null;
    const status = (txData && txData.status) ? txData.status : 'PENDING';

    console.log('[create-pix] pixCode extraído:', pixCode ? pixCode.substring(0, 60) + '...' : 'NULO - VERIFICAR RESPOSTA DA FREEPAY');
    console.log('[create-pix] pixQrImageUrl:', pixQrImageUrl);
    console.log('[create-pix] transactionId:', transactionId);
    console.log('[create-pix] status:', status);

    // Resposta normalizada para o frontend
    // O frontend em pagamento.html lê: data.pix_code || data.pixCode || data.data[0].pixCode
    const normalizedResponse = {
      // Campos originais da FreePay
      ...fpJson,
      // Campos normalizados no nível raiz (para compatibilidade com o frontend)
      pixCode,
      pix_code: pixCode,
      pixQrImageUrl,
      transactionId,
      calculatedAmount,
      expirationDate,
      e2e,
      status,
      // Garantir que data seja sempre um array com os campos normalizados
      data: dataArr.length > 0
        ? dataArr.map((item, idx) => idx === 0 ? {
            ...item,
            pixCode,
            pix_code: pixCode,
            pixQrImageUrl,
            transactionId: item.id || transactionId
          } : item)
        : [{
            pixCode,
            pix_code: pixCode,
            pixQrImageUrl,
            transactionId,
            calculatedAmount,
            status
          }]
    };

    return res.status(200).json(normalizedResponse);

  } catch (err) {
    console.error('[create-pix] erro interno:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'internal_error', detail: String(err) });
  }
};
