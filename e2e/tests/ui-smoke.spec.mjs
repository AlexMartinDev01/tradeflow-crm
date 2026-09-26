import {test,expect} from '@playwright/test';
import {DEMO_PASSWORD} from './helpers.mjs';

async function login(page){
  await page.goto('/#/login');
  await page.getByLabel('用户名').fill('demo.manager');
  await page.getByLabel('密码').fill(DEMO_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
}

test.describe('TradeFlow manager UI smoke',()=>{
  test('login, dashboard and all critical workbenches render without server errors',async({page})=>{
    const serverErrors=[];
    page.on('response',response=>{
      if(response.url().includes('/api/')&&response.status()>=500)serverErrors.push(`${response.status()} ${response.url()}`);
    });

    await login(page);
    await expect(page.getByText('外贸客户管理系统')).toBeVisible();
    await expect(page.getByText('Nordstern Technik GmbH')).toBeVisible();

    const routes=[
      ['/#/customers','客户360°'],
      ['/#/data-quality','客户数据质量中心'],
      ['/#/sales/inquiries','询盘管理'],
      ['/#/sales/opportunities','商机管理'],
      ['/#/sales/quotations','报价管理'],
      ['/#/contracts','合同管理'],
      ['/#/orders','订单执行'],
      ['/#/finance','回款与信用'],
      ['/#/shipments','出运执行'],
      ['/#/customs','报关管理'],
      ['/#/aftersales','售后与投诉'],
      ['/#/knowledge','售后知识库'],
      ['/#/analytics','统计分析中心'],
      ['/#/reports','自定义报表设计器'],
      ['/#/automation','自动化与提醒']
    ];

    for(const [route,heading] of routes){
      await page.goto(route);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
    }

    expect(serverErrors,'No critical page may trigger HTTP 5xx').toEqual([]);
  });

  test('seeded business data is visible from customer, order and knowledge UI',async({page})=>{
    await login(page);

    await page.goto('/#/customers');
    await expect(page.getByText('Nordstern Technik GmbH',{exact:true})).toBeVisible();
    await expect(page.getByText('MapleTech Controls Inc.',{exact:true})).toBeVisible();

    await page.goto('/#/orders');
    await expect(page.getByText('SO-DEMO-2026-001',{exact:true})).toBeVisible();

    await page.goto('/#/knowledge');
    await expect(page.getByText('Servo drive commissioning alarm troubleshooting',{exact:true})).toBeVisible();
  });
});
