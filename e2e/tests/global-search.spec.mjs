import {test,expect} from '@playwright/test';
import {loginApi,getJson,authenticatePage} from './helpers.mjs';

function names(rows){return rows.map(x=>x.name)}

test.describe('TradeFlow global search coverage',()=>{
  test('manager unified search resolves customer, contact, email, tag, brand and tax number',async({request})=>{
    const manager=await loginApi(request,'demo.manager');

    const cases=[
      ['Nordstern Technik GmbH','Nordstern Technik GmbH','客户名称'],
      ['Anna Schmidt','Nordstern Technik GmbH','联系人'],
      ['anna.schmidt@customer1.example.com','Nordstern Technik GmbH','联系方式'],
      ['重点客户（演示）','Nordstern Technik GmbH','标签'],
      ['Novaris Motion','Nordstern Technik GmbH','品牌'],
      ['DE123456789','Nordstern Technik GmbH','税号/VAT']
    ];

    for(const [term,expected,reasonLabel] of cases){
      const rows=await getJson(request,'/api/search?q='+encodeURIComponent(term),manager.headers);
      expect(names(rows),`search term "${term}" should include ${expected}`).toContain(expected);
      const row=rows.find(x=>x.name===expected);
      expect(row.match_reasons?.some(x=>String(x.label).includes(reasonLabel)),`search term "${term}" should explain match as ${reasonLabel}`).toBe(true);
    }
  });

  test('sales self-scope is enforced by unified search and cannot leak another owner customer',async({request})=>{
    const sales=await loginApi(request,'demo.sales01');

    const own=await getJson(request,'/api/search?q='+encodeURIComponent('Nordstern Technik GmbH'),sales.headers);
    expect(names(own)).toContain('Nordstern Technik GmbH');
    for(const row of own)expect(row.owner_id).toBe(sales.user.id);

    const other=await getJson(request,'/api/search?q='+encodeURIComponent('AlpenWerk Automation AG'),sales.headers);
    expect(names(other)).not.toContain('AlpenWerk Automation AG');
    expect(other).toHaveLength(0);
  });

  test('empty query returns no data and does not accidentally enumerate customers',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const rows=await getJson(request,'/api/search?q=',manager.headers);
    expect(rows).toEqual([]);
  });

  test('real browser search by contact email opens the correct customer 360 page',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/search');
    await expect(page.getByRole('heading',{name:'全局搜索'})).toBeVisible();

    const input=page.getByPlaceholder('输入客户名、联系人、邮箱、电话、品牌、标签、税号等');
    await input.fill('anna.schmidt@customer1.example.com');
    await page.getByRole('button',{name:'搜索'}).click();

    const row=page.getByRole('row',{name:/Nordstern Technik GmbH/});
    await expect(row).toBeVisible();
    await expect(row.getByText(/联系方式（email）/)).toBeVisible();
    await row.getByRole('button',{name:'打开客户'}).click();

    await expect(page).toHaveURL(/#\/customers\//);
    await expect(page.getByText('Nordstern Technik GmbH').first()).toBeVisible();
  });
});
