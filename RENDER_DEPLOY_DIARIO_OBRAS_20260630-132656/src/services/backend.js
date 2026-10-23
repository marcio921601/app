let csrf=null,currentUserId=null,generation=0;
export class ApiError extends Error {
  constructor(status,error={}){super(error.message||'Não foi possível concluir a solicitação.');this.status=status;this.code=error.code;this.details=error.details;this.requestId=error.requestId;}
}
export const backendClient={
  setCsrf(value,userId=null){if(csrf!==value||currentUserId!==userId)generation++;csrf=value;currentUserId=userId;},
  async request(path,{method='GET',body,signal,mutationId,expectedUserId}={}) {
    if(!path.startsWith('/api/')) throw new Error('Endereço de API inválido.');
    const requestGeneration=generation;
    const identityChanged=()=>new ApiError(401,{code:'SESSION_CHANGED',message:'A conta mudou. A edição permanece vinculada à conta original.'});
    if(expectedUserId&&currentUserId!==expectedUserId)throw identityChanged();
    const raw=body instanceof Blob||body instanceof ArrayBuffer;
    const response=await fetch(path,{method,signal,credentials:'same-origin',cache:'no-store',
      headers:{...(body!==undefined?{'Content-Type':raw?'application/octet-stream':'application/json'}:{}),...(!['GET','HEAD'].includes(method)&&csrf?{'X-CSRF-Token':csrf}:{}),...(mutationId?{'X-Mutation-ID':mutationId}:{})},
      ...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
    let value;try{value=await response.json();}catch{throw new ApiError(response.status,{message:'Resposta inválida do servidor.'});}
    if(expectedUserId&&requestGeneration!==generation)throw identityChanged();
    if(!response.ok) {if(response.status===401&&requestGeneration===generation&&!path.startsWith('/api/auth/'))window.dispatchEvent(new Event('session-expired'));throw new ApiError(response.status,value.error);}
    return value;
  }
};
