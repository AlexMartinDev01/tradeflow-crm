import {test,expect} from '@playwright/test';
import {authenticatePage,plusDays} from './helpers.mjs';

async function expectDashboardRedirect(page,path){
  await page.goto(path);
  await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
}

test.describe('TradeFlow extended UI role matrix',()=>{
  test('finance sees finance workbench but cannot enter sales or management-only routes',async({page,request})=>{
    await authenticatePage(page,request,'demo.finance');
    await page.goto('/#/');

    await expect(page.getByText('回款与信用',{exact:true})).toBeVisible();
    await expect(page.getByText('询盘管理',{exact:true})).toHaveCount(0);
    await expect(page.getByText('客户营销',{exact:true})).toHaveCount(0);
    await expect(page.getByText('自动化规则',{exact:true})).toHaveCount(0);
    await expect(page.getByText('组织与账号',{exact:true})).toHaveCount(0);

    await page.goto('/#/finance');
    await expect(page.getByRole('heading',{name:'回款与信用'})).toBeVisible();
    await expect(page.getByRole('button',{name:'登记到账'}).first()).toBeVisible();

    await expectDashboardRedirect(page,'/#/sales/inquiries');
    await expectDashboardRedirect(page,'/#/marketing');
    await expectDashboardRedirect(page,'/#/settings/team');
  });

  test('followup can respond to inquiries but cannot convert opportunities or enter finance',async({page,request})=>{
    await authenticatePage(page,request,'demo.followup');
    await page.goto('/#/sales/inquiries');

    await expect(page.getByRole('heading',{name:'询盘管理'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增询盘'})).toBeVisible();
    await expect(page.getByRole('button',{name:'转商机'})).toHaveCount(0);

    await page.goto('/#/sales/opportunities');
    await expect(page.getByRole('heading',{name:'商机管理'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增商机'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'生成报价'})).toHaveCount(0);

    await expectDashboardRedirect(page,'/#/finance');
    await expectDashboardRedirect(page,'/#/automation');
  });

  test('manager gets operational administration but not admin-only account/backup/privacy controls',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/');

    for(const label of ['客户营销','自动化规则','系统集成','审计日志','运行监控']){
      await expect(page.getByText(label,{exact:true})).toBeVisible();
    }
    for(const label of ['组织与账号','数据库备份','附件备份','数据隐私']){
      await expect(page.getByText(label,{exact:true})).toHaveCount(0);
    }

    await page.goto('/#/automation');
    await expect(page.getByRole('heading',{name:'自动化与提醒'})).toBeVisible();
    await expectDashboardRedirect(page,'/#/settings/team');
    await expectDashboardRedirect(page,'/#/settings/backups');
  });
});

test.describe('TradeFlow real browser sales actions',()=>{
  test('manager creates inquiry, records first response and converts it to opportunity using UI controls',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const port='E2E Port '+suffix;
    const opportunityName='UI Opportunity '+suffix;

    await page.goto('/#/sales/inquiries');
    await expect(page.getByRole('heading',{name:'询盘管理'})).toBeVisible();

    await page.getByRole('button',{name:'新增询盘'}).click();
    const create=page.getByRole('dialog',{name:'新增询盘'});
    await expect(create).toBeVisible();

    const customerSelect=create.getByLabel('客户');
    await customerSelect.click();
    await customerSelect.fill('Nordstern');
    await page.getByRole('option',{name:'Nordstern Technik GmbH',exact:true}).click();

    await create.getByLabel('来源').fill('Playwright UI '+suffix);
    await create.getByLabel('数量').fill('18 sets');
    await create.getByLabel('目标价').fill('EUR 980 / set');
    await create.getByLabel('目的港').fill(port);
    await create.getByLabel('期望交期').fill(plusDays(45));
    await create.getByLabel('备注').fill('Created through real browser controls');
    await create.getByRole('button',{name:'保存询盘'}).click();

    await expect(page.getByText('询盘已创建并自动分配负责人')).toBeVisible();
    const row=page.getByRole('row',{name:new RegExp(port)});
    await expect(row).toBeVisible();

    await row.getByRole('button',{name:'记录响应'}).click();
    await expect(page.getByText(/已记录首次响应/)).toBeVisible();
    await expect(row.getByText(/达标|超时/)).toBeVisible();

    await row.getByRole('button',{name:'转商机'}).click();
    const convert=page.getByRole('dialog',{name:'询盘转商机'});
    await expect(convert).toBeVisible();
    await convert.getByLabel('商机名称').fill(opportunityName);
    await convert.getByLabel('预计金额').fill('17640');
    await convert.getByLabel('预计成交日').fill(plusDays(30));
    await convert.getByLabel('成交概率 %').fill('65');
    await convert.getByLabel('竞争对手').fill('UI Test Competitor');
    await convert.getByRole('button',{name:'确认转商机'}).click();

    await expect(page.getByText('已转为商机')).toBeVisible();
    await expect(row.getByText('converted',{exact:true})).toBeVisible();

    await page.goto('/#/sales/opportunities');
    await expect(page.getByRole('row',{name:new RegExp(opportunityName)})).toBeVisible();
  });
});

test.describe('TradeFlow complex mobile workbenches',()=>{
  test.use({viewport:{width:390,height:844}});

  async function expectNoPageOverflow(page,label){
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,`${label} must not create document-level horizontal overflow`).toBeLessThanOrEqual(2);
  }

  test('quotation, order, aftersales and BI pages stay usable on a phone viewport',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');

    await page.goto('/#/sales/quotations');
    await expect(page.getByRole('heading',{name:'报价管理'})).toBeVisible();
    await expectNoPageOverflow(page,'quotation list');
    await page.getByRole('button',{name:'详情'}).first().click();
    const quoteDrawer=page.getByRole('dialog',{name:'报价详情'});
    await expect(quoteDrawer).toBeVisible();
    const expectDrawerInsideViewport=async(drawer,label)=>{
      await expect.poll(async()=>{
        const box=await drawer.boundingBox();
        if(!box)return 9999;
        return Math.max(Math.abs(Math.min(0,box.x)),Math.max(0,box.x+box.width-390));
      },{message:label+' should finish its slide-in animation inside the phone viewport',timeout:3000}).toBeLessThanOrEqual(1);
    };
    await expectDrawerInsideViewport(quoteDrawer,'quotation detail');
    await expectNoPageOverflow(page,'quotation detail');
    await page.keyboard.press('Escape');
    await expect(quoteDrawer).toBeHidden();

    await page.goto('/#/orders');
    await expect(page.getByRole('heading',{name:'订单执行'})).toBeVisible();
    await expectNoPageOverflow(page,'order list');
    await page.getByRole('button',{name:'详情'}).first().click();
    const orderDrawer=page.getByRole('dialog',{name:'订单执行详情'});
    await expect(orderDrawer).toBeVisible();
    await expectDrawerInsideViewport(orderDrawer,'order detail');
    await expectNoPageOverflow(page,'order detail');
    await page.keyboard.press('Escape');
    await expect(orderDrawer).toBeHidden();

    await page.goto('/#/aftersales');
    await expect(page.getByRole('heading',{name:'售后与投诉'})).toBeVisible();
    await expectNoPageOverflow(page,'aftersales list');
    await page.getByRole('button',{name:'详情'}).first().click();
    const afterDrawer=page.getByRole('dialog',{name:'售后工单详情'});
    await expect(afterDrawer).toBeVisible();
    await expectDrawerInsideViewport(afterDrawer,'aftersales detail');
    await expectNoPageOverflow(page,'aftersales detail');
    await page.keyboard.press('Escape');

    await page.goto('/#/reports');
    await expect(page.getByRole('heading',{name:'自定义报表设计器'})).toBeVisible();
    await expectNoPageOverflow(page,'BI designer');
    await page.getByRole('button',{name:'运行报表'}).click();
    await expect(page.getByText(/共 \d+ 个分组/)).toBeVisible();
    await expectNoPageOverflow(page,'BI report result');
  });
});


test.describe('TradeFlow additional mobile workbenches',()=>{
  test.use({viewport:{width:390,height:844}});

  async function expectNoOverflow(page,label){
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,label+' must not create document-level horizontal overflow').toBeLessThanOrEqual(2);
  }

  test('search, finance and shipment workbenches stay within phone viewport',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');

    await page.goto('/#/search');
    await expect(page.getByRole('heading',{name:'全局搜索'})).toBeVisible();
    await page.getByPlaceholder('输入客户名、联系人、邮箱、电话、品牌、标签、税号等').fill('Anna Schmidt');
    await page.getByRole('button',{name:'搜索'}).click();
    await expect(page.getByRole('row',{name:/Nordstern Technik GmbH/})).toBeVisible();
    await expectNoOverflow(page,'global search');

    await page.goto('/#/finance');
    await expect(page.getByRole('heading',{name:'回款与信用'})).toBeVisible();
    await expect(page.getByText('应收 / 回款明细')).toBeVisible();
    await expectNoOverflow(page,'finance');

    await page.goto('/#/shipments');
    await expect(page.getByRole('heading',{name:'出运执行'})).toBeVisible();
    await expect(page.getByText(/共 \d+ 批/)).toBeVisible();
    await expectNoOverflow(page,'shipments');
  });
});
