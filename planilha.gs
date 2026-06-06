/**
 * ============================================================
 *  PLANILHA.GS — Operações no Google Sheets
 *  CRM + Dashboard | Milvolts LTDA
 *  v2 — Configs, atualizarStatus, excluirLinha
 * ============================================================
 */

function getSpreadsheet() {
  // 1. Bound script (executado a partir da própria planilha)
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (_) { ss = null; }
  if (ss) return ss;
  // 2. Web App / trigger externo: lê ID do Script Properties
  var id = (PropertiesService.getScriptProperties().getProperty('spreadsheet_id') || '').trim();
  if (!id) throw new Error(
    'Planilha não configurada. ' +
    'Acesse: Apps Script Editor → Configurações do projeto → Propriedades do script ' +
    '→ adicione spreadsheet_id = <ID_DA_PLANILHA>. ' +
    'Ou pelo painel admin → Configurações → 🔒 Credenciais.'
  );
  return SpreadsheetApp.openById(id);
}

// ──────────────────────────────────────────────────────────────
//  CRM — ESCRITA
// ──────────────────────────────────────────────────────────────

function adicionarLinhaCRM(dados, recipient) {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_CRM);
  if (!sheet) throw new Error('Aba "' + CONFIG.SHEET_CRM + '" não encontrada.');
  sheet.appendRow([
    dados.estagio_funil    || 'conferir_pecas', dados.valor_peca       || '', dados.atendente        || '',
    dados.chat_id          || dados.contextId || '', dados.prioridade       || '', dados.protocolo        || '',
    dados.oportunidade_nome|| '', recipient              || dados.recipient || '', dados.obs              || '',
    'Thaynan IA', '#',            dados.categoria_peca   || '', '1',
    dados.valor_peca       || '', dados.tarefa           || '', dados.data_tarefa      || '',
    dados.atendente        || '', dados.status_tarefa    || '', '',
    dados.atendente        || '', dados.origem           || '',
  ]);
  Logger.log('[CRM] Linha adicionada: protocolo=' + dados.protocolo);
  return true;
}

/**
 * Atualiza o Status (coluna A) pelo protocolo (coluna F).
 */
function atualizarStatusCRM(protocolo, novoStatus, authToken) {
  var sessao = requireAuth(authToken, 'operador');
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_CRM);
  if (!sheet) return { ok: false, erro: 'Aba CRM não encontrada.' };
  var dados = sheet.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][5]) === String(protocolo)) {
      sheet.getRange(i + 1, 1).setValue(novoStatus);
      Logger.log('[CRM] Status atualizado: ' + protocolo + ' → ' + novoStatus);
      registrarLog('auditoria', 'ok', {
        protocolo: protocolo,
        novoStatus: novoStatus,
      }, '', {
        usuario: sessao.email,
        acao: 'editar_card_status',
      });
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Protocolo não encontrado: ' + protocolo };
}

/**
 * Edita campos específicos de um lead pelo protocolo.
 * @param {string} protocolo - Protocolo do lead (chave de busca na col F)
 * @param {Object} campos - { valor, responsavel, produto, canal, transfPara, obs, statusTarefa, origem }
 */
/**
 * Retorna o índice de coluna (1-based) pelo nome do header.
 * Se não existir, cria a coluna no final com o header formatado.
 */
function _colByHeader(sheet, headerName) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = headers.indexOf(headerName);
  if (idx >= 0) return idx + 1;
  // Cria nova coluna
  var newCol = lastCol + 1;
  var cell = sheet.getRange(1, newCol);
  cell.setValue(headerName).setFontWeight('bold').setBackground('#1D4ED8').setFontColor('#FFFFFF');
  sheet.setColumnWidth(newCol, 120);
  Logger.log('[CRM] Nova coluna criada: ' + headerName + ' @ col ' + newCol);
  return newCol;
}

function editarCampoCRM(protocolo, campos, authToken) {
  var sessao = requireAuth(authToken, 'operador');
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_CRM);
  if (!sheet) return { ok: false, erro: 'Aba CRM não encontrada.' };

  // Campos com coluna fixa (legacy)
  var CAMPO_COL_FIXO = {
    valor:        2,
    responsavel:  3,
    produto:      12,
    canal:        11,
    transfPara:   20,
    obs:          9,
    statusTarefa: 18,
    origem:       21,
  };
  // Campos com coluna dinâmica (ficha do cliente + veículo)
  var CAMPOS_DINAMICOS = [
    'email','genero','nascimento','cargo',
    'empresa','cidade','estado','anotacoesCliente',
    'veicFabricante','veicModelo','veicAno','veicMoto',
  ];

  var dados = sheet.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][5]) === String(protocolo)) {
      var keys = Object.keys(campos);
      for (var k = 0; k < keys.length; k++) {
        var field = keys[k];
        var val   = campos[field];
        var col   = CAMPO_COL_FIXO[field];
        if (col !== undefined) {
          sheet.getRange(i + 1, col).setValue(val);
        } else if (CAMPOS_DINAMICOS.indexOf(field) >= 0) {
          col = _colByHeader(sheet, field);
          sheet.getRange(i + 1, col).setValue(val);
        }
      }
      Logger.log('[CRM] editarCampoCRM: protocolo=' + protocolo + ' campos=' + JSON.stringify(keys));
      registrarLog('auditoria', 'ok', { protocolo: protocolo, campos: campos }, '', {
        usuario: sessao.email,
        acao: 'editar_card_campos',
      });
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Protocolo não encontrado: ' + protocolo };
}

/**
 * Exclui permanentemente a linha pelo protocolo.
 */
function excluirLinhaCRM(protocolo, authToken) {
  var sessao = requireAuth(authToken, 'operador');
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_CRM);
  if (!sheet) return { ok: false, erro: 'Aba CRM não encontrada.' };
  var dados = sheet.getDataRange().getValues();
  for (var i = 1; i < dados.length; i++) {
    if (String(dados[i][5]) === String(protocolo)) {
      sheet.deleteRow(i + 1);
      Logger.log('[CRM] Linha excluída: protocolo=' + protocolo);
      registrarLog('auditoria', 'ok', {
        protocolo: protocolo,
      }, '', {
        usuario: sessao.email,
        acao: 'excluir_card',
      });
      return { ok: true };
    }
  }
  return { ok: false, erro: 'Protocolo não encontrado: ' + protocolo };
}

// ──────────────────────────────────────────────────────────────
//  TRANSFERENCIAS — ESCRITA
// ──────────────────────────────────────────────────────────────

function adicionarLinhaTransferencias(dados) {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_TRANSFERENCIAS);
  if (!sheet) throw new Error('Aba "' + CONFIG.SHEET_TRANSFERENCIAS + '" não encontrada.');
  sheet.appendRow([
    dados.name || '',
    dados.recipient || '',
    dados.channel || '',
    dados.memberName || '',
    dados.contextId || '',
    dados.memberId || '',
    dados.agentId || '',
    dados.summary || '',
  ]);
  return true;
}

// ──────────────────────────────────────────────────────────────
//  LEITURA
// ──────────────────────────────────────────────────────────────

function _sheetToObjects(sheetName) {
  var sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var h = d[0];
  return d.slice(1).map(function(row){
    var o={};h.forEach(function(c,i){o[c||'c'+i]=row[i]!==undefined?row[i]:'';});return o;
  });
}

function getDadosCRM()           { return _sheetToObjects(CONFIG.SHEET_CRM); }
function getDadosTransferencias(){ return _sheetToObjects(CONFIG.SHEET_TRANSFERENCIAS); }
function getDadosTelegramIDs()   { return _sheetToObjects(CONFIG.SHEET_TELEGRAM_IDS); }

// ──────────────────────────────────────────────────────────────
//  ABA: CONFIGS
// ──────────────────────────────────────────────────────────────

/**
 * Lê configurações da aba "configs". Cria a aba se não existir.
 * @returns {Object} Mapa chave→valor
 */
function getConfigs() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName('configs') || _criarAbaConfigs(ss);
  var d = sheet.getDataRange().getValues();
  var c = {};
  for (var i = 1; i < d.length; i++) {
    var k = String(d[i][0]||'').trim();
    if (k && k.toLowerCase() !== 'chave') c[k] = d[i][1] !== undefined ? d[i][1] : '';
  }
  return c;
}

function getPublicConfigs(authToken) {
  requireAuth(authToken, 'operador');
  var configs = getConfigs();
  return {
    logo_url: configs.logo_url || '',
    logo_grande_url: configs.logo_grande_url || '',
    icone_url: configs.icone_url || '',
    empresa_nome: configs.empresa_nome || '',
    tema_padrao: configs.tema_padrao || 'claro',
    chat_lateral_url: configs.chat_lateral_url || '',
    chat_lateral_nome: configs.chat_lateral_nome || 'Monitora Chat',
    chat_lateral_habilitado: String(configs.chat_lateral_habilitado || 'false').toLowerCase() === 'true',
    push_eventos: {
      conferir_pecas: String(configs.push_conferir_pecas || 'true').toLowerCase() === 'true',
      transferir_para_humano: String(configs.push_transferir_para_humano || 'true').toLowerCase() === 'true',
      nao_sabe_responder: String(configs.push_nao_sabe_responder || 'true').toLowerCase() === 'true',
      iniciar_atendimento: String(configs.push_iniciar_atendimento || 'false').toLowerCase() === 'true',
      primeiro_atendimento: String(configs.push_primeiro_atendimento || 'true').toLowerCase() === 'true',
    },
  };
}

function salvarConfig(chave, valor) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName('configs') || _criarAbaConfigs(ss);
  var d = sheet.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim() === chave) { sheet.getRange(i+1,2).setValue(valor); return {ok:true}; }
  }
  sheet.appendRow([chave, valor, '']);
  return {ok:true};
}

// ──────────────────────────────────────────────────────────────
//  LOGS — Aba "Logs" (escrita e leitura)
// ──────────────────────────────────────────────────────────────

/**
 * Registra um evento na aba "Logs".
 * Cria a aba automaticamente se não existir.
 * NUNCA propaga exceções — logging não pode quebrar o fluxo principal.
 *
 * @param {string}        tipo    - Tipo do evento (ex: 'conferir_pecas', 'ERRO_PARSE')
 * @param {string}        status  - 'ok' | 'parcial' | 'erro' | 'ignored'
 * @param {Object|string} payload - Payload recebido (será serializado como JSON)
 * @param {string}        [erro]  - Mensagem de erro, se houver
 */
function registrarLog(tipo, status, payload, erro, meta) {
  try {
    var ss    = getSpreadsheet();
    var sheet = ss.getSheetByName('Logs') || _criarAbaLogs(ss);
    _garantirColunasLogs_(sheet);

    var payloadStr = '';
    try { payloadStr = JSON.stringify(payload || ''); }
    catch(_) { payloadStr = String(payload || ''); }

    var usuario = '';
    var acao    = '';
    if (meta && typeof meta === 'object') {
      usuario = String(meta.usuario || '');
      acao    = String(meta.acao || '');
    }

    sheet.appendRow([
      new Date(),                            // A: Timestamp
      tipo   || '',                          // B: Tipo
      status || '',                          // C: Status
      payloadStr.substring(0, 50000),        // D: Payload
      String(erro || '').substring(0, 5000), // E: Erro detalhado
      usuario.substring(0, 320),             // F: Usuário
      acao.substring(0, 320),                // G: Ação
    ]);
  } catch (e) {
    // Nunca propaga — apenas loga no Logger nativo
    Logger.log('[registrarLog] Falha silenciosa: ' + e.message);
  }
}

/**
 * Cria e formata a aba "Logs" no spreadsheet.
 * @param {Spreadsheet} ss
 * @returns {Sheet}
 */
function _criarAbaLogs(ss) {
  var sh = ss.insertSheet('Logs');
  var hdr = sh.getRange(1, 1, 1, 7);
  hdr.setValues([['Timestamp', 'Tipo', 'Status', 'Payload', 'Erro', 'Usuario', 'Acao']]);
  hdr.setFontWeight('bold')
     .setBackground('#1D4ED8')
     .setFontColor('#FFFFFF');
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 220);
  sh.setColumnWidth(3, 100);
  sh.setColumnWidth(4, 500);
  sh.setColumnWidth(5, 300);
  sh.setColumnWidth(6, 220);
  sh.setColumnWidth(7, 220);
  sh.setFrozenRows(1);
  Logger.log('[LOGS] Aba "Logs" criada automaticamente.');
  return sh;
}

/**
 * Retorna os últimos N registros da aba "Logs" em ordem decrescente (mais recente primeiro).
 * Chamado pelo frontend via google.script.run.getLogsData().
 *
 * @param {number} [limite=200] - Máximo de registros a retornar
 * @returns {Array<Object>} Array de objetos com chaves: Timestamp, Tipo, Status, Payload, Erro
 */
function getLogsData(limite, authToken) {
  requireAuth(authToken, 'admin');
  limite = limite || 200;
  var sheet = getSpreadsheet().getSheetByName('Logs');
  if (!sheet) return [];
  var d = sheet.getDataRange().getValues();
  if (d.length < 2) return [];
  var headers = d[0];
  var rows    = d.slice(1).reverse(); // mais recentes primeiro
  if (rows.length > limite) rows = rows.slice(0, limite);
  return rows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      var val = row[i] !== undefined ? row[i] : '';
      // Converte Date do Sheets para string ISO legível
      if (val instanceof Date) val = val.toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'});
      obj[String(h || 'c' + i)] = val;
    });
    return obj;
  });
}

function _garantirColunasLogs_(sheet) {
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var required = ['Timestamp', 'Tipo', 'Status', 'Payload', 'Erro', 'Usuario', 'Acao'];
  if (headers.length < required.length || required.some(function(name, idx) { return headers[idx] !== name; })) {
    sheet.getRange(1, 1, 1, required.length).setValues([required]);
    sheet.getRange(1, 1, 1, required.length)
      .setFontWeight('bold')
      .setBackground('#1D4ED8')
      .setFontColor('#FFFFFF');
  }
}

function _criarAbaConfigs(ss) {
  var sh = ss.insertSheet('configs');
  var h = sh.getRange(1,1,1,3);
  h.setValues([['Chave','Valor','Descrição']]);
  h.setFontWeight('bold').setBackground('#1D4ED8').setFontColor('#FFFFFF');

  [
    ['logo_url',       'https://i.imgur.com/OIXtZJm.png', 'Logo horizontal Milvolts (sidebar)'],
    ['logo_grande_url','https://i.imgur.com/sPCqhhG.png',  'Logo grande Milvolts'],
    ['icone_url',      'https://i.imgur.com/eBPowrl.png',  'Ícone da aba do navegador (favicon)'],
    ['empresa_nome',   'Milvolts LTDA',                    'Nome da empresa'],
    ['tema_padrao',    'claro',                            'Tema padrão: "claro" ou "escuro"'],
    // bot_token e chat_id REMOVIDOS — ficam no Script Properties (telegram_bot_token / telegram_chat_id)
    ['push_conferir_pecas', 'true',                        'Notificação push: Conferir Peças'],
    ['push_transferir_para_humano', 'true',                'Notificação push: Transferir para humano'],
    ['push_nao_sabe_responder', 'true',                    'Notificação push: Não sabe responder'],
    ['push_iniciar_atendimento', 'false',                  'Notificação push: Iniciar atendimento'],
    ['push_primeiro_atendimento', 'true',                  'Notificação push: Primeiro atendimento'],
    ['chat_lateral_habilitado', 'false',                   'Exibir botão de chat lateral no CRM'],
    ['chat_lateral_nome', 'Monitora Chat',                 'Nome exibido para o recurso de chat lateral'],
    ['chat_lateral_url', '',                               'URL externa do ambiente de chat lateral'],
  ].forEach(function(row, i){ sh.getRange(i+2,1,1,3).setValues([row]); });

  sh.setColumnWidth(1,180); sh.setColumnWidth(2,320); sh.setColumnWidth(3,280);
  Logger.log('[CONFIGS] Aba criada com valores padrão.');
  return sh;
}
