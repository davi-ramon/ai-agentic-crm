/**
 * ============================================================
 *  SERVICOS.GS — Integrações Externas
 *  GPT Maker API v2  +  Telegram Bot API
 *  CRM + Dashboard | Milvolts LTDA
 *
 *  ── Mapeamento de endpoints (API v2) ──────────────────────
 *
 *  Listar chats:
 *    GET  /workspace/{workspaceId}/chats
 *         ↑ singular "workspace" (não "workspaces")
 *
 *  Enviar mensagem:
 *    POST /chat/{chatId}/send-message
 *         body: { "message": "...", "replyMessageId": "" }
 *
 *  Assumir atendimento (start-human):
 *    PUT  /chat/{chatId}/start-human
 *         (sem body)
 *
 *  Encerrar atendimento (stop-human):
 *    PUT  /chat/{chatId}/stop-human
 *         (sem body)
 *
 * ============================================================
 */

// ──────────────────────────────────────────────────────────────
//  UTILITÁRIO HTTP — GPT Maker v2
// ──────────────────────────────────────────────────────────────

/**
 * Faz uma requisição autenticada para a API do GPT Maker v2.
 *
 * @param {string}      metodo   - 'GET' | 'POST' | 'PUT'
 * @param {string}      endpoint - Caminho relativo à BASE_URL (ex: '/chat/ID/stop-human')
 * @param {Object|null} corpo    - Body JSON (ou null para GET/PUT sem body)
 * @returns {Object}   Resposta parseada como JSON
 */
function chamarGPTMaker(metodo, endpoint, corpo) {
  var url    = CONFIG.GPTMAKER_BASE_URL + endpoint;
  var methodUpper = String(metodo || 'GET').toUpperCase();
  var opcoes = {
    method:             methodUpper.toLowerCase(),
    headers:            {
      'Authorization': CONFIG.GPTMAKER_API_KEY,
      'Accept': 'application/json',
    },
    muteHttpExceptions: true,
  };

  if (corpo !== null && corpo !== undefined) {
    opcoes.contentType = 'application/json';
    opcoes.payload     = JSON.stringify(corpo);
  } else if (methodUpper === 'PUT') {
    // O endpoint start-human/stop-human da API v2 exige PUT sem body.
    // Definimos apenas o contentType para evitar 415 em alguns cenários do UrlFetchApp.
    opcoes.contentType = 'application/json';
  }

  Logger.log('[GPTMAKER] → ' + methodUpper + ' ' + url);

  try {
    var resposta = UrlFetchApp.fetch(url, opcoes);
    var codigo   = resposta.getResponseCode();
    var conteudo = resposta.getContentText();

    Logger.log('[GPTMAKER] ← HTTP ' + codigo + ' | ' + conteudo.substring(0, 200));

    // Resposta HTML = URL errada ou token inválido
    if (conteudo && conteudo.trim().startsWith('<')) {
      throw new Error(
        'GPT Maker retornou HTML (HTTP ' + codigo + '). ' +
        'Verifique GPTMAKER_BASE_URL e GPTMAKER_API_KEY em config.gs.\n' +
        'Primeiros 200 chars: ' + conteudo.substring(0, 200)
      );
    }

    // Erros HTTP 4xx / 5xx
    if (codigo >= 400) {
      throw new Error('GPT Maker HTTP ' + codigo + ': ' + conteudo.substring(0, 300));
    }

    // Resposta vazia (comum em PUT start/stop-human)
    if (!conteudo || !conteudo.trim()) {
      return { status: codigo, ok: true };
    }

    return JSON.parse(conteudo);

  } catch (e) {
    Logger.log('[GPTMAKER] EXCEÇÃO: ' + e.message);
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────
//  LISTAR CHATS
//  GET /workspace/{workspaceId}/chats
// ──────────────────────────────────────────────────────────────

/**
 * Busca os chats ativos no workspace (usado pela automação "Devolver todos").
 * @param {number} limite - Máximo de resultados (padrão: CONFIG.MAX_CONVERSAS_DEVOLVER)
 * @returns {Array} Lista de chats
 */
function gptMakerBuscarChats(limite) {
  // ⚠️  ENDPOINT v2: /workspace (singular) — não /workspaces (plural)
  var endpoint = '/workspace/' + CONFIG.GPTMAKER_WORKSPACE_ID
               + '/chats?limit=' + (limite || CONFIG.MAX_CONVERSAS_DEVOLVER);

  Logger.log('[GPTMAKER] Buscando chats do workspace ' + CONFIG.GPTMAKER_WORKSPACE_ID);

  var resp = chamarGPTMaker('GET', endpoint, null);

  // A API pode retornar { data: [...] } ou diretamente um array
  if (Array.isArray(resp))                return resp;
  if (resp && Array.isArray(resp.data))   return resp.data;
  if (resp && Array.isArray(resp.chats))  return resp.chats;

  Logger.log('[GPTMAKER] AVISO: Formato de resposta inesperado em /chats: ' + JSON.stringify(resp));
  return [];
}

// ──────────────────────────────────────────────────────────────
//  ASSUMIR ATENDIMENTO
//  PUT /chat/{chatId}/start-human
// ──────────────────────────────────────────────────────────────

/**
 * Assume o atendimento — coloca o chat em modo humano (start-human).
 * @param {string} chatId - ID do chat
 */
function gptMakerStartHuman(chatId) {
  // ⚠️  ENDPOINT v2: /chat/{chatId}/start-human  (sem body)
  Logger.log('[GPTMAKER] start-human → chatId: ' + chatId);
  return chamarGPTMaker('PUT', '/chat/' + chatId + '/start-human', null);
}

// ──────────────────────────────────────────────────────────────
//  ENCERRAR ATENDIMENTO
//  PUT /chat/{chatId}/stop-human
// ──────────────────────────────────────────────────────────────

/**
 * Devolve o atendimento ao bot — remove o modo humano (stop-human).
 * @param {string} chatId - ID do chat
 */
function gptMakerStopHuman(chatId) {
  // ⚠️  ENDPOINT v2: /chat/{chatId}/stop-human  (sem body)
  Logger.log('[GPTMAKER] stop-human → chatId: ' + chatId);
  return chamarGPTMaker('PUT', '/chat/' + chatId + '/stop-human', null);
}

// ──────────────────────────────────────────────────────────────
//  ENVIAR MENSAGEM
//  POST /chat/{chatId}/send-message
// ──────────────────────────────────────────────────────────────

/**
 * Envia uma mensagem de texto para um chat via GPT Maker v2.
 * @param {string} chatId   - ID do chat
 * @param {string} mensagem - Texto a enviar
 */
function gptMakerEnviarMensagem(chatId, mensagem) {
  // ⚠️  ENDPOINT v2: /chat/{chatId}/send-message
  //     body: { message: "...", replyMessageId: "" }
  Logger.log('[GPTMAKER] Enviando mensagem → chatId: ' + chatId);
  return chamarGPTMaker('POST', '/chat/' + chatId + '/send-message', {
    message:        mensagem,
    replyMessageId: '',
  });
}

// ──────────────────────────────────────────────────────────────
//  LISTAR TODOS OS CHATS (com paginação)
//  Itera páginas até obter maxTotal chats ou não houver mais
// ──────────────────────────────────────────────────────────────

/**
 * Busca todos os chats ativos usando paginação, até maxTotal resultados.
 * Respeita o limite de 6 minutos do Apps Script.
 * @param {number} maxTotal - Número máximo de chats a buscar (padrão: 500)
 * @returns {Array} Lista de chats
 */
function gptMakerBuscarTodosChats(maxTotal) {
  maxTotal = maxTotal || 500;
  var PAGE_SIZE  = 100;
  var MAX_PAGINAS = 20;       // segurança
  var MAX_MS     = 30 * 1000; // 30s apenas para busca; o tempo pesado é no stop-human
  var todos   = [];
  var pagina  = 1;
  var offset  = 0;
  var inicio  = Date.now();

  while (todos.length < maxTotal && pagina <= MAX_PAGINAS && (Date.now() - inicio) < MAX_MS) {
    // Tenta page + offset para compatibilidade máxima com a API
    var endpoint = '/workspace/' + CONFIG.GPTMAKER_WORKSPACE_ID
                 + '/chats?limit=' + PAGE_SIZE
                 + '&page=' + pagina
                 + '&offset=' + offset;
    var resp;
    try {
      resp = chamarGPTMaker('GET', endpoint, null);
    } catch (e) {
      Logger.log('[GPTMAKER] Erro na página ' + pagina + ': ' + e.message);
      break;
    }

    var chats = [];
    if (Array.isArray(resp))                chats = resp;
    else if (resp && Array.isArray(resp.data))   chats = resp.data;
    else if (resp && Array.isArray(resp.chats))  chats = resp.chats;
    else if (resp && Array.isArray(resp.results))chats = resp.results;

    if (chats.length === 0) {
      Logger.log('[GPTMAKER] Página ' + pagina + ': sem mais resultados. Encerrando.');
      break;
    }

    todos = todos.concat(chats);
    Logger.log('[GPTMAKER] Página ' + pagina + ' (offset=' + offset + '): ' + chats.length + ' chats | acumulado: ' + todos.length + ' | tempo: ' + Math.round((Date.now()-inicio)/1000) + 's');

    // Condição de parada: retornou menos que o limite → última página
    if (chats.length < PAGE_SIZE) break;

    pagina++;
    offset += chats.length;
    Utilities.sleep(200); // anti-rate-limit entre páginas
  }

  Logger.log('[GPTMAKER] Total final: ' + todos.length + ' chats em ' + Math.round((Date.now()-inicio)/1000) + 's');
  return todos;
}

// ──────────────────────────────────────────────────────────────
//  TELEGRAM BOT API
// ──────────────────────────────────────────────────────────────

/**
 * Envia uma mensagem via Telegram Bot API.
 * @param {string|number} chatId    - ID do chat ou grupo
 * @param {string}        texto     - Texto da mensagem
 * @param {string}        parseMode - 'HTML' | 'Markdown' (padrão: 'HTML')
 */
function telegramEnviarMensagem(chatId, texto, parseMode) {
  var telegram = getTelegramConfig_();
  if (!telegram.botToken) {
    Logger.log('[TELEGRAM] AVISO: Token não configurado. Mensagem não enviada.');
    return { ok: false, error: 'Token não configurado' };
  }

  var url   = 'https://api.telegram.org/bot' + telegram.botToken + '/sendMessage';
  var corpo = {
    chat_id:    String(chatId),
    text:       texto,
    parse_mode: parseMode || 'HTML',
  };

  Logger.log('[TELEGRAM] Enviando mensagem → chatId: ' + chatId);

  try {
    var resposta  = UrlFetchApp.fetch(url, {
      method:             'post',
      contentType:        'application/json',
      payload:            JSON.stringify(corpo),
      muteHttpExceptions: true,
    });
    var resultado = JSON.parse(resposta.getContentText());
    Logger.log('[TELEGRAM] Resultado → ok=' + resultado.ok + (resultado.ok ? '' : ' | erro: ' + JSON.stringify(resultado)));
    return resultado;
  } catch (e) {
    Logger.log('[TELEGRAM] EXCEÇÃO: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  LER MENSAGENS DE UM CHAT
//  GET /chat/{chatId}/messages?limit=N
// ──────────────────────────────────────────────────────────────

/**
 * Lê as últimas N mensagens de um chat (para verificar resposta do cliente).
 * @param {string} chatId - ID do chat
 * @param {number} limit  - Máximo de mensagens (padrão: 20)
 * @returns {Array} Lista de mensagens [ { role, content, createdAt } ]
 */
function gptMakerGetMensagens(chatId, limit) {
  limit = limit || 20;
  Logger.log('[GPTMAKER] Buscando mensagens → chatId: ' + chatId + ' limit: ' + limit);
  var resp = chamarGPTMaker('GET', '/chat/' + chatId + '/messages?limit=' + limit, null);
  if (Array.isArray(resp))               return resp;
  if (resp && Array.isArray(resp.data))  return resp.data;
  if (resp && Array.isArray(resp.messages)) return resp.messages;
  return [];
}

function getTelegramConfig_() {
  var configs = getConfigs();
  return {
    botToken: String(configs.bot_token || CONFIG.TELEGRAM_BOT_TOKEN || '').trim(),
    chatId: String(configs.chat_id || CONFIG.TELEGRAM_GROUP_ID || '').trim(),
  };
}
