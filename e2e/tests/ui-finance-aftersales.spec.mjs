import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson,postJson,plusDays} from './helpers.mjs';

test.describe('TradeFlow finance UI mutation',()=>{
  test('finance records a real receivable payment through the browser UI',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const customerName='Finance UI Customer '+suffix;
    const bankRef='BANK-UI-'+suffix;

    const customer=await postJson(request,'/api/customers',{
      name:customerName,
      english_name:customerName,
      country:'Germany',
      city:'Hamburg',
      industry:'Industrial Equipment',
      customer_types:['Importer'],
      status:'following',
      grade:'B',
      source:'Playwright Finance UI',
      language:'English',
      timezone:'Europe/Berlin'
    },manager.headers);

    const payment=await postJson(request,'/api/payments',{
      customer_id:customer.id,
      order_id:null,
      type:'balance',
      amount:4321.55,
      currency:'USD',
      due_at:new Date(Date.now()-86400000).toISOString(),
      paid_at:null,
      status:'pending',
      bank_ref:null,
      notes:'Created for browser finance acceptance'
    },manager.headers);

    await authenticatePage(page,request,'demo.finance');
    await page.goto('/#/finance');
    await expect(page.getByRole('heading',{name:'回款与信用'})).toBeVisible();

    let row=page.getByRole('row',{name:new RegExp(customerName)});
    await expect(row).toBeVisible();
    await expect(row.getByText('pending',{exact:true})).toBeVisible();
    await row.getByRole('button',{name:'登记到账'}).click();

    const dialog=page.getByRole('dialog',{name:'登记到账'});
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('银行流水号').fill(bankRef);
    await dialog.getByRole('button',{name:'确认到账'}).click();

    await expect(page.getByText('到账已登记')).toBeVisible();
    row=page.getByRole('row',{name:new RegExp(customerName)});
    await expect(row.getByText('paid',{exact:true})).toBeVisible();
    await expect(row.getByText(bankRef,{exact:true})).toBeVisible();

    const finance=await loginApi(request,'demo.finance');
    const payments=await getJson(request,'/api/payments?size=500',finance.headers);
    const refreshed=payments.data.find(x=>x.id===payment.id);
    expect(refreshed).toBeTruthy();
    expect(refreshed.status).toBe('paid');
    expect(refreshed.bank_ref).toBe(bankRef);
    expect(refreshed.paid_at).toBeTruthy();
  });
});

test.describe('TradeFlow aftersales knowledge UI loop',()=>{
  test('manager applies a recommended knowledge solution and publishes a new article from the resolved ticket',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const ticketNo='AS-UI-'+suffix;
    const subject='Servo drive commissioning alarm UI '+suffix;

    const customers=await getJson(request,'/api/customers?keyword=Nordstern&size=20',manager.headers);
    const customer=customers.data.find(x=>x.name==='Nordstern Technik GmbH');
    expect(customer).toBeTruthy();

    const ticket=await postJson(request,'/api/aftersales',{
      ticket_no:ticketNo,
      customer_id:customer.id,
      order_id:null,
      category:'quality',
      severity:'normal',
      subject,
      description:'Browser acceptance ticket requiring reuse of a known commissioning solution.',
      responsible_team:'Quality',
      solution:'',
      status:'open',
      satisfaction:null,
      opened_at:new Date().toISOString(),
      closed_at:null
    },manager.headers);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/aftersales');
    await expect(page.getByRole('heading',{name:'售后与投诉'})).toBeVisible();

    const row=page.getByRole('row',{name:new RegExp(ticketNo)});
    await expect(row).toBeVisible();
    await row.getByRole('button',{name:'详情'}).click();

    const drawer=page.getByRole('dialog',{name:'售后工单详情'});
    await expect(drawer).toBeVisible();
    const recommendation=drawer.getByRole('row',{name:/Servo drive commissioning alarm troubleshooting/});
    await expect(recommendation).toBeVisible();
    await recommendation.getByRole('button',{name:'应用方案'}).click();

    await expect(page.getByText('历史方案已应用到当前工单，请结合实际情况确认后再保存/结案')).toBeVisible();
    const solution=drawer.getByLabel('解决方案');
    await expect(solution).toHaveValue(/Firmware parameter mismatch/);

    const statusInput=drawer.getByLabel('工单状态');
    await expect(statusInput).toBeVisible();
    const statusSelect=statusInput.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " el-select ")][1]');
    await statusSelect.click();
    await page.getByRole('option',{name:'resolved',exact:true}).click();
    await expect(drawer.getByRole('button',{name:'更新状态'})).toBeEnabled();
    await drawer.getByRole('button',{name:'更新状态'}).click();
    await expect(page.getByText('工单状态已更新')).toBeVisible();

    await expect.poll(async()=>{
      const response=await request.get(`/api/workflows/aftersales/${ticket.id}/full`,{headers:manager.headers});
      if(!response.ok())return 'http-'+response.status();
      return (await response.json()).status;
    },{message:'aftersales status must persist as resolved',timeout:10000}).toBe('resolved');

    await expect(statusSelect).toContainText('resolved');
    await expect(drawer.getByRole('button',{name:'沉淀为知识'})).toBeVisible();
    await drawer.getByRole('button',{name:'沉淀为知识'}).click();

    const knowledgeDialog=page.getByRole('dialog',{name:'将已解决工单沉淀为知识'});
    await expect(knowledgeDialog).toBeVisible();
    await expect(knowledgeDialog.getByLabel('知识标题')).toHaveValue(subject);
    await knowledgeDialog.locator('label.el-radio').filter({hasText:'直接发布'}).click();
    await knowledgeDialog.getByRole('button',{name:'确认沉淀'}).click();

    await expect(page.getByText('已发布到售后知识库')).toBeVisible();

    await page.goto('/#/knowledge');
    await expect(page.getByRole('heading',{name:'售后知识库'})).toBeVisible();
    await expect(page.getByRole('row',{name:new RegExp(subject)})).toBeVisible();

    const full=await getJson(request,`/api/workflows/aftersales/${ticket.id}/full`,manager.headers);
    expect(full.status).toBe('resolved');
    expect(full.solution).toContain('Firmware parameter mismatch');
  });
});
