/**
 * ============================================================
 *  FOLLOWUP_QUEUE.GS
 *  Fila de Follow-ups — agendamento e disparo progressivo
 *
 *  Cada follow-up de etapa pode ter múltiplas repetições com
 *  intervalo configurado (5–60 min). Este módulo gerencia a
 *  fila: enfileira ao mover o card, dispara 1× por minuto
 *  via time trigger e para automaticamente ao detectar resposta.
 *
 *  Fila armazenada em: Sheet "followup_queue"
 *  Colunas: id | card_protocolo | stage_id | fu_id | fu_data_json
 *           | agendado_para | status | tentativas | ultima_tentativa
 *
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

var FQ_SHEET_NAME = 'followup_queue';

// ──────────────────────────────────────────────────────────────
//  SCHEMA — cabeçalhos da sheet
// ──────────────────────────────────────────────────────────────
var FQ_COLS = [
  'id', 'card_protocolo', 'stage_id', 'fu_id', 'fu_data_json',
  'agendado_para', 'status', 'tentativas', 'ultima_tentativa', 'criado_em',
];

/**
 * Garante que a sheet de fila existe com os cabeçalhos corretos.
 * Cria automaticamente se não existir.
 */
function _fqEnsureSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(FQ_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(FQ_SHEET_NAME);
    sheet.appendRow(FQ_COLS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, FQ_COLS.length).setFontWeight('bold');
  }
  return sheet;
}

function _fqColIdx(col) { return FQ_COLS.indexOf(col) + 1; }

// ──────────────────────────────────────────────────────────────
//  ENFILEIRAR — chamado ao mover card para etapa
// ──────────────────────────────────────────────────────────────

/**
 * Enfileira todos os follow-ups não-imediatos configurados para uma etapa.
 * Follow-ups imediatos (fu.imediato===true) são disparados em _executarMensagemAuto.
 *
 * @param {string} stageId
 * @param {string} protocolo  protocolo do card
 * @param {Object} autoConfig  config da etapa (já parseada)
 * @param {string} authToken
 */
function enqueueFollowUps(stageId, protocolo, autoConfig, authToken) {
  requireAuth(authToken, 'operador');
  if (!autoConfig || !autoConfig.followups || !autoConfig.followups.length) return { ok: true, enfileirados: 0 };

  var sheet = _fqEnsureSheet();
  var now   = new Date();
  var count = 0;

  autoConfig.followups.forEach(function(fu) {
    if (!fu.ativo || fu.imediato) return; // imediatos não entram na fila
    var intervaloMs = (fu.intervalo_minutos || 30) * 60 * 1000;
    var maxOc       = fu.max_ocorrencias || 1;

    for (var occ = 1; occ <= maxOc; occ++) {
      var agendadoPara = new Date(now.getTime() + intervaloMs * occ);
      var id = 'fq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      sheet.appendRow([
        id,
        protocolo,
        stageId,
        fu.id || ('fu_' + occ),
        JSON.stringify(fu),
        agendadoPara.toISOString(),
        'pendente',
        0,
        '',
        now.toISOString(),
      ]);
      count++;
    }
  });

  registrarLog('followup_enfileirado', 'ok', { stageId: stageId, protocolo: protocolo, count: count }, protocolo);
  return { ok: true, enfileirados: count };
}

// ──────────────────────────────────────────────────────────────
//  PROCESSADOR — time trigger, executa a cada 1 minuto
// ──────────────────────────────────────────────────────────────

/**
 * Processa a fila de follow-ups.
 * Deve ser chamada por um trigger de tempo (every minute).
 * Processa no máx. 30 itens por execução para não ultrapassar 6 min de runtime GAS.
 */
function triggerFollowUpQueue() {
  var sheet = _fqEnsureSheet();
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return; // só cabeçalho

  var now      = new Date();
  var headers  = data[0];
  var iStatus  = headers.indexOf('status');
  var iAgenda  = headers.indexOf('agendado_para');
  var iProto   = headers.indexOf('card_protocolo');
  var iStage   = headers.indexOf('stage_id');
  var iFuData  = headers.indexOf('fu_data_json');
  var iTent    = headers.indexOf('tentativas');
  var iUltima  = headers.indexOf('ultima_tentativa');

  var processed = 0;

  for (var r = 1; r < data.length && processed < 30; r++) {
    var row    = data[r];
    var status = row[iStatus];
    if (status !== 'pendente') continue;

    var agendado = new Date(row[iAgenda]);
    if (agendado > now) continue; // ainda não é hora

    var protocolo = String(row[iProto]);
    var stageId   = String(row[iStage]);
    var fuData;
    try { fuData = JSON.parse(row[iFuData]); } catch(e) {
      _fqSetStatus(sheet, r + 1, 'erro_parse');
      continue;
    }

    // Verifica se o card ainda está na mesma etapa
    var card = _buscarCardPorProtocolo(protocolo);
    if (!card) {
      _fqSetStatus(sheet, r + 1, 'card_nao_encontrado');
      continue;
    }
    var etapaAtual = card.etapa || card['Etapa'] || card.stage || '';
    if (etapaAtual && etapaAtual !== stageId) {
      _fqSetStatus(sheet, r + 1, 'cancelado_etapa_mudou');
      _fqSetCellByRow(sheet, r + 1, iUltima, now.toISOString());
      continue;
    }

    // Verifica stop-on-reply: se o cliente respondeu, cancela toda a fila deste protocolo
    if (fuData.parar_ao_responder) {
      if (_fqClienteRespondeu(protocolo, stageId)) {
        _fqCancelarTodosCard(sheet, data, protocolo, 'cancelado_cliente_respondeu');
        break;
      }
    }

    // Dispara o follow-up
    var resultado = _executarMensagemAuto(card, fuData, stageId);
    var tentativas = (parseInt(row[iTent]) || 0) + 1;
    _fqSetCellByRow(sheet, r + 1, iStatus,  resultado.ok ? 'enviado' : 'erro');
    _fqSetCellByRow(sheet, r + 1, iTent,    tentativas);
    _fqSetCellByRow(sheet, r + 1, iUltima,  now.toISOString());

    registrarLog('followup_disparado', resultado.ok ? 'ok' : 'erro', {
      protocolo: protocolo, stageId: stageId, fuId: fuData.id,
      tentativas: tentativas, motivo: resultado.motivo || '',
    }, protocolo);

    processed++;
    Utilities.sleep(300); // pequena pausa entre disparos p/ respeitar rate limits
  }

  Logger.log('[FQ] triggerFollowUpQueue processou ' + processed + ' item(ns) às ' + now.toISOString());
}

// ──────────────────────────────────────────────────────────────
//  PARAR FOLLOW-UPS DE UM CARD (ex: card foi ganho/perdido)
// ──────────────────────────────────────────────────────────────

/**
 * Cancela todos os follow-ups pendentes de um protocolo.
 * Chame quando o card for ganho, perdido ou movido para etapa final.
 *
 * @param {string} protocolo
 * @param {string} authToken
 */
function pararFollowUpsCard(protocolo, authToken) {
  requireAuth(authToken, 'operador');
  var sheet = _fqEnsureSheet();
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, cancelados: 0 };
  var count = _fqCancelarTodosCard(sheet, data, protocolo, 'cancelado_manual');
  return { ok: true, cancelados: count };
}

// ──────────────────────────────────────────────────────────────
//  TESTE DIRETO — dispara um follow-up/webhook para número específico
// ──────────────────────────────────────────────────────────────

/**
 * Dispara um follow-up de teste diretamente para um número de telefone.
 * Não usa o card real — monta um card fictício com o telefone informado.
 *
 * @param {string} stageId
 * @param {Object} fuData   dados do follow-up (texto, usar_ia, etc.)
 * @param {string} phone    número limpo de dígitos (ex: 5511999999999)
 * @param {string} authToken
 */
function testarFollowUpDireto(stageId, fuData, phone, authToken) {
  requireAuth(authToken, 'admin');
  if (!fuData || !fuData.texto) return { ok: false, motivo: 'sem_texto' };
  if (!phone || phone.replace(/\D/g,'').length < 10) return { ok: false, motivo: 'telefone_invalido' };

  var mockCard = {
    protocolo:    'TESTE',
    nome_cliente: 'Teste',
    produto:      'Produto Teste',
    valor:        '0',
    telefone:     phone.replace(/\D/g,''),
    responsavel:  'Sistema',
  };

  var resultado = _executarMensagemAuto(mockCard, fuData, stageId);
  registrarLog('followup_teste_direto', resultado.ok ? 'ok' : 'erro', {
    stageId: stageId, phone: phone, fuId: fuData.id || 'teste', motivo: resultado.motivo || '',
  }, 'TESTE');
  return resultado;
}

/**
 * Dispara um webhook de teste.
 *
 * @param {string} stageId
 * @param {Object} whData  dados do webhook (endpoint, metodo, campos, headers)
 * @param {string} authToken
 */
function testarWebhookDireto(stageId, whData, authToken) {
  requireAuth(authToken, 'admin');
  if (!whData || !whData.endpoint) return { ok: false, motivo: 'endpoint_vazio' };

  var mockCard = {
    protocolo:    'TESTE',
    nome_cliente: 'Teste',
    produto:      'Produto Teste',
    valor:        '0',
    telefone:     '5500000000000',
    responsavel:  'Sistema',
    etapa:        stageId,
  };

  var resultado = _executarWebhookAuto(mockCard, whData, stageId);
  registrarLog('webhook_teste_direto', resultado.ok ? 'ok' : 'erro', {
    stageId: stageId, endpoint: whData.endpoint, motivo: resultado.motivo || '', http: resultado.http || '',
  }, 'TESTE');
  return resultado;
}

// ──────────────────────────────────────────────────────────────
//  SETUP DE TRIGGER — chamar uma vez para ativar o processador
// ──────────────────────────────────────────────────────────────

/**
 * Cria o time trigger de 1 minuto para processar a fila.
 * Chame esta função uma única vez pelo menu de gatilhos do GAS.
 * Verifica se já existe antes de criar para evitar duplicação.
 */
function setupFollowUpQueueTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'triggerFollowUpQueue') {
      Logger.log('[FQ] Trigger já existe. Nenhuma ação necessária.');
      return 'trigger_ja_existe';
    }
  }
  ScriptApp.newTrigger('triggerFollowUpQueue')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('[FQ] Trigger criado com sucesso.');
  return 'trigger_criado';
}

/**
 * Remove o trigger de processamento da fila.
 */
function removeFollowUpQueueTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed  = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'triggerFollowUpQueue') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log('[FQ] Trigger(s) removido(s): ' + removed);
  return { removidos: removed };
}

// ──────────────────────────────────────────────────────────────
//  HELPERS INTERNOS
// ──────────────────────────────────────────────────────────────

function _fqSetStatus(sheet, rowNum, status) {
  sheet.getRange(rowNum, _fqColIdx('status')).setValue(status);
}
function _fqSetCellByRow(sheet, rowNum, colIdx0, value) {
  sheet.getRange(rowNum, colIdx0 + 1).setValue(value);
}

/**
 * Cancela todos os itens pendentes de um protocolo.
 * @returns {number} quantidade cancelada
 */
function _fqCancelarTodosCard(sheet, data, protocolo, motivo) {
  var iProto  = data[0].indexOf('card_protocolo');
  var iStatus = data[0].indexOf('status');
  var count   = 0;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][iProto]) === String(protocolo) && data[r][iStatus] === 'pendente') {
      sheet.getRange(r + 1, iStatus + 1).setValue(motivo || 'cancelado');
      count++;
    }
  }
  return count;
}

/**
 * Verifica se o cliente respondeu após a última mensagem enviada.
 * Heurística: busca no histórico GPT Maker se há mensagem do cliente
 * mais recente do que o último follow-up enviado para este protocolo.
 *
 * Por enquanto: retorna false (implementar integração GPT Maker quando disponível).
 * Substitua este stub pela consulta real ao histórico de conversas.
 */
function _fqClienteRespondeu(protocolo, stageId) {
  // TODO: consultar GPT Maker API — GET /chat/{chatId}/messages — e verificar
  // se há mensagem com role='user' após o timestamp do último follow-up enviado.
  return false;
}
