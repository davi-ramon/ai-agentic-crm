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

// ──────────────────────────────────────────────────────────────
//  AGENTE — ATIVAR / INATIVAR
//  PUT /agent/{agentId}/active
//  PUT /agent/{agentId}/inactive
// ──────────────────────────────────────────────────────────────

/**
 * Ativa o agente no GPT Maker (remove pausa, volta a responder).
 * Chamado ao desativar autopreservação.
 */
function gptMakerAtivarAgente() {
  Logger.log('[GPTMAKER] Ativando agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('PUT', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/active', null);
}

/**
 * Inativa o agente no GPT Maker (pausa respostas, IA para de atender).
 * Chamado ao ativar autopreservação.
 */
function gptMakerInativarAgente() {
  Logger.log('[GPTMAKER] Inativando agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('PUT', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/inactive', null);
}

/**
 * Busca dados e status atual do agente.
 * Útil para confirmar se está ativo/inativo antes de agir.
 * GET /agent/{agentId}
 */
function gptMakerGetAgente() {
  Logger.log('[GPTMAKER] Buscando dados do agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('GET', '/agent/' + CONFIG.GPTMAKER_AGENT_ID, null);
}

// ──────────────────────────────────────────────────────────────
//  TREINAMENTOS — CRUD COMPLETO
//  POST   /agent/{agentId}/trainings        → criar
//  GET    /agent/{agentId}/trainings        → listar / buscar
//  PUT    /training/{trainingId}            → atualizar (só TEXT)
//  DELETE /training/{trainingId}            → remover
// ──────────────────────────────────────────────────────────────

/**
 * Cria um novo treinamento de texto no agente.
 * @param {string} texto       - Conteúdo do treinamento
 * @param {string} callbackUrl - (opcional) webhook para notificar quando pronto
 * @returns {Object} { success: true }
 */
function gptMakerCriarTreinamento(texto, callbackUrl) {
  Logger.log('[GPTMAKER] Criando treinamento → agente: ' + CONFIG.GPTMAKER_AGENT_ID);
  var body = { type: 'TEXT', text: String(texto) };
  if (callbackUrl) body.callbackUrl = callbackUrl;
  return chamarGPTMaker('POST', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/trainings', body);
}

/**
 * Lista / busca treinamentos do agente.
 * Use o parâmetro query para buscar por trecho do texto (ex: '[PDV-ID:PDV-123]').
 * @param {string} query    - Filtro de texto (opcional)
 * @param {number} pageSize - Resultados por página (padrão: 20)
 * @returns {Array} Lista de { id, type, text, image }
 */
function gptMakerBuscarTreinamentos(query, pageSize) {
  var qs = '?type=TEXT&pageSize=' + (pageSize || 20);
  if (query) qs += '&query=' + encodeURIComponent(String(query));
  Logger.log('[GPTMAKER] Buscando treinamentos → query: ' + (query || '(all)'));
  var resp = chamarGPTMaker('GET', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/trainings' + qs, null);
  if (Array.isArray(resp))               return resp;
  if (resp && Array.isArray(resp.data))  return resp.data;
  if (resp && Array.isArray(resp.items)) return resp.items;
  return [];
}

/**
 * Atualiza o texto de um treinamento existente (somente tipo TEXT).
 * @param {string} trainingId - ID do treinamento no GPT Maker
 * @param {string} texto      - Novo conteúdo
 * @returns {Object} { success: true }
 */
function gptMakerAtualizarTreinamento(trainingId, texto) {
  Logger.log('[GPTMAKER] Atualizando treinamento ' + trainingId);
  return chamarGPTMaker('PUT', '/training/' + trainingId, { type: 'TEXT', text: String(texto) });
}

/**
 * Remove um treinamento do agente.
 * Ignora 404 (já removido = ok).
 * @param {string} trainingId - ID do treinamento
 */
function gptMakerRemoverTreinamento(trainingId) {
  Logger.log('[GPTMAKER] Removendo treinamento ' + trainingId);
  try {
    return chamarGPTMaker('DELETE', '/training/' + trainingId, null);
  } catch (e) {
    if (e.message && e.message.indexOf('404') > -1) {
      Logger.log('[GPTMAKER] Treinamento ' + trainingId + ' já removido (404 ignorado).');
      return { success: true };
    }
    throw e;
  }
}

// ──────────────────────────────────────────────────────────────
//  CONFIGURAÇÕES DO AGENTE
//  GET /agent/{agentId}/settings
//  PUT /agent/{agentId}/settings
// ──────────────────────────────────────────────────────────────

/**
 * Retorna as configurações atuais do agente (modelo LLM, emojis, limites, etc.).
 */
function gptMakerGetConfiguracoes() {
  Logger.log('[GPTMAKER] Buscando configurações do agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('GET', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/settings', null);
}

/**
 * Atualiza configurações do agente.
 * Envie apenas os campos que deseja alterar.
 * @param {Object} config - Ex: { prefferModel: 'GPT_4_O', enabledEmoji: false }
 */
function gptMakerAtualizarConfiguracoes(config) {
  Logger.log('[GPTMAKER] Atualizando configurações do agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('PUT', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/settings', config);
}

// ──────────────────────────────────────────────────────────────
//  WEBHOOKS DO AGENTE
//  GET /agent/{agentId}/webhooks
//  PUT /agent/{agentId}/webhooks
// ──────────────────────────────────────────────────────────────

/**
 * Retorna os webhooks configurados no agente.
 * Eventos: onNewMessage, onTransfer, onFirstInteraction, onFinishInteraction, etc.
 */
function gptMakerGetWebhooks() {
  Logger.log('[GPTMAKER] Buscando webhooks do agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('GET', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/webhooks', null);
}

/**
 * Atualiza webhooks do agente.
 * @param {Object} webhooks - Ex: { onNewMessage: 'https://...', onTransfer: 'https://...' }
 */
function gptMakerAtualizarWebhooks(webhooks) {
  Logger.log('[GPTMAKER] Atualizando webhooks do agente ' + CONFIG.GPTMAKER_AGENT_ID);
  return chamarGPTMaker('PUT', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/webhooks', webhooks);
}

// ──────────────────────────────────────────────────────────────
//  ADICIONAR MENSAGEM AO CONTEXTO (disparo ativo / follow-up via IA)
//  POST /agent/{agentId}/add-message
// ──────────────────────────────────────────────────────────────

/**
 * Injeta uma mensagem no contexto do LLM para um cliente específico.
 * Útil para disparos ativos: adiciona o contexto de que uma mensagem
 * foi enviada, para que a IA saiba responder em continuidade.
 *
 * @param {string} contextId - ID externo do cliente (ex: número de WhatsApp ou chatId)
 * @param {string} prompt    - Texto da mensagem
 * @param {string} role      - 'user' (mensagem do cliente) ou 'assistant' (mensagem da IA)
 */
function gptMakerAdicionarContexto(contextId, prompt, role) {
  Logger.log('[GPTMAKER] Adicionando contexto → contextId: ' + contextId + ' | role: ' + (role || 'assistant'));
  return chamarGPTMaker('POST', '/agent/' + CONFIG.GPTMAKER_AGENT_ID + '/add-message', {
    contextId: String(contextId),
    prompt:    String(prompt),
    role:      role || 'assistant',
  });
}

// ──────────────────────────────────────────────────────────────
//  INICIAR CONVERSA ATIVA (canal WhatsApp)
//  POST /v2/channel/{channelId}/start-conversation
// ──────────────────────────────────────────────────────────────

/**
 * Inicia uma conversa ativa pelo canal WhatsApp configurado.
 * Útil para disparos proativos (ex: follow-up via canal, não via chat existente).
 * @param {string} phone   - Número no formato internacional: 5599...
 * @param {string} message - Mensagem inicial
 */
function gptMakerIniciarConversa(phone, message) {
  Logger.log('[GPTMAKER] Iniciando conversa ativa → phone: ' + phone);
  return chamarGPTMaker('POST', '/channel/' + CONFIG.GPTMAKER_CHANNEL_ID + '/start-conversation', {
    phone:   String(phone),
    message: String(message),
  });
}

// ──────────────────────────────────────────────────────────────
//  HEALTH CHECK — Verifica saúde de todos os serviços integrados
//  Chamado no boot do front-end para alertar o operador
// ──────────────────────────────────────────────────────────────

/**
 * Faz um diagnóstico completo do sistema no boot do app.
 * Retorna { ok: bool, resultados: [ { servico, ok, status?, erro? } ] }
 * Chamada pelo frontend logo após login (de forma assíncrona, sem bloquear UI).
 */
function verificarSaudeCompleta(authToken) {
  requireAuth(authToken, 'operador');
  var res = [];

  // ── 1. Google Sheets ──────────────────────────────────────
  try {
    var ss = getSpreadsheet();
    var abas = ss.getSheets().map(function(s){ return s.getName(); });
    res.push({ servico: 'Google Sheets', ok: true, status: abas.length + ' abas (' + abas.join(', ') + ')' });
  } catch(e) {
    res.push({ servico: 'Google Sheets', ok: false, erro: e.message });
  }

  // ── 2. GPT Maker — status do agente ──────────────────────
  try {
    if (!CONFIG.GPTMAKER_AGENT_ID || CONFIG.GPTMAKER_AGENT_ID.indexOf('YOUR_') > -1) {
      res.push({ servico: 'GPT Maker IA', ok: false, erro: 'GPTMAKER_AGENT_ID não configurado em config.gs' });
    } else if (!CONFIG.GPTMAKER_API_KEY || CONFIG.GPTMAKER_API_KEY.indexOf('YOUR_') > -1) {
      res.push({ servico: 'GPT Maker IA', ok: false, erro: 'GPTMAKER_API_KEY não configurado em config.gs' });
    } else {
      var agente = gptMakerGetAgente();
      var ativo  = agente && String(agente.status || '').toUpperCase() !== 'INACTIVE';
      res.push({
        servico: 'GPT Maker IA',
        ok: true,
        status: ativo ? 'ativo' : 'INATIVO',
        agente_ativo: ativo,
        agente_nome: String(agente.name || agente.agentName || ''),
      });
    }
  } catch(e) {
    res.push({ servico: 'GPT Maker IA', ok: false, erro: e.message });
  }

  // ── 3. GPT Maker — treinamentos ──────────────────────────
  try {
    if (!CONFIG.GPTMAKER_AGENT_ID || CONFIG.GPTMAKER_AGENT_ID.indexOf('YOUR_') > -1) {
      res.push({ servico: 'GPT Maker Treinamentos', ok: false, erro: 'AGENT_ID não configurado' });
    } else {
      var treins = gptMakerBuscarTreinamentos('', 5);
      res.push({ servico: 'GPT Maker Treinamentos', ok: true, status: (Array.isArray(treins) ? treins.length : 0) + ' treinamentos encontrados' });
    }
  } catch(e) {
    res.push({ servico: 'GPT Maker Treinamentos', ok: false, erro: e.message });
  }

  // ── 4. Telegram ──────────────────────────────────────────
  try {
    var tg = getTelegramConfig_();
    if (!tg.botToken || tg.botToken.indexOf('YOUR_') > -1) {
      res.push({ servico: 'Telegram', ok: false, erro: 'TELEGRAM_BOT_TOKEN não configurado em config.gs' });
    } else {
      var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + tg.botToken + '/getMe', { muteHttpExceptions: true });
      var tgRes = JSON.parse(resp.getContentText());
      res.push({
        servico: 'Telegram',
        ok: tgRes.ok === true,
        status: tgRes.ok ? '@' + (tgRes.result.username || '?') + ' conectado' : 'Token inválido',
      });
    }
  } catch(e) {
    res.push({ servico: 'Telegram', ok: false, erro: e.message });
  }

  // ── 5. PDV sheet ─────────────────────────────────────────
  try {
    var pdvSh = getSpreadsheet().getSheetByName('PDV');
    if (!pdvSh) {
      res.push({ servico: 'PDV', ok: false, erro: 'Aba "PDV" não encontrada na planilha. Cadastre o primeiro produto para criá-la.' });
    } else {
      var rows = pdvSh.getLastRow() - 1; // exclui cabeçalho
      res.push({ servico: 'PDV', ok: true, status: Math.max(0, rows) + ' produto(s) cadastrado(s)', total: Math.max(0, rows) });
    }
  } catch(e) {
    res.push({ servico: 'PDV', ok: false, erro: e.message });
  }

  var tudo_ok = res.every(function(r){ return r.ok; });
  Logger.log('[HEALTH] ' + (tudo_ok ? '✅ Tudo ok.' : '⚠️ Problemas encontrados.') + ' ' + JSON.stringify(res));
  return { ok: tudo_ok, resultados: res };
}
