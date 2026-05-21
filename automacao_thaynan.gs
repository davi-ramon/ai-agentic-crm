/**
 * ============================================================
 *  AUTOMACAO_DEVOLVER.GS
 *  Automação 2: Devolver todos os atendimentos — Thaynan
 *
 *  Converte o blueprint Make.com para Apps Script.
 *  Fluxo:
 *    Trigger (webhook ou manual) → Define variáveis
 *      → Busca chats no GPT Maker (chatsSearch)
 *        → Para cada chat: stop-human (devolve ao Thaynan IA)
 *          → Responde 200
 *            → Avisa o Thaynan via GPT Maker (WhatsApp)
 *
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

/**
 * Ponto de entrada da automação "Devolver todos os atendimentos".
 * Pode ser chamada:
 *  - Via doPost quando payload contém { "action": "devolver_atendimentos" }
 *  - Manualmente via editor do Apps Script (chamada direta)
 *
 * @param {Object} [payload] - Payload opcional do webhook
 * @returns {Object} Resultado com contagem de chats processados
 */
function devolverTodosAtendimentos(payload) {
  Logger.log('[DEVOLVER] Iniciando automação "Devolver todos os atendimentos"...');

  // ──────────────────────────────────────────────
  //  Módulo "Define as variáveis" (ID: 10 no blueprint)
  // ──────────────────────────────────────────────
  const variaveis = {
    api_key:         CONFIG.GPTMAKER_API_KEY,
    agenteID:        CONFIG.GPTMAKER_AGENT_ID,
    chatID:          CONFIG.GPTMAKER_CHANNEL_ID,
    max_conversas:   CONFIG.MAX_CONVERSAS_DEVOLVER,
    whatsappThaynan: CONFIG.WHATSAPP_THAYNAN,
  };

  Logger.log('[DEVOLVER] Variáveis definidas: ' + JSON.stringify(variaveis));

  // ──────────────────────────────────────────────
  //  Módulo gpt-maker:chatsSearch (ID: 15 no blueprint)
  //  Busca os atendimentos ativos no workspace
  // ──────────────────────────────────────────────
  let chats = [];
  try {
    // Usa busca paginada para obter até 500 chats (vs. limite fixo de 100 anterior)
    chats = gptMakerBuscarTodosChats(500);
    Logger.log('[DEVOLVER] Chats encontrados (paginado): ' + chats.length);
  } catch (e) {
    Logger.log('[DEVOLVER] Erro ao buscar chats: ' + e.message);
    return { status: 'erro', mensagem: 'Erro ao buscar chats: ' + e.message };
  }

  if (chats.length === 0) {
    Logger.log('[DEVOLVER] Nenhum chat ativo encontrado.');

    // Mesmo sem chats, avisa o Thaynan (comportamento do blueprint)
    _avisarThaynanDevolver(variaveis);

    return { status: 'ok', chats_processados: 0, mensagem: 'Nenhum chat ativo para devolver.' };
  }

  // ──────────────────────────────────────────────
  //  Módulo gpt-maker:chatPut (ID: 16 no blueprint)
  //  Para CADA chat: stop-human (devolve ao bot Thaynan IA)
  //  Controle: sleep(350ms) entre chamadas + timeout de 5 minutos
  // ──────────────────────────────────────────────
  let processados = 0;
  const erros = [];
  const SLEEP_MS = 350;           // intervalo entre stop-human (evita rate-limit)
  const MAX_EXEC_MS = 5 * 60 * 1000; // 5 minutos máximo para o loop
  const tInicio = Date.now();

  Logger.log('[DEVOLVER] Iniciando loop stop-human: ' + chats.length + ' chats | sleep=' + SLEEP_MS + 'ms | timeout=5min');

  for (let i = 0; i < chats.length; i++) {
    // Verifica timeout antes de cada chamada
    const elapsed = Date.now() - tInicio;
    if (elapsed > MAX_EXEC_MS) {
      Logger.log('[DEVOLVER] ⏱ Timeout atingido (' + Math.round(elapsed/1000) + 's). Parando em ' + i + '/' + chats.length);
      break;
    }

    const chat   = chats[i];
    const chatId = chat.id || chat.chatId || chat._id;
    if (!chatId) {
      Logger.log('[DEVOLVER] Chat ' + i + ' sem ID, pulando.');
      continue;
    }

    try {
      gptMakerStopHuman(chatId);
      processados++;
      if (processados % 10 === 0) { // log a cada 10 para não poluir
        Logger.log('[DEVOLVER] Progresso: ' + processados + '/' + chats.length + ' | ' + Math.round(elapsed/1000) + 's');
      }
    } catch (e) {
      erros.push({ chatId: chatId, erro: e.message });
      Logger.log('[DEVOLVER] ✗ Erro stop-human [' + chatId + ']: ' + e.message);
    }

    // Sleep anti-rate-limit (não espera na última iteração)
    if (i < chats.length - 1) Utilities.sleep(SLEEP_MS);
  }

  const tempoTotal = Math.round((Date.now() - tInicio) / 1000);
  Logger.log('[DEVOLVER] ═══ RESULTADO: ' + processados + ' processados / ' + chats.length + ' total | ' + erros.length + ' erros | ' + tempoTotal + 's ═══');

  // ──────────────────────────────────────────────
  //  Módulo gpt-maker:chatsMessagesPOST (ID: 18 no blueprint)
  //  Avisa o Thaynan via WhatsApp (canal GPT Maker)
  //  Mensagem: "Thaynan, passando pra avisar que todos os
  //             atendimentos foram atribuídos à mim."
  // ──────────────────────────────────────────────
  _avisarThaynanDevolver(variaveis);

  return {
    status:            'ok',
    chats_total:       chats.length,
    chats_processados: processados,
    chats_erros:       erros.length,
    tempo_segundos:    tempoTotal,
    erros:             erros,
  };
}

/**
 * Envia a mensagem de aviso ao Thaynan via GPT Maker (WhatsApp).
 * O chatId é construído como: channelID-whatsappThaynan
 * @param {Object} variaveis - Variáveis da automação
 */
function _avisarThaynanDevolver(variaveis) {
  const chatIdThaynan = variaveis.chatID + '-' + variaveis.whatsappThaynan;
  const mensagem      = 'Thaynan, passando pra avisar que todos os atendimentos foram atribuídos à mim.';

  try {
    gptMakerEnviarMensagem(chatIdThaynan, mensagem);
    Logger.log('[DEVOLVER] ✓ Aviso enviado ao Thaynan: ' + chatIdThaynan);
  } catch (e) {
    // Não é crítico, apenas loga
    Logger.log('[DEVOLVER] ✗ Erro ao avisar Thaynan: ' + e.message);
  }
}

/**
 * Função auxiliar para execução manual via editor do Apps Script.
 * Útil para testar a automação sem precisar de um webhook.
 */
function executarDevolverAtendimentos() {
  const resultado = devolverTodosAtendimentos({});
  Logger.log('RESULTADO FINAL: ' + JSON.stringify(resultado));
  return resultado;
}

/**
 * ════════════════════════════════════════════════════
 *  TRIGGER AUTOMÁTICO — use esta função no acionador
 * ════════════════════════════════════════════════════
 *
 *  Como configurar o acionador diário (00:00):
 *  1. No editor do Apps Script → menu "Acionadores" (ícone de relógio)
 *  2. Clique em "+ Adicionar acionador"
 *  3. Função a executar: triggerDevolverAtendimentos
 *  4. Tipo: baseado em tempo → Diariamente
 *  5. Horário: Entre 0h e 1h (00:00–01:00)
 *  6. Salvar
 *
 *  OU rode `criarGatilhoDiario()` uma única vez no editor.
 */
function triggerDevolverAtendimentos() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('[TRIGGER] Acionador diário iniciado: ' + new Date().toLocaleString('pt-BR'));
  Logger.log('═══════════════════════════════════════');

  try {
    var resultado = devolverTodosAtendimentos({});
    Logger.log('[TRIGGER] Concluído: ' + JSON.stringify(resultado));

    // Notifica por e-mail se houver erros (opcional — requer permissão Gmail)
    // MailApp.sendEmail('seu@email.com', 'Devolver Atendimentos', JSON.stringify(resultado));

  } catch (e) {
    Logger.log('[TRIGGER] ERRO CRÍTICO: ' + e.message + '\n' + e.stack);
  }
}