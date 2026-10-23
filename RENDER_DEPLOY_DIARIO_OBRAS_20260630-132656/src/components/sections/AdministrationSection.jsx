import {useState} from 'react';
import {Card} from '../common/Card';
import {Field} from '../common/Field';
import {TAB_ITEMS} from '../../data/defaults';
export function AdministrationSection({data,currentUser,actualAccess,accessProfiles,onSetVisualizarComoPerfil,onInviteUser,onUpdateMemberships,onDeactivateUser,onUpdateProfile}) {
  const [nome,setNome]=useState(''),[email,setEmail]=useState(''),[cargo,setCargo]=useState(''),[obraId,setObraId]=useState(''),[perfil,setPerfil]=useState('apontador'),[send,setSend]=useState(false),[busy,setBusy]=useState(false);
  const obras=data.multiobra.obras.filter(o=>o.version),perfis=accessProfiles.filter(p=>p.id!=='gerencia');
  async function invite(event) {
    event.preventDefault();setBusy(true);
    try{const result=await onInviteUser({nome,email,cargo,memberships:obraId?[{obraId,perfil}]:[],send});if(result){setNome('');setEmail('');setCargo('');setSend(false);}}
    finally{setBusy(false);}
  }
  return <div className="section-stack">
    <Card title="Sessão autenticada"><p>{currentUser.nome} · {currentUser.email}</p>
      <Field label="Visualizar como"><select aria-label="Visualizar como" value="" onChange={e=>onSetVisualizarComoPerfil(e.target.value)} disabled={!actualAccess.isAdmin}>
        <option value="">Administrativo</option>{perfis.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
      </select></Field>
    </Card>
    <Card title="Convidar pessoa" subtitle="Prepare o cadastro e libere as obras. O convite fica pendente até a pessoa definir a senha.">
      <form aria-label="Convidar pessoa" onSubmit={invite} className="stack">
        <div className="form-grid form-grid-3"><Field label="Nome"><input required value={nome} onChange={e=>setNome(e.target.value)}/></Field>
          <Field label="E-mail"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field>
          <Field label="Cargo"><input value={cargo} onChange={e=>setCargo(e.target.value)}/></Field>
          <Field label="Obra liberada"><select value={obraId} onChange={e=>setObraId(e.target.value)}><option value="">Sem obra por enquanto</option>{obras.map(o=><option key={o.id} value={o.id}>{o.codigo+' · '+o.nome}</option>)}</select></Field>
          <Field label="Perfil"><select value={perfil} onChange={e=>setPerfil(e.target.value)}>{perfis.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
        </div>
        <label><input type="checkbox" checked={send} onChange={e=>setSend(e.target.checked)}/> Enviar convite por e-mail agora</label>
        <button className="btn btn-primary" type="submit" disabled={busy}>{send?'Enviar convite':'Preparar convite'}</button>
      </form>
    </Card>
    <Card title="Pessoas e acesso às obras" subtitle="As alterações passam a valer no próximo acesso à API.">
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Pessoa</th><th>Situação</th><th>Obras e perfis</th><th>Ações</th></tr></thead><tbody>
        {data.administracao.usuarios.map(user=><UserAccessRow key={user.id+':'+user.version} user={user} obras={obras} profiles={perfis} memberships={data.administracao.memberships.filter(m=>m.userId===user.id)} onSave={onUpdateMemberships} onDeactivate={onDeactivateUser}/>)}
      </tbody></table></div>
    </Card>
    <Card title="Permissões dos perfis">{accessProfiles.map(profile=><ProfileEditor key={profile.id+':'+profile.version} profile={profile} onSave={onUpdateProfile}/>)}</Card>
  </div>;
}
function UserAccessRow({user,obras,profiles,memberships,onSave,onDeactivate}) {
  const [links,setLinks]=useState(Object.fromEntries(memberships.map(m=>[m.obraId,m.perfil]))),[busy,setBusy]=useState(false);
  async function run(action){setBusy(true);try{await action();}finally{setBusy(false);}}
  return <tr><td><strong>{user.nome}</strong><div>{user.email}</div><small>{user.cargo}{user.isAdmin?' · Administrador global':''}</small></td>
    <td>{user.status==='pending'?'Pendente':user.ativo?'Ativo':'Bloqueado'}</td><td><div className="stack">
      {obras.map(obra=><div key={obra.id} className="button-row">
        <label><input type="checkbox" aria-label={'Liberar '+obra.codigo} checked={!!links[obra.id]} onChange={e=>setLinks(current=>{const next={...current};if(e.target.checked)next[obra.id]='apontador';else delete next[obra.id];return next;})}/> {obra.codigo}</label>
        <select aria-label={'Perfil na '+obra.codigo} disabled={!links[obra.id]||user.isAdmin} value={links[obra.id]||'apontador'} onChange={e=>setLinks(current=>({...current,[obra.id]:e.target.value}))}>{profiles.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
      </div>)}
    </div></td><td><div className="stack"><button className="btn btn-primary" disabled={busy} onClick={()=>run(()=>onSave(user.id,Object.entries(links).map(([obraId,perfil])=>({obraId,perfil})),user.version))}>Salvar acessos</button>
      <button className="btn btn-danger" disabled={busy||!user.ativo} onClick={()=>run(()=>onDeactivate(user.id,user.version))}>Desativar</button></div></td></tr>;
}
function ProfileEditor({profile,onSave}) {
  const [label,setLabel]=useState(profile.label),[tabs,setTabs]=useState(profile.tabs),[editableTabs,setEditable]=useState(profile.editableTabs),[canDeleteHistory,setDelete]=useState(profile.canDeleteHistory),[busy,setBusy]=useState(false);
  const toggle=(list,id,checked)=>checked?[...new Set([...list,id])]:list.filter(v=>v!==id);
  return <details className="profile-editor"><summary>{profile.label}</summary><form onSubmit={async event=>{event.preventDefault();setBusy(true);try{await onSave({id:profile.id,label,tabs,editableTabs,canDeleteHistory,expectedVersion:profile.version});}finally{setBusy(false);}}}>
    <fieldset disabled={profile.isAdmin||busy}><Field label={'Nome do perfil '+profile.id}><input value={label} onChange={e=>setLabel(e.target.value)}/></Field>
      <div className="profile-grid">{TAB_ITEMS.filter(t=>!['administracao','multiobra'].includes(t.value)).map(tab=><div key={tab.value}>
        <label><input type="checkbox" checked={tabs.includes(tab.value)} onChange={e=>{setTabs(toggle(tabs,tab.value,e.target.checked));if(!e.target.checked)setEditable(editableTabs.filter(t=>t!==tab.value));}}/> Ler {tab.label}</label>
        <label><input type="checkbox" checked={editableTabs.includes(tab.value)} onChange={e=>{setEditable(toggle(editableTabs,tab.value,e.target.checked));if(e.target.checked)setTabs(toggle(tabs,tab.value,true));}}/> Editar {tab.label}</label>
      </div>)}</div>
      <label><input type="checkbox" checked={canDeleteHistory} onChange={e=>setDelete(e.target.checked)}/> Excluir histórico</label>
      <button className="btn btn-primary" type="submit">Salvar perfil</button>
    </fieldset>
  </form></details>;
}
