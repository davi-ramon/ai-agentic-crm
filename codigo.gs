/**
 * ============================================================
 *  CODIGO.GS — Handlers Principais
 *  doGet  → Serve o Dashboard (index.html)
 *  doPost → Recebe webhooks e roteia para as automações
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

// ──────────────────────────────────────────────────────────────
//  doGet — Serve o Frontend (Dashboard + CRM)
// ──────────────────────────────────────────────────────────────

/**
 * Handler GET: retorna o HTML do Dashboard.
 * Acessível via URL de implantação do Web App.
 *
 * @param {Object} e - Evento do Apps Script
 * @returns {HtmlOutput}
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  if (_isPwaAssetRequest_(params)) return _renderPwaAsset_(params);
  var page = _normalizarPaginaFront_(params.page || params.view || '');
  var arquivo = page === 'app' ? 'index' : 'login';
  return HtmlService
    .createHtmlOutputFromFile(arquivo)
    .setTitle('CRM + Dashboard | Milvolts LTDA')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function _normalizarPaginaFront_(valor) {
  var page = String(valor || '').trim().toLowerCase();
  if (page === 'app' || page === 'index' || page === 'dashboard') return 'app';
  return 'login';
}

// ──────────────────────────────────────────────────────────────
//  doPost — Router Central de Webhooks
// ──────────────────────────────────────────────────────────────

/**
 * Handler POST: roteador central para TODOS os webhooks.
 *
 * Prioridade de detecção de tipo:
 *  1. URL param ?tipo=NOME  (configure no GPT Maker por evento)
 *  2. payload.estagio_funil (eventos personalizados)
 *  3. Detecção estrutural (campos únicos por tipo de evento)
 *
 * Todos os eventos nativos GPT Maker suportados:
 *  iniciar_atendimento, primeiro_atendimento, nova_mensagem,
 *  nao_sabe_responder, novo_agendamento, cancelamento_de_evento,
 *  transferir_para_humano, finalizou_atendimento, conversa_finalizada
 *
 * Evento personalizado:
 *  conferir_pecas  (webhook do Thaynan IA via Make.com → agora nativo)
 *
 * @param {Object} e - Evento do Apps Script
 * @returns {TextOutput} JSON {"status":"success"} sempre (evita retry do GPT Maker)
 */
function doPost(e) {
  var payload = {};
  var rawBody = '';
  var params  = {};

  // ── Parse do body + URL params ───────────────────────────
  params  = (e && e.parameter)                         ? e.parameter         : {};
  rawBody = (e && e.postData && e.postData.contents)   ? e.postData.contents : '';

  try {
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (jsonErr) {
        payload = _parseBodyFallback_(rawBody);
        if (Object.keys(payload).length === 0) throw jsonErr;
      }
    } else if (Object.keys(params).length > 0) {
      payload = params; // fallback: params como payload
    }
  } catch (parseErr) {
    Logger.log('[doPost] Erro parse: ' + parseErr.message + ' | body: ' + rawBody.substring(0, 200));
    try { registrarLog('ERRO_PARSE', 'erro', rawBody, parseErr.message); } catch(_){}
    return _responderSucesso({ status: 'erro_parse', mensagem: parseErr.message });
  }

  payload = _mesclarObjetos_(payload, params);
  var tipoParam = normalizarTipoEvento_(params.tipo || payload.tipo || '');
  Logger.log('[doPost] tipo_param=' + tipoParam + ' | payload=' + JSON.stringify(payload).substring(0, 400));

  // ── Detecção de tipo + Roteamento ────────────────────────
  var tipo      = 'desconhecido';
  var resultado = {};

  try {
    tipo      = _detectarTipo(tipoParam, payload, params);
    Logger.log('[doPost] ═ Tipo detectado: ' + tipo + ' ═');
    resultado = _rotear(tipo, payload, params);
  } catch (execErr) {
    Logger.log('[doPost] Erro execução [' + tipo + ']: ' + execErr.message + '\n' + (execErr.stack || ''));
    resultado = { status: 'erro', mensagem: execErr.message };
  }

  // ── Registrar no Log (sheet "Logs") ─────────────────────
  try {
    var erroLog = '';
    if (resultado.erros && resultado.erros.length > 0) erroLog = JSON.stringify(resultado.erros);
    else if (resultado.mensagem)                        erroLog = resultado.mensagem;
    registrarLog(tipo, resultado.status || 'ok', payload, erroLog);
  } catch(_){}

  // ── SEMPRE retorna 200 + {"status":"success"} ────────────
  // GPT Maker só re-envia o webhook se receber erro HTTP ou timeout.
  // Retornamos sempre success; erros internos ficam nos Logs da sheet.
  return _responderSucesso(resultado);
}

// ──────────────────────────────────────────────────────────────
//  _detectarTipo — Identifica o tipo do webhook recebido
// ──────────────────────────────────────────────────────────────

/**
 * Detecta o tipo do evento a partir do URL param ?tipo= e/ou campos do payload.
 *
 * Configure cada evento no GPT Maker com URL:
 *   https://script.google.com/macros/.../exec?tipo=NOME_DO_EVENTO
 *
 * Ex: ?tipo=iniciar_atendimento, ?tipo=transferir_para_humano, etc.
 * Se não configurado, a detecção estrutural assume (funciona para a maioria).
 *
 * @param {string} tipoParam  - Valor de e.parameter.tipo (já lowercase)
 * @param {Object} payload    - Body JSON parseado
 * @param {Object} params     - URL params (e.parameter)
 * @returns {string} Tipo do evento
 */
function _detectarTipo(tipoParam, payload, params) {
  // 1. URL param explícito — mais confiável (configure no GPT Maker)
  if (tipoParam) return tipoParam;

  // 2. Campo estagio_funil — evento personalizado conferir_pecas
  var estagioFunil = normalizarTipoEvento_(payload.estagio_funil || params.estagio_funil || '');
  if (estagioFunil === 'conferir_pecas') return 'conferir_pecas';

  // 3. Campo peca + modelo — também indica conferir_pecas (fallback estrutural)
  if (payload.peca && payload.modelo) return 'conferir_pecas';

  // 4. Detecção estrutural — campos únicos por tipo de evento nativo
  //    (ordem importa: do mais específico para o mais genérico)

  if (payload.question)                                  return 'nao_sabe_responder';
  if (payload.summary  && payload.memberId)              return 'transferir_para_humano';
  if (payload.eventId  && payload.startDate)             return 'novo_agendamento';
  if (payload.eventId  && !payload.startDate)            return 'cancelamento_de_evento';
  if (payload.role     && payload.message !== undefined) return 'nova_mensagem';
  if (payload.finishAt && payload.humanEmail)            return 'conversa_finalizada';
  if (payload.finishAt && payload.workspaceId)           return 'finalizou_atendimento';
  if (payload.interactionId && payload.protocol)         return 'iniciar_atendimento';

  // 5. Ação manual via webhook interno
  if (normalizarTipoEvento_(payload.action) === 'devolver_atendimentos') return 'devolver_atendimentos';

  return 'desconhecido';
}

// ──────────────────────────────────────────────────────────────
//  _rotear — Despacha para o handler correto
// ──────────────────────────────────────────────────────────────

/**
 * Despacha o payload para o handler correspondente ao tipo detectado.
 *
 * @param {string} tipo    - Tipo do evento (retorno de _detectarTipo)
 * @param {Object} payload - Body JSON
 * @param {Object} params  - URL params
 * @returns {Object} Resultado do handler
 */
function _rotear(tipo, payload, params) {
  // Extrai recipient a partir de chat_id ou contextId (para Rota A)
  var chatIdRaw = payload.chat_id || payload.contextId || params.contextId || '';
  var recipient = extrairRecipient(chatIdRaw) || payload.recipient || '';

  switch (tipo) {
    // ── Evento personalizado ──────────────────────────────
    case 'conferir_pecas':
      return rotaConferirPecas(payload, recipient);

    // ── Eventos nativos com ação de negócio ───────────────
    case 'transferir_para_humano':
      return rotaTransferenciaHumano(payload);

    case 'nao_sabe_responder':
      return rotaNaoSabeResponder(payload);

    case 'novo_agendamento':
      return rotaNovoAgendamento(payload);

    case 'cancelamento_de_evento':
      return rotaCancelamentoEvento(payload);

    // ── Eventos nativos informativos (notificação opcional) ─
    case 'nova_mensagem':
      return rotaNovaMensagem(payload);

    case 'conversa_finalizada':
      return rotaConversaFinalizada(payload);

    case 'finalizou_atendimento':
      return rotaFinalizouAtendimento(payload);

    case 'iniciar_atendimento':
    case 'primeiro_atendimento':
      return rotaIniciarAtendimento(tipo, payload);

    // ── Ação interna (Devolver Atendimentos) ─────────────
    case 'devolver_atendimentos':
      return devolverTodosAtendimentos(payload);

    default:
      Logger.log('[doPost] Tipo desconhecido — sem handler: ' + tipo);
      return { status: 'ignored', mensagem: 'Tipo não reconhecido: ' + tipo };
  }
}

// ──────────────────────────────────────────────────────────────
//  Helpers de Resposta HTTP
// ──────────────────────────────────────────────────────────────

/**
 * Retorna SEMPRE {"status":"success"} + dados extras.
 * GPT Maker exige status "success" para não reenviar o webhook.
 * Erros internos ficam registrados na sheet "Logs".
 *
 * @param {Object} [dados] - Dados extras (opcionais)
 * @returns {TextOutput}
 */
function _responderSucesso(dados) {
  var corpo = Object.assign({ status: 'success' }, dados || {});
  return ContentService
    .createTextOutput(JSON.stringify(corpo))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Retorna uma resposta JSON de sucesso legacy (mantido para compatibilidade interna).
 * @param {Object|string} dados - Dados a serializar
 * @returns {TextOutput}
 */
function responderOk(dados) {
  var corpo = typeof dados === 'string'
    ? { status: 'ok', mensagem: dados }
    : Object.assign({ status: 'ok' }, dados);
  return ContentService
    .createTextOutput(JSON.stringify(corpo))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Retorna uma resposta JSON de erro (uso interno/debug).
 * @param {string} mensagem - Descrição do erro
 * @returns {TextOutput}
 */
function responderErro(mensagem) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'erro', mensagem: mensagem }))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizarTipoEvento_(valor) {
  var tipo = String(valor || '').trim();
  if (!tipo) return '';
  try { tipo = decodeURIComponent(tipo); } catch (_) {}
  tipo = tipo.replace(/^.*tipo=/i, '');
  tipo = tipo.split('?')[0].split('&')[0].trim().toLowerCase();
  return tipo;
}

function _parseBodyFallback_(rawBody) {
  var body = String(rawBody || '').trim();
  if (!body) return {};
  if (body.charAt(0) === '{' || body.charAt(0) === '[') return {};

  var obj = {};
  body.split('&').forEach(function(part) {
    if (!part) return;
    var idx = part.indexOf('=');
    var key = idx >= 0 ? part.substring(0, idx) : part;
    var value = idx >= 0 ? part.substring(idx + 1) : '';
    try { key = decodeURIComponent(String(key).replace(/\+/g, ' ')); } catch (_) {}
    try { value = decodeURIComponent(String(value).replace(/\+/g, ' ')); } catch (_) {}
    if (key) obj[key] = value;
  });
  return obj;
}

function _mesclarObjetos_(prioritario, complementar) {
  var out = {};
  [complementar || {}, prioritario || {}].forEach(function(src) {
    Object.keys(src).forEach(function(key) {
      if (src[key] !== undefined && src[key] !== null && src[key] !== '') out[key] = src[key];
    });
  });
  return out;
}

// ──────────────────────────────────────────────────────────────
//  Testes Manuais — execute no editor do Apps Script para testar
//  Selecione a função e clique em ▶ Executar
// ──────────────────────────────────────────────────────────────

/** Simula conferir_pecas (webhook personalizado do Thaynan IA). */
function _testarConferirPecas() {
  var r = _rotear('conferir_pecas', {
    estagio_funil:'conferir_pecas', peca:'Amortecedor dianteiro',
    modelo:'Toyota Hilux 2022', valor_peca:'850', atendente:'Thaynan',
    chat_id:'3F102654AAC2505647613ED3AED0536B-556381008682',
    prioridade:'Alta', protocolo:'20260409090000',
    oportunidade_nome:'Amortecedor Hilux 2022', obs:'Urgência',
    categoria_peca:'Suspensão', tarefa:'Enviar orçamento',
    data_tarefa:'2026-04-09T10:00:00.000-0300', status_tarefa:'to_do',
    origem:'orgânico', nome_cliente:'Cliente Teste',
  }, {});
  Logger.log('[TESTE] conferir_pecas: ' + JSON.stringify(r));
}

/** Simula transferir_para_humano (evento nativo GPT Maker). */
function _testarTransferenciaHumano() {
  var r = _rotear('transferir_para_humano', {
    summary:'Cliente quer orçamento de pastilha de freio para Honda Civic 2020.',
    agentId:CONFIG.GPTMAKER_AGENT_ID, name:'João Silva',
    recipient:'5599912345678', channel:'CLOUD_API',
    memberName:'Thaynan', memberId:'3EE8F01CB6FC905A892C8685EF9066B3',
    contextId:'3F102654AAC2505647613ED3AED0536B-5599912345678',
    channelId:'3F102654AAC2505647613ED3AED0536B',
  }, {});
  Logger.log('[TESTE] transferir_para_humano: ' + JSON.stringify(r));
}

/** Simula nao_sabe_responder (evento nativo GPT Maker). */
function _testarNaoSabeResponder() {
  var r = _rotear('nao_sabe_responder', {
    assistantId:CONFIG.GPTMAKER_AGENT_ID,
    question:"O usuário perguntou: 'qual o prazo de entrega para Belém?'",
    channel:'CLOUD_API',
    contextId:'3F102654AAC2505647613ED3AED0536B-556381008682',
  }, {});
  Logger.log('[TESTE] nao_sabe_responder: ' + JSON.stringify(r));
}

/** Simula novo_agendamento (evento nativo GPT Maker). */
function _testarNovoAgendamento() {
  var r = _rotear('novo_agendamento', {
    eventId:'abc123', agentId:CONFIG.GPTMAKER_AGENT_ID,
    userName:'Pedro Alves', userEmail:'pedro@email.com',
    startDate:'2026-04-25T14:00:00.000-03:00',
    endDate:'2026-04-25T15:00:00.000-03:00',
    subject:'Reunião Estratégica com Pedro Alves',
    meetUrl:'https://meet.google.com/xxx-yyyy-zzz',
    name:'Pedro', recipient:'5599900000000',
    channel:'CLOUD_API', channelId:CONFIG.GPTMAKER_CHANNEL_ID,
    calendarId:'primary',
  }, {});
  Logger.log('[TESTE] novo_agendamento: ' + JSON.stringify(r));
}

/** Simula detectarTipo com cada tipo de payload. */
function _testarDetectarTipo() {
  var casos = [
    { label:'conferir_pecas', p:{estagio_funil:'conferir_pecas'} },
    { label:'nao_sabe_responder', p:{question:'algo'} },
    { label:'transferir_para_humano', p:{summary:'x', memberId:'y'} },
    { label:'novo_agendamento', p:{eventId:'e', startDate:'d'} },
    { label:'cancelamento_de_evento', p:{eventId:'e'} },
    { label:'nova_mensagem', p:{role:'user', message:'oi'} },
    { label:'conversa_finalizada', p:{finishAt:'t', humanEmail:'e@e'} },
    { label:'finalizou_atendimento', p:{finishAt:'t', workspaceId:'w'} },
    { label:'iniciar_atendimento', p:{interactionId:'i', protocol:1} },
  ];
  casos.forEach(function(c) {
    Logger.log('[TIPO] ' + c.label + ' → ' + _detectarTipo('', c.p, {}));
  });
}

/** Testa a leitura dos dados do dashboard. */
function _testarDashboard() {
  var dados = _getDashboardDataInterno();
  Logger.log('[TESTE] DASHBOARD DATA: ' + JSON.stringify(dados, null, 2));
}

/** Testa a leitura dos últimos logs. */
function _testarGetLogs() {
  var sheet = getSpreadsheet().getSheetByName('Logs');
  var logs = sheet ? sheet.getDataRange().getValues() : [];
  Logger.log('[TESTE] LOGS (' + logs.length + '): ' + JSON.stringify(logs, null, 2));
}
