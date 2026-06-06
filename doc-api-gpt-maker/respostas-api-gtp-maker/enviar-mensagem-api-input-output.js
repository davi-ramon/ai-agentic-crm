
/* ENVIA UMA MENSAGEM PARA O CHAT
 * Obs: Envia uma nova mensagem para o chat
 * rota: https://api.gptmaker.ai/v2/chat/{chatId}/send-message
 * 
 */
 
//input em Java Script

const options = {
  method: 'POST',
  headers: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJncHRtYWtlciIsImlkIjoiM0YwRjM3NjdFOENGQTExRjVBNDBERUZCNjU0MTBGRDYiLCJ0ZW5hbnQiOiIzRjBGMzc2N0U4Q0ZBMTFGNUE0MERFRkI2NTQxMEZENiIsInV1aWQiOiJiZTQyZDNiNy1mNGUzLTQxNjQtYjg5NC04ZTIwM2QxNjdiMmMifQ.KtVDxsZ0XSd8IL88lsJgHch7q7nL4XU9PtpqY_2Hj2c',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({message: 'opa, tudo bem?', replyMessageId: '<string>'})
};

fetch('https://api.gptmaker.ai/v2/chat/3F14F4F990BF403F0113BEBD982C5347-556392998814/send-message', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
  
// output response em JSON

{"success":true}