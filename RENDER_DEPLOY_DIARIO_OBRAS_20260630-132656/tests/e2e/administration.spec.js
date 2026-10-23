import {test,expect} from '@playwright/test';
import {enter} from '../helpers/browser-login';
test.beforeEach(async({request})=>{await request.post('/__test/reset',{data:{}});});
test('administrador libera obra e apontador registra sem administrar',async({page,browser})=>{
 await enter(page,'admin@example.invalid');await page.getByRole('tab',{name:'Logins',exact:true}).click();
 const row=page.getByRole('row').filter({hasText:'apontador@example.invalid'});
 await row.getByLabel('Liberar T3',{exact:true}).check();
 await row.getByLabel('Perfil na T3',{exact:true}).selectOption('apontador');
 await row.getByRole('button',{name:'Salvar acessos',exact:true}).click();
 await expect(page.getByText('Acessos atualizados.',{exact:true})).toBeVisible();
 const context=await browser.newContext(),other=await context.newPage();
 try {
  await enter(other);await expect(other.getByLabel('Obra ativa',{exact:true}).locator('option')).toHaveCount(3);
  await other.getByLabel('Obra ativa',{exact:true}).selectOption({label:'T3 · Obra restrita'});
  await expect(other.getByLabel('Obra',{exact:true})).toHaveValue('Obra restrita');
  await other.getByRole('button',{name:'Salvar dia no historico',exact:true}).click();
  await expect(other.getByText('Salvo no servidor',{exact:true})).toBeVisible();
  await other.getByRole('tab',{name:'Historico',exact:true}).click();
  await expect(other.getByRole('button',{name:'Consultar',exact:true})).toBeEnabled();
  await expect(other.getByRole('button',{name:'Excluir',exact:true})).toBeDisabled();
  expect((await other.request.get('/api/admin/users')).status()).toBe(403);
 }finally{await context.close();}
});
test('convite preparado fica pendente e simulação mantém identidade',async({page})=>{
 await enter(page,'admin@example.invalid');const before=await(await page.request.get('/api/session')).json();
 await page.getByRole('tab',{name:'Logins',exact:true}).click();
 const form=page.getByRole('form',{name:'Convidar pessoa'});
 await form.getByLabel('Nome',{exact:true}).fill('Pessoa convidada fictícia');
 await form.getByLabel('E-mail',{exact:true}).fill('convite@example.invalid');
 await form.getByRole('button',{name:'Preparar convite',exact:true}).click();
 await expect(page.getByRole('row').filter({hasText:'convite@example.invalid'})).toContainText('Pendente');
 await page.getByLabel('Visualizar como',{exact:true}).selectOption('apontador');
 await expect(page.getByRole('tab',{name:'Logins',exact:true})).not.toBeVisible();
 expect((await(await page.request.get('/api/session')).json()).user.id).toBe(before.user.id);
 await page.getByRole('button',{name:'Voltar ao administrativo',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Logins',exact:true})).toBeVisible();
});
test('último administrador recebe erro visível ao tentar desativar',async({page})=>{
 await enter(page,'admin@example.invalid');await page.getByRole('tab',{name:'Logins',exact:true}).click();
 await page.getByRole('row').filter({hasText:'admin@example.invalid'}).getByRole('button',{name:'Desativar',exact:true}).click();
 await expect(page.getByText('Mantenha pelo menos um administrador ativo.',{exact:true})).toBeVisible();
});
test('RH consulta histórico e engenheiro edita gerencial',async({page,request})=>{
 await request.post('/__test/regression');await enter(page,'rh@example.invalid');
 await page.getByRole('tab',{name:'Historico',exact:true}).click();await page.getByRole('button',{name:'Consultar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Salvar dia no historico',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Sair',exact:true}).click();await enter(page,'engenheiro@example.invalid');
 await page.getByRole('tab',{name:'Gerencial',exact:true}).click();
 await page.getByLabel('Riscos',{exact:true}).fill('Risco fictício acompanhado');
 await expect(page.getByText('Salvo no servidor',{exact:true})).toBeVisible();
});
