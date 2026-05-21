/**
 * ============================================================
 *  AUTOMACAO_THAYNAN.GS
 *  Automação 1: Integração Agente Thaynan da Milvolts
 *
 *  Converte o blueprint Make.com para Apps Script.
 *  Fluxo:
 *    Webhook (doPost) → Seta variáveis → Router
 *      ├── Rota A (conferir_pecas):
 *      │     • Adiciona linha na aba CRM
 *      │     • Chama GPT Maker: start-human (assume atendimento)
 *      │     • Envia resumo da cotação para o cliente via GPT Maker
 *      │     └── Envia notificação no Grupo do Telegram
 *      └── Rota B (Transf. p/ Humano):
 *            • Adiciona linha na aba transferencias
 *            └── Envia notificação no Grupo do Telegram
 *
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

/**
 * Ponto de entrada da automação.
 * Recebe o payload do webhook, extrai as variáveis e roteia para
 * a função correta (conferir_pecas ou transferência para humano).
 *
 * @param {Object} payload - Objeto JSON recebido no doPost
 * @returns {Object} Objeto de resultado com status e mensagem
 */
function processarWebhookThaynan(payload) {
  Logger.log('[THAYNAN] Payload recebido: ' + JSON.stringify(payload));

  // ──────────────────────────────────────────────
  //  Módulo "Seta as variáveis" (ID: 4 no blueprint)
  //  Extrai o recipient a partir do chat_id
  //  Lógica original: se chat_id contém "-", pega o que vem depois
  // ──────────────────────────────────────────────
  const chatId    = payload.chat_id || '';
  const recipient = extrairRecipient(chatId);

  Logger.log('[THAYNAN] chat_id: ' + chatId + ' | recipient: ' + recipient);

  // ──────────────────────────────────────────────
  //  Router: decide qual rota executar
  // ──────────────────────────────────────────────

  // ROTA A — conferir_pecas
  // Condições: peca existe E modelo existe E estagio_funil === 'conferir_pecas'
  if (payload.peca && payload.modelo && payload.estagio_funil === 'conferir_pecas') {
    Logger.log('[THAYNAN] → Rota A: conferir_pecas');
    return rotaConferirPecas(payload, recipient);
  }

  // ROTA B — Transferência para Humano
  // Condições: summary existe E memberId existe
  if (payload.summary && payload.memberId) {
    Logger.log('[THAYNAN] → Rota B: Transferência para Humano');
    return rotaTransferenciaHumano(payload);
  }

  Logger.log('[THAYNAN] Nenhuma rota correspondeu. Payload ignorado.');
  return { status: 'ignored', mensagem: 'Payload não corresponde a nenhuma rota configurada.' };
}

// ──────────────────────────────────────────────────────────────
//  ROTA A — Conferir Peças / Registrar Cotação no CRM
// ──────────────────────────────────────────────────────────────

/**
 * Processa um novo orçamento de peça.
 * - Salva no CRM
 * - Assume o atendimento (start-human) no GPT Maker
 * - Envia resumo para o cliente
 * - Notifica o grupo do Telegram
 *
 * @param {Object} payload   - Dados do webhook
 * @param {string} recipient - Número de WhatsApp extraído do chat_id
 */
function rotaConferirPecas(payload, recipient) {
  // ── Verificação de Autopreservação ─────────────────────────
  // Se o pipeline está sobrecarregado, a IA recusa novos leads e avisa o operador.
  try {
    var ap = verificarAutopreservacao();
    if (ap.ativa) {
      Logger.log('[ROTA A] 🔴 AUTOPRESERVAÇÃO ATIVA. Lead recusado. Motivo: ' + ap.motivo);
      registrarLog('conferir_pecas', 'bloqueado_autopreservacao', payload,
        'Autopreservação ativa: ' + ap.motivo);
      return { status: 'bloqueado', motivo: 'autopreservacao_ativa', detalhe: ap.motivo };
    }
  } catch (apErr) {
    Logger.log('[ROTA A] Erro ao verificar autopreservação (ignorado): ' + apErr.message);
  }
  // ───────────────────────────────────────────────────────────

  const erros = [];
  var chatId = normalizarChatId_(payload.chat_id || payload.contextId || '');
  var nomeCliente = resolverNomeCliente(payload);
  var dadosCRM = Object.assign({}, payload, {
    chat_id: chatId,
    estagio_funil: 'conferir_pecas',
    nome_cliente: nomeCliente,
  });
  recipient = recipient || extrairRecipient(chatId) || payload.recipient || payload.contact_phone || '';

  // 1. Registra na aba CRM (ID 25 no blueprint)
  try {
    adicionarLinhaCRM(dadosCRM, recipient);
    Logger.log('[ROTA A] ✓ Linha adicionada no CRM');
  } catch (e) {
    erros.push('CRM: ' + e.message);
    Logger.log('[ROTA A] ✗ Erro no CRM: ' + e.message);
  }

  // 2. GPT Maker: start-human — assume o atendimento (ID 2 no blueprint)
  try {
    gptMakerStartHuman(chatId);
    Logger.log('[ROTA A] ✓ GPT Maker: start-human executado para ' + chatId);
  } catch (e) {
    erros.push('GPT Maker start-human: ' + e.message);
    Logger.log('[ROTA A] ✗ Erro start-human: ' + e.message);
  }

  // 3. Envia resumo da cotação para o cliente via GPT Maker (ID 3 no blueprint)
  //    Mensagem original: "RESUMO DA COTAÇÃO! ..."
  try {
    const mensagemCliente = [
      '*RESUMO DA COTACAO*',
      '',
      'Cliente/Telefone: ' + (nomeCliente || '') + ' | ' + recipient + ';',
      'Peça: ' + (payload.peca || '') + ';',
      'Carro: ' + (payload.modelo || '') + ';',
      '',
      '_' + (nomeCliente || 'Cliente') + ', o vendedor foi notificado, '
        + 'em alguns minutos você tera retorno._',
    ].join('\n');

    gptMakerEnviarMensagem(chatId, mensagemCliente);
    Logger.log('[ROTA A] ✓ Mensagem de resumo enviada ao cliente');
  } catch (e) {
    erros.push('GPT Maker mensagem cliente: ' + e.message);
    Logger.log('[ROTA A] ✗ Erro mensagem cliente: ' + e.message);
  }

  // 4. Notifica o grupo do Telegram (ID 19 no blueprint)
  //    Mensagem original: "<b>NOVA COTAÇÃO!</b>..."
  if (_notifHabilitada('conferir_pecas')) {
    try {
      var telegram = getTelegramConfig_();
      const mensagemTelegram = [
        '<b>NOVA COTACAO</b>',
        '',
        '<b>Cliente:</b> ' + _esc(nomeCliente || 'N/I') + ';',
        '<b>Telefone:</b> ' + _esc(recipient || 'N/I') + ';',
        '<b>Peca:</b> ' + _esc(payload.peca || 'N/I') + ';',
        '<b>Carro:</b> ' + _esc(payload.modelo || 'N/I') + ';',
        '',
        '<i>' + _esc(payload.tarefa || '') + '</i>',
      ].join('\n');

      telegramEnviarMensagem(telegram.chatId, mensagemTelegram, 'HTML');
      Logger.log('[ROTA A] ✓ Notificação enviada ao Telegram');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
      Logger.log('[ROTA A] ✗ Erro Telegram: ' + e.message);
    }
  }

  return {
    status:    erros.length === 0 ? 'ok' : 'parcial',
    rota:      'conferir_pecas',
    protocolo: payload.protocolo || '',
    erros:     erros,
  };
}

// ──────────────────────────────────────────────────────────────
//  ROTA B — Transferência para Humano
// ──────────────────────────────────────────────────────────────

/**
 * Processa uma transferência de atendimento para humano.
 * - Salva na aba transferencias
 * - Notifica o grupo do Telegram
 *
 * @param {Object} payload - Dados do webhook de transferência
 */
function rotaTransferenciaHumano(payload) {
  const erros = [];
  var dados = normalizarTransferenciaHumano_(payload);

  // 1. Registra na aba transferencias (ID 28 no blueprint)
  try {
    adicionarLinhaTransferencias(dados);
    Logger.log('[ROTA B] ✓ Linha adicionada em transferencias');
  } catch (e) {
    erros.push('Transferencias: ' + e.message);
    Logger.log('[ROTA B] ✗ Erro transferencias: ' + e.message);
  }

  // 2. Notifica o grupo do Telegram (ID 21 no blueprint)
  //    Mensagem original: "<b>Transferência Para Humano!</b>..."
  if (_notifHabilitada('transferir_para_humano')) {
    try {
      const mensagemTelegram = [
        '<b>TRANSFERENCIA PARA HUMANO</b>',
        '',
        'Atencao, o cliente <b>' + _esc(dados.name || 'N/I') + '</b> '
          + 'solicitou transferencia para um humano:',
        '',
        '<b>Cliente:</b> ' + _esc(dados.name || 'N/I'),
        '<b>Telefone:</b> ' + _esc(dados.recipient || 'N/I'),
        '<b>Canal:</b> '    + _esc(dados.channel || 'N/I'),
        '<b>Transferido para:</b> ' + _esc(dados.memberName || 'N/I'),
        '',
        '<b>Resumo:</b> <i>' + _esc(dados.summary || '') + '</i>',
      ].join('\n');

      try {
        var telegram = getTelegramConfig_();
        telegramEnviarMensagem(telegram.chatId, mensagemTelegram, 'HTML');
        Logger.log('[ROTA B] ✓ Notificação enviada ao Telegram');
      } catch (eTelegram) {
        Logger.log('[ROTA B] Telegram ignorado (erro silencioso): ' + eTelegram.message);
      }
    } catch (e) {
      erros.push('Telegram builder: ' + e.message);
    }
  }

  return {
    status: erros.length === 0 ? 'ok' : 'parcial',
    rota:   'transferencia_humano',
    cliente: dados.name || '',
    erros:  erros,
  };
}

// ──────────────────────────────────────────────────────────────
//  ROTAS — EVENTOS NATIVOS GPT MAKER
// ──────────────────────────────────────────────────────────────

/**
 * Rota: nao_sabe_responder
 * Evento nativo disparado quando o agente não consegue responder uma pergunta.
 * Ação: notifica o grupo do Telegram com a pergunta (se habilitado).
 */
function rotaNaoSabeResponder(payload) {
  var erros = [];
  Logger.log('[ROTA nao_sabe_responder] question: ' + (payload.question || '').substring(0, 200));

  if (_notifHabilitada('nao_sabe_responder')) {
    try {
      var msg = [
        '<b>Thaynan IA nao soube responder</b>',
        '',
        '<b>Pergunta:</b>',
        '<i>' + _esc(payload.question || 'N/I') + '</i>',
        '',
        '<b>Contexto:</b> ' + _esc(payload.contextId || payload.channel || '—'),
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
      Logger.log('[ROTA nao_sabe_responder] ✓ Telegram notificado');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
      Logger.log('[ROTA nao_sabe_responder] ✗ Telegram: ' + e.message);
    }
  }

  return { status: erros.length === 0 ? 'ok' : 'parcial', rota: 'nao_sabe_responder', erros: erros };
}

/**
 * Rota: novo_agendamento
 * Evento nativo disparado quando um agendamento é criado pelo agente.
 * Ação: notifica o Telegram com detalhes do agendamento (se habilitado).
 */
function rotaNovoAgendamento(payload) {
  var erros = [];
  Logger.log('[ROTA novo_agendamento] eventId: ' + payload.eventId);

  if (_notifHabilitada('novo_agendamento')) {
    try {
      var dataInicio = '';
      if (payload.startDate) {
        try { dataInicio = new Date(payload.startDate).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}); }
        catch(_) { dataInicio = String(payload.startDate); }
      }
      var msg = [
        '<b>Novo Agendamento</b>',
        '',
        '<b>Cliente:</b> ' + _esc(payload.userName || payload.name || 'N/I'),
        '<b>E-mail:</b> '  + _esc(payload.userEmail || '—'),
        '<b>Data:</b> '    + _esc(dataInicio || '—'),
        '<b>Assunto:</b> ' + _esc(payload.subject || '—'),
        '<b>Meet:</b> '    + _esc(payload.meetUrl || '—'),
        '',
        '<b>Telefone:</b> ' + _esc(payload.recipient || '—'),
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
      Logger.log('[ROTA novo_agendamento] ✓ Telegram notificado');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
      Logger.log('[ROTA novo_agendamento] ✗ Telegram: ' + e.message);
    }
  }

  return { status: erros.length === 0 ? 'ok' : 'parcial', rota: 'novo_agendamento', erros: erros };
}

/**
 * Rota: cancelamento_de_evento
 * Evento nativo disparado quando um evento do calendário é cancelado.
 * Ação: notifica o Telegram (se habilitado).
 */
function rotaCancelamentoEvento(payload) {
  var erros = [];
  Logger.log('[ROTA cancelamento_de_evento] eventId: ' + payload.eventId);

  if (_notifHabilitada('cancelamento_de_evento')) {
    try {
      var msg = [
        '<b>Evento Cancelado</b>',
        '',
        '<b>Cliente:</b> '   + _esc(payload.name      || 'N/I'),
        '<b>Telefone:</b> '  + _esc(payload.recipient  || '—'),
        '<b>Evento ID:</b> ' + _esc(payload.eventId    || '—'),
        '<b>Canal:</b> '     + _esc(payload.channel    || '—'),
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
      Logger.log('[ROTA cancelamento_de_evento] ✓ Telegram notificado');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
      Logger.log('[ROTA cancelamento_de_evento] ✗ Telegram: ' + e.message);
    }
  }

  return { status: erros.length === 0 ? 'ok' : 'parcial', rota: 'cancelamento_de_evento', erros: erros };
}

/**
 * Rota: nova_mensagem
 * Evento nativo disparado a cada nova mensagem do cliente.
 * Notificação DESABILITADA por padrão (muito frequente — configure em Configurações).
 */
function rotaNovaMensagem(payload) {
  var erros = [];
  Logger.log('[ROTA nova_mensagem] de: ' + (payload.contactName || payload.contactPhone || '?'));

  if (_notifHabilitada('nova_mensagem')) {
    try {
      var msg = [
        '<b>Nova Mensagem</b>',
        '',
        '<b>Cliente:</b> ' + _esc(payload.contactName  || 'N/I'),
        '<b>Tel:</b> '     + _esc(payload.contactPhone  || '—'),
        '<b>Canal:</b> '   + _esc(payload.channel       || '—'),
        '',
        '<i>' + _esc((payload.message || '').substring(0, 300)) + '</i>',
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
    }
  }

  return { status: 'ok', rota: 'nova_mensagem', erros: erros };
}

/**
 * Rota: iniciar_atendimento / primeiro_atendimento
 * Eventos nativos disparados no início de uma interação.
 * Notificação DESABILITADA por padrão — configure em Configurações se necessário.
 *
 * @param {string} tipo - 'iniciar_atendimento' ou 'primeiro_atendimento'
 */
function rotaIniciarAtendimento(tipo, payload) {
  var erros = [];
  Logger.log('[ROTA ' + tipo + '] protocolo: ' + payload.protocol + ' | nome: ' + payload.name);

  if (_notifHabilitada(tipo)) {
    try {
      var label = tipo === 'primeiro_atendimento' ? 'Primeiro Atendimento' : 'Novo Atendimento';
      var msg = [
        '<b>' + label + '</b>',
        '',
        '<b>Cliente:</b> '   + _esc(payload.name      || 'N/I'),
        '<b>Telefone:</b> '  + _esc(payload.recipient  || '—'),
        '<b>Protocolo:</b> ' + _esc(String(payload.protocol || '—')),
        '<b>Canal:</b> '     + _esc(payload.channel    || '—'),
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
    }
  }

  return { status: 'ok', rota: tipo, erros: erros };
}

/**
 * Rota: finalizou_atendimento
 * Evento nativo disparado quando o atendimento é encerrado (sem participação humana).
 * Notificação DESABILITADA por padrão.
 */
function rotaFinalizouAtendimento(payload) {
  var erros = [];
  Logger.log('[ROTA finalizou_atendimento] protocolo: ' + payload.protocol);

  if (_notifHabilitada('finalizou_atendimento')) {
    try {
      var msg = [
        '<b>Atendimento Finalizado</b>',
        '',
        '<b>Cliente:</b> '            + _esc(payload.name              || 'N/I'),
        '<b>Protocolo:</b> '          + _esc(String(payload.protocol   || '—')),
        '<b>Humano participou:</b> '  + (payload.humanParticipated ? 'Sim' : 'Não'),
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
    }
  }

  return { status: 'ok', rota: 'finalizou_atendimento', erros: erros };
}

/**
 * Rota: conversa_finalizada
 * Evento nativo disparado ao encerrar conversa onde houve atendimento humano.
 * Notificação DESABILITADA por padrão.
 */
function rotaConversaFinalizada(payload) {
  var erros = [];
  Logger.log('[ROTA conversa_finalizada] protocolo: ' + payload.protocol + ' | humano: ' + payload.humanName);

  if (_notifHabilitada('conversa_finalizada')) {
    try {
      var msg = [
        '<b>Conversa Finalizada</b>',
        '',
        '<b>Cliente:</b> '   + _esc(payload.name       || 'N/I'),
        '<b>Protocolo:</b> ' + _esc(String(payload.protocol || '—')),
        '<b>Atendente:</b> ' + _esc(payload.humanName  || '—'),
        '<b>E-mail:</b> '    + _esc(payload.humanEmail || '—'),
      ].join('\n');
      telegramEnviarMensagem(CONFIG.TELEGRAM_GROUP_ID, msg, 'HTML');
    } catch (e) {
      erros.push('Telegram: ' + e.message);
    }
  }

  return { status: 'ok', rota: 'conversa_finalizada', erros: erros };
}

// ──────────────────────────────────────────────────────────────
//  UTILITÁRIOS INTERNOS
// ──────────────────────────────────────────────────────────────

/**
 * Extrai o recipient (número do WhatsApp) a partir do chat_id.
 * Lógica Make.com original:
 *   if(contains(chat_id, "-"), substring(chat_id, indexOf(chat_id, "-") + 1, length), null)
 *
 * Exemplo: "3F102654AAC2505647613ED3AED0536B-556381008682" → "556381008682"
 *
 * @param {string} chatId
 * @returns {string|null}
 */
function extrairRecipient(chatId) {
  if (chatId && chatId.includes('-')) {
    return chatId.substring(chatId.indexOf('-') + 1);
  }
  return null;
}

function resolverNomeCliente(payload) {
  var candidates = [
    payload && payload.contact_name,
    payload && payload.name,
    payload && payload.whatsappName,
    payload && payload.nome_cliente,
    payload && payload.contactName,
    payload && payload.userName,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var value = String(candidates[i] || '').trim();
    if (value && value.toLowerCase() !== 'n/i') return value;
  }
  return _inferirNomeDaSummary_(payload && payload.summary);
}

function normalizarTransferenciaHumano_(payload) {
  var contextId = normalizarChatId_(payload.contextId || payload.context_id || payload.chat_id || '');
  return {
    name: resolverNomeCliente(payload) || 'N/I',
    recipient: payload.recipient || extrairRecipient(contextId) || payload.contact_phone || '',
    channel: payload.channel || payload.channelName || payload.source || '',
    memberName: payload.memberName || payload.membername || payload.humanName || payload.member || '',
    contextId: contextId,
    memberId: payload.memberId || payload.memberID || payload.member_id || '',
    agentId: payload.agentId || payload.agentID || payload.assistantId || payload.agent || '',
    summary: payload.summary || payload.question || '',
  };
}

function normalizarChatId_(chatId) {
  return String(chatId || '').trim();
}

function _inferirNomeDaSummary_(summary) {
  var text = String(summary || '');
  if (!text) return '';
  var patterns = [
    /Cliente[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,60}?)(?:\s+solicitou|\s+via|\s+pediu|\.|,)/i,
    /cliente\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{1,60}?)(?:\s+solicitou|\s+via|\s+pediu|\.|,)/i,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var match = text.match(patterns[i]);
    if (match && match[1]) {
      var nome = String(match[1]).replace(/\s+/g, ' ').trim();
      if (nome.toLowerCase() !== 'sem nome informado') return nome;
    }
  }
  return '';
}

/**
 * Verifica se a notificação Telegram está habilitada para um dado tipo de evento.
 * Lê da aba "configs" com a chave "notif_TIPO".
 *
 * Defaults:
 *   habilitado por padrão:  conferir_pecas, transferir_para_humano,
 *                           nao_sabe_responder, novo_agendamento, cancelamento_de_evento
 *   desabilitado por padrão: nova_mensagem, iniciar_atendimento,
 *                            primeiro_atendimento, finalizou_atendimento, conversa_finalizada
 *
 * @param {string} evento - Ex: 'conferir_pecas', 'nova_mensagem', etc.
 * @returns {boolean}
 */
function _notifHabilitada(evento) {
  try {
    var configs = getConfigs();
    var valor   = configs['notif_' + evento];

    // Se chave não configurada ainda → usar default
    if (valor === '' || valor === undefined || valor === null) {
      var defaultTrue = [
        'conferir_pecas', 'transferir_para_humano',
        'nao_sabe_responder', 'novo_agendamento', 'cancelamento_de_evento',
      ];
      return defaultTrue.indexOf(evento) >= 0;
    }

    // Aceita: true (bool), 'true' (string), 1, 'sim', 'yes'
    var v = String(valor).toLowerCase().trim();
    return v === 'true' || v === '1' || v === 'sim' || v === 'yes';

  } catch (e) {
    Logger.log('[_notifHabilitada] Erro ao ler config: ' + e.message);
    return true; // fail-open: se não conseguir ler, notifica
  }
}

/**
 * Escapa caracteres especiais HTML para uso seguro em mensagens Telegram (modo HTML).
 * Evita quebra de parse quando o conteúdo do usuário contém < > & etc.
 *
 * @param {string} str
 * @returns {string}
 */
function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
