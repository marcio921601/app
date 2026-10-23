import pg from 'pg';
const normalize=result=>{
  const value=Array.isArray(result)?result.at(-1):result;
  return {rows:value?.rows||[],rowCount:value?.rowCount||0};
};
export function connectDatabase(config) {
  const url=new URL(config.databaseUrl);
  for(const name of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(name);
  const pool=new pg.Pool({connectionString:url.toString(),max:8,connectionTimeoutMillis:10000,
    idleTimeoutMillis:30000,ssl:config.databaseSsl?{rejectUnauthorized:true,ca:config.databaseCa}:false});
  const query=async(text,params=[])=>normalize(await pool.query(text,params));
  return {
    query,
    async transaction(fn) {
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const tx={query:async(text,params=[])=>normalize(await client.query(text,params))};
        const result=await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch(error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close:()=>pool.end()
  };
}
