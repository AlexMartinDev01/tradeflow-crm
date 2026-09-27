import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson,postJson} from './helpers.mjs';

async function createCustomer(request,headers,name){
  return postJson(request,'/api/customers',{
    name,english_name:name,country:'Germany',city:'Berlin',industry:'Industrial Automation',
    customer_types:['Importer'],status:'potential',grade:'B',source:'Playwright Recovery'
  },headers);
}

test.describe('TradeFlow recycle and recovery browser workflow',()=>{
  test('manager restores a soft-deleted customer from recycle bin',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const name='Recycle E2E '+Date.now();
    const customer=await createCustomer(request,manager.headers,name);

    const deleted=await request.delete('/api/customers/'+customer.id,{headers:manager.headers});
    expect(deleted.status()).toBe(200);

    const hidden=await request.get('/api/customers/'+customer.id,{headers:manager.headers});
    expect(hidden.status()).toBe(404);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/recycle-bin/customers');
    await expect(page.getByRole('heading',{name:'客户回收站'})).toBeVisible();
    const row=page.getByRole('row',{name:new RegExp(name)});
    await expect(row).toBeVisible();
    await row.getByRole('button',{name:'查看'}).click();

    const drawer=page.getByText('删除影响与恢复').locator('..');
    await expect(page.getByRole('button',{name:'恢复客户'})).toBeVisible();
    await page.getByRole('button',{name:'恢复客户'}).click();
    const confirmBox=page.locator('.el-message-box');
    await expect(confirmBox).toBeVisible();
    await confirmBox.locator('.el-button--primary').click();
    await expect(page.getByText('客户已恢复')).toBeVisible();

    const restored=await getJson(request,'/api/customers/'+customer.id,manager.headers);
    expect(restored.name).toBe(name);
    expect(restored.deleted_at??null).toBeNull();
  });
});

test.describe('TradeFlow Excel import and export browser workflow',()=>{
  test('manager previews and commits CSV customer import, then exports XLSX',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const name='Excel E2E Customer '+suffix;
    const csv='name,country,city,website,industry\n'+name+',Germany,Berlin,https://excel-'+suffix+'.example.com,Industrial Automation\n';

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/data/excel');
    await expect(page.getByRole('heading',{name:'Excel 导入 / 导出'})).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name:'e2e-import-'+suffix+'.csv',
      mimeType:'text/csv',
      buffer:Buffer.from(csv,'utf8')
    });
    await expect(page.getByText(/已选择：e2e-import-/)).toBeVisible();
    const previewResponse=page.waitForResponse(r=>r.url().includes('/api/customers/import/preview')&&r.request().method()==='POST'&&r.status()===200);
    await page.getByRole('button',{name:'预检数据'}).click();
    await previewResponse;
    await expect(page.getByRole('row',{name:new RegExp(name)})).toBeVisible();
    await expect(page.getByText(/可新增 1/)).toBeVisible();

    await page.getByRole('button',{name:'执行正式导入'}).click();
    await expect(page.getByText(/导入完成：新增 1/)).toBeVisible();

    const customers=await getJson(request,'/api/customers?keyword='+encodeURIComponent(name)+'&size=50',manager.headers);
    expect(customers.data.some(x=>x.name===name)).toBeTruthy();

    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'导出 Excel'}).click();
    const download=await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^客户数据_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

test.describe('TradeFlow backup, integrity and operations safety',()=>{
  test('admin creates and downloads a consistent SQLite backup from UI',async({page,request})=>{
    await authenticatePage(page,request,'demo.admin');
    await page.goto('/#/settings/backups');
    await expect(page.getByRole('heading',{name:'数据库备份'})).toBeVisible();

    await page.getByRole('button',{name:'立即创建备份'}).click();
    await expect(page.getByText(/备份已创建：tradeflow-manual-/)).toBeVisible();

    const manualRow=page.getByRole('row').filter({hasText:'手工'}).first();
    await expect(manualRow).toBeVisible();
    const downloadPromise=page.waitForEvent('download');
    await manualRow.getByRole('button',{name:'下载'}).click();
    const download=await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^tradeflow-manual-.*\.sqlite$/);

    const admin=await loginApi(request,'demo.admin');
    const backups=await getJson(request,'/api/backups',admin.headers);
    expect(backups.rows.some(x=>x.kind==='manual'&&Number(x.size_bytes)>0)).toBeTruthy();
  });

  test('admin runs attachment integrity and SQLite quick check through UI',async({page,request})=>{
    await authenticatePage(page,request,'demo.admin');

    await page.goto('/#/settings/attachment-backup');
    await expect(page.getByRole('heading',{name:'附件完整性与备份'})).toBeVisible();
    await page.getByRole('button',{name:'快速检查'}).click();
    await expect(page.getByText('快速附件检查通过')).toBeVisible();

    await page.goto('/#/settings/ops');
    await expect(page.getByRole('heading',{name:'运行监控'})).toBeVisible();
    await page.getByRole('button',{name:'数据库完整性检查'}).click();
    await expect(page.getByText('SQLite quick_check：正常')).toBeVisible();
  });
});

test.describe('TradeFlow integration configuration and audit trail',()=>{
  test('manager creates integration config and action is persisted and audited',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const name='E2E Webhook '+suffix;

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/integrations');
    await page.getByRole('button',{name:'新增集成'}).click();
    const dialog=page.getByRole('dialog',{name:'新增集成'});
    await dialog.getByLabel('名称').fill(name);
    await dialog.getByLabel('Endpoint / Base URL').fill('https://example.com/tradeflow-e2e/'+suffix);
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await expect(page.getByRole('row',{name:new RegExp(name)})).toBeVisible();

    const integrations=await getJson(request,'/api/integrations',manager.headers);
    const saved=integrations.find(x=>x.name===name);
    expect(saved).toBeTruthy();
    expect(saved.type).toBe('webhook');

    const audit=await getJson(request,'/api/audit',manager.headers);
    expect(audit.some(x=>x.action==='create'&&x.entity_type==='integration'&&x.entity_id===saved.id)).toBeTruthy();
  });
});
