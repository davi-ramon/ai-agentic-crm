/**
 * ============================================================
 *  CONFIG.EXAMPLE.GS — Template de Configuração
 *  AI Agentic CRM | Milvolts LTDA
 *
 *  COMO USAR:
 *    1. Copie este arquivo para config.gs
 *    2. Preencha os valores com suas próprias credenciais
 *    3. NUNCA suba o config.gs para o repositório público
 *
 *  config.gs está listado no .gitignore por segurança.
 * ============================================================
 */

var CONFIG = {

  // ── Google Sheets ──────────────────────────────────────────
  // ID da planilha Google Sheets que serve como banco de dados
  // Encontre em: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',

  SHEET_CRM:            'CRM',
  SHEET_TRANSFERENCIAS: 'transferencias',
  SHEET_TELEGRAM_IDS:   'telegram_IDs',

  // ── GPT Maker API v2 ───────────────────────────────────────
  // Documentação: https://docs.gptmaker.ai
  // Base URL da API v2 (não alterar)
  GPTMAKER_BASE_URL:    'https://api.gptmaker.ai/v2',

  // Token Bearer da sua conta GPT Maker
  GPTMAKER_API_KEY:     'Bearer YOUR_GPTMAKER_JWT_TOKEN_HERE',

  // IDs do seu workspace, agente e canal no GPT Maker
  GPTMAKER_WORKSPACE_ID: 'YOUR_WORKSPACE_ID',
  GPTMAKER_AGENT_ID:     'YOUR_AGENT_ID',
  GPTMAKER_CHANNEL_ID:   'YOUR_CHANNEL_ID',

  // ── Telegram Bot API ───────────────────────────────────────
  // Crie um bot em: https://t.me/BotFather
  TELEGRAM_BOT_TOKEN:   'YOUR_BOT_TOKEN_HERE',
  TELEGRAM_GROUP_ID:    '-100YOUR_GROUP_ID_HERE',

  // ── WhatsApp / Contato operacional ─────────────────────────
  // Número no formato internacional (sem + ou espaços)
  WHATSAPP_THAYNAN:     '55DDDNUMBER',

  // ── Limites operacionais ───────────────────────────────────
  MAX_CONVERSAS_DEVOLVER: 100,
};
