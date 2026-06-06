
/* DELETAR MENSAGENS DENTRO DE UM CHAT
 * rota: https://api.gptmaker.ai/v2/chat/{chatId}/messages
 * 
 */
 
//input em Java Script

const options = {
  method: 'DELETE',
  headers: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJncHRtYWtlciIsImlkIjoiM0YwRjM3NjdFOENGQTExRjVBNDBERUZCNjU0MTBGRDYiLCJ0ZW5hbnQiOiIzRjBGMzc2N0U4Q0ZBMTFGNUE0MERFRkI2NTQxMEZENiIsInV1aWQiOiJiZTQyZDNiNy1mNGUzLTQxNjQtYjg5NC04ZTIwM2QxNjdiMmMifQ.KtVDxsZ0XSd8IL88lsJgHch7q7nL4XU9PtpqY_2Hj2c'
  }
};

fetch('https://api.gptmaker.ai/v2/chat/{chatId}/messages', options)
  .then(res => res.json())
  .then(res => console.log(res))
  .catch(err => console.error(err));

// output response em JSON

{"success": true}