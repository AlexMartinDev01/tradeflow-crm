import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson,postJson,plusDays} from './helpers.mjs';

test.describe('TradeFlow core workbench browser acceptance',()=>{
  test('manager generates an initial quotation from opportunity once and stage advances atomically',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customers=await getJson(request,'/api/customers?keyword=Nordstern&size=20',manager.headers);
    const customer=customers.data.find(x=>x.name==='Nordstern Technik GmbH');
    expect(customer).toBeTruthy();
    const suffix=Date.now().toString().slice(-7);
    const opportunityName='UI Quote Opportunity '+suffix;

    const opportunity=await postJson(request,'/api/opportunities',{
      customer_id:customer.id,
      name:opportunityName,
      stage:'solution',
      expected_amount:24800,
      currency:'USD',
      expected_close_date:plusDays(30),
      probability:60,
      competitor:'Playwright competitor',
      notes:'Browser quotation conversion acceptance'
    },manager.headers);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/sales/opportunities');
    await expect(page.getByRole('heading',{name:'商机管理'})).toBeVisible();
    const row=page.getByRole('row',{name:new RegExp(opportunityName)});
    await expect(row).toBeVisible();
    await row.getByRole('button',{name:'生成报价'}).click();

    const dialog=page.getByRole('dialog',{name:'生成初版报价'});
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('有效期').fill(plusDays(20));
    await dialog.getByRole('button',{name:'创建报价'}).click();
    await expect(page.getByText(/已就绪，商机已推进到 quotation/)).toBeVisible();

    await expect.poll(async()=>{
      const list=await getJson(request,'/api/opportunities?size=500',manager.headers);
      return list.data.find(x=>x.id===opportunity.id)?.stage;
    },{timeout:10000}).toBe('quotation');

    const quotes=await getJson(request,'/api/quotations?size=500',manager.headers);
    expect(quotes.data.filter(x=>x.opportunity_id===opportunity.id&&Number(x.version)===1)).toHaveLength(1);
  });

  test('manager creates a new contract version through the real drawer UI',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customers=await getJson(request,'/api/customers?keyword=Nordstern&size=20',manager.headers);
    const customer=customers.data.find(x=>x.name==='Nordstern Technik GmbH');
    const contract=await postJson(request,'/api/workflows/contracts',{
      customer_id:customer.id,
      amount:20000,
      currency:'USD',
      effective_from:plusDays(1),
      effective_to:plusDays(365),
      terms:'Browser contract version acceptance'
    },manager.headers);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/contracts');
    await expect(page.getByRole('heading',{name:'合同管理'})).toBeVisible();
    const row=page.getByRole('row',{name:new RegExp(contract.contract_no)});
    await expect(row).toBeVisible();
    await row.getByRole('button',{name:'详情'}).click();

    const drawer=page.getByRole('dialog',{name:'合同工作台'});
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button',{name:'生成新版本'}).click();

    const versionDialog=page.getByRole('dialog',{name:'生成合同新版本'});
    await expect(versionDialog).toBeVisible();
    await versionDialog.getByLabel('金额').fill('21500');
    await versionDialog.getByLabel('合同条款').fill('Browser generated V2 contract terms');
    await versionDialog.getByRole('button',{name:'生成新版本'}).click();
    await expect(page.getByText('合同新版本已生成')).toBeVisible();
    await expect(drawer.getByText(/V2/).first()).toBeVisible();

    const full=await getJson(request,'/api/workflows/contracts/'+contract.id+'/full',manager.headers);
    expect(full.current_version).toBe(2);
    expect(full.versions.map(x=>Number(x.version))).toEqual([2,1]);
    expect(Number(full.amount)).toBe(21500);
  });

  test('customs draft inherits destination country from selected order customer',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const customer=await postJson(request,'/api/customers',{
      name:'Customs UI Customer '+suffix,
      english_name:'Customs UI Customer '+suffix,
      country:'Germany',
      city:'Hamburg',
      industry:'Industrial Distribution',
      customer_types:['Importer'],
      status:'following',
      grade:'B',
      source:'Playwright Customs UI'
    },manager.headers);
    const order=await postJson(request,'/api/orders',{
      customer_id:customer.id,
      status:'confirmed',
      currency:'USD',
      incoterm:'FOB',
      payment_terms:'30/70',
      total:5000,
      requested_delivery:plusDays(45),
      notes:'Browser customs acceptance'
    },manager.headers);
    await postJson(request,'/api/orderItems',{
      order_id:order.id,
      product_name:'E2E Customs Servo',
      quantity:10,
      unit:'pcs',
      unit_price:500,
      amount:5000
    },manager.headers);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/customs');
    await expect(page.getByRole('heading',{name:'报关管理'})).toBeVisible();
    await page.getByRole('button',{name:'新建报关草稿'}).click();

    const dialog=page.getByRole('dialog',{name:'新建报关草稿'});
    await expect(dialog).toBeVisible();
    const orderSelect=dialog.getByLabel('订单');
    await orderSelect.click();
    await orderSelect.fill(order.order_no);
    await page.getByRole('option',{name:new RegExp(order.order_no)}).click();

    await expect(dialog.getByLabel('目的国')).toHaveValue('Germany');
    await dialog.getByLabel('申报海关').fill('Shanghai Customs E2E');
    await dialog.getByRole('button',{name:'创建草稿'}).click();
    await expect(page.getByText('报关草稿已创建')).toBeVisible();
    await expect(page.getByRole('dialog',{name:'报关资料工作台'})).toBeVisible();

    const declarations=await getJson(request,'/api/customs-declarations',manager.headers);
    const created=declarations.find(x=>x.order_id===order.id);
    expect(created).toBeTruthy();
    expect(created.destination_country).toBe('Germany');
  });
});

test.describe('TradeFlow inquiry opportunity contract customs mobile acceptance',()=>{
  test.use({viewport:{width:390,height:844}});

  async function expectNoOverflow(page,label){
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,label+' must not create document-level horizontal overflow').toBeLessThanOrEqual(2);
  }

  test('core sales and customs workbenches remain usable on phone viewport',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');

    for(const [route,heading] of [
      ['/#/sales/inquiries','询盘管理'],
      ['/#/sales/opportunities','商机管理'],
      ['/#/contracts','合同管理'],
      ['/#/customs','报关管理']
    ]){
      await page.goto(route);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
      await expectNoOverflow(page,heading);
    }

    await page.goto('/#/contracts');
    await page.getByRole('button',{name:'详情'}).first().click();
    const contractDrawer=page.getByRole('dialog',{name:'合同工作台'});
    await expect(contractDrawer).toBeVisible();
    await expectNoOverflow(page,'合同工作台');
    await page.keyboard.press('Escape');

    await page.goto('/#/customs');
    await page.getByRole('button',{name:'详情'}).first().click();
    const customsDrawer=page.getByRole('dialog',{name:'报关资料工作台'});
    await expect(customsDrawer).toBeVisible();
    await expectNoOverflow(page,'报关资料工作台');
  });
});
