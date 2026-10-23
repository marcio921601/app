import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {enter} from '../helpers/browser-login';
const XLSX=createRequire(import.meta.url)('xlsx');
test.beforeEach(async({request})=>{await request.post('/__test/reset',{data:{}});await request.post('/__test/regression');});
test('relatório mantém oito HH e produção doze na tela e na impressão',async({page})=>{
 await enter(page);await page.getByLabel('Data',{exact:true}).fill('2026-10-23');
 await page.getByRole('tab',{name:'Produtividade',exact:true}).click();
 await expect(page.locator('.unit-summary-card')).toContainText('12');
 await expect(page.locator('.unit-summary-card')).toContainText('8 HH');
 await page.emulateMedia({media:'print'});
 const print=page.locator('.print-layout');
 await expect(print.locator('.print-box').filter({hasText:'HH total'}).locator('.print-box-value')).toHaveText('8');
 await expect(print.locator('.print-box').filter({hasText:'Producao'}).locator('.print-box-value')).toHaveText('12');
 await expect(print.getByRole('row').filter({hasText:'1,5'})).toBeVisible();
});
test('exportação contém somente obras autorizadas e cálculos históricos confirmados',async({page,request})=>{
 await request.post('/__test/change-budget');await enter(page,'engenheiro@example.invalid');
 const jsonDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar JSON',exact:true}).click();
 const json=JSON.parse(await readFile(await(await jsonDownload).path(),'utf8'));
 expect(json.multiobra.obras.map(o=>o.codigo)).toEqual(['T1','T2']);expect(json.historico).toHaveLength(1);
 await page.getByRole('tab',{name:'Produtividade',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:/Exportar.*Excel/}).click();
 const book=XLSX.read(await readFile(await(await download).path()),{type:'buffer'});
 const rows=XLSX.utils.sheet_to_json(book.Sheets['Banco de dados']);
 const historical=rows.find(r=>r.Fonte==='Historico');expect(historical.HH).toBe(8);expect(historical['Quantidade executada']).toBe(12);expect(historical['Valor realizado']).toBe(120);
 expect(JSON.stringify(rows)).not.toContain('Dado de obra restrita');
});
