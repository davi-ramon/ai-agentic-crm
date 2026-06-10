
/* LISTAR MENSAGENS DE UM ATENDIMENTO ('atendimento' é diferente de um chat)
 * rota: https://api.gptmaker.ai/v2/interaction/{interactionId}/messages
 * 
 */

// input em Java Script

const options = {
  method: 'GET',
  headers: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJncHRtYWtlciIsImlkIjoiM0YzMzZGQkY2MDMwRjE4Q0Q3RDk4Njc1QTEwRTBGM0UiLCJ0ZW5hbnQiOiIzRjMzNkZCRjYwMzBGMThDRDdEOTg2NzVBMTBFMEYzRSIsInV1aWQiOiJhZDM5M2UwMy04Y2U1LTQ4N2YtOWIzZi1hNGVlZjA3YjAxNGUifQ.uGTu2JfrLTlGl2dZTdr4fPXaNDY82G2bdY2I4xQDW9w'
  }
};

fetch('https://api.gptmaker.ai/v2/interaction/3F46EE55C891E090D1263E7821600C19/messages', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));

// output em JSON:



[
  {
    "fileName": null,
    "agentId": "3F384B33FB2110119241BEE45B6B402D",
    "metadata": {},
    "role": "assistant",
    "requestApproval": false,
    "assistantName": "Bruto",
    "type": "TEXT",
    "conversationNotificationType": null,
    "assistantAvatar": "https://gpt-files.com/file/3F384B33FB2110119241BEE45B6B402D/3F38BD991D73F03525D3A6D2BA82CB85.jpg",
    "midiaContent": null,
    "postPermalink": null,
    "deletedMessage": null,
    "audioUrl": null,
    "protocol": null,
    "videoUrl": null,
    "imageUrl": null,
    "postMediaType": null,
    "id": "3F46EE5D3CAE70FF00C9F2D52672F95D",
    "text": "Beleza. Me manda numa só msg: motorização + seu nome + telefone pra eu registrar e verificar as borrachas do estabilizador dianteiro, o filtro e o silenciador.",
    "itIsReplyMessage": null,
    "postMediaThumbnailUrl": null,
    "height": null,
    "postMediaUrl": null,
    "userPicture": null,
    "agentAvatar": "https://gpt-files.com/file/3F384B33FB2110119241BEE45B6B402D/3F38BD991D73F03525D3A6D2BA82CB85.jpg",
    "documentUrl": null,
    "agentName": "Bruto",
    "externalId": "wamid.HBgMNTU5OTg1NDEyMTA4FQIAERgSMzUwQkZBQ0Y1OUZCRTQyMThFAA==",
    "postId": null,
    "userName": null,
    "userId": null,
    "transactionId": "3F46EE5D3D23A278DD03F2D52672F95D",
    "silentTransfer": false,
    "assistantId": "3F384B33FB2110119241BEE45B6B402D",
    "sequence": 20,
    "postCaption": null,
    "width": null,
    "messageHasEdited": false,
    "hasError": false,
    "time": 1781091311319
  },
  {
    "fileName": null,
    "agentId": null,
    "metadata": {},
    "role": "user",
    "requestApproval": false,
    "assistantName": null,
    "type": "AUDIO",
    "conversationNotificationType": null,
    "assistantAvatar": null,
    "midiaContent": "E o resto tu tem aí as borrachas do estabilizador dianteiro desse carro?",
    "postPermalink": null,
    "deletedMessage": null,
    "audioUrl": "https://gpt-files.com/file/3F466E46EC9CF02859055620096D8C8E/3F46EE547B2A500FB8A73ABE1169A82E",
    "protocol": null,
    "videoUrl": null,
    "imageUrl": null,
    "postMediaType": null,
    "id": "3F46EE550960907D8F023E7821600C19",
    "text": "",
    "itIsReplyMessage": null,
    "postMediaThumbnailUrl": null,
    "height": null,
    "postMediaUrl": null,
    "userPicture": null,
    "agentAvatar": null,
    "documentUrl": null,
    "agentName": null,
    "externalId": "wamid.HBgMNTU5OTg1NDEyMTA4FQIAEhggQUMyNkQ5OTkzQjcxMDRFNjBCNDlDNEIxNTA0ODUzRkEA",
    "postId": null,
    "userName": null,
    "userId": null,
    "transactionId": null,
    "silentTransfer": false,
    "assistantId": null,
    "sequence": 19,
    "postCaption": null,
    "width": null,
    "messageHasEdited": false,
    "hasError": false,
    "time": 1781091298815
  }
]