import {useState} from 'react';
import {ITAUBA_LOGO} from '../../data/defaults';
export function AuthScreen({session}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState('login'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event) {
    event.preventDefault();setBusy(true);setMessage('');
    try {if(session.status==='setup') await session.setPassword(password);else if(mode==='recover') setMessage((await session.recover(email)).message);else await session.login(email,password);}
    catch(error){setMessage(error.message);}finally{setBusy(false);}
  }
  return <main className="auth-shell"><section className="auth-card">
    <img src={ITAUBA_LOGO} alt="Itaúba Engenharia"/><h1>Diário de Obras</h1>
    {session.status==='loading'?<p role="status">Verificando sessão…</p>:session.status==='failed'?<>
      <p role="alert">Não foi possível conectar ao aplicativo.</p><button className="btn btn-primary" onClick={session.reload}>Tentar novamente</button>
    </>:<form onSubmit={submit}>
      <h2>{session.status==='setup'?'Definir senha':mode==='recover'?'Recuperar acesso':'Entrar na sua conta'}</h2>
      {session.status!=='setup'?<><label htmlFor="auth-email">E-mail</label><input id="auth-email" autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></>:null}
      {session.status==='setup'||mode==='login'?<><label htmlFor="auth-password">{session.status==='setup'?'Nova senha':'Senha'}</label><input id="auth-password" type="password" autoComplete={session.status==='setup'?'new-password':'current-password'} minLength={session.status==='setup'?12:undefined} maxLength={512} required value={password} onChange={e=>setPassword(e.target.value)}/></>:null}
      {session.status==='setup'?<p>Use pelo menos 12 caracteres.</p>:null}
      {message?<p role="alert">{message}</p>:null}
      <button disabled={busy} className="btn btn-primary" type="submit">{busy?'Aguarde…':session.status==='setup'?'Definir senha':mode==='recover'?'Enviar instruções':'Entrar'}</button>
      {session.status!=='setup'?<button className="btn btn-ghost" type="button" onClick={()=>{setMessage('');setMode(mode==='login'?'recover':'login');}}>{mode==='login'?'Esqueci minha senha':'Voltar para entrar'}</button>:null}
    </form>}
  </section></main>;
}
