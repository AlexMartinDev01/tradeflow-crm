import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson,postJson} from './helpers.mjs';

async function chooseSelect(page,combobox,label){
  const root=combobox.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' el-select ')][1]");
  await root.locator('.el-select__wrapper').click();
  if(await combobox.isEditable())await combobox.fill(label);
  await page.getByRole('option',{name:label,exact:true}).click();
}

async function createCustomer(request,headers,name,extra={}){
  return postJson(request,'/api/customers',{
    name,
    english_name:name,
    country:'Germany',
    city:'Hamburg',
    industry:'Industrial Automation',
    customer_types:['Importer','Distributor'],
    status:'following',
    grade:'B',
    source:'Governance E2E',
    language:'English',
    timezone:'Europe/Berlin',
    business_scope:'Browser governance acceptance customer',
    ...extra
  },headers);
}

test.describe('TradeFlow customer governance UI',()=>{
  test('manager bulk previews and applies changes to the complete filtered result',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const prefix='Bulk Governance '+suffix;
    const updatedSource='Bulk Updated '+suffix;

    const first=await createCustomer(request,manager.headers,prefix+' A');
    const second=await createCustomer(request,manager.headers,prefix+' B');
    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/customers');
    await expect(page.getByRole('heading',{name:'客户360°'})).toBeVisible();

    const keyword=page.getByPlaceholder('客户名 / 官网 / 税号 / 注册号 / 主营业务');
    await keyword.fill(prefix);
    await page.getByRole('button',{name:'应用筛选'}).click();
    await expect(page.getByText('当前条件共 2 个客户')).toBeVisible();

    await page.getByRole('button',{name:/批量操作/}).click();
    const dialog=page.getByRole('dialog',{name:'客户批量操作'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/当前完整筛选结果（2）/)).toBeVisible();

    await chooseSelect(page,dialog.getByLabel('批量修改客户等级'),'A');
    await dialog.getByLabel('修改来源').fill(updatedSource);
    await dialog.getByRole('button',{name:'重新预览'}).click();

    await expect(dialog.getByText('预览确认',{exact:true})).toBeVisible();
    await expect(dialog.getByText(/将影响 2 个客户/)).toBeVisible();
    await dialog.getByRole('button',{name:'确认执行'}).click();

    const confirm=page.getByRole('dialog',{name:'确认批量修改'});
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button',{name:'确认执行'}).click();
    await expect(page.getByText('已完成 2 个客户的批量修改')).toBeVisible();

    const result=await getJson(request,'/api/customers?keyword='+encodeURIComponent(prefix)+'&size=20',manager.headers);
    expect(result.data).toHaveLength(2);
    for(const customer of result.data){
      expect(customer.grade).toBe('A');
      expect(customer.source).toBe(updatedSource);
    }
  });

  test('data quality center surfaces an incomplete customer and navigates to remediation',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const name='Incomplete Governance '+suffix;
    const customer=await postJson(request,'/api/customers',{
      name,
      english_name:name,
      customer_types:['Importer'],
      status:'potential',
      grade:'C'
    },manager.headers);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/data-quality');
    await expect(page.getByRole('heading',{name:'客户数据质量中心'})).toBeVisible();

    const row=page.getByRole('row',{name:new RegExp(name)});
    await expect(row).toBeVisible();
    await expect(row.getByText('国家缺失',{exact:true})).toBeVisible();
    await expect(row.getByText('无有效联系人',{exact:true})).toBeVisible();

    await row.getByRole('button',{name:'去完善'}).click();
    await expect(page).toHaveURL(new RegExp('#/customers/'+customer.id));
  });
});

test.describe('TradeFlow custom BI browser workflow',()=>{
  test('manager runs and saves a report definition from the real UI',async({page,request})=>{
    const suffix=Date.now().toString().slice(-8);
    const reportName='UI Saved BI '+suffix;

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/reports');
    await expect(page.getByRole('heading',{name:'自定义报表设计器'})).toBeVisible();

    await page.getByRole('button',{name:'运行报表'}).click();
    await expect(page.getByText(/共 \d+ 个分组/)).toBeVisible();

    await page.getByRole('button',{name:'保存为报表'}).click();
    const dialog=page.getByRole('dialog',{name:'保存报表定义'});
    await dialog.getByLabel('报表名称').fill(reportName);
    await dialog.getByRole('button',{name:'保存'}).click();

    await expect(page.getByText('报表定义已保存')).toBeVisible();
    await expect(page.getByText(reportName,{exact:true})).toBeVisible();

    const saved=page.getByText(reportName,{exact:true}).locator('xpath=ancestor::div[contains(@style,"border-bottom")][1]');
    await saved.getByRole('button',{name:'打开'}).click();
    await expect(page.getByText(/共 \d+ 个分组/)).toBeVisible();
  });
});

test.describe('TradeFlow configurable automation browser workflow',()=>{
  test('manager previews and saves a safe custom automation rule',async({page,request})=>{
    const suffix=Date.now().toString().slice(-8);
    const ruleName='UI Following Reminder '+suffix;

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/automation');
    await expect(page.getByRole('heading',{name:'自动化与提醒'})).toBeVisible();

    await page.getByRole('button',{name:'新建自定义规则'}).click();
    const dialog=page.getByRole('dialog',{name:'新建自定义自动化规则'});
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('规则名称').fill(ruleName);
    await dialog.getByLabel('自动化条件值').fill('following');
    await dialog.getByRole('button',{name:'预览命中'}).click();

    await expect(dialog.getByText('规则预览')).toBeVisible();
    await expect(dialog.getByText(/当前命中 \d+ 条/)).toBeVisible();
    await dialog.getByRole('button',{name:'保存规则'}).click();

    await expect(page.getByText('自定义自动化规则已保存')).toBeVisible();
    await page.getByRole('tab',{name:'自定义规则'}).click();
    await expect(page.getByRole('row',{name:new RegExp(ruleName)})).toBeVisible();
  });
});
