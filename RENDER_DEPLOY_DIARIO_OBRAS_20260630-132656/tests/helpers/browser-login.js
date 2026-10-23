import {expect} from '@playwright/test';
export async function enter(page,email='apontador@example.invalid') {
  await page.goto('/');await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill('Uma senha forte de teste 123!');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByLabel('Obra ativa',{exact:true})).toBeVisible();
  await expect(page.getByText('Carregando dados…',{exact:true})).not.toBeVisible();
}

