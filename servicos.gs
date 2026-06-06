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
//  CONFIG GPT MAKER — leitura priorizada
//  Ordem de prioridade (maior → menor):
//    1. Script Properties (configurado pelo admin via frontend)
//    2. CONFIG.GPTMAKER_* em config.gs (fallback / valores padrão)
// ──────────────────────────────────────────────────────────────

var _gptMakerCfgCache_ = null; // Cache para a execução atual (evita leituras repetidas)

/**
 * Retorna as credenciais GPT Maker resolvidas (Script Properties > config.gs).
 * Cacheia o resultado para a duração da execução atual do script.
 */
function getGPTMakerConfig_() {
  if (_gptMakerCfgCache_) return _gptMakerCfgCache_;
  // Lê EXCLUSIVAMENTE do Script Properties — sem fallback para config.gs
  var props = PropertiesService.getScriptProperties();
  _gptMakerCfgCache_ = {
    apiKey:      (props.getProperty('gptmaker_api_key')      || '').trim(),
    agentId:     (props.getProperty('gptmaker_agent_id')     || '').trim(),
    workspaceId: (props.getProperty('gptmaker_workspace_id') || '').trim(),
    channelId:   (props.getProperty('gptmaker_channel_id')   || '').trim(),
    baseUrl:     CONFIG.GPTMAKER_BASE_URL,
  };
  return _gptMakerCfgCache_;
}

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
  var _gm  = getGPTMakerConfig_();
  var url  = _gm.baseUrl + endpoint;
  var methodUpper = String(metodo || 'GET').toUpperCase();
  var opcoes = {
    method:             methodUpper.toLowerCase(),
    headers:            {
      'Authorization': _gm.apiKey,
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
  var endpoint = '/workspace/' + getGPTMakerConfig_().workspaceId
               + '/chats?limit=' + (limite || CONFIG.MAX_CONVERSAS_DEVOLVER);

  Logger.log('[GPTMAKER] Buscando chats do workspace ' + getGPTMakerConfig_().workspaceId);

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
//  GERAR RESPOSTA VIA IA (follow-up inteligente)
//  POST /agent/{agentId}/conversation
// ──────────────────────────────────────────────────────────────

/**
 * Solicita à IA que gere uma mensagem personalizada com base no histórico
 * de conversa de um cliente (contextId) e no prompt de instrução fornecido.
 *
 * A IA lê o histórico do chat, internaliza a instrução e retorna a mensagem.
 * Custa 1 crédito da API por chamada.
 *
 * @param {string} contextId  - ID do chat/contexto do cliente (= chatId)
 * @param {string} instrucao  - Prompt de instrução para a IA (até ~255 chars recomendado)
 * @returns {Object}          { message: string, images: [], audios: [] }
 */
function gptMakerGerarResposta(contextId, instrucao) {
  var _gm = getGPTMakerConfig_();
  if (!_gm.agentId) throw new Error('Agent ID do GPT Maker não configurado.');
  Logger.log('[GPTMAKER] Gerando resposta IA → agentId: ' + _gm.agentId + ' | contextId: ' + contextId);
  var resp = chamarGPTMaker('POST', '/agent/' + _gm.agentId + '/conversation', {
    contextId: String(contextId),
    prompt:    String(instrucao),
  });
  Logger.log('[GPTMAKER] Resposta IA gerada: ' + JSON.stringify(String((resp && resp.message) || '').substring(0, 120)));
  return resp;
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
    var endpoint = '/workspace/' + getGPTMakerConfig_().workspaceId
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
 * Envia uma imagem para o chat.
 * @param {string} chatId    - ID do chat GPT Maker
 * @param {string} imageUrl  - URL pública da imagem
 * @param {string} caption   - Legenda opcional
 * @returns {Object} { success: true } ou erro
 */
function gptMakerEnviarImagem(chatId, imageUrl, caption) {
  var payload = { imageUrl: imageUrl };
  if (caption) payload.message = caption;
  Logger.log('[GPTMAKER] Enviando imagem → chatId: ' + chatId + ' imageUrl: ' + imageUrl);
  return chamarGPTMaker('POST', '/chat/' + chatId + '/send-message', payload);
}

/**
 * Retorna a última mensagem de cada chatId informado (para checar atividade).
 * @param {string[]} chatIds
 * @returns {Object} { chatId: { time, role, type, id } }
 */
function gptMakerGetLastMessages(chatIds) {
  var result = {};
  (chatIds || []).forEach(function(chatId) {
    try {
      var msgs = gptMakerGetMensagens(chatId, 1, 1);
      if (msgs && msgs.length) {
        result[chatId] = { time: msgs[0].time||0, role: msgs[0].role||'user', type: msgs[0].type||'TEXT', id: msgs[0].id||'' };
      }
    } catch(e) {}
  });
  return result;
}

/**
 * Lê as últimas N mensagens de um chat.
 * @param {string} chatId - ID do chat
 * @param {number} limit  - Máximo de mensagens por página (padrão: 20)
 * @param {number} page   - Página (1 = mais recente, 2 = anterior, etc.)
 * @returns {Array} Lista de mensagens da API GPT Maker
 */
function gptMakerGetMensagens(chatId, limit, page) {
  limit = limit || 20;
  page  = page  || 1;
  var qs = '/messages?limit=' + limit + (page > 1 ? '&page=' + page : '');
  Logger.log('[GPTMAKER] Buscando mensagens → chatId: ' + chatId + ' limit: ' + limit + ' page: ' + page);
  var resp = chamarGPTMaker('GET', '/chat/' + chatId + qs, null);
  if (Array.isArray(resp))               return resp;
  if (resp && Array.isArray(resp.data))  return resp.data;
  if (resp && Array.isArray(resp.messages)) return resp.messages;
  return [];
}

function getTelegramConfig_() {
  // Lê EXCLUSIVAMENTE do Script Properties — token não fica na planilha
  var props = PropertiesService.getScriptProperties();
  return {
    botToken: (props.getProperty('telegram_bot_token') || '').trim(),
    chatId:   (props.getProperty('telegram_chat_id')   || '').trim(),
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
  Logger.log('[GPTMAKER] Ativando agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('PUT', '/agent/' + getGPTMakerConfig_().agentId + '/active', null);
}

/**
 * Inativa o agente no GPT Maker (pausa respostas, IA para de atender).
 * Chamado ao ativar autopreservação.
 */
function gptMakerInativarAgente() {
  Logger.log('[GPTMAKER] Inativando agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('PUT', '/agent/' + getGPTMakerConfig_().agentId + '/inactive', null);
}

/**
 * Busca dados e status atual do agente.
 * Útil para confirmar se está ativo/inativo antes de agir.
 * GET /agent/{agentId}
 */
function gptMakerGetAgente() {
  Logger.log('[GPTMAKER] Buscando dados do agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('GET', '/agent/' + getGPTMakerConfig_().agentId, null);
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
  Logger.log('[GPTMAKER] Criando treinamento → agente: ' + getGPTMakerConfig_().agentId);
  var body = { type: 'TEXT', text: String(texto) };
  if (callbackUrl) body.callbackUrl = callbackUrl;
  return chamarGPTMaker('POST', '/agent/' + getGPTMakerConfig_().agentId + '/trainings', body);
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
  var resp = chamarGPTMaker('GET', '/agent/' + getGPTMakerConfig_().agentId + '/trainings' + qs, null);
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
  Logger.log('[GPTMAKER] Buscando configurações do agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('GET', '/agent/' + getGPTMakerConfig_().agentId + '/settings', null);
}

/**
 * Atualiza configurações do agente.
 * Envie apenas os campos que deseja alterar.
 * @param {Object} config - Ex: { prefferModel: 'GPT_4_O', enabledEmoji: false }
 */
function gptMakerAtualizarConfiguracoes(config) {
  Logger.log('[GPTMAKER] Atualizando configurações do agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('PUT', '/agent/' + getGPTMakerConfig_().agentId + '/settings', config);
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
  Logger.log('[GPTMAKER] Buscando webhooks do agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('GET', '/agent/' + getGPTMakerConfig_().agentId + '/webhooks', null);
}

/**
 * Atualiza webhooks do agente.
 * @param {Object} webhooks - Ex: { onNewMessage: 'https://...', onTransfer: 'https://...' }
 */
function gptMakerAtualizarWebhooks(webhooks) {
  Logger.log('[GPTMAKER] Atualizando webhooks do agente ' + getGPTMakerConfig_().agentId);
  return chamarGPTMaker('PUT', '/agent/' + getGPTMakerConfig_().agentId + '/webhooks', webhooks);
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
  return chamarGPTMaker('POST', '/agent/' + getGPTMakerConfig_().agentId + '/add-message', {
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
  return chamarGPTMaker('POST', '/channel/' + getGPTMakerConfig_().channelId + '/start-conversation', {
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
    var _gmChk = getGPTMakerConfig_();
    if (!_gmChk.agentId || _gmChk.agentId.indexOf('YOUR_') > -1) {
      res.push({ servico: 'GPT Maker IA', ok: false, erro: 'Agent ID não configurado — acesse Configurações → Integração GPT Maker.' });
    } else if (!_gmChk.apiKey || _gmChk.apiKey.indexOf('YOUR_') > -1) {
      res.push({ servico: 'GPT Maker IA', ok: false, erro: 'API Token não configurado — acesse Configurações → Integração GPT Maker.' });
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
    if (!getGPTMakerConfig_().agentId || getGPTMakerConfig_().agentId.indexOf('YOUR_') > -1) {
      res.push({ servico: 'GPT Maker Treinamentos', ok: false, erro: 'Agent ID não configurado' });
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
    if (!tg.botToken) {
      res.push({ servico: 'Telegram', ok: false, erro: 'telegram_bot_token não configurado. Acesse Configurações → 🔒 Credenciais.' });
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

// ──────────────────────────────────────────────────────────────
//  CONFIGURAÇÃO DE INTEGRAÇÕES (frontend ↔ Script Properties)
//  Permite ao admin gerenciar credenciais pelo painel sem tocar
//  em config.gs ou fazer redeploy.
// ──────────────────────────────────────────────────────────────

/**
 * Retorna TODAS as credenciais sensíveis do Script Properties para o painel admin.
 * Valores lidos exclusivamente do Script Properties — sem fallback para config.gs.
 */
function getIntegracaoConfig(authToken) {
  requireAuth(authToken, 'admin');
  var props = PropertiesService.getScriptProperties();
  var get   = function(k) { return (props.getProperty(k) || '').trim(); };
  return {
    // Google Sheets
    spreadsheet_id:        get('spreadsheet_id'),
    // GPT Maker
    gptmaker_api_key:      get('gptmaker_api_key'),
    gptmaker_agent_id:     get('gptmaker_agent_id'),
    gptmaker_workspace_id: get('gptmaker_workspace_id'),
    gptmaker_channel_id:   get('gptmaker_channel_id'),
    // Telegram
    telegram_bot_token:    get('telegram_bot_token'),
    telegram_chat_id:      get('telegram_chat_id'),
    // Operacional
    whatsapp_operacional:  get('whatsapp_operacional'),
  };
}

/**
 * Salva credenciais sensíveis no Script Properties do Apps Script.
 * Cobre: Spreadsheet ID, GPT Maker, Telegram, WhatsApp operacional.
 *
 * Regras:
 *   - Campo vazio/ausente → mantém o valor existente (não apaga)
 *   - Campo = 'CLEAR'    → remove a propriedade
 *   - Qualquer outro valor → salva/sobrescreve
 */
function salvarIntegracaoConfig(dados, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  var props  = PropertiesService.getScriptProperties();

  // Todas as chaves gerenciadas por esta função
  var CHAVES = [
    'spreadsheet_id',
    'gptmaker_api_key',
    'gptmaker_agent_id',
    'gptmaker_workspace_id',
    'gptmaker_channel_id',
    'telegram_bot_token',
    'telegram_chat_id',
    'whatsapp_operacional',
  ];

  var atualizados = [];
  CHAVES.forEach(function(chave) {
    var val = dados[chave];
    if (val === undefined || val === null) return;
    var valStr = String(val).trim();
    if (valStr === '') return;                          // vazio → mantém existente
    if (valStr.toUpperCase() === 'CLEAR') {
      props.deleteProperty(chave);
      Logger.log('[INTEG] Removido: ' + chave);
      atualizados.push(chave + ':CLEAR');
    } else {
      props.setProperty(chave, valStr);
      Logger.log('[INTEG] Salvo: ' + chave + ' (' + valStr.substring(0, 12) + '...)');
      atualizados.push(chave);
    }
  });

  // Invalida cache GPT Maker para recarregar novos valores
  _gptMakerCfgCache_ = null;

  registrarLog('config_integracao', 'ok', { campos: atualizados }, '', {
    usuario: sessao.email,
    acao: 'salvar_integracao',
  });

  return { ok: true, atualizados: atualizados };
}
