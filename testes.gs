/**
 * ============================================================
 *  TESTES.GS — Autorização de Escopos OAuth
 *
 *  COMO USAR:
 *  1. Abra o editor do Apps Script
 *  2. Selecione a função  autorizarTodosOsEscopos
 *  3. Clique em ▶ Executar
 *  4. Aceite TODAS as permissões na janela de autorização
 *  5. Pronto — todos os escopos estarão autorizados
 *
 *  Você também pode executar cada função individualmente
 *  se quiser autorizar apenas um escopo específico.
 *
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

// ──────────────────────────────────────────────────────────────
//  MASTER — executa todos de uma vez
// ──────────────────────────────────────────────────────────────

/**
 * Executa todos os testes de escopo em sequência.
 * Selecione ESTA função e clique em Executar para forçar
 * a janela de autorização com TODOS os escopos de uma vez.
 */
function autorizarTodosOsEscopos() {
  var resultados = {};

  Logger.log('═══════════════════════════════════════════');
  Logger.log('  AUTORIZAÇÃO DE ESCOPOS — Milvolts CRM');
  Logger.log('═══════════════════════════════════════════');

  resultados.email         = _testeEnvioEmail();
  resultados.gmail         = _testeGmail();
  resultados.conexaoExterna = _testeConexaoExterna();
  resultados.planilha      = _testePlanilha();
  resultados.drive         = _testeDrive();
  resultados.triggers      = _testeTriggers();
  resultados.propriedades  = _testePropriedades();
  resultados.cache         = _testeCache();
  resultados.calendario    = _testeCalendario();
  resultados.usuario       = _testeUsuario();

  Logger.log('───────────────────────────────────────────');
  Logger.log('RESUMO:');
  Object.keys(resultados).forEach(function(k) {
    var r = resultados[k];
    Logger.log('  ' + (r.ok ? '✅' : '❌') + ' ' + k + (r.ok ? '' : ': ' + r.erro));
  });
  Logger.log('═══════════════════════════════════════════');

  var erros = Object.keys(resultados).filter(function(k){ return !resultados[k].ok; });
  if (erros.length === 0) {
    Logger.log('✅ Todos os escopos autorizados com sucesso!');
  } else {
    Logger.log('⚠️  Escopos com falha: ' + erros.join(', '));
    Logger.log('    Execute cada função individualmente para diagnosticar.');
  }

  return resultados;
}

// ──────────────────────────────────────────────────────────────
//  1. ENVIO DE E-MAIL — MailApp (scope: script.send_mail)
// ──────────────────────────────────────────────────────────────

function autorizarEnvioEmail() { return _testeEnvioEmail(); }

function _testeEnvioEmail() {
  Logger.log('[1/10] Testando MailApp (envio de e-mail)...');
  try {
    var destinatario = Session.getActiveUser().getEmail();
    if (!destinatario) throw new Error('Usuário não identificado. Faça login com sua conta Google.');

    MailApp.sendEmail({
      to:      destinatario,
      subject: '[Milvolts CRM] Teste de autorização de e-mail',
      body:    'Este e-mail confirma que o escopo de envio de e-mail foi autorizado com sucesso.\n\n'
             + 'Você pode ignorar este e-mail.\n\n'
             + '— Sistema CRM Milvolts',
      htmlBody: '<p>Este e-mail confirma que o escopo de envio de e-mail foi <b>autorizado com sucesso</b>.</p>'
              + '<p style="color:#888">Você pode ignorar este e-mail.<br>— Sistema CRM Milvolts</p>',
    });
    Logger.log('   ✅ MailApp OK — e-mail enviado para ' + destinatario);
    return { ok: true, destinatario: destinatario };
  } catch(e) {
    Logger.log('   ❌ MailApp ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  2. GMAIL — GmailApp (scope: mail.google.com)
// ──────────────────────────────────────────────────────────────

function autorizarGmail() { return _testeGmail(); }

function _testeGmail() {
  Logger.log('[2/10] Testando GmailApp (acesso à caixa de entrada)...');
  try {
    var threads = GmailApp.getInboxThreads(0, 1);
    Logger.log('   ✅ GmailApp OK — threads na caixa: ' + threads.length);
    return { ok: true };
  } catch(e) {
    Logger.log('   ❌ GmailApp ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  3. CONEXÕES EXTERNAS — UrlFetchApp (scope: script.external_request)
// ──────────────────────────────────────────────────────────────

function autorizarConexoesExternas() { return _testeConexaoExterna(); }

function _testeConexaoExterna() {
  Logger.log('[3/10] Testando UrlFetchApp (conexões externas / webhooks)...');
  try {
    // Usa um endpoint público de teste (httpbin) para validar o escopo
    var resp = UrlFetchApp.fetch('https://httpbin.org/get?origem=milvolts_crm_teste', {
      method:             'GET',
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    Logger.log('   ✅ UrlFetchApp OK — HTTP ' + code);
    return { ok: true, httpStatus: code };
  } catch(e) {
    Logger.log('   ❌ UrlFetchApp ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  4. PLANILHA — SpreadsheetApp (scope: spreadsheets)
// ──────────────────────────────────────────────────────────────

function autorizarPlanilha() { return _testePlanilha(); }

function _testePlanilha() {
  Logger.log('[4/10] Testando SpreadsheetApp (ler/escrever planilha)...');
  try {
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var nome   = ss.getName();
    var sheets = ss.getSheets().length;

    // Testa criação de aba e exclusão (cria e remove imediatamente)
    var nomeTeste = '__teste_escopo_' + Date.now();
    var sheetTmp  = ss.insertSheet(nomeTeste);
    sheetTmp.getRange('A1').setValue('teste_escopo_autorizado');
    ss.deleteSheet(sheetTmp);

    Logger.log('   ✅ SpreadsheetApp OK — planilha: "' + nome + '" | abas: ' + sheets);
    return { ok: true, planilha: nome, abas: sheets };
  } catch(e) {
    Logger.log('   ❌ SpreadsheetApp ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  5. DRIVE — DriveApp (scope: drive)
// ──────────────────────────────────────────────────────────────

function autorizarDrive() { return _testeDrive(); }

function _testeDrive() {
  Logger.log('[5/10] Testando DriveApp (criar/ler/excluir arquivos no Drive)...');
  try {
    // Cria arquivo de teste, lê e exclui
    var arquivo = DriveApp.createFile('__milvolts_teste_escopo.txt', 'teste_autorizado_' + new Date().toISOString(), 'text/plain');
    var id      = arquivo.getId();
    var conteudo = arquivo.getBlob().getDataAsString();
    arquivo.setTrashed(true); // move para lixeira

    Logger.log('   ✅ DriveApp OK — arquivo criado e removido (id: ' + id + ')');
    return { ok: true, arquivoId: id };
  } catch(e) {
    Logger.log('   ❌ DriveApp ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  6. TRIGGERS — ScriptApp (scope: script.scriptapp)
// ──────────────────────────────────────────────────────────────

function autorizarTriggers() { return _testeTriggers(); }

function _testeTriggers() {
  Logger.log('[6/10] Testando ScriptApp (listar triggers / agendamentos)...');
  try {
    var triggers = ScriptApp.getProjectTriggers();
    Logger.log('   ✅ ScriptApp OK — triggers ativos: ' + triggers.length);
    return { ok: true, triggers: triggers.length };
  } catch(e) {
    Logger.log('   ❌ ScriptApp ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  7. PROPRIEDADES DO SCRIPT — PropertiesService
// ──────────────────────────────────────────────────────────────

function autorizarPropriedades() { return _testePropriedades(); }

function _testePropriedades() {
  Logger.log('[7/10] Testando PropertiesService (script properties / secrets)...');
  try {
    var props = PropertiesService.getScriptProperties();
    var chaves = props.getKeys();
    // Escreve e lê uma propriedade de teste, depois remove
    props.setProperty('__teste_escopo_temp__', 'ok_' + Date.now());
    var val = props.getProperty('__teste_escopo_temp__');
    props.deleteProperty('__teste_escopo_temp__');
    Logger.log('   ✅ PropertiesService OK — chaves configuradas: ' + chaves.length);
    return { ok: true, chaves: chaves.length };
  } catch(e) {
    Logger.log('   ❌ PropertiesService ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  8. CACHE — CacheService
// ──────────────────────────────────────────────────────────────

function autorizarCache() { return _testeCache(); }

function _testeCache() {
  Logger.log('[8/10] Testando CacheService (cache de script)...');
  try {
    var cache = CacheService.getScriptCache();
    cache.put('__teste_cache__', 'ok', 10);
    var val = cache.get('__teste_cache__');
    cache.remove('__teste_cache__');
    Logger.log('   ✅ CacheService OK');
    return { ok: true };
  } catch(e) {
    Logger.log('   ❌ CacheService ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  9. CALENDÁRIO — CalendarApp (scope: calendar)
// ──────────────────────────────────────────────────────────────

function autorizarCalendario() { return _testeCalendario(); }

function _testeCalendario() {
  Logger.log('[9/10] Testando CalendarApp (acesso ao Google Calendar)...');
  try {
    var calendarios = CalendarApp.getAllCalendars();
    Logger.log('   ✅ CalendarApp OK — calendários: ' + calendarios.length);
    return { ok: true, calendarios: calendarios.length };
  } catch(e) {
    Logger.log('   ❌ CalendarApp ERRO (pode não estar habilitado): ' + e.message);
    return { ok: false, erro: e.message };
  }
}

// ──────────────────────────────────────────────────────────────
//  10. USUÁRIO / SESSÃO — Session (scope: userinfo.email)
// ──────────────────────────────────────────────────────────────

function autorizarUsuario() { return _testeUsuario(); }

function _testeUsuario() {
  Logger.log('[10/10] Testando Session (informações do usuário)...');
  try {
    var email = Session.getActiveUser().getEmail();
    var locale = Session.getActiveUserLocale();
    Logger.log('   ✅ Session OK — usuário: ' + email + ' | locale: ' + locale);
    return { ok: true, email: email };
  } catch(e) {
    Logger.log('   ❌ Session ERRO: ' + e.message);
    return { ok: false, erro: e.message };
  }
}
