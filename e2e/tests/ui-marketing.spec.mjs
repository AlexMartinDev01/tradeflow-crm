import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson,postJson} from './helpers.mjs';

async function choose(page,select,label){
  await select.locator('.el-select__wrapper').click();
  const input=select.getByRole('combobox');
  if(await input.isEditable())await input.fill(label);
  await page.getByRole('option',{name:label,exact:true}).click();
}

test.describe('TradeFlow marketing local workflow acceptance',()=>{
  test('manager builds segment, template and campaign, prepares recipients and records external send',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const fixtureName='Marketing Fixture '+suffix;
    const uniqueSource='Marketing UI '+suffix;
    const segmentName='Unique Source Segment '+suffix;
    const templateName='Q4 Demo Template '+suffix;
    const campaignName='Isolated Q4 Campaign '+suffix;

    const customer=await postJson(request,'/api/customers',{
      name:fixtureName,
      english_name:fixtureName,
      country:'Iceland',
      city:'Reykjavik',
      industry:'Industrial Automation',
      customer_types:['Importer'],
      status:'following',
      grade:'B',
      source:uniqueSource,
      language:'English',
      timezone:'Atlantic/Reykjavik'
    },manager.headers);
    const contact=await postJson(request,'/api/contacts',{
      customer_id:customer.id,
      name:'Marketing Buyer '+suffix,
      title:'Procurement Manager',
      department:'Procurement',
      role:'Decision Maker',
      is_primary:1,
      is_departed:0
    },manager.headers);
    await postJson(request,'/api/channels',{
      contact_id:contact.id,
      channel:'email',
      value:'marketing-'+suffix+'@example.com',
      label:'E2E marketing email',
      is_primary:1
    },manager.headers);
    await postJson(request,'/api/marketing/consent',{
      customer_id:customer.id,
      contact_id:contact.id,
      channel:'email',
      status:'opt_in',
      source:'e2e-marketing-fixture'
    },manager.headers,[200]);

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/marketing');
    await expect(page.getByRole('heading',{name:'客户营销'})).toBeVisible();

    await page.getByRole('tab',{name:'客户分群'}).click();
    await page.getByRole('button',{name:'新建分群'}).click();
    const segmentDialog=page.getByRole('dialog',{name:'新建动态客户分群'});
    await segmentDialog.getByLabel('分群名称').fill(segmentName);
    await choose(page,segmentDialog.getByTestId('segment-source'),uniqueSource);
    await segmentDialog.getByRole('button',{name:'先预览匹配客户'}).click();

    const previewDialog=page.getByRole('dialog',{name:'分群预览'});
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByRole('row',{name:new RegExp(fixtureName)})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(previewDialog).toBeHidden();
    await segmentDialog.getByRole('button',{name:'保存分群'}).click();
    await expect(page.getByText('客户分群已保存')).toBeVisible();

    const segments=await getJson(request,'/api/marketing/segments',manager.headers);
    const savedSegment=segments.find(x=>x.name===segmentName);
    expect(savedSegment).toBeTruthy();

    await page.getByRole('tab',{name:'邮件模板'}).click();
    await page.getByRole('button',{name:'新建模板'}).click();
    const templateDialog=page.getByRole('dialog',{name:'新建邮件模板'});
    await templateDialog.getByLabel('模板名称').fill(templateName);
    await templateDialog.getByLabel('主题').fill('Automation update for {{customer_name}}');
    await templateDialog.getByLabel('正文').fill('Hello {{contact_name}}, this is an E2E marketing workflow for {{customer_name}}.');
    await templateDialog.getByRole('button',{name:'保存模板'}).click();
    await expect(page.getByText('邮件模板已保存')).toBeVisible();

    const templates=await getJson(request,'/api/marketing/templates',manager.headers);
    const savedTemplate=templates.find(x=>x.name===templateName);
    expect(savedTemplate).toBeTruthy();

    await page.getByRole('tab',{name:'营销活动'}).click();
    await page.getByRole('button',{name:'新建活动'}).click();
    const campaignDialog=page.getByRole('dialog',{name:'新建营销活动'});
    await campaignDialog.getByLabel('活动名称').fill(campaignName);
    await choose(page,campaignDialog.getByTestId('campaign-segment'),segmentName);
    await choose(page,campaignDialog.getByTestId('campaign-template'),templateName);
    await campaignDialog.getByLabel('邮件主题').fill('E2E Q4 update');
    await campaignDialog.getByRole('button',{name:'保存活动'}).click();
    await expect(page.getByText('营销活动已创建')).toBeVisible();

    let campaignRow=page.getByRole('row',{name:new RegExp(campaignName)});
    await expect(campaignRow).toBeVisible();
    await campaignRow.getByRole('button',{name:'准备名单'}).click();

    campaignRow=page.getByRole('row',{name:new RegExp(campaignName)});
    await expect(campaignRow.getByText('prepared',{exact:true})).toBeVisible();

    const campaigns=await getJson(request,'/api/campaigns?size=500',manager.headers);
    const savedCampaign=campaigns.data.find(x=>x.name===campaignName);
    expect(savedCampaign).toBeTruthy();
    const preparedRecipients=await getJson(request,'/api/marketing/campaigns/'+savedCampaign.id+'/recipients',manager.headers);
    expect(preparedRecipients).toHaveLength(1);
    expect(preparedRecipients[0].customer_id).toBe(customer.id);
    expect(preparedRecipients[0].status).toBe('prepared');

    await campaignRow.getByRole('button',{name:'收件人'}).click();
    const recipientsDialog=page.getByRole('dialog',{name:'营销收件人'});
    await expect(recipientsDialog).toBeVisible();
    const fixtureRow=recipientsDialog.getByRole('row',{name:new RegExp(fixtureName)});
    await expect(fixtureRow).toBeVisible();
    await expect(fixtureRow.getByText('prepared',{exact:true})).toBeVisible();

    await fixtureRow.getByRole('button',{name:'标记外部已发送'}).click();
    await expect(page.getByText('已记录外部发送')).toBeVisible();
    await expect(recipientsDialog.getByRole('row',{name:new RegExp(fixtureName)}).getByText('sent',{exact:true})).toBeVisible();

    const stats=await getJson(request,'/api/marketing/campaigns/'+savedCampaign.id+'/stats',manager.headers);
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(stats.sent).toBeGreaterThanOrEqual(1);

    const recipientList=await getJson(request,'/api/marketing/campaigns/'+savedCampaign.id+'/recipients',manager.headers);
    expect(recipientList).toHaveLength(1);
    const fixtureRecipient=recipientList[0];
    expect(fixtureRecipient.customer_id).toBe(customer.id);

    await postJson(request,'/api/marketing/consent',{
      customer_id:fixtureRecipient.customer_id,
      contact_id:fixtureRecipient.contact_id,
      channel:'email',
      status:'opt_out',
      source:'e2e-consent'
    },manager.headers,[200]);

    const second=await postJson(request,'/api/campaigns',{
      name:'Consent Recheck '+suffix,
      type:'email',
      segment_id:savedSegment.id,
      template_id:savedTemplate.id,
      subject:'Consent recheck',
      content:'Should be skipped after opt-out',
      status:'draft'
    },manager.headers);
    const secondPrep=await postJson(request,'/api/marketing/campaigns/'+second.id+'/prepare',{},manager.headers,[200]);
    expect(secondPrep.prepared).toBe(0);
    expect(secondPrep.skipped).toBe(1);
    expect(secondPrep.total).toBe(1);
  });

  test('sales cannot enter management-only marketing workbench',async({page,request})=>{
    await authenticatePage(page,request,'demo.sales01');
    await page.goto('/#/marketing');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading',{name:'经营概览'})).toBeVisible();
  });
});

test.describe('TradeFlow marketing mobile acceptance',()=>{
  test.use({viewport:{width:390,height:844}});

  test('marketing tabs and campaign table do not create document-level horizontal overflow',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/marketing');
    await expect(page.getByRole('heading',{name:'客户营销'})).toBeVisible();
    for(const tab of ['营销活动','客户分群','邮件模板']){
      await page.getByRole('tab',{name:tab}).click();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      expect(overflow,tab+' must not overflow phone viewport').toBeLessThanOrEqual(2);
    }
  });
});
