import {test,expect} from '@playwright/test';
import {enter} from '../helpers/browser-login';
test.setTimeout(20000);
const observations=page=>page.locator('section.card').filter({has:page.getByRole('heading',{name:'Observacoes',exact:true})}).last().locator('textarea');
const saved=page=>expect(page.getByText('Salvo no servidor',{exact:true})).toBeVisible();
const endpoint='**/api/obras/*/diarios/*';
test.beforeEach(async({request})=>{await request.post('/__test/reset',{data:{}});});
test('resposta antiga não troca obra ou data e preserva edição feita durante envio',async({page})=>{
 await enter(page);let release;const gate=new Promise(resolve=>release=resolve);let first=true;
 await page.route(endpoint,async route=>{if(route.request().method()!=='PUT'||!first)return route.continue();first=false;const response=await route.fetch();await gate;await route.fulfill({response});});
 await observations(page).fill('Texto da primeira obra');
 await expect(page.getByText('Enviando',{exact:true})).toBeVisible();
 const firstWork=await page.getByLabel('Obra ativa',{exact:true}).inputValue();
 await page.getByLabel('Obra ativa',{exact:true}).selectOption({label:'T2 · Obra fictícia B'});
 await expect(page.getByLabel('Obra',{exact:true})).toHaveValue('Obra fictícia B');
 await page.getByLabel('Data',{exact:true}).fill('2026-10-24');
 await observations(page).fill('Texto exclusivo da segunda obra');release();
 await saved(page);
 const work=await page.getByLabel('Obra ativa',{exact:true}).inputValue();
 const result=await(await page.request.get('/api/obras/'+work+'/diarios/2026-10-24')).json();
 expect(result.diary.payload.observacoes).toBe('Texto exclusivo da segunda obra');expect(work).not.toBe(firstWork);
});
test('dois navegadores recebem conflito sem perder texto e reaplicam explicitamente',async({page,browser})=>{
 const context=await browser.newContext(),other=await context.newPage();let release=()=>{};
 try {
  await enter(page);await enter(other);
  const gate=new Promise(resolve=>release=resolve);
  await other.route(endpoint,async route=>{if(route.request().method()!=='PUT')return route.continue();await gate;await route.continue();});
  await observations(other).fill('Edição da segunda pessoa');await observations(page).fill('Edição da primeira pessoa');await saved(page);release();
  await expect(other.getByRole('dialog',{name:'Conflito de edição'})).toBeVisible();
  await expect(observations(other)).toHaveValue('Edição da segunda pessoa');
  await other.getByRole('button',{name:'Reaplicar minhas alterações'}).click();await saved(other);
  await expect(observations(other)).toHaveValue('Edição da segunda pessoa');
 }finally{release();await context.close();}
});
test('edição adicional durante resposta lenta permanece e grava depois',async({page})=>{
 await enter(page);let release;const gate=new Promise(resolve=>release=resolve);let first=true;
 await page.route(endpoint,async route=>{if(route.request().method()!=='PUT'||!first)return route.continue();first=false;const response=await route.fetch();await gate;await route.fulfill({response});});
 await observations(page).fill('Texto inicial');await expect(page.getByText('Enviando',{exact:true})).toBeVisible();
 await observations(page).fill('Texto final mantido');release();await saved(page);
 await expect(observations(page)).toHaveValue('Texto final mantido');
 await page.reload();await expect(observations(page)).toHaveValue('Texto final mantido');
});

test('administrador restaura explicitamente diário excluído sem apagar histórico',async({page,request})=>{
 const seeded=await(await request.post('/__test/regression')).json();await enter(page,'admin@example.invalid');
 await page.getByLabel('Data',{exact:true}).fill(seeded.diary.data);
 await expect(page.getByText('Salvo no servidor',{exact:true})).toBeVisible();
 const session=await(await page.request.get('/api/session')).json();
 const removed=await page.request.delete('/api/diarios/'+seeded.diary.id,{headers:{Origin:'http://localhost:4173','X-CSRF-Token':session.csrfToken},data:{reason:'Ensaio de restauração',expectedVersion:seeded.diary.version}});
 expect(removed.status()).toBe(200);
 await observations(page).fill('Texto restaurado por decisão administrativa');
 await expect(page.getByRole('heading',{name:'Diário excluído',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Restaurar e reaplicar minhas alterações'}).click();await saved(page);
 const result=await(await page.request.get('/api/obras/'+seeded.diary.obraId+'/diarios/'+seeded.diary.data)).json();
 expect(result.diary.version).toBe(3);expect(result.diary.summary.atividades[0].valorExecutado).toBe(120);
 expect(result.diary.payload.observacoes).toBe('Texto restaurado por decisão administrativa');
});
for(const afterCommit of [false,true])test('desconexão '+(afterCommit?'depois':'antes')+' do commit permite repetição segura',async({page})=>{
 await enter(page);
 await page.route(endpoint,async route=>{if(route.request().method()!=='PUT')return route.continue();if(afterCommit)await route.fetch();await route.abort();});
 await observations(page).fill('Edição preservada na rede');
 await expect(page.getByText('Falha no envio',{exact:true})).toBeVisible();
 await expect(observations(page)).toHaveValue('Edição preservada na rede');
 await page.unroute(endpoint);await page.getByRole('button',{name:'Tentar salvar',exact:true}).click();await saved(page);
 const work=await page.getByLabel('Obra ativa',{exact:true}).inputValue(),date=await page.getByLabel('Data',{exact:true}).inputValue();
 const result=await(await page.request.get('/api/obras/'+work+'/diarios/'+date)).json();expect(result.diary.version).toBe(1);
});
test('401 preserva pendência e outra conta não a recebe',async({page,request})=>{
 await enter(page);await request.post('/__test/expire');
 await observations(page).fill('Edição privada do apontador');
 await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
 await enter(page,'admin@example.invalid');
 await expect(observations(page)).toHaveValue('');
 await expect(page.getByRole('button',{name:'Restaurar edição pendente'})).not.toBeVisible();
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 await enter(page);
 await expect(page.getByRole('button',{name:'Restaurar edição pendente'})).toBeVisible();
 await page.getByRole('button',{name:'Restaurar edição pendente'}).click();await saved(page);
 await expect(observations(page)).toHaveValue('Edição privada do apontador');
});
test('foco atualiza formulário limpo sem substituir edição pendente',async({page,browser})=>{
 const context=await browser.newContext(),other=await context.newPage();
 try {
  await enter(page);await enter(other);await observations(other).fill('Atualização compartilhada');await saved(other);
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(observations(page)).toHaveValue('Atualização compartilhada');
  await page.route(endpoint,route=>route.request().method()==='PUT'?route.abort():route.continue());
  await observations(page).fill('Minha edição pendente');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(observations(page)).toHaveValue('Minha edição pendente');
 }finally{await context.close();}
});
test('falha no armazenamento mantém formulário e permite exportar antes de sair',async({page})=>{
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('itauba:pending:'))throw new Error('quota');return original.call(this,k,v);};});
 await enter(page);await page.route(endpoint,route=>route.request().method()==='PUT'?route.abort():route.continue());
 await observations(page).fill('Conteúdo para exportação');
 await expect(page.getByText(/Não foi possível preservar a edição neste navegador/)).toBeVisible();
 await expect(observations(page)).toHaveValue('Conteúdo para exportação');
 await page.getByRole('button',{name:'Sair',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar e sair'}).click();await download;
 await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
});
