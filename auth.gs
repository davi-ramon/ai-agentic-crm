/**
 * ============================================================
 *  AUTH.GS - Autenticacao, Convites, Recuperacao e Sessoes
 *  CRM + Dashboard | Milvolts LTDA
 * ============================================================
 */

var AUTH_CONFIG = {
  USERS_SHEET: 'Users',
  SESSION_PREFIX: 'auth_session_',
  INVITE_PREFIX: 'auth_invite_',
  RESET_PREFIX: 'auth_reset_',
  RESET_CODE_PREFIX: 'auth_reset_code_',
  RESET_ACCESS_PREFIX: 'auth_reset_access_',
  SESSION_TTL_HOURS: 24,
  INVITE_TTL_HOURS: 72,
  RESET_TTL_HOURS: 2,
  RESET_CODE_TTL_MINUTES: 5,
  RESET_ACCESS_TTL_MINUTES: 10,
};

function getAuthBootstrap() {
  var users = _listarUsuariosInterno_();
  return {
    needsSetup: users.length === 0,
    webappUrl: _getWebAppUrl_(),
    loginUrl: _buildPageUrl_('login'),
    appUrl: _buildPageUrl_('app'),
  };
}

function setupPrimeiroAdmin(nome, email, senha) {
  var users = _listarUsuariosInterno_();
  if (users.length > 0) throw new Error('O primeiro administrador ja foi configurado.');

  var senhaHash = _hashPassword_(senha);
  _upsertUser_({
    nome: nome,
    email: email,
    senha: senhaHash,
    role: 'admin',
    created_at: new Date(),
  });

  var user = _buscarUsuarioPorEmail_(email);
  var sessao = _criarSessao_(user);
  registrarLog('login', 'ok', { origem: 'setup_inicial', email: user.email }, '', {
    usuario: user.email,
    acao: 'login',
  });
  return _buildAuthSuccessResponse_(user, sessao, { origem: 'setup_inicial' });
}

function loginUsuario(email, senha) {
  var normalizedEmail = _normalizeEmail_(email);
  Logger.log('[AUTH][loginUsuario] Tentativa de login para ' + (normalizedEmail || '<email_invalido>'));

  var user = _buscarUsuarioPorEmail_(normalizedEmail);
  if (!user || !user.senha) {
    _registrarFalhaAuth_('login', normalizedEmail, 'Usuario nao encontrado ou sem senha cadastrada.');
    throw new Error('E-mail ou senha invalidos.');
  }

  var passwordCheck = _verifyPasswordCompat_(senha, user.senha);
  if (!passwordCheck.ok) {
    _registrarFalhaAuth_('login', normalizedEmail, 'Senha invalida. Formato detectado: ' + passwordCheck.format);
    throw new Error('E-mail ou senha invalidos.');
  }

  if (passwordCheck.needsUpgrade) {
    Logger.log('[AUTH][loginUsuario] Migrando senha legada para hash seguro: ' + normalizedEmail + ' (' + passwordCheck.format + ')');
    _upsertUser_({
      nome: user.nome,
      email: user.email,
      senha: _hashPassword_(senha),
      role: user.role,
      created_at: user.created_at || new Date(),
    });
    user = _buscarUsuarioPorEmail_(normalizedEmail) || user;
  }

  var sessao = _criarSessao_(user);
  registrarLog('login', 'ok', { email: user.email, password_format: passwordCheck.format }, '', {
    usuario: user.email,
    acao: 'login',
  });
  return _buildAuthSuccessResponse_(user, sessao, { password_format: passwordCheck.format });
}

function logoutUsuario(authToken) {
  var sessao = _requireSession_(authToken, 'operador');
  _getScriptProperties_().deleteProperty(AUTH_CONFIG.SESSION_PREFIX + authToken);
  registrarLog('logout', 'ok', { email: sessao.email }, '', {
    usuario: sessao.email,
    acao: 'logout',
  });
  return { ok: true };
}

function getSessionInfo(authToken) {
  var sessao = _getSession_(authToken);
  if (!sessao) return { authenticated: false };
  return {
    authenticated: true,
    user: _publicUser_(sessao),
    appUrl: _buildPageUrl_('app'),
    loginUrl: _buildPageUrl_('login'),
    permissions: {
      admin: _roleAllows_(sessao.role, 'admin'),
      operador: _roleAllows_(sessao.role, 'operador'),
    },
  };
}

function listarUsuarios(authToken) {
  _requireSession_(authToken, 'admin');
  return _listarUsuariosInterno_().map(_publicUser_);
}

function enviarConviteUsuario(dados, authToken) {
  var sessao = _requireSession_(authToken, 'admin');
  var nome = String((dados && dados.nome) || '').trim();
  var email = _normalizeEmail_((dados && dados.email) || '');
  var role = _sanitizeRole_((dados && dados.role) || 'operador');
  if (!nome) throw new Error('Informe o nome do usuario.');
  if (!email) throw new Error('Informe um e-mail valido.');

  var existente = _buscarUsuarioPorEmail_(email);
  _upsertUser_({
    nome: nome,
    email: email,
    senha: existente ? existente.senha : '',
    role: role,
    created_at: existente && existente.created_at ? existente.created_at : new Date(),
  });

  var inviteToken = _createTimedToken_(AUTH_CONFIG.INVITE_PREFIX, {
    nome: nome,
    email: email,
    role: role,
    createdBy: sessao.email,
  }, AUTH_CONFIG.INVITE_TTL_HOURS);

  var link = _buildAuthLink_('inviteToken', inviteToken);
  var assunto = 'Convite de acesso | Milvolts CRM';
  var corpo = [
    'Ola, ' + nome + '.',
    '',
    'Seu acesso ao Milvolts CRM foi liberado.',
    'Clique no link abaixo para definir sua senha:',
    link,
    '',
    'Este link expira em ' + AUTH_CONFIG.INVITE_TTL_HOURS + ' horas.',
  ].join('\n');
  MailApp.sendEmail(email, assunto, corpo);

  registrarLog('auditoria', 'ok', { nome: nome, email: email, role: role }, '', {
    usuario: sessao.email,
    acao: 'convite_usuario',
  });
  return { ok: true, email: email, link: link };
}

function verificarConvite(token) {
  var data = _readTimedToken_(AUTH_CONFIG.INVITE_PREFIX, token);
  if (!data) throw new Error('Convite invalido ou expirado.');
  return {
    ok: true,
    nome: data.nome || '',
    email: data.email || '',
    role: _sanitizeRole_(data.role || 'operador'),
  };
}

function aceitarConvite(token, nome, senha) {
  var data = _readTimedToken_(AUTH_CONFIG.INVITE_PREFIX, token);
  if (!data) throw new Error('Convite invalido ou expirado.');

  var email = _normalizeEmail_(data.email || '');
  var role = _sanitizeRole_(data.role || 'operador');
  _upsertUser_({
    nome: String(nome || data.nome || '').trim(),
    email: email,
    senha: _hashPassword_(senha),
    role: role,
    created_at: new Date(),
  });

  _deleteTimedToken_(AUTH_CONFIG.INVITE_PREFIX, token);
  var user = _buscarUsuarioPorEmail_(email);
  var sessao = _criarSessao_(user);
  registrarLog('login', 'ok', { origem: 'convite', email: email }, '', {
    usuario: email,
    acao: 'login',
  });
  return _buildAuthSuccessResponse_(user, sessao, { origem: 'convite' });
}

function solicitarResetSenha(email) {
  return solicitarCodigoRecuperacao(email);
}

function verificarResetSenha(token) {
  throw new Error('O fluxo antigo por link foi desativado. Use a recuperacao por codigo de 6 digitos.');
}

function redefinirSenha(token, senha) {
  throw new Error('O fluxo antigo por link foi desativado. Use a recuperacao por codigo de 6 digitos.');
}

function solicitarCodigoRecuperacao(email) {
  var normalizedEmail = _normalizeEmail_(email);
  Logger.log('[AUTH][solicitarCodigoRecuperacao] Solicitacao para ' + (normalizedEmail || '<email_invalido>'));

  var user = _buscarUsuarioPorEmail_(normalizedEmail);
  if (!user) {
    registrarLog('auth', 'ok', { email: normalizedEmail }, 'Solicitacao de recuperacao recebida para e-mail nao cadastrado.', {
      usuario: normalizedEmail,
      acao: 'solicitar_codigo_recuperacao',
    });
    return { ok: true };
  }

  var code = _generateNumericCode_(6);
  _saveExpiringRecord_(_getRecoveryCodeKey_(user.email), {
    email: user.email,
    nome: user.nome || '',
    codeHash: _hashSecretWithSalt_(code),
  }, AUTH_CONFIG.RESET_CODE_TTL_MINUTES * 60000);

  _enviarEmailCodigoRecuperacao_(user, code);
  registrarLog('auth', 'ok', { email: user.email }, '', {
    usuario: user.email,
    acao: 'solicitar_codigo_recuperacao',
  });
  return { ok: true };
}

function validarCodigoRecuperacao(email, codigo) {
  var normalizedEmail = _normalizeEmail_(email);
  Logger.log('[AUTH][validarCodigoRecuperacao] Validando codigo para ' + (normalizedEmail || '<email_invalido>'));

  var user = _buscarUsuarioPorEmail_(normalizedEmail);
  if (!user) throw new Error('Codigo invalido ou expirado.');

  var record = _readExpiringRecord_(_getRecoveryCodeKey_(user.email));
  if (!record || !_verifySecretWithSalt_(codigo, record.codeHash || '')) {
    _registrarFalhaAuth_('validar_codigo_recuperacao', normalizedEmail, 'Codigo invalido ou expirado.');
    throw new Error('Codigo invalido ou expirado.');
  }

  _deleteExpiringRecord_(_getRecoveryCodeKey_(user.email));
  var accessToken = _generateSecureToken_();
  _saveExpiringRecord_(_getRecoveryAccessKey_(accessToken), {
    email: user.email,
  }, AUTH_CONFIG.RESET_ACCESS_TTL_MINUTES * 60000);

  registrarLog('auth', 'ok', { email: user.email }, '', {
    usuario: user.email,
    acao: 'validar_codigo_recuperacao',
  });
  return {
    ok: true,
    email: user.email,
    accessToken: accessToken,
  };
}

function redefinirSenhaComCodigo(email, accessToken, senha) {
  var normalizedEmail = _normalizeEmail_(email);
  Logger.log('[AUTH][redefinirSenhaComCodigo] Redefinindo senha para ' + (normalizedEmail || '<email_invalido>'));

  var user = _buscarUsuarioPorEmail_(normalizedEmail);
  if (!user) throw new Error('Usuario nao encontrado.');

  var accessData = _readExpiringRecord_(_getRecoveryAccessKey_(accessToken));
  if (!accessData || _normalizeEmail_(accessData.email || '') !== normalizedEmail) {
    _registrarFalhaAuth_('redefinir_senha_com_codigo', normalizedEmail, 'Token de redefinicao invalido ou expirado.');
    throw new Error('Sessao de redefinicao invalida ou expirada. Solicite um novo codigo.');
  }

  _upsertUser_({
    nome: user.nome,
    email: user.email,
    senha: _hashPassword_(senha),
    role: user.role,
    created_at: user.created_at || new Date(),
  });

  user = _buscarUsuarioPorEmail_(normalizedEmail) || user;

  _deleteExpiringRecord_(_getRecoveryAccessKey_(accessToken));
  _deleteExpiringRecord_(_getRecoveryCodeKey_(normalizedEmail));
  try { _enviarEmailSenhaRedefinida_(user); }
  catch (mailErr) { Logger.log('[AUTH][redefinirSenhaComCodigo] Falha ao enviar e-mail de confirmação: ' + mailErr.message); }
  registrarLog('auth', 'ok', { email: user.email }, '', {
    usuario: user.email,
    acao: 'redefinir_senha',
  });
  return { ok: true };
}

function requireAuth(authToken, requiredRole) {
  return _requireSession_(authToken, requiredRole || 'operador');
}

function _requireSession_(authToken, requiredRole) {
  var sessao = _getSession_(authToken);
  if (!sessao) throw new Error('Sessao invalida ou expirada. Faca login novamente.');
  if (!_roleAllows_(sessao.role, requiredRole || 'operador')) {
    throw new Error('Voce nao tem permissao para executar esta acao.');
  }
  return sessao;
}

function _getSession_(authToken) {
  if (!authToken) return null;
  var raw = _getScriptProperties_().getProperty(AUTH_CONFIG.SESSION_PREFIX + authToken);
  if (!raw) return null;

  var data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    _getScriptProperties_().deleteProperty(AUTH_CONFIG.SESSION_PREFIX + authToken);
    return null;
  }

  if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
    _getScriptProperties_().deleteProperty(AUTH_CONFIG.SESSION_PREFIX + authToken);
    return null;
  }
  return data;
}

function _criarSessao_(user) {
  var token = _generateSecureToken_();
  var expiresAt = new Date(Date.now() + AUTH_CONFIG.SESSION_TTL_HOURS * 3600000).toISOString();
  var sessao = {
    token: token,
    nome: user.nome || '',
    email: _normalizeEmail_(user.email || ''),
    role: _sanitizeRole_(user.role || 'operador'),
    expiresAt: expiresAt,
  };
  _getScriptProperties_().setProperty(AUTH_CONFIG.SESSION_PREFIX + token, JSON.stringify(sessao));
  return sessao;
}

function _listarUsuariosInterno_() {
  var sheet = _getUsersSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headerMap = _getUsersHeaderMap_(data[0] || []);
  return data.slice(1)
    .filter(function(row) {
      return _normalizeEmail_(_getUserCell_(row, headerMap, 'email')) !== '';
    })
    .map(function(row, idx) {
      return {
        rowIndex: idx + 2,
        nome: String(_getUserCell_(row, headerMap, 'nome') || '').trim(),
        email: _normalizeEmail_(_getUserCell_(row, headerMap, 'email')),
        senha: String(_getUserCell_(row, headerMap, 'senha') || ''),
        role: _sanitizeRole_(_getUserCell_(row, headerMap, 'role') || 'operador'),
        created_at: _getUserCell_(row, headerMap, 'created_at') || '',
      };
    });
}

function _buscarUsuarioPorEmail_(email) {
  var normalized = _normalizeEmail_(email);
  if (!normalized) return null;
  var users = _listarUsuariosInterno_();
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === normalized) return users[i];
  }
  return null;
}

function _upsertUser_(user) {
  var sheet = _getUsersSheet_();
  var normalizedEmail = _normalizeEmail_(user.email || '');
  if (!normalizedEmail) throw new Error('E-mail invalido.');

  var row = _buscarUsuarioPorEmail_(normalizedEmail);
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 5)).getValues()[0];
  var headerMap = _getUsersHeaderMap_(headers || []);
  var width = Math.max(headers.length, 5);
  var rowValues = row && row.rowIndex
    ? sheet.getRange(row.rowIndex, 1, 1, width).getValues()[0]
    : new Array(width).fill('');

  rowValues[headerMap.nome] = String(user.nome || '').trim();
  rowValues[headerMap.email] = normalizedEmail;
  rowValues[headerMap.senha] = String(user.senha || '');
  rowValues[headerMap.role] = _sanitizeRole_(user.role || 'operador');
  rowValues[headerMap.created_at] = user.created_at || new Date();

  if (row && row.rowIndex) {
    sheet.getRange(row.rowIndex, 1, 1, width).setValues([rowValues]);
    return row.rowIndex;
  }

  sheet.appendRow(rowValues);
  return sheet.getLastRow();
}

function _getUsersSheet_() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(AUTH_CONFIG.USERS_SHEET);
  if (sheet) return sheet;

  sheet = ss.insertSheet(AUTH_CONFIG.USERS_SHEET);
  sheet.getRange(1, 1, 1, 5).setValues([['nome', 'email', 'senha', 'role', 'created_at']]);
  sheet.getRange(1, 1, 1, 5)
    .setFontWeight('bold')
    .setBackground('#1D4ED8')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 320);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 180);
  return sheet;
}

function _publicUser_(user) {
  return {
    nome: user.nome || '',
    email: _normalizeEmail_(user.email || ''),
    role: _sanitizeRole_(user.role || 'operador'),
    created_at: _toClientSafeValue_(user.created_at || ''),
  };
}

function _buildAuthSuccessResponse_(user, sessao, extra) {
  if (!user) throw new Error('Falha interna de autenticacao: usuario nao encontrado para montar a sessao.');
  if (!sessao || !sessao.token) throw new Error('Falha interna de autenticacao: sessao nao criada corretamente.');
  return Object.assign({
    ok: true,
    token: String(sessao.token || ''),
    user: _publicUser_(user),
  }, extra || {});
}

function _toClientSafeValue_(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return value;
}

function _hashPassword_(password) {
  _assertPasswordPolicy_(password);
  return _hashSecretWithSalt_(password);
}

function _verifyPassword_(password, storedHash) {
  return _verifySecretWithSalt_(password, storedHash);
}

function _createTimedToken_(prefix, payload, ttlHours) {
  var token = _generateSecureToken_();
  var record = Object.assign({}, payload || {}, {
    expiresAt: new Date(Date.now() + ttlHours * 3600000).toISOString(),
  });
  _getScriptProperties_().setProperty(prefix + token, JSON.stringify(record));
  return token;
}

function _readTimedToken_(prefix, token) {
  if (!token) return null;
  var raw = _getScriptProperties_().getProperty(prefix + token);
  if (!raw) return null;

  var data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    _getScriptProperties_().deleteProperty(prefix + token);
    return null;
  }

  if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
    _getScriptProperties_().deleteProperty(prefix + token);
    return null;
  }
  return data;
}

function _deleteTimedToken_(prefix, token) {
  if (!token) return;
  _getScriptProperties_().deleteProperty(prefix + token);
}

function _buildAuthLink_(paramName, token) {
  return _buildPageUrl_('login', paramName, token);
}

function _buildPageUrl_(page, extraParamName, extraParamValue) {
  var url = _getWebAppUrl_();
  if (!url) return '';
  var query = ['page=' + encodeURIComponent(page || 'login')];
  if (extraParamName && extraParamValue) {
    query.push(encodeURIComponent(extraParamName) + '=' + encodeURIComponent(extraParamValue));
  }
  return url + '?' + query.join('&');
}

function _getWebAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; }
  catch (_) { return ''; }
}

function _getScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function _normalizeEmail_(email) {
  var value = String(email || '').trim().toLowerCase();
  if (!value || value.indexOf('@') < 1) return '';
  return value;
}

function _sanitizeRole_(role) {
  return String(role || '').toLowerCase() === 'admin' ? 'admin' : 'operador';
}

function _roleAllows_(actualRole, requiredRole) {
  var order = { operador: 1, admin: 2 };
  return (order[_sanitizeRole_(actualRole)] || 0) >= (order[_sanitizeRole_(requiredRole || 'operador')] || 0);
}

function _generateSecureToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function _generateNumericCode_(length) {
  var size = Math.max(4, Number(length) || 6);
  var code = '';
  while (code.length < size) {
    code += Math.floor(Math.random() * 10);
  }
  return code.substring(0, size);
}

function _bytesToHex_(bytes) {
  return bytes.map(function(b) {
    var value = b < 0 ? b + 256 : b;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function _sha256Hex_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return _bytesToHex_(digest);
}

function _hashSecretWithSalt_(value) {
  var salt = _generateSecureToken_().substring(0, 16);
  return salt + ':' + _sha256Hex_(salt + '|' + String(value || ''));
}

function _verifySecretWithSalt_(value, storedHash) {
  var parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  return _sha256Hex_(parts[0] + '|' + String(value || '')) === parts[1];
}

function _verifyPasswordCompat_(password, storedValue) {
  var stored = String(storedValue || '');
  var plain = String(password || '');
  if (!stored) return { ok: false, needsUpgrade: false, format: 'vazio' };
  if (stored.indexOf(':') > -1) {
    return { ok: _verifySecretWithSalt_(plain, stored), needsUpgrade: false, format: 'salted_hash' };
  }
  if (stored === plain) {
    return { ok: true, needsUpgrade: true, format: 'texto_plano' };
  }
  if (/^[a-f0-9]{64}$/i.test(stored) && _sha256Hex_(plain).toLowerCase() === stored.toLowerCase()) {
    return { ok: true, needsUpgrade: true, format: 'sha256_legado' };
  }
  return { ok: false, needsUpgrade: false, format: 'desconhecido' };
}

function _registrarFalhaAuth_(acao, email, detalhe) {
  var normalizedEmail = _normalizeEmail_(email);
  Logger.log('[AUTH][' + acao + '] Falha para ' + (normalizedEmail || '<email_invalido>') + ': ' + detalhe);
  registrarLog('auth', 'erro', { email: normalizedEmail }, detalhe || '', {
    usuario: normalizedEmail,
    acao: acao,
  });
}

function _normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function _getUsersHeaderMap_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var normalized = _normalizeHeader_(headers[i]);
    if (normalized && map[normalized] === undefined) map[normalized] = i;
  }
  return {
    nome: _pickUserHeaderIndex_(map, ['nome', 'name'], 0),
    email: _pickUserHeaderIndex_(map, ['email', 'mail'], 1),
    senha: _pickUserHeaderIndex_(map, ['senha', 'password', 'pass'], 2),
    role: _pickUserHeaderIndex_(map, ['role', 'perfil', 'tipo'], 3),
    created_at: _pickUserHeaderIndex_(map, ['createdat', 'created_at', 'datacriacao'], 4),
  };
}

function _pickUserHeaderIndex_(map, aliases, fallbackIndex) {
  for (var i = 0; i < aliases.length; i++) {
    var key = _normalizeHeader_(aliases[i]);
    if (map[key] !== undefined) return map[key];
  }
  return fallbackIndex;
}

function _getUserCell_(row, headerMap, fieldName) {
  var index = headerMap && headerMap[fieldName];
  if (index === undefined || index === null || index < 0) return '';
  return row[index];
}

function _safeEmailKey_(email) {
  return Utilities.base64EncodeWebSafe(_normalizeEmail_(email || ''));
}

function _getRecoveryCodeKey_(email) {
  return AUTH_CONFIG.RESET_CODE_PREFIX + _safeEmailKey_(email);
}

function _getRecoveryAccessKey_(token) {
  return AUTH_CONFIG.RESET_ACCESS_PREFIX + String(token || '');
}

function _saveExpiringRecord_(key, payload, ttlMs) {
  var record = Object.assign({}, payload || {}, {
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  });
  _getScriptProperties_().setProperty(String(key || ''), JSON.stringify(record));
  return record;
}

function _readExpiringRecord_(key) {
  if (!key) return null;
  var raw = _getScriptProperties_().getProperty(String(key));
  if (!raw) return null;

  var data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    _getScriptProperties_().deleteProperty(String(key));
    return null;
  }

  if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
    _getScriptProperties_().deleteProperty(String(key));
    return null;
  }
  return data;
}

function _deleteExpiringRecord_(key) {
  if (!key) return;
  _getScriptProperties_().deleteProperty(String(key));
}

function _maskEmail_(email) {
  var normalized = _normalizeEmail_(email);
  if (!normalized) return '';
  var parts = normalized.split('@');
  var local = parts[0] || '';
  var domain = parts[1] || '';
  if (local.length <= 2) return normalized;
  return local.substring(0, 2) + '***@' + domain;
}

function _buildRecoveryEmailHtml_(user, code) {
  var nome = String((user && user.nome) || 'usuario').trim() || 'usuario';
  var maskedEmail = _maskEmail_((user && user.email) || '');
  return _buildTransactionalEmailShell_({
    titulo: 'Codigo para redefinir sua senha',
    subtitulo: 'Recebemos uma solicitacao de recuperacao para a conta ' + maskedEmail + '.',
    corpoHtml: [
      '<p style="margin:0 0 14px;font-size:15px;line-height:1.7;">Ola, <strong>' + nome + '</strong>.</p>',
      '<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#334155;">Use o codigo abaixo na tela de recuperacao do Milvolts CRM. Ele expira em <strong>5 minutos</strong> e pode ser usado apenas uma vez.</p>',
      '<div style="margin:0 0 24px;padding:20px 18px;border-radius:20px;background:#f8fbff;border:1px solid #dbeafe;text-align:center;">',
        '<div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Seu codigo</div>',
        '<div style="font-size:34px;letter-spacing:.38em;font-weight:800;color:#1d4ed8;">' + code + '</div>',
      '</div>',
      '<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#475569;">Se voce nao solicitou essa alteracao, ignore este e-mail. Nenhuma mudanca sera aplicada sem a validacao do codigo.</p>',
    ].join(''),
  });
}

function _enviarEmailCodigoRecuperacao_(user, code) {
  var nome = String((user && user.nome) || 'usuario').trim() || 'usuario';
  var body = [
    'Ola, ' + nome + '.',
    '',
    'Seu codigo de recuperacao do Milvolts CRM e: ' + code,
    '',
    'Esse codigo expira em 5 minutos.',
    'Se voce nao solicitou a redefinicao, ignore este e-mail.',
  ].join('\n');

  MailApp.sendEmail({
    to: user.email,
    subject: 'Codigo de recuperacao | Milvolts CRM',
    body: body,
    htmlBody: _buildRecoveryEmailHtml_(user, code),
    name: 'Milvolts CRM',
  });
}

function _buildSenhaRedefinidaEmailHtml_(user) {
  var nome = String((user && user.nome) || 'usuario').trim() || 'usuario';
  var maskedEmail = _maskEmail_((user && user.email) || '');
  return _buildTransactionalEmailShell_({
    titulo: 'Senha redefinida com sucesso',
    subtitulo: 'A senha da conta ' + maskedEmail + ' foi atualizada no Milvolts CRM.',
    corpoHtml: [
      '<p style="margin:0 0 14px;font-size:15px;line-height:1.7;">Ola, <strong>' + nome + '</strong>.</p>',
      '<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Confirmamos que a senha da sua conta foi redefinida com sucesso. O acesso ao CRM ja pode ser feito usando a nova senha.</p>',
      '<div style="margin:0 0 24px;padding:18px 18px;border-radius:20px;background:#f8fbff;border:1px solid #dbeafe;">',
        '<div style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Status da conta</div>',
        '<div style="font-size:22px;font-weight:800;color:#1d4ed8;">Acesso atualizado</div>',
      '</div>',
      '<p style="margin:0 0 10px;font-size:14px;line-height:1.7;color:#475569;">Se voce nao reconhece essa alteracao, recomendamos redefinir sua senha novamente imediatamente e revisar os acessos ativos.</p>',
    ].join(''),
  });
}

function _enviarEmailSenhaRedefinida_(user) {
  var nome = String((user && user.nome) || 'usuario').trim() || 'usuario';
  var body = [
    'Ola, ' + nome + '.',
    '',
    'Sua senha do Milvolts CRM foi redefinida com sucesso.',
    'Se voce nao reconhece essa alteracao, redefina a senha novamente imediatamente.',
  ].join('\n');

  MailApp.sendEmail({
    to: user.email,
    subject: 'Senha redefinida com sucesso | Milvolts CRM',
    body: body,
    htmlBody: _buildSenhaRedefinidaEmailHtml_(user),
    name: 'Milvolts CRM',
  });
}

function _buildTransactionalEmailShell_(options) {
  var titulo = String((options && options.titulo) || '').trim();
  var subtitulo = String((options && options.subtitulo) || '').trim();
  var corpoHtml = String((options && options.corpoHtml) || '').trim();
  return [
    '<div style="margin:0;padding:32px 16px;background:#eef4ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">',
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d9e7ff;border-radius:24px;overflow:hidden;box-shadow:0 20px 55px rgba(15,23,42,.12);">',
        '<div style="padding:28px 32px;background:linear-gradient(135deg,#0b1733 0%,#123f9a 60%,#2d6fff 100%);color:#ffffff;">',
          '<img src="https://i.imgur.com/05Bbsy8.png" alt="Milvolts" style="display:block;width:152px;height:auto;margin-bottom:22px;">',
          '<div style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;opacity:.78;">Milvolts CRM</div>',
          '<h1 style="margin:10px 0 8px;font-size:28px;line-height:1.15;">' + titulo + '</h1>',
          '<p style="margin:0;font-size:14px;line-height:1.6;opacity:.9;">' + subtitulo + '</p>',
        '</div>',
        '<div style="padding:32px;">',
          corpoHtml,
          '<p style="margin:0;font-size:13px;line-height:1.7;color:#94a3b8;">Milvolts CRM - Seguranca de acesso</p>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');
}

function _assertPasswordPolicy_(password) {
  var value = String(password || '');
  if (value.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
}
