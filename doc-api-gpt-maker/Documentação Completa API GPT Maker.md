# **Documentação Completa da API GPT Maker**

Este documento detalha todos os endpoints, métodos, parâmetros e exemplos de Payload/Response da API do GPT Maker. Foi estruturado para fácil consumo e indexação por LLMs (Large Language Models) e desenvolvedores.

## **1\. Configurações Globais**

* **Base URL:** https://api.gptmaker.ai  
* **Autenticação:** Todas as requisições requerem o cabeçalho Authorization: Bearer \<token\>.  
* **Content-Type:** application/json (para métodos POST, PUT, PATCH).

## **2\. Workspaces**

Agrupam agentes e canais dentro de uma conta.

### **2.1 Listar Workspaces**

* **Descrição:** Lista os workspaces vinculados à conta.  
* **Rota:** GET /v2/workspaces  
* **Response (200 OK):**

\[  
  {  
    "id": "string",  
    "name": "string"  
  }  
\]

### **2.2 Listar Chats do Workspace**

* **Rota:** GET /v2/workspace/{workspaceId}/chats  
* **Parâmetros de Rota:** workspaceId (Obrigatório)  
* **Parâmetros de Query:** agentId, page, pageSize, query  
* **Response (200 OK):** Array de objetos representando chats (ID, status lido, nome do usuário, id do agente, etc.).

### **2.3 Listar Canais do Workspace**

* **Rota:** GET /v2/workspace/{workspaceId}/channels  
* **Parâmetros de Rota:** workspaceId (Obrigatório)  
* **Parâmetros de Query:** page (default: 1), pageSize (default: 25), query, agentId  
* **Response (200 OK):** Objeto contendo data (array de canais) e count (total).

### **2.4 Criar Canal no Workspace (Sem Agente)**

* **Rota:** POST /v2/workspace/{workspaceId}/create-channel  
* **Body:**

{  
  "name": "Meu Canal",  
  "type": "Z\_API" // Opções: Z\_API, WHATSAPP, INSTAGRAM, TELEGRAM, WIDGET, etc.  
}

* **Response (200 OK):** Objeto do canal criado, incluindo workspace e assistantId (nulo por padrão).

## **3\. Agentes (Agents)**

A inteligência artificial configurada para atuar em canais.

### **3.1 Listar Agentes**

* **Rota:** GET /v2/workspace/{workspaceId}/agents  
* **Parâmetros de Query:** page, pageSize, query  
* **Response (200 OK):** Array de agentes.

### **3.2 Buscar Agente por ID**

* **Rota:** GET /v2/agent/{agentId}  
* **Response (200 OK):** Dados completos do agente (nome, comportamento, tipo de comunicação, empresa, etc.).

### **3.3 Criar Agente**

* **Rota:** POST /v2/workspace/{workspaceId}/agents  
* **Body:**

{  
  "name": "Nome do Agente",  
  "avatar": "\[https://url-da-foto.com\](https://url-da-foto.com)",  
  "behavior": "Você é um assistente prestativo...",  
  "communicationType": "FORMAL", // FORMAL, NORMAL, RELAXED  
  "type": "SUPPORT", // SUPPORT, SALE, PERSONAL  
  "jobName": "Nome da Empresa",  
  "jobSite": "\[https://empresa.com\](https://empresa.com)",  
  "jobDescription": "Descrição da empresa"  
}

* **Response (200 OK):** Agente criado com id retornado.

### **3.4 Atualizar Agente**

* **Rota:** PUT /v2/agent/{agentId}  
* **Body:** Mesma estrutura de "Criar Agente".

### **3.5 Deletar Agente**

* **Rota:** DELETE /v2/agent/{agentId}  
* **Response (200 OK):** {"success": true}

### **3.6 Ativar / Inativar Agente**

* **Ativar:** PUT /v2/agent/{agentId}/active  
* **Inativar:** PUT /v2/agent/{agentId}/inactive  
* **Response (200 OK):** {"success": true}

### **3.7 Obter / Atualizar Configurações do Agente**

* **Obter:** GET /v2/agent/{agentId}/settings  
* **Atualizar:** PUT /v2/agent/{agentId}/settings  
* **Body de Atualização:**

{  
  "prefferModel": "GPT\_4\_O", // Modelos LLM suportados (GPT\_5, CLAUDE\_3\_5\_SONNET, etc)  
  "timezone": "America/Sao\_Paulo",  
  "enabledHumanTransfer": true,  
  "enabledReminder": true,  
  "splitMessages": true,  
  "enabledEmoji": true,  
  "limitSubjects": true,  
  "messageGroupingTime": "NO\_GROUP",  
  "maxDailyMessages": 100,  
  "maxDailyMessagesLimitAction": "TEMP\_BLOCK\_30S",  
  "knowledgeByFunction": true,  
  "onLackKnowLedge": "\[https://webhook.site/\](https://webhook.site/)..."  
}

### **3.8 Listar Histórico de Comportamento**

* **Rota:** GET /v2/agent/{id}/list-behavior-history  
* **Parâmetros de Query:** page, pageSize  
* **Response (200 OK):** Registros de alterações do comportamento.

### **3.9 Consumo de Créditos**

* **Rota:** GET /v2/agent/{agentId}/credits-spent  
* **Parâmetros de Query:** year, month, day  
* **Response (200 OK):** {"total": 123, "data": \[...\]}

## **4\. Canais (Channels)**

### **4.1 Listar Canais (por Agente)**

* **Rota:** GET /v2/agent/{agentId}/search  
* **Parâmetros de Query:** page, pageSize, query  
* **Response (200 OK):** Canais vinculados ao agente.

### **4.2 Criar Canal (Vinculado ao Agente)**

* **Rota:** POST /v2/agent/{agentId}/create-channel  
* **Body:** {"name": "Canal 1", "type": "WHATSAPP"}

### **4.3 Editar Canal (Nome / Agente Vinculado)**

* **Rota:** PUT /v2/channel/{channelId}  
* **Body:** {"name": "Novo nome", "agentId": "id-do-novo-agente"} (Envie agentId null para desvincular).

### **4.4 Deletar Canal**

* **Rota:** DELETE /v2/channel/{channelId}

### **4.5 Configurações do Canal**

* **Obter:** GET /v2/channel/{channelId}/config  
* **Atualizar:** PUT /v2/channel/{id}/config  
* **Body (Envie apenas os campos a alterar):**

{  
  "audioAction": "DISABLED",  
  "startTrigger": "ONLY\_WHEN\_CALLING\_BY\_NAME",  
  "endTrigger": "WHEN\_SAY\_GOODBYE"  
}

### **4.6 Iniciar Conversa (Apenas WhatsApp Não Oficial)**

* **Rota:** POST /v2/channel/{channelId}/start-conversation  
* **Body:**

{  
  "phone": "5511999999999",  
  "message": "Olá, tudo bem?"  
}

## **5\. Chats e Atendimentos**

### **5.1 Chats**

* **Deletar Chat:** DELETE /v2/chat/{chatId}  
* **Listar Mensagens:** GET /v2/chat/{chatId}/messages  
* **Limpar Mensagens:** DELETE /v2/chat/{chatId}/messages

### **5.2 Controle Humano x IA**

* **Humano assume (IA para):** PUT /v2/chat/{chatId}/start-human  
* **IA volta a responder:** PUT /v2/chat/{chatId}/stop-human

### **5.3 Manipulação de Mensagens (Envio/Edição/Deleção)**

* **Enviar Mensagem:** POST /v2/chat/{chatId}/send-message  
  * Body: {"message": "Texto", "replyMessageId": "id-opcional"}  
* **Editar Mensagem:** PUT /v2/chat/{chatId}/message/{messageId} (Só suportado por Z-API, Telegram, Widget)  
  * Body: {"message": "Novo Texto"}  
* **Deletar Mensagem:** DELETE /v2/chat/{chatId}/message/{messageId}

### **5.4 Atendimentos (Interactions)**

Utilizados para relatórios, fechamentos e resumos (após a conversa).

* **Mensagens do Atendimento:** GET /v2/interaction/{interactionId}/messages  
* **Deletar Atendimento:** DELETE /v2/interaction/{id}

### **5.5 Adicionar Contexto via API (Forçar Mensagem no LLM)**

* **Rota:** POST /v2/agent/{agentId}/add-message  
* **Body:**

{  
  "contextId": "12345", // ID do cliente  
  "prompt": "Olá, você tem interesse no produto X?",  
  "role": "assistant" // 'user' ou 'assistant'  
}

## **6\. Treinamentos (Trainings)**

Base de conhecimento injetada no agente.

### **6.1 Listar Treinamentos**

* **Rota:** GET /v2/agent/{agentId}/trainings  
* **Parâmetros de Query:** page, pageSize, type (TEXT, WEBSITE, VIDEO, DOCUMENT), query

### **6.2 Criar Treinamento**

* **Rota:** POST /v2/agent/{agentId}/trainings  
* **Body:**

{  
  "type": "TEXT",  
  "text": "Conteúdo do treinamento...",  
  "image": "url-imagem.jpg",  
  "callbackUrl": "url-webhook" // Opcional  
}

### **6.3 Atualizar Treinamento**

* **Rota:** PUT /v2/training/{trainingId}  
* *(Apenas tipo TEXT pode ser atualizado, demais devem ser recriados)*.

### **6.4 Remover Treinamento**

* **Rota:** DELETE /v2/training/{trainingId}

## **7\. Webhooks e Intenções (Tools)**

### **7.1 Webhooks do Agente**

* **Obter:** GET /v2/agent/{agentId}/webhooks  
* **Atualizar:** PUT /v2/agent/{agentId}/webhooks  
* **Eventos Disponíveis:** onNewMessage, onLackKnowLedge, onTransfer, onFirstInteraction, onStartInteraction, onFinishInteraction, onCreateEvent, onCancelEvent.

### **7.2 Intenções (Intentions)**

Permite que o Agente faça requisições HTTP automáticas (como Functions/Tools).

* **Listar:** GET /v2/agent/{agentId}/intentions  
* **Criar:** POST /v2/agent/{agentId}/intentions  
* **Atualizar:** PUT /v2/intention/{intentionId}  
* **Deletar:** DELETE /v2/intention/{intentionId}  
* **Body de Criação (Exemplo):**

{  
  "description": "Consultar saldo do cliente",  
  "type": "WEBHOOK",  
  "httpMethod": "GET",  
  "url": "\[https://api.empresa.com/saldo\](https://api.empresa.com/saldo)",  
  "autoGenerateParams": true,  
  "autoGenerateBody": true,  
  "details": "Use essa intenção quando o cliente pedir para ver o saldo.",  
  "fields": \[  
    {  
      "name": "cpf",  
      "jsonName": "cpf\_cliente",  
      "description": "O CPF extraído da conversa",  
      "type": "STRING",  
      "required": true  
    }  
  \],  
  "headers": \[\],  
  "params": \[\],  
  "variables": \[\],  
  "requestBody": ""  
}

## **8\. Automações de Atendimento**

### **8.1 Regras de Transferência**

Define condições de transbordo (para humano ou outro agente).

* **Listar:** GET /v2/agent/{id}/transfer-rules  
* **Criar:** POST /v2/agent/{agentId}/transfer-rules  
* **Atualizar:** PUT /v2/agent/{agentId}/transfer-rules/{transfer-rule-id}  
* **Deletar:** DELETE /v2/agent/{agentId}/transfer-rules/{transfer-rule-id}  
* **Body de Criação (Exemplo):**

{  
  "instructions": "Transfira se o cliente estiver muito irritado.",  
  "returnOnFinish": true,  
  "type": "HUMAN", // Ou 'AGENT'  
  "userId": "id-do-usuario-destino",  
  "agentId": null  
}

### **8.2 Ações de Inatividade (Idle Actions)**

O que fazer quando o cliente não responde.

* **Listar:** GET /v2/agent/{agentId}/idle-actions  
* **Criar:** POST /v2/agent/{agentId}/idle-actions  
* **Atualizar:** PUT /v2/agent/{agentId}/idle-actions  
* **Deletar:** DELETE /v2/agent/{agentId}/idle-actions  
* **Body de Criação/Atualização:**

{  
  "actions": \[  
    {  
      "instructions": "Mande uma mensagem perguntando se o cliente ainda está aí.",  
      "seconds": 3600, // Tempo de espera  
      "allowAllHours": true  
    }  
  \],  
  "finishOn": {  
    "seconds": 86400 // Finaliza o chat após 24h  
  }  
}  
