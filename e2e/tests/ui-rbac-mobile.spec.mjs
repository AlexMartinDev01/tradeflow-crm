import {test,expect} from '@playwright/test';
import {DEMO_PASSWORD,loginApi} from './helpers.mjs';

async function login(page,username){
  await page.goto('/#/login');
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(DEMO_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
}

test.describe('TradeFlow UI write permissions',()=>{
  test('manager can create a customer from the real UI',async({page})=>{
    await login(page,'demo.manager');
    await page.goto('/#/customers');
    const name='UI E2E Customer '+Date.now().toString().slice(-8);

    await page.getByRole('button',{name:'新增客户'}).click();
    await page.getByLabel('客户名称').fill(name);
    await page.getByLabel('英文名称').fill(name);
    await page.getByLabel('国家').fill('Germany');
    await page.getByLabel('城市').fill('Hamburg');
    await page.getByLabel('行业').fill('Industrial Automation');
    await page.getByLabel('来源').fill('Playwright UI');
    await page.getByLabel('主营业务').fill('Automated browser acceptance customer');
    await page.getByRole('button',{name:'查重并保存'}).click();

    await expect(page.getByText('客户已创建')).toBeVisible();
    await expect(page.getByRole('row',{name:new RegExp(name)})).toBeVisible();
  });

  test('readonly sees business data but no misleading write controls',async({page})=>{
    await login(page,'demo.readonly');

    await page.goto('/#/customers');
    await expect(page.getByRole('heading',{name:'客户360°'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增客户'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:/批量操作/})).toHaveCount(0);

    await page.goto('/#/sales/inquiries');
    await expect(page.getByRole('heading',{name:'询盘管理'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增询盘'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'记录响应'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'转商机'})).toHaveCount(0);

    await page.goto('/#/sales/opportunities');
    await expect(page.getByRole('heading',{name:'商机管理'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增商机'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'生成报价'})).toHaveCount(0);

    await page.goto('/#/shipments');
    await expect(page.getByRole('heading',{name:'出运执行'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新建出运批次'})).toHaveCount(0);

    await page.goto('/#/aftersales');
    await expect(page.getByRole('heading',{name:'售后与投诉'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新建售后工单'})).toHaveCount(0);
  });

  test('sales navigation does not expose management-only modules and direct URL access is redirected',async({page})=>{
    await login(page,'demo.sales01');
    await expect(page.getByText('询盘管理',{exact:true})).toBeVisible();
    await expect(page.getByText('客户360°',{exact:true})).toBeVisible();

    for(const label of ['客户营销','自动化规则','系统集成','审计日志','组织与账号','数据库备份','数据隐私']){
      await expect(page.getByText(label,{exact:true})).toHaveCount(0);
    }

    await page.goto('/#/settings/team');
    await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);

    await page.goto('/#/marketing');
    await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
  });

  test('readonly customer detail does not show attachment write controls',async({page})=>{
    await login(page,'demo.readonly');
    await page.goto('/#/customers');
    const row=page.getByRole('row',{name:/Nordstern Technik GmbH/});
    await expect(row).toBeVisible();
    await row.dblclick();
    await expect(page).toHaveURL(/#\/customers\//);
    await expect(page.getByRole('button',{name:'上传附件'})).toHaveCount(0);
  });
});

test.describe('TradeFlow mobile layout',()=>{
  test.use({viewport:{width:390,height:844}});

  test('mobile dashboard and navigation drawer remain usable without horizontal page overflow',async({page})=>{
    await login(page,'demo.manager');

    const menu=page.getByRole('button',{name:'打开导航'});
    await expect(menu).toBeVisible();

    let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await menu.click();
    await expect(page.getByText('客户360°',{exact:true})).toBeVisible();
    await page.getByText('客户360°',{exact:true}).click();
    await expect(page.getByRole('heading',{name:'客户360°'})).toBeVisible();

    overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    await menu.click();
    await expect(page.getByText('售后知识库',{exact:true})).toBeVisible();
  });

  test('mobile customer dialog fits inside the viewport',async({page,request})=>{
    const session=await loginApi(request,'demo.manager');
    await page.addInitScript(token=>localStorage.setItem('token',token),session.token);
    await page.goto('/#/customers',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'客户360°'})).toBeVisible({timeout:15000});
    await expect(page.getByRole('button',{name:'新增客户'})).toBeVisible({timeout:15000});
    await page.getByRole('button',{name:'新增客户'}).click();
    const dialog=page.getByRole('dialog',{name:'新增客户'});
    await expect(dialog).toBeVisible();
    const box=await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(392);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
