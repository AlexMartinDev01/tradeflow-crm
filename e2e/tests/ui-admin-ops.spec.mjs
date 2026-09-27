import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson} from './helpers.mjs';

async function expectNoOverflow(page,label){
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow,label+' must not create document-level horizontal overflow').toBeLessThanOrEqual(2);
}
async function selectOption(page,control,label){
  await control.click();
  const option=page.getByRole('option',{name:label,exact:true});
  await expect(option).toBeVisible();
  await option.click();
}

test.describe('TradeFlow administration and operations workbenches',()=>{
  test('admin can open all administrator-only workbenches',async({page,request})=>{
    await authenticatePage(page,request,'demo.admin');
    const routes=[
      ['/#/settings/team','组织与账号权限'],
      ['/#/settings/backups','数据库备份'],
      ['/#/settings/attachment-backup','附件完整性与备份'],
      ['/#/settings/privacy','数据隐私与导出权限'],
      ['/#/settings/ops','运行监控'],
      ['/#/settings/channels','联系方式渠道设计器'],
      ['/#/settings/custom-fields','自定义字段设计器'],
      ['/#/integrations','系统集成'],
      ['/#/data/excel','Excel 导入 / 导出'],
      ['/#/audit','审计日志'],
      ['/#/recycle-bin/customers','客户回收站'],
      ['/#/settings/exchange-rates','汇率与币种换算'],
      ['/#/settings/security','账号安全']
    ];
    for(const [route,heading] of routes){
      await page.goto(route);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
    }
  });

  test('manager is redirected away from admin-only account backup and privacy pages',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    for(const route of ['/#/settings/team','/#/settings/backups','/#/settings/attachment-backup','/#/settings/privacy']){
      await page.goto(route);
      await expect(page).toHaveURL(/#\/$/);
      await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
    }
    for(const [route,heading] of [
      ['/#/settings/ops','运行监控'],
      ['/#/settings/channels','联系方式渠道设计器'],
      ['/#/settings/custom-fields','自定义字段设计器'],
      ['/#/integrations','系统集成'],
      ['/#/data/excel','Excel 导入 / 导出'],
      ['/#/audit','审计日志']
    ]){
      await page.goto(route);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
    }
  });

  test('finance can maintain exchange rates but cannot enter management configuration',async({page,request})=>{
    await authenticatePage(page,request,'demo.finance');
    await page.goto('/#/settings/exchange-rates');
    await expect(page.getByRole('heading',{name:'汇率与币种换算'})).toBeVisible();
    await expect(page.getByRole('button',{name:'录入汇率'})).toBeVisible();

    for(const route of ['/#/integrations','/#/settings/custom-fields','/#/audit']){
      await page.goto(route);
      await expect(page).toHaveURL(/#\/$/);
      await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
    }
  });

  test('manager creates a custom field through the real UI',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const key='e2e_field_'+suffix;
    const label='E2E 年采购等级 '+suffix;

    await page.goto('/#/settings/custom-fields');
    await page.getByRole('button',{name:'新增字段'}).click();
    const dialog=page.getByRole('dialog',{name:'新增自定义字段'});
    await dialog.getByLabel('字段Key').fill(key);
    await dialog.getByLabel('显示名称').fill(label);
    await dialog.getByLabel('字段分组').fill('E2E 验收');
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await expect(page.getByText('字段配置已保存')).toBeVisible();
    await expect(page.getByRole('row',{name:new RegExp(label)})).toBeVisible();

    const manager=await loginApi(request,'demo.manager');
    const fields=await getJson(request,'/api/customFields?size=500',manager.headers);
    expect(fields.data.some(x=>x.field_key===key&&x.label===label)).toBeTruthy();
  });

  test('finance records a new exchange rate through the real UI',async({page,request})=>{
    await authenticatePage(page,request,'demo.finance');
    const source='E2E Finance '+Date.now();

    await page.goto('/#/settings/exchange-rates');
    await page.getByRole('button',{name:'录入汇率'}).click();
    const dialog=page.getByRole('dialog',{name:'录入汇率'});
    await selectOption(page,dialog.getByLabel('目标币种'),'SGD');
    await dialog.getByLabel('汇率').fill('1.3456');
    await dialog.getByLabel('来源').fill(source);
    await dialog.getByLabel('备注').fill('Playwright admin/ops acceptance');
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await expect(page.getByText('汇率已保存')).toBeVisible();
    await expect(page.getByRole('row',{name:/USD \/ SGD/})).toBeVisible();
  });
});

test.describe('TradeFlow mobile quick intake',()=>{
  test.use({viewport:{width:390,height:844}});

  test('sales creates customer and contact from phone quick-create UI',async({page,request})=>{
    const sales=await loginApi(request,'demo.sales01');
    await authenticatePage(page,request,'demo.sales01');
    const suffix=Date.now().toString().slice(-7);
    const company='Mobile E2E Customer '+suffix;
    const email='buyer.'+suffix+'@example.com';

    await page.goto('/#/mobile/quick-create');
    await expect(page.getByRole('heading',{name:'手机极速建档'})).toBeVisible();
    await expectNoOverflow(page,'mobile quick create');

    await page.getByLabel('客户 / 公司名称 *').fill(company);
    await page.getByLabel('国家').fill('Germany');
    await page.getByLabel('城市').fill('Hamburg');
    await page.getByLabel('行业').fill('Industrial Automation');
    await page.getByLabel('姓名').fill('Mobile Buyer '+suffix);
    await page.getByLabel('职位').fill('Procurement Manager');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('电话').fill('+49 555 '+suffix);
    await page.getByLabel('现场备注').fill('Created from Playwright mobile quick intake');
    await page.getByRole('button',{name:'查重并创建客户'}).click();

    await expect(page.getByText('客户已建档')).toBeVisible();
    await expect(page).toHaveURL(/#\/customers\/[0-9a-f-]+$/);
    await expect(page.getByText(company,{exact:true}).first()).toBeVisible();

    const customers=await getJson(request,'/api/customers?keyword='+encodeURIComponent(company)+'&size=50',sales.headers);
    const saved=customers.data.find(x=>x.name===company);
    expect(saved).toBeTruthy();
    expect(saved.owner_id).toBe(sales.user.id);

    const contacts=await getJson(request,'/api/contacts?customer_id='+saved.id+'&size=50',sales.headers);
    expect(contacts.data.some(x=>x.name==='Mobile Buyer '+suffix)).toBeTruthy();
  });

  test('admin configuration pages remain inside phone viewport',async({page,request})=>{
    await authenticatePage(page,request,'demo.admin');
    for(const [route,heading] of [
      ['/#/settings/team','组织与账号权限'],
      ['/#/settings/backups','数据库备份'],
      ['/#/settings/privacy','数据隐私与导出权限'],
      ['/#/settings/ops','运行监控']
    ]){
      await page.goto(route);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
      await expectNoOverflow(page,heading);
    }
  });
});
