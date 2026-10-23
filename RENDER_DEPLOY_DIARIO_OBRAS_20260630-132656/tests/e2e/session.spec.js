import {test,expect} from '@playwright/test';
import {enter} from '../helpers/browser-login';
test.beforeEach(async({request})=>{await request.post('/__test/reset',{data:{}});});
test('entra por convite e não por perfil na URL',async({page,request})=>{
  const result=await request.post('/__test/invite',{data:{email:'apontador@example.invalid'}}),{link}=await result.json();
  await page.goto(link);await page.getByLabel('Nova senha',{exact:true}).fill('Uma senha forte de teste 123!');
  await page.getByRole('button',{name:'Definir senha'}).click();
  await expect(page.getByLabel('Obra ativa',{exact:true})).toBeVisible();
  await page.goto('/?perfil=gerencia&usuario=admin');
  await expect(page.getByText('Administrativo',{exact:true})).not.toBeVisible();
  await expect(page.getByRole('tab',{name:'Logins',exact:true})).not.toBeVisible();
});
test('lista vazia não cria exemplos',async({page,request})=>{
  await request.post('/__test/reset',{data:{mode:'empty'}});
  await enter(page,'admin@example.invalid');
  await expect(page.getByText('Nenhuma obra disponível.',{exact:true})).toBeVisible();
  await expect(page.getByText('VIADUTO MAX STANDACHER - PR',{exact:true})).not.toBeVisible();
});
test('apontador seleciona uma obra autorizada sem editar seu cadastro',async({page})=>{
  await enter(page);
  const selector=page.getByLabel('Obra ativa',{exact:true});
  await expect(selector.locator('option')).toHaveCount(2);
  await selector.selectOption({label:'T2 · Obra fictícia B'});
  await expect(page.getByLabel('Obra',{exact:true})).toHaveValue('Obra fictícia B');
  await expect(page.getByRole('tab',{name:'Multiobra',exact:true})).not.toBeVisible();
});
test('sem sessão mostra entrada e erro de rede permite tentar novamente',async({page})=>{
  await page.goto('/?perfil=gerencia');
  await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
  await page.route('**/api/session',route=>route.abort());
  await page.reload();await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
  await page.unroute('**/api/session');await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
});
test('cadastro de profissional confirma no servidor e persiste após recarregar',async({page})=>{
  await enter(page,'admin@example.invalid');
  await page.getByRole('tab',{name:'Cadastros',exact:true}).click();
  await page.getByRole('button',{name:'Adicionar profissional',exact:true}).click();
  const row=page.getByRole('row').filter({has:page.getByRole('button',{name:'Salvar',exact:true})}).first();
  await row.getByRole('textbox').nth(0).fill('Pessoa de teste');
  await row.locator('input[list]').fill('ARMADOR');
  await row.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(page.getByText('Cadastro salvo no servidor.',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('tab',{name:'Cadastros',exact:true}).click();
  await expect(row.getByRole('textbox').nth(0)).toHaveValue('Pessoa de teste');
});
