const prefix='itauba:pending:v1:';
function keyName(key) {
  if(!key||['userId','obraId','date'].some(k=>typeof key[k]!=='string'||!key[k]))throw new Error('Escopo de edição inválido.');
  return prefix+[key.userId,key.obraId,key.date].map(encodeURIComponent).join(':');
}
export function createPendingDrafts(storage) {
  return {
    load(key) {
      try {const raw=storage.getItem(keyName(key));return raw?JSON.parse(raw):null;}
      catch {throw new Error('Não foi possível ler a edição pendente deste navegador.');}
    },
    save(key,draft) {
      const name=keyName(key);
      try{storage.setItem(name,JSON.stringify(draft));}
      catch{throw new Error('Não foi possível preservar a edição neste navegador. Mantenha a tela aberta ou exporte o conteúdo pendente.');}
    },
    remove(key) {try{storage.removeItem(keyName(key));}catch{throw new Error('Não foi possível limpar a edição pendente deste navegador.');}},
    listUser(userId) {
      const match=prefix+encodeURIComponent(userId)+':',result=[];
      try {
        for(let i=0;i<storage.length;i++) {
          const name=storage.key(i);
          if(name?.startsWith(match)) {
            const [userId,obraId,date]=name.slice(prefix.length).split(':').map(decodeURIComponent);
            result.push({key:{userId,obraId,date},draft:JSON.parse(storage.getItem(name))});
          }
        }
        return result;
      }catch{throw new Error('Não foi possível ler as edições pendentes deste navegador.');}
    },
    clearUser(userId) {for(const item of this.listUser(userId))this.remove(item.key);}
  };
}
export const pendingDrafts=Object.fromEntries(['load','save','remove','listUser','clearUser'].map(method=>[method,(...args)=>createPendingDrafts(globalThis.localStorage)[method](...args)]));
