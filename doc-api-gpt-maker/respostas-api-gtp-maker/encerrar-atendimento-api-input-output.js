
/* ENCERRAR ATENDIMENTO DE UM CHAT
 * Obs: Encerrar atendimento humano, isso fará que a proxima interação do cliente, o agente volte a responder.
 * rota: https://api.gptmaker.ai/v2/chat/{chatId}/start-human
 * 
 */
 
//input em Java Script

const options = {
  method: 'PUT',
  headers: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJncHRtYWtlciIsImlkIjoiM0YwRjM3NjdFOENGQTExRjVBNDBERUZCNjU0MTBGRDYiLCJ0ZW5hbnQiOiIzRjBGMzc2N0U4Q0ZBMTFGNUE0MERFRkI2NTQxMEZENiIsInV1aWQiOiJiZTQyZDNiNy1mNGUzLTQxNjQtYjg5NC04ZTIwM2QxNjdiMmMifQ.KtVDxsZ0XSd8IL88lsJgHch7q7nL4XU9PtpqY_2Hj2c'
  }
};

fetch('https://api.gptmaker.ai/v2/chat/3F14F4F990BF403F0113BEBD982C5347-559981470424/stop-human', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));
  
// output response em JSON

{"success":true}