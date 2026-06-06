/**
 * ============================================================
 *  CONFIG.EXAMPLE.GS — Documentação do Sistema de Configuração
 *  CRM + Dashboard | Milvolts LTDA
 *
 *  ══ COMO CONFIGURAR O SISTEMA ══════════════════════════════
 *
 *  Este projeto usa DOIS locais de configuração:
 *
 *  1. SCRIPT PROPERTIES (credenciais sensíveis)
 *     Acesse: Apps Script Editor → ⚙️ Configurações do projeto
 *                                  → Propriedades do script
 *     Ou pelo painel admin: Configurações → 🔒 Credenciais
 *
 *     Chaves obrigatórias:
 *       spreadsheet_id          → ID da planilha Google Sheets
 *       gptmaker_api_key        → Bearer JWT (painel GPT Maker)
 *       gptmaker_agent_id       → ID do agente
 *       gptmaker_workspace_id   → ID do workspace
 *       gptmaker_channel_id     → ID do canal (WhatsApp)
 *       telegram_bot_token      → Token do bot (@BotFather)
 *       telegram_chat_id        → ID do grupo/chat de alertas
 *       whatsapp_operacional    → Número WhatsApp (ex: 559981483656)
 *
 *  2. ABA "configs" NA PLANILHA (configurações operacionais)
 *     Acesse diretamente na planilha, aba "configs",
 *     ou pelo painel admin → Configurações.
 *
 *     Exemplos de chaves operacionais (não-sensíveis):
 *       empresa_nome            → Nome da empresa
 *       tema_padrao             → 'claro' ou 'escuro'
 *       mon_etapa_1             → Etapa 1 monitorada (ex: conferir_pecas)
 *       mon_etapa_2             → Etapa 2 monitorada
 *       mon_etapa_3             → Etapa 3 monitorada
 *       mon_alerta_conferir_pecas → Limite de alerta (qtd leads)
 *       followup_etapa          → Etapa de follow-up automático
 *       followup_prompt         → Instrução para a IA / template
 *       followup_max_tentativas → Número máximo de tentativas
 *       followup_intervalo_minutos → Intervalo entre tentativas (min)
 *       push_conferir_pecas     → 'true' / 'false'
 *       ... (demais configs de UI e automação)
 *
 *  ══ config.gs NÃO DEVE CONTER CREDENCIAIS ══════════════════
 *  O arquivo config.gs contém SOMENTE:
 *    - Nomes das abas da planilha (SHEET_CRM, etc.)
 *    - URL base da API GPT Maker (não é segredo)
 *    - Constantes operacionais fixas (MAX_CONVERSAS_DEVOLVER)
 *
 *  ══ PRIMEIRO DEPLOY ════════════════════════════════════════
 *  1. Faça push do código: clasp push --force
 *  2. Deploy como Web App
 *  3. No Apps Script Editor, configure as Script Properties
 *     (spreadsheet_id é a mais crítica — sem ela o app não sobe)
 *  4. Acesse o Web App e faça login como admin
 *  5. Configure as demais credenciais pelo painel de admin
 *     (Configurações → 🔒 Credenciais)
 *
 * ============================================================
 */

// Este arquivo é apenas documentação. Não define variáveis.
// Veja config.gs para as constantes não-sensíveis.
