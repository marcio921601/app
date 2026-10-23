import {randomUUID} from 'node:crypto';
export async function addWork(db,{codigo=randomUUID(),nome='Obra fictícia'}={}) {
  const id=randomUUID();
  await db.query('INSERT INTO app.obras(id,codigo,nome) VALUES($1,$2,$3)',[id,codigo,nome]);
  return id;
}
export async function grant(db,userId,obraId,perfil='apontador') {
  await db.query('INSERT INTO app.memberships(user_id,obra_id,perfil) VALUES($1,$2,$3)',[userId,obraId,perfil]);
}
export const actorFor=user=>({id:user.id,authUserId:user.authUserId,isAdmin:user.isAdmin,nome:user.nome});
