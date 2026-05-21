# 🤖 AI Agentic CRM — WhatsApp Sales Pipeline Automation

<div align="center">

[![Google Apps Script](https://img.shields.io/badge/Google_Apps_Script-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/apps-script)
[![GPT Maker](https://img.shields.io/badge/GPT_Maker_API_v2-7C3AED?style=for-the-badge&logo=openai&logoColor=white)](https://gptmaker.ai)
[![Telegram](https://img.shields.io/badge/Telegram_Bot-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chart.js&logoColor=white)](https://chartjs.org)
[![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

**A production-grade, serverless, AI-powered CRM system built entirely on Google Apps Script.**  
Handles WhatsApp lead intake → AI triage → human handoff → automated follow-up → closing — with real-time dashboard, product catalog, and self-preserving AI orchestration.

[Live App (requires auth)](#) · [Architecture](#architecture) · [Features](#features) · [Setup](#setup)

</div>

---

## 🎯 What This Does

This system automates the **entire sales pipeline** for an auto-parts store receiving leads via **WhatsApp**:

1. Customer sends a message on WhatsApp
2. **AI agent (GPT Maker)** triages the lead and collects vehicle/part details
3. System creates a lead record in Google Sheets CRM
4. Human agents are notified via **Telegram**
5. After quote is sent, an **automated follow-up engine** sends personalized follow-up messages at configurable intervals
6. **Pipeline monitoring** watches for overload — if critical thresholds are hit, AI self-preserves by automatically pausing new lead intake
7. The **AI is trained in real-time** as products are added/updated in the catalog

> Built for **Milvolts Peças LTDA** (Imperatriz, MA, Brazil) — in production, handling real customers.

---

## ✨ Features

### 🧠 AI & Automation
- **GPT Maker AI integration** (v2 API) — custom WhatsApp AI agent that triages leads
- **Automated follow-up engine** — sends follow-up messages at configurable intervals (1–72h), template-based with `{{nome}}`, `{{produto}}`, `{{valor}}`, `{{tentativa}}` variables
- **AI self-preservation** — monitors pipeline load; auto-pauses AI when critical thresholds are exceeded, preventing overload
- **Real-time AI training** — adding/editing products in the catalog automatically syncs to the AI agent's memory via GPT Maker Memory API

### 📊 Dashboard & Analytics
- **Real-time KPI dashboard** with 10+ metrics (Chart.js)
- **AI productivity metrics** — compares AI vs. human performance across 8 dimensions (quotes/month, response time, simultaneous chats, availability, conversion rate, etc.)
- **Funnel visualization** — tracks leads across all pipeline stages
- Responsive, dark/light theme, **PWA-installable** on mobile

### 🗃️ CRM Pipeline
Full sales funnel management with stages:
`novo_lead` → `pre_atendimento` → `dados_coletados` → `conferir_pecas` → `orcamento_enviado` → `follow_up` → `venda_fechada` / `perdido` / `sem_resposta`

- Full CRUD on leads via Google Sheets backend
- Lead transfer between agents
- Activity logging on every action

### 🛒 Smart Product Catalog (PDV)
- Full CRUD for parts/products with 17 fields (name, price, discount, compatibility, models, year, engine, etc.)
- **Bidirectional AI sync** — every save/update/delete reflects instantly in the AI agent's knowledge base
- Bulk re-sync function for mass updates

### 🔔 Notifications & Monitoring
- **Telegram bot** notifications for new leads, alerts, and critical pipeline events
- **Pipeline monitoring** with configurable warning/critical thresholds per funnel stage
- Automatic alerts when queues build up

### 🔐 Authentication & Security
- Token-based auth system with role levels (`viewer` / `operador` / `admin`)
- User management via Google Sheets
- All sensitive routes protected server-side

---

## 🏗️ Architecture

```
WhatsApp Customer
      │
      ▼
 GPT Maker AI Agent (WhatsApp Channel)
      │  triages lead, collects details
      ▼
 Google Apps Script (Web App / Webhook)
      │
      ├── Google Sheets (Database)
      │     ├── CRM          ← leads, pipeline, history
      │     ├── PDV          ← product catalog
      │     ├── followup_tracking
      │     ├── Configs      ← feature flags, thresholds
      │     ├── Users        ← auth tokens + roles
      │     ├── Logs         ← audit trail
      │     └── telegram_IDs ← notification targets
      │
      ├── GPT Maker API v2
      │     ├── /workspace/{id}/chats  → list active chats
      │     ├── /chat/{id}/send-message → send follow-ups
      │     ├── /chat/{id}/start-human → take over from AI
      │     ├── /chat/{id}/stop-human  → return to AI
      │     ├── /chat/{id}/messages    → check client replies
      │     └── /workspace/{id}/agent/{id}/memory → AI training
      │
      ├── Telegram Bot API
      │     └── sendMessage → team notifications
      │
      └── Browser Client (SPA)
            ├── Dashboard (Chart.js KPIs)
            ├── CRM List / Kanban view
            ├── PDV Catalog
            ├── Configurations
            └── PWA (service worker, installable)
```

**Key architectural decisions:**
- **Serverless** — zero infrastructure cost, scales on Google's servers
- **Google Sheets as DB** — perfect for SMBs; non-technical staff can view/audit data directly
- **Time-based triggers** — follow-up engine and monitoring run every hour via Apps Script triggers
- **Self-contained** — single `.gs` + `index.html` stack, no external databases or hosting needed

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend / Runtime | Google Apps Script (V8) |
| Database | Google Sheets API |
| Frontend | Vanilla JS, HTML5, CSS3 (no frameworks) |
| Charts | Chart.js 4.4.1 |
| AI Agent | GPT Maker API v2 |
| Messaging | Telegram Bot API |
| PWA | Service Worker (custom) |
| Auth | Custom token-based (role-aware) |
| CI/CD | CLASP (Google Apps Script CLI) |

---

## 📁 Project Structure

```
├── config.example.gs          # Config template (copy → config.gs, fill in credentials)
├── config.gs                  # ⛔ GITIGNORED — real credentials
├── auth.gs                    # Authentication & authorization
├── planilha.gs                # Spreadsheet helpers & sheet initialization
├── servicos.gs                # GPT Maker API + Telegram API integrations
├── codigo.gs                  # Core CRM routes (doGet, doPost, webhook handler)
├── dashboard_servidor.gs      # Dashboard KPI aggregation (server-side)
├── automacao_devolver.gs      # Lead intake & routing logic
├── automacao_followup.gs      # Automated follow-up engine
├── automacao_monitoramento.gs # Pipeline monitoring + AI self-preservation
├── automacao_thaynan.gs       # AI agent orchestration utilities
├── pdv.gs                     # Product catalog CRUD + AI memory sync
├── pwa.gs                     # PWA manifest & service worker
├── index.html                 # Full SPA frontend (dashboard, CRM, PDV, configs)
├── login.html                 # Login page
├── appsscript.json            # Apps Script manifest
├── .clasp.json                # CLASP project config (scriptId)
└── deploy.ps1                 # One-command deploy script
```

---

## 🚀 Setup

### Prerequisites
- Google account with Google Apps Script access
- [CLASP](https://github.com/google/clasp) installed: `npm install -g @google/clasp`
- GPT Maker account with a configured AI agent
- Telegram bot token (via [@BotFather](https://t.me/BotFather))

### 1. Clone & Configure
```bash
git clone https://github.com/YOUR_USERNAME/ai-agentic-crm.git
cd ai-agentic-crm

# Copy and fill in your credentials
cp config.example.gs config.gs
# Edit config.gs with your API keys, IDs, and tokens
```

### 2. Create Google Apps Script Project
```bash
# Login to your Google account
clasp login

# Create a new bound script (or use existing one — update .clasp.json)
clasp create --type webapp --title "AI Agentic CRM"
```

### 3. Deploy
```bash
# Push code + deploy in one command
.\deploy.ps1 -Message "Initial deployment"
```

### 4. Configure Time-Based Triggers
Run once in the Apps Script editor:
```javascript
criarTriggerFollowUp()       // hourly follow-up engine
criarTriggerMonitoramento()  // hourly pipeline monitoring
```

### 5. Access the App
- **Production:** `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`
- **Development:** `https://script.google.com/macros/s/{DEPLOYMENT_ID}/dev`

---

## 📈 Portfolio Highlights

This project demonstrates:

| Skill | Evidence |
|-------|----------|
| **AI/LLM Integration** | GPT Maker API v2 — send messages, control human handoff, sync AI memory |
| **API Design** | RESTful webhook handler (`doPost`), clean route separation |
| **Automation Engineering** | Time-based triggers, self-healing pipeline, configurable follow-up engine |
| **Serverless Architecture** | Zero-infra production system on Google Apps Script |
| **Full-Stack Development** | Backend (GAS) + Frontend (SPA) in a single coherent codebase |
| **Real-Time Dashboard** | Chart.js KPIs, AI productivity metrics, live funnel stats |
| **PWA** | Installable mobile app with service worker caching |
| **Database Design** | Multi-sheet Sheets DB with audit logs, role-based access |
| **Security** | Credentials management, .gitignore, token auth, role-aware middleware |
| **Production Readiness** | Real client, live traffic, LGPD/GDPR-aware data handling |

---

## 🌐 Live Context

> Built for **Milvolts Peças LTDA**, an auto-parts store in Imperatriz, MA, Brazil.  
> The system manages the full customer journey from first WhatsApp message to closed sale,  
> replacing what previously required a full-time human receptionist with an AI agent  
> that operates 24/7 and escalates to humans only when needed.

---

## 📄 License

This project is shared for **portfolio and educational purposes**.  
Business logic, branding, and client-specific configurations are excluded.  
See [LICENSE](LICENSE) for details.

---

<div align="center">

Built with ☕ and `console.log()` debugging by **Wagner Tavares**  
[LinkedIn](https://linkedin.com/in/YOUR_LINKEDIN) · [GitHub](https://github.com/YOUR_USERNAME)

</div>
