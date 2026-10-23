import { PGlite } from '@electric-sql/pglite';
function adapt(client) {
  return {async query(text,params=[]) {
    const result=params.length?await client.query(text,params):(await client.exec(text)).at(-1);
    return {rows:result?.rows||[],rowCount:result?.affectedRows??result?.rows?.length??0};
  }};
}
export async function createTestDb() {
  const pg=new PGlite();
  await pg.waitReady;
  return {...adapt(pg),transaction:fn=>pg.transaction(tx=>fn(adapt(tx))),close:()=>pg.close()};
}
