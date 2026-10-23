import {useCallback,useEffect,useState} from 'react';
import {backendClient} from '../services/backend';
export function useSession() {
  const [state,setState]=useState({status:'loading',user:null,csrf:null,error:null});
  const accept=useCallback(value=>{backendClient.setCsrf(value.csrfToken,value.user.id);setState({status:value.setupRequired?'setup':'authenticated',user:value.user,csrf:value.csrfToken,error:null});},[]);
  const reload=useCallback(async()=>{
    setState(s=>({...s,status:'loading',error:null}));
    try{accept(await backendClient.request('/api/session'));}
    catch(error){setState({status:error.status===401?'anonymous':'failed',user:null,csrf:null,error});}
  },[accept]);
  useEffect(()=>{reload();const expired=()=>{backendClient.setCsrf(null);setState({status:'anonymous',user:null,csrf:null,error:null});};window.addEventListener('session-expired',expired);return()=>window.removeEventListener('session-expired',expired);},[reload]);
  return {...state,reload,
    login:async(email,password)=>accept(await backendClient.request('/api/auth/login',{method:'POST',body:{email,password}})),
    setPassword:async(password)=>accept(await backendClient.request('/api/auth/password',{method:'POST',body:{password}})),
    recover:email=>backendClient.request('/api/auth/recover',{method:'POST',body:{email}}),
    logout:async()=>{await backendClient.request('/api/auth/logout',{method:'POST',body:{}});backendClient.setCsrf(null);setState({status:'anonymous',user:null,csrf:null,error:null});}
  };
}
