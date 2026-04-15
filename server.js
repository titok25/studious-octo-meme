/**
 * server.js
 * Servidor HTTP para Railway
 * - Serve arquivos estáticos
 * - Expõe /api/create-pix (integração FreePay)
 * - Expõe /api/freepay-webhook (recebe notificações da FreePay)
 * - Expõe /api/health (health check para Railway)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const createPixHandler = require('./api/create-pix');

// ── Tipos MIME suportados ─────────────────────────────────────────────────────
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.pdf':  'application/pdf'
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function enhanceResponse(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (data) {
    const payload = JSON.stringify(data);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(payload));
    }
    res.end(payload);
    return res;
  };
  return res;
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('invalid_json_body'));
      }
    });
    req.on('error', reject);
  });
}

function isPathInsideRoot(targetPath) {
  const relative = path.relative(rootDir, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function resolveStaticPath(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath || '/');
  } catch (e) {
    pathname = urlPath || '/';
  }

  if (pathname === '/') return path.join(rootDir, 'index.html');

  const cleaned = pathname.replace(/^\/+/, '');
  const candidate = path.join(rootDir, cleaned);

  // Proteção contra path traversal
  if (!isPathInsideRoot(candidate) && candidate !== path.join(rootDir, 'index.html')) {
    return null;
  }

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;

  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    const indexHtml = path.join(candidate, 'index.html');
    const indexHtm  = path.join(candidate, 'index.htm');
    if (fs.existsSync(indexHtml)) return indexHtml;
    if (fs.existsSync(indexHtm))  return indexHtm;
  }

  const withHtml = `${candidate}.html`;
  const withHtm  = `${candidate}.htm`;
  if (fs.existsSync(withHtml) && fs.statSync(withHtml).isFile()) return withHtml;
  if (fs.existsSync(withHtm)  && fs.statSync(withHtm).isFile())  return withHtm;

  return null;
}

function serveStatic(req, res, urlPath) {
  const filePath = resolveStaticPath(urlPath);
  if (!filePath) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error('[server] Erro ao ler arquivo:', filePath, err.message);
      res.statusCode = 500;
      res.end('Internal server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ── Servidor principal ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (e) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const pathname = parsedUrl.pathname;
  enhanceResponse(res);

  // Headers de segurança básicos
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  try {
    // ── Health check (Railway usa isso para verificar se o serviço está ativo)
    if (pathname === '/health' || pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'armario-checkout',
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
      });
    }

    // ── Webhook da FreePay (recebe notificações de pagamento)
    if (pathname === '/api/freepay-webhook') {
      let body = {};
      try {
        body = await parseBody(req);
      } catch (err) {
        body = { raw: 'invalid_or_empty_body' };
      }
      console.log('[webhook] FreePay notificação recebida:', JSON.stringify(body));

      // Processar status do pagamento
      const status = body.Status || body.status || '';
      const txId = body.Id || body.id || body.ExternalId || body.externalId || '';
      console.log(`[webhook] Transação ${txId} - Status: ${status}`);

      // Sempre responder 200 para a FreePay saber que recebemos
      return sendJson(res, 200, { ok: true, received: true });
    }

    // ── Criação de transação PIX
    if (pathname === '/api/create-pix') {
      if (req.method === 'OPTIONS') {
        // Suporte a preflight CORS
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
      }

      if (req.method === 'POST') {
        try {
          req.body = await parseBody(req);
        } catch (err) {
          return sendJson(res, 400, { error: 'invalid_json_body', message: 'Corpo da requisição inválido.' });
        }
      } else {
        req.body = {};
      }

      return createPixHandler(req, res);
    }

    // ── Arquivos estáticos
    return serveStatic(req, res, pathname);

  } catch (err) {
    console.error('[server] Erro interno:', err && err.stack ? err.stack : err);
    return sendJson(res, 500, { error: 'internal_server_error' });
  }
});

// ── Inicialização ─────────────────────────────────────────────────────────────
// Railway injeta PORT automaticamente; fallback para 3000 em desenvolvimento local
const port = Number(process.env.PORT || 3000);

server.listen(port, '0.0.0.0', () => {
  console.log(`[server] Servidor iniciado na porta ${port}`);
  console.log(`[server] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[server] Diretório raiz: ${rootDir}`);

  // Verificar variáveis de ambiente críticas
  const hasPublicKey = !!(process.env.FREEPAY_PUBLIC_KEY || process.env.PUBLIC_KEY);
  const hasSecretKey = !!(process.env.FREEPAY_SECRET_KEY || process.env.SECRET_KEY);
  if (!hasPublicKey || !hasSecretKey) {
    console.warn('[server] ATENÇÃO: Variáveis FREEPAY_PUBLIC_KEY e/ou FREEPAY_SECRET_KEY não configuradas!');
    console.warn('[server] Configure-as nas variáveis de ambiente do Railway para que o PIX funcione.');
  } else {
    console.log('[server] Credenciais FreePay: OK');
  }
});

// Graceful shutdown para Railway
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM recebido, encerrando servidor...');
  server.close(() => {
    console.log('[server] Servidor encerrado.');
    process.exit(0);
  });
});
