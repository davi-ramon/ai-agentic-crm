/**
 * ============================================================
 *  DASHBOARD_SERVIDOR.GS — Funções server-side para o frontend
 *  CRM + Dashboard | Milvolts LTDA
 *  v3 — Fixes:
 *    - executarDevolverDoFrontend chama devolverTodosAtendimentos (nome correto)
 *    - _parseValor robusto: busca qualquer chave com "valor" no nome
 *    - Log detalhado de colunas recebidas para diagnóstico
 * ============================================================
 */

// ──────────────────────────────────────────────────────────────
//  getDashboardData — KPIs + Gráficos + Mini-tabelas
// ──────────────────────────────────────────────────────────────

function _getDashboardDataInterno() {
  try {
    var crmRaw    = getDadosCRM();
    var transfRaw = getDadosTransferencias();

    Logger.log('[DASH] CRM rows: ' + crmRaw.length + ' | Transf rows: ' + transfRaw.length);

    // ── DEBUG: loga as chaves do primeiro registro para diagnóstico
    if (crmRaw.length > 0) {
      var keys = Object.keys(crmRaw[0]);
      Logger.log('[DASH] Colunas CRM: ' + JSON.stringify(keys));
      Logger.log('[DASH] 1º registro: ' + JSON.stringify(crmRaw[0]));
      // Chaves que contêm "valor"
      var valorKeys = keys.filter(function(k){ return k.toLowerCase().indexOf('valor') > -1; });
      Logger.log('[DASH] Chaves com "valor": ' + JSON.stringify(valorKeys));
    }

    var totalCRM    = crmRaw.length;
    var totalTransf = transfRaw.length;
    var valorTotal      = 0;
    var comValor        = 0;
    var statusCount     = {};
    var origemCount     = {};
    var prioridadeCount = {};
    var agenteCount     = {};
    var tarefaCount     = {};
    // Novos KPIs
    var vendasGanhas      = 0;
    var valorVendasGanhas = 0;
    var vendasPerdidas      = 0;
    var valorVendasPerdidas = 0;
    var emConferirPecas   = 0;

    crmRaw.forEach(function(row) {
      var valor = _parseValor(row);
      if (valor > 0) { valorTotal += valor; comValor++; }

      var status = String(_col(row,'Status') || '').trim();
      if (status) statusCount[status] = (statusCount[status] || 0) + 1;

      // Novos KPIs por status
      var sl = status.toLowerCase().replace(/[\s-]+/g,'_');
      if (sl === 'venda_fechada') { vendasGanhas++;  valorVendasGanhas  += valor; }
      if (sl === 'perdido')       { vendasPerdidas++; valorVendasPerdidas += valor; }
      if (sl === 'conferir_pecas') emConferirPecas++;

      var origem = String(_col(row,'Origem') || 'Orgânico').trim() || 'Orgânico';
      origemCount[origem] = (origemCount[origem] || 0) + 1;

      var prior = String(_col(row,'Prioridade') || 'Baixa').trim() || 'Baixa';
      prioridadeCount[prior] = (prioridadeCount[prior] || 0) + 1;

      var agente = String(_col(row,'Agente') || 'Thaynan').trim() || 'Thaynan';
      if (agente.length > 16) agente = agente.substring(0, 16);
      agenteCount[agente] = (agenteCount[agente] || 0) + 1;

      var stTarefa = String(_col(row,'Status Tarefa') || 'Pendente').trim() || 'Pendente';
      tarefaCount[stTarefa] = (tarefaCount[stTarefa] || 0) + 1;
    });

    Logger.log('[DASH] valorTotal=' + valorTotal + ' comValor=' + comValor + ' statusCount=' + JSON.stringify(statusCount));

    // Funil em ordem canônica
    var STAGE_ORDER = [
      {id:'novo_lead',        label:'Novo Lead'},
      {id:'pre_atendimento',  label:'Pré-atend.'},
      {id:'dados_coletados',  label:'Dados Colet.'},
      {id:'conferir_pecas',    label:'Conferir Peças'},
      {id:'orcamento_enviado',label:'Orçamento Enviado'},
      {id:'follow_up',        label:'Follow-up'},
      {id:'venda_fechada',    label:'Venda Fechada'},
      {id:'perdido',          label:'Perdido'},
      {id:'sem_resposta',     label:'Sem Resposta'},
    ];
    var stageCount = {};
    STAGE_ORDER.forEach(function(st) {
      var count = 0;
      Object.keys(statusCount).forEach(function(k) {
        if (k.toLowerCase().replace(/[\s-]+/g,'_') === st.id) count += statusCount[k];
      });
      stageCount[st.label] = count;
    });

    var ticketMedio = comValor > 0 ? Math.round(valorTotal / comValor) : 0;

    var ultimasCotacoes = crmRaw.slice(-8).reverse().map(function(r) {
      return {
        status:      _col(r,'Status'),
        oportunidade:_col(r,'Nome da Oportunidade') || _col(r,'oportunidade') || '—',
        agente:      _col(r,'Agente') || 'Thaynan',
        valor:       _parseValor(r),
      };
    });

    var ultimasTransferencias = transfRaw.slice(-6).reverse().map(function(r) {
      return {
        nome:  _col(r,'Nome do Cliente') || '—',
        canal: _col(r,'Canal') || '—',
        membro:_col(r,'Nome do Membro') || '—',
      };
    });

    return {
      kpis: {
        totalOportunidades:      totalCRM,
        valorTotalOportunidades: valorTotal,
        ticketMedio:             ticketMedio,
        totalCotacoes:           totalCRM,
        totalTransferencias:     totalTransf,
        vendasGanhas:            vendasGanhas,
        valorVendasGanhas:       valorVendasGanhas,
        vendasPerdidas:          vendasPerdidas,
        valorVendasPerdidas:     valorVendasPerdidas,
        emConferirPecas:         emConferirPecas,
      },
      graficos: {
        stageCount:       stageCount,
        origemCount:      origemCount,
        prioridadeCount:  prioridadeCount,
        agenteCount:      agenteCount,
        tarefaCount:      tarefaCount,
      },
      totalCRM:              totalCRM,
      totalTransf:           totalTransf,
      ultimasCotacoes:       ultimasCotacoes,
      ultimasTransferencias: ultimasTransferencias,
    };

  } catch (e) {
    Logger.log('[getDashboardData] ERRO: ' + e.message + '\nStack: ' + e.stack);
    throw e;
  }
}

function getDashboardData(authToken) {
  requireAuth(authToken, 'operador');
  return _getDashboardDataInterno();
}

// ──────────────────────────────────────────────────────────────
//  getCrmData — Lista completa do CRM formatada
// ──────────────────────────────────────────────────────────────

function _getCrmDataInterno() {
  try {
    var raw = getDadosCRM();
    Logger.log('[getCrmData] ' + raw.length + ' registros');
    return raw.map(function(r) {
      var valor = _parseValor(r);
      return {
        status:      _col(r,'Status'),
        valor:       valor,
        responsavel: _col(r,'Responsável'),
        contato:     _col(r,'Contato'),            // coluna real: "Contato" (chatId GPT Maker)
        nomeCliente: _col(r,'Nome do Cliente') || _col(r,'Nome') || _col(r,'Cliente') || '—',
        prioridade:  _col(r,'Prioridade'),
        protocolo:   _col(r,'Protocolo'),
        oportunidade:_col(r,'Nome da Oportunidade') || '—',
        whatsapp:    _col(r,'WhatsApp'),
        obs:         _col(r,'Observação'),
        agente:      _col(r,'Agente') || 'Thaynan',
        canal:       _col(r,'Canal'),
        produto:     _col(r,'Nome do Produto/Serviço') || '—',
        qtd:         _col(r,'Qtd.'),
        precoUnit:   _col(r,'Preço Unit. (R$)'),   // coluna real: "Preço Unit. (R$)"
        titTarefa:   _col(r,'Título da Tarefa'),
        dataTarefa:  _col(r,'Data da Tarefa'),
        atribuicao:  _col(r,'Atribuição da Tarefa'), // coluna real: "Atribuição da Tarefa"
        statusTarefa:_col(r,'Status da Tarefa'),     // coluna real: "Status da Tarefa"
        idOport:     _col(r,'ID da Oportunidade'),  // coluna real: "ID da Oportunidade"
        transfPara:  _col(r,'Transferido para'),
        origem:      _col(r,'Origem'),
      };
    });
  } catch (e) {
    Logger.log('[getCrmData] ERRO: ' + e.message);
    throw e;
  }
}

function getCrmData(authToken) {
  requireAuth(authToken, 'operador');
  return _getCrmDataInterno();
}

// ──────────────────────────────────────────────────────────────
//  getTransferenciasData
// ──────────────────────────────────────────────────────────────

function _getTransferenciasDataInterno() {
  try {
    var raw = getDadosTransferencias();
    if (raw.length === 0) return [];

    // ── DEBUG: loga colunas reais da aba transferencias ──
    var cols = Object.keys(raw[0]);
    Logger.log('[TRANSF] Colunas reais (' + cols.length + '): ' + JSON.stringify(cols));
    Logger.log('[TRANSF] 1º registro: ' + JSON.stringify(raw[0]));

    return raw.map(function(r) {
      // _colM: tenta múltiplos nomes possíveis, retorna o 1º não vazio
      var _colM = function() {
        for (var i = 0; i < arguments.length; i++) {
          var v = _col(r, arguments[i]);
          if (v && v !== '') return v;
        }
        return '';
      };
      var nome = _colM('Nome do Cliente', 'Nome', 'name', 'Cliente');
      var telefone = _colM(
        'Telefone/Identificação',
        'Telefone/Identificação (recipient)',
        'Telefone',
        'recipient',
        'Identificação',
        'Contato',
        'Phone'
      );
      var canal = _colM('Canal', 'Canal (channel)', 'channel', 'Channel', 'Canal do Chat');
      var membro = _colM(
        'Nome do Membro',
        'Nome do Membro (membername)',
        'membername',
        'memberName',
        'Membro',
        'Member Name',
        'Atendente'
      );
      var ctxId = _colM(
        'ID do Canal de Contexto',
        'ID do Canal de Contexto (contextchannelID)',
        'contextchannelID',
        'contextId',
        'ID do Canal',
        'context_id',
        'Canal ID',
        'channelId'
      );
      var memberId = _colM(
        'ID do Membro',
        'ID do Membro (memberID)',
        'memberID',
        'memberId',
        'member_id',
        'Member ID'
      );
      var agenteId = _colM(
        'ID do Agente',
        'ID do Agente (agentID)',
        'agentID',
        'agentId',
        'agent_id',
        'Agent ID',
        'Agente ID'
      );
      var resumo = _colM(
        'Resumo da Conversa',
        'Resumo da Conversa (summary)',
        'summary',
        'Resumo',
        'Summary',
        'Descrição',
        'Obs'
      );
      return {
        nome: nome,
        telefone: telefone,
        recipient: telefone,
        canal: canal,
        channel: canal,
        membro: membro,
        memberName: membro,
        ctxId: ctxId,
        contextId: ctxId,
        memberId: memberId,
        agenteId: agenteId,
        agentId: agenteId,
        resumo: resumo,
        summary: resumo,
      };
    });
  } catch (e) {
    Logger.log('[getTransferenciasData] ERRO: ' + e.message);
    throw e;
  }
}

function getTransferenciasData(authToken) {
  requireAuth(authToken, 'operador');
  return _getTransferenciasDataInterno();
}

// ──────────────────────────────────────────────────────────────
//  executarDevolverDoFrontend
//  ⚠️  CORREÇÃO: chama devolverTodosAtendimentos (não devolverAtendimentos)
// ──────────────────────────────────────────────────────────────

function executarDevolverDoFrontend(authToken) {
  try {
    requireAuth(authToken, 'admin');
    Logger.log('[executarDevolverDoFrontend] Disparando devolverTodosAtendimentos...');
    // NOME CORRETO: devolverTodosAtendimentos (definido em automacao_devolver.gs)
    return devolverTodosAtendimentos({});
  } catch (e) {
    Logger.log('[executarDevolverDoFrontend] ERRO: ' + e.message + '\nStack: ' + e.stack);
    return { status: 'erro', mensagem: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  HELPERS PRIVADOS
// ──────────────────────────────────────────────────────────────

/**
 * Lê coluna pelo nome do cabeçalho.
 * Aceita variações de capitalização e normalização.
 */
function _col(row, colName) {
  if (!row) return '';
  var val = row[colName];
  if (val !== undefined && val !== null && val !== '') return String(val).trim();
  // Normaliza: minúsculas, sem acentos simples, sem espaços/pontuação
  var norm = colName.toLowerCase().replace(/[^a-z0-9]/g,'');
  var keys = Object.keys(row);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase().replace(/[^a-z0-9]/g,'') === norm) {
      return String(row[keys[i]] || '').trim();
    }
  }
  return '';
}

/**
 * _parseValor — Extrai valor monetário de forma robusta.
 *
 * Estratégia:
 *  1. Tenta chaves exatas conhecidas
 *  2. Busca qualquer chave que contenha "valor" no nome (case-insensitive)
 *  3. Retorna 0 se não encontrar
 *
 * Loga o resultado para diagnóstico.
 */
function _parseValor(row) {
  // 1. Chaves exatas (ordem de prioridade)
  var candidates = ['Valor(R$)', 'Valor (R$)', 'Valor', 'valor', 'VALOR', 'Preço Unit.', 'preco_unit', 'Preço Unitário'];
  for (var i = 0; i < candidates.length; i++) {
    var v = row[candidates[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      var n = _toNumber(v);
      if (n > 0) return n;
    }
  }

  // 2. Fallback: qualquer chave com "valor" no nome
  var keys = Object.keys(row);
  for (var j = 0; j < keys.length; j++) {
    if (keys[j].toLowerCase().indexOf('valor') > -1) {
      var vf = row[keys[j]];
      if (vf !== undefined && vf !== null && String(vf).trim() !== '') {
        var nf = _toNumber(vf);
        if (nf > 0) {
          Logger.log('[_parseValor] Valor encontrado em chave alternativa "' + keys[j] + '": ' + nf);
          return nf;
        }
      }
    }
  }

  return 0;
}

function _toNumber(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var s = String(v).replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ──────────────────────────────────────────────────────────────
//  criarGatilhoDiario — configura trigger automático às 00:00
//  Execute manualmente UMA VEZ no editor para ativar.
// ──────────────────────────────────────────────────────────────

function criarGatilhoDiario() {
  // Remove triggers duplicados da mesma função
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'executarDevolverAtendimentos') {
      ScriptApp.deleteTrigger(t);
      Logger.log('[TRIGGER] Trigger anterior removido.');
    }
  });
  ScriptApp.newTrigger('executarDevolverAtendimentos')
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();
  Logger.log('[TRIGGER] Trigger diário criado: 00:00 → executarDevolverAtendimentos');
  return { ok: true, mensagem: 'Trigger diário configurado para 00:00.' };
}

function removerGatilhoDiario() {
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'executarDevolverAtendimentos') {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  });
  Logger.log('[TRIGGER] ' + removidos + ' trigger(s) removido(s).');
  return { ok: true, mensagem: removidos + ' trigger(s) removido(s).' };
}

// ──────────────────────────────────────────────────────────────
//  CONFIGURAÇÕES DE NOTIFICAÇÕES — por tipo de evento
// ──────────────────────────────────────────────────────────────

/**
 * Retorna as configurações de notificação Telegram para cada tipo de evento.
 * Chamado pelo frontend via google.script.run.getConfigsNotificacoes().
 *
 * @returns {Array<{chave, label, habilitado}>}
 */
function getConfigsNotificacoes(authToken) {
  requireAuth(authToken, 'admin');
  var configs = getConfigs();

  var eventos = [
    { chave:'conferir_pecas',         label:'Conferir Peças (Nova Cotação)',    def:true  },
    { chave:'transferir_para_humano', label:'Transferir para Humano',            def:true  },
    { chave:'nao_sabe_responder',     label:'Não Sabe Responder',               def:true  },
    { chave:'novo_agendamento',       label:'Novo Agendamento',                 def:true  },
    { chave:'cancelamento_de_evento', label:'Cancelamento de Evento',           def:true  },
    { chave:'nova_mensagem',          label:'Nova Mensagem do Cliente',         def:false },
    { chave:'iniciar_atendimento',    label:'Iniciar Atendimento',              def:false },
    { chave:'primeiro_atendimento',   label:'Primeiro Atendimento',             def:false },
    { chave:'finalizou_atendimento',  label:'Finalizou Atendimento',            def:false },
    { chave:'conversa_finalizada',    label:'Conversa Finalizada',              def:false },
  ];

  return eventos.map(function(ev) {
    var raw = configs['notif_' + ev.chave];
    var habilitado;
    if (raw === '' || raw === undefined || raw === null) {
      habilitado = ev.def;
    } else {
      var v = String(raw).toLowerCase().trim();
      habilitado = (v === 'true' || v === '1' || v === 'sim' || v === 'yes');
    }
    return { chave: ev.chave, label: ev.label, habilitado: habilitado };
  });
}

/**
 * Salva a configuração de notificação de um evento.
 * Chamado pelo frontend via google.script.run.salvarConfigNotificacao().
 *
 * @param {string}  chave      - Ex: 'conferir_pecas'
 * @param {boolean} habilitado - true/false
 * @returns {{ok: boolean}}
 */
function salvarConfigNotificacao(chave, habilitado, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  var result = salvarConfig('notif_' + chave, habilitado ? 'true' : 'false');
  registrarLog('auditoria', 'ok', {
    chave: 'notif_' + chave,
    habilitado: !!habilitado,
  }, '', {
    usuario: sessao.email,
    acao: 'alterar_config_notificacao',
  });
  return result;
}

/**
 * Retorna as configurações gerais de Telegram (token mascarado + group ID).
 * Chamado pelo frontend para exibir na página de Configurações.
 * @returns {{groupId: string, tokenMask: string}}
 */
function getConfigsTelegram(authToken) {
  requireAuth(authToken, 'admin');
  // Lê exclusivamente do Script Properties — token não fica na planilha
  var props = PropertiesService.getScriptProperties();
  return {
    botToken: (props.getProperty('telegram_bot_token') || '').trim(),
    chatId:   (props.getProperty('telegram_chat_id')   || '').trim(),
  };
}

function salvarConfigsTelegram(dados, authToken) {
  var sessao   = requireAuth(authToken, 'admin');
  var props    = PropertiesService.getScriptProperties();
  var botToken = String((dados && dados.bot_token) || '').trim();
  var chatId   = String((dados && dados.chat_id)   || '').trim();
  if (!botToken) throw new Error('Informe o bot token do Telegram.');
  if (!chatId)   throw new Error('Informe o chat ID do Telegram.');

  // Salva no Script Properties (não na planilha — é dado sensível)
  props.setProperty('telegram_bot_token', botToken);
  props.setProperty('telegram_chat_id',   chatId);

  registrarLog('auditoria', 'ok', {
    telegram_bot_token: 'atualizado',
    telegram_chat_id:   chatId,
  }, '', { usuario: sessao.email, acao: 'alterar_config_telegram' });
  return { ok: true };
}

function getConfigsPush(authToken) {
  requireAuth(authToken, 'admin');
  var configs = getConfigs();
  var eventos = [
    { chave:'conferir_pecas',         label:'Conferir Peças (Nova Cotação)', def:true  },
    { chave:'transferir_para_humano', label:'Transferir para Humano',         def:true  },
    { chave:'nao_sabe_responder',     label:'Não Sabe Responder',             def:true  },
    { chave:'iniciar_atendimento',    label:'Iniciar Atendimento',            def:false },
    { chave:'primeiro_atendimento',   label:'Primeiro Atendimento',           def:true  },
  ];
  return eventos.map(function(ev) {
    var raw = configs['push_' + ev.chave];
    var habilitado = raw === '' || raw === undefined || raw === null
      ? ev.def
      : ['true', '1', 'sim', 'yes'].indexOf(String(raw).toLowerCase().trim()) >= 0;
    return { chave: ev.chave, label: ev.label, habilitado: habilitado };
  });
}

function salvarConfigsPush(dados, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  Object.keys(dados || {}).forEach(function(chave) {
    salvarConfig('push_' + chave, dados[chave] ? 'true' : 'false');
  });
  registrarLog('auditoria', 'ok', { push: dados || {} }, '', {
    usuario: sessao.email,
    acao: 'alterar_config_push',
  });
  return { ok: true };
}

function getConfigsChatLateral(authToken) {
  requireAuth(authToken, 'admin');
  var configs = getConfigs();
  return {
    habilitado: String(configs.chat_lateral_habilitado || 'false').toLowerCase() === 'true',
    nome: String(configs.chat_lateral_nome || 'Monitora Chat'),
    url: String(configs.chat_lateral_url || ''),
  };
}

function salvarConfigsChatLateral(dados, authToken) {
  var sessao = requireAuth(authToken, 'admin');
  salvarConfig('chat_lateral_habilitado', dados && dados.habilitado ? 'true' : 'false');
  salvarConfig('chat_lateral_nome', String((dados && dados.nome) || 'Monitora Chat').trim());
  salvarConfig('chat_lateral_url', String((dados && dados.url) || '').trim());
  registrarLog('auditoria', 'ok', { chat_lateral: dados || {} }, '', {
    usuario: sessao.email,
    acao: 'alterar_config_chat_lateral',
  });
  return { ok: true };
}

function getRecentPushEvents(sinceIso, authToken) {
  requireAuth(authToken, 'operador');
  var sheet = getSpreadsheet().getSheetByName('Logs');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;
  var allowed = {
    conferir_pecas: true,
    transferir_para_humano: true,
    nao_sabe_responder: true,
    iniciar_atendimento: true,
    primeiro_atendimento: true,
  };

  var rows = data.slice(1).reverse().slice(0, 120);
  var events = [];
  rows.forEach(function(row) {
    var timestamp = row[0];
    var tipo = String(row[1] || '').toLowerCase();
    var status = String(row[2] || '').toLowerCase();
    var payloadRaw = row[3];
    if (!allowed[tipo]) return;
    if (status === 'erro' || status === 'ignored') return;

    var ts = timestamp instanceof Date ? timestamp : new Date(timestamp || '');
    var tsMs = ts && !isNaN(ts.getTime()) ? ts.getTime() : 0;
    if (sinceMs && tsMs <= sinceMs) return;

    var payload = {};
    try { payload = JSON.parse(String(payloadRaw || '{}')); } catch (_) {}
    events.push(_buildPushNotificationEvent_(tipo, ts, payload));
  });

  return events.reverse();
}

function _buildPushNotificationEvent_(tipo, timestamp, payload) {
  var tsIso = timestamp instanceof Date && !isNaN(timestamp.getTime())
    ? timestamp.toISOString()
    : new Date().toISOString();
  var cliente = _pushValue_(payload,
    ['contact_name', 'name', 'whatsappName', 'nome_cliente', 'contactName', 'summary']
  ) || 'Cliente';
  var protocolo = _pushValue_(payload, ['protocol', 'protocolo']);
  var resumo = _pushValue_(payload,
    ['summary', 'question', 'obs', 'message', 'tarefa', 'produto', 'modelo', 'peca']
  );
  var titulo = 'Atualização no CRM';
  var subtitulo = cliente;

  if (tipo === 'conferir_pecas') titulo = 'Nova cotação para conferir peças';
  if (tipo === 'transferir_para_humano') titulo = 'Atendimento transferido para humano';
  if (tipo === 'nao_sabe_responder') titulo = 'IA sinalizou dúvida no atendimento';
  if (tipo === 'iniciar_atendimento' || tipo === 'primeiro_atendimento') titulo = 'Novo atendimento iniciado';
  if (protocolo) subtitulo += ' • Protocolo ' + protocolo;

  return {
    id: tipo + ':' + tsIso,
    tipo: tipo,
    timestamp: tsIso,
    titulo: titulo,
    subtitulo: subtitulo,
    mensagem: resumo || 'Abra o CRM para ver os detalhes deste atendimento.',
    icon: 'https://i.imgur.com/eBPowrl.png',
    badge: 'https://i.imgur.com/eBPowrl.png',
    url: _buildPageUrl_('app'),
  };
}

function _pushValue_(payload, keys) {
  for (var i = 0; i < keys.length; i++) {
    var raw = payload ? payload[keys[i]] : '';
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
      var value = String(raw).trim();
      if (keys[i] === 'summary' && value.indexOf('Cliente:') === 0) {
        var match = value.match(/Cliente:\s*([^\n]+)/i);
        if (match && match[1]) return match[1].trim();
      }
      return value;
    }
  }
  return '';
}

// ──────────────────────────────────────────────────────────────
//  MODAL CHAT — Funções chamadas pelo painel de chat da modal
// ──────────────────────────────────────────────────────────────

/**
 * Retorna uma página de mensagens de um chat para exibir no painel da modal.
 * @param {string} chatId    - ID do chat GPT Maker (channelId-phone)
 * @param {string} authToken
 * @param {number} page      - Página (1 = mais recente, 2 = anterior…)
 * @returns {Array} Array com todos os campos da API GPT Maker
 */
function getModalChatMessages(chatId, authToken, page) {
  requireAuth(authToken, 'operador');
  if (!chatId || chatId.length < 10) {
    Logger.log('[MODAL-CHAT] chatId inválido: ' + chatId);
    return [];
  }
  page = page || 1;
  try {
    Logger.log('[MODAL-CHAT] getModalChatMessages chatId=' + chatId + ' page=' + page);
    var msgs = gptMakerGetMensagens(chatId, 10, page);
    var result = (msgs || []).map(function(m) {
      return {
        id:                           String(m.id || ''),
        sequence:                     m.sequence || 0,
        role:                         String(m.role || 'user'),
        type:                         String(m.type || 'TEXT'),
        conversationNotificationType: m.conversationNotificationType || null,
        text:                         String(m.text || m.content || m.message || ''),
        midiaContent:                 m.midiaContent || null,
        audioUrl:                     m.audioUrl || null,
        imageUrl:                     m.imageUrl || null,
        videoUrl:                     m.videoUrl || null,
        documentUrl:                  m.documentUrl || null,
        fileName:                     m.fileName || null,
        assistantName:                m.assistantName || null,
        agentName:                    m.agentName || null,
        userName:                     m.userName || null,
        assistantAvatar:              m.assistantAvatar || null,
        agentAvatar:                  m.agentAvatar || null,
        time:                         m.time || null,
        width:                        m.width || null,
        height:                       m.height || null,
        protocol:                     m.protocol || null,
      };
    });
    result.sort(function(a, b) {
      var sa = a.sequence || 0, sb = b.sequence || 0;
      if (sa && sb && sa !== sb) return sa - sb;
      return (a.time || 0) - (b.time || 0);
    });
    Logger.log('[MODAL-CHAT] ✓ ' + result.length + ' msgs, page=' + page + ', chatId=' + chatId);
    return result;
  } catch(e) {
    Logger.log('[MODAL-CHAT] Erro ao buscar mensagens: ' + e.message);
    return [];
  }
}

/**
 * Envia uma mensagem via GPT Maker a partir do painel de chat da modal.
 * @param {string} chatId  - ID do chat GPT Maker
 * @param {string} texto   - Texto a enviar
 * @param {string} authToken
 * @returns {{ ok: boolean, erro?: string }}
 */
function enviarMensagemModal(chatId, texto, authToken) {
  requireAuth(authToken, 'operador');
  if (!chatId || !texto) return { ok: false, erro: 'chatId ou texto inválido' };
  try {
    Logger.log('[MODAL-CHAT] enviarMensagemModal chatId=' + chatId + ' txt=' + texto.substring(0, 60));
    gptMakerEnviarMensagem(chatId, texto);
    Logger.log('[MODAL-CHAT] ✓ Mensagem enviada');
    return { ok: true };
  } catch(e) {
    Logger.log('[MODAL-CHAT] ✗ Erro: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * Faz upload de uma imagem (base64 do cliente) para o Google Drive,
 * obtém URL pública e envia via GPT Maker.
 * @param {string} chatId    - ID do chat GPT Maker
 * @param {string} dataUrl   - data:image/...;base64,... (vindo do cliente)
 * @param {string} mimeType  - ex: "image/jpeg" ou "image/png"
 * @param {string} authToken
 * @returns {{ ok: boolean, imageUrl?: string, erro?: string }}
 */
/**
 * Faz upload de imagem (data URL base64) para o Drive, obtém URL pública direta e envia via GPT Maker.
 * URL usa drive.usercontent.google.com — formato sem redirecionamento de login para arquivos públicos.
 */
function enviarImagemModal(chatId, dataUrl, mimeType, authToken) {
  requireAuth(authToken, 'operador');
  if (!chatId || !dataUrl) return { ok: false, erro: 'chatId ou imagem ausente' };
  try {
    var raw      = dataUrl.replace(/^data:[^;]+;base64,/, '');
    var ext      = mimeType === 'image/png' ? 'png' : (mimeType === 'image/gif' ? 'gif' : 'jpg');
    var fileName = 'crm-img-' + Date.now() + '.' + ext;

    var bytes = Utilities.base64Decode(raw);
    var blob  = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName);
    var file  = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // URL direta (sem redirect de login) — compatível com download automatizado por WhatsApp/Z-API
    var imageUrl = 'https://drive.usercontent.google.com/download?id=' + file.getId() + '&export=download&authuser=0';
    Logger.log('[MODAL-CHAT] enviarImagemModal → fileId=' + file.getId() + ' url=' + imageUrl);

    gptMakerEnviarImagem(chatId, imageUrl, '');
    Logger.log('[MODAL-CHAT] ✓ Imagem enviada ao GPT Maker');
    return { ok: true, imageUrl: imageUrl };
  } catch(e) {
    Logger.log('[MODAL-CHAT] ✗ Erro ao enviar imagem: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

/**
 * Faz upload de áudio (base64 WebM/OGG) para o Drive e envia via GPT Maker.
 */
function enviarAudioModal(chatId, dataUrl, mimeType, authToken) {
  requireAuth(authToken, 'operador');
  if (!chatId || !dataUrl) return { ok: false, erro: 'chatId ou áudio ausente' };
  try {
    var raw      = dataUrl.replace(/^data:[^;]+;base64,/, '');
    var ext      = mimeType && mimeType.includes('ogg') ? 'ogg' : 'webm';
    var fileName = 'crm-audio-' + Date.now() + '.' + ext;
    var mime     = mimeType || 'audio/webm';

    var bytes = Utilities.base64Decode(raw);
    var blob  = Utilities.newBlob(bytes, mime, fileName);
    var file  = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var audioUrl = 'https://drive.usercontent.google.com/download?id=' + file.getId() + '&export=download&authuser=0';
    Logger.log('[MODAL-CHAT] enviarAudioModal → fileId=' + file.getId());

    gptMakerEnviarAudio(chatId, audioUrl);
    Logger.log('[MODAL-CHAT] ✓ Áudio enviado ao GPT Maker');
    return { ok: true, audioUrl: audioUrl };
  } catch(e) {
    Logger.log('[MODAL-CHAT] ✗ Erro ao enviar áudio: ' + e.message);
    return { ok: false, erro: e.message };
  }
}
