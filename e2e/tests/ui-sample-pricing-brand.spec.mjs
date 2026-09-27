import {test,expect} from '@playwright/test';
import {authenticatePage,loginApi,getJson,postJson} from './helpers.mjs';

async function createOwnedCustomer(request,managerHeaders,ownerId,prefix){
  const suffix=Date.now().toString().slice(-8)+Math.random().toString(16).slice(2,5);
  return postJson(request,'/api/customers',{
    name:prefix+' '+suffix,
    english_name:prefix+' '+suffix,
    country:'Germany',
    city:'Hamburg',
    industry:'Industrial Distribution',
    customer_types:['Importer','Distributor'],
    status:'following',
    grade:'B',
    source:'Playwright UI',
    language:'English',
    timezone:'Europe/Berlin',
    owner_id:ownerId
  },managerHeaders);
}

async function selectElementOption(page,control,label){
  await control.click();
  await control.fill(label);
  await page.getByRole('option',{name:label,exact:true}).click();
}

test.describe('TradeFlow sample workbench browser and RBAC acceptance',()=>{
  test('sales creates, ships, delivers and records feedback for a sample through real UI',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const sales=await loginApi(request,'demo.sales01');
    const customer=await createOwnedCustomer(request,manager.headers,sales.user.id,'Sample UI Customer');
    const suffix=Date.now().toString().slice(-7);
    const product='UI Validation Sample '+suffix;
    const tracking='DHL-UI-'+suffix;
    const feedback='Customer accepted specification and requested commercial quotation '+suffix;

    await authenticatePage(page,request,'demo.sales01');
    await page.goto('/#/sales/samples');
    await expect(page.getByRole('heading',{name:'样品管理'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增样品'})).toBeVisible();

    await page.getByRole('button',{name:'新增样品'}).click();
    const dialog=page.getByRole('dialog',{name:'新增样品申请'});
    await expect(dialog).toBeVisible();
    await selectElementOption(page,dialog.getByLabel('客户'),customer.name);
    await dialog.getByLabel('产品').fill(product);
    await dialog.getByLabel('数量').fill('2 sets');
    await dialog.getByLabel('快递公司').fill('DHL');
    await dialog.getByLabel('运单号').fill(tracking);
    await dialog.getByRole('button',{name:'保存',exact:true}).click();

    await expect(page.getByText('样品申请已创建')).toBeVisible();
    let row=page.getByRole('row',{name:new RegExp(tracking)});
    await expect(row).toBeVisible();
    await row.getByRole('button',{name:'标记寄出'}).click();
    await expect(page.getByText('已标记寄出')).toBeVisible();

    row=page.getByRole('row',{name:new RegExp(tracking)});
    await expect(row.getByText('sent',{exact:true})).toBeVisible();
    await row.getByRole('button',{name:'确认签收'}).click();
    await expect(page.getByText(/已签收，并自动创建任务/)).toBeVisible();

    row=page.getByRole('row',{name:new RegExp(tracking)});
    await expect(row.getByText('delivered',{exact:true})).toBeVisible();
    await row.getByRole('button',{name:'反馈'}).click();
    const feedbackDialog=page.getByRole('dialog',{name:'记录样品反馈'});
    await feedbackDialog.getByPlaceholder('质量、规格、包装、价格、客户试用结论及下一步').fill(feedback);
    await feedbackDialog.getByRole('button',{name:'保存反馈'}).click();
    await expect(page.getByText('样品反馈已保存')).toBeVisible();

    const samples=await getJson(request,'/api/samples?size=500',sales.headers);
    const saved=samples.data.find(x=>x.tracking_no===tracking);
    expect(saved).toBeTruthy();
    expect(saved.status).toBe('feedback');
    expect(saved.feedback).toBe(feedback);
    expect(saved.delivered_at).toBeTruthy();

    const tasks=await getJson(request,'/api/tasks?customer_id='+customer.id+'&size=500',sales.headers);
    expect(tasks.data.filter(x=>x.automation_key==='sample-feedback:'+saved.id)).toHaveLength(1);
  });

  test('readonly sees sample data but no sample mutation controls',async({page,request})=>{
    await authenticatePage(page,request,'demo.readonly');
    await page.goto('/#/sales/samples');
    await expect(page.getByRole('heading',{name:'样品管理'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增样品'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'标记寄出'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'确认签收'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'反馈'})).toHaveCount(0);
  });
});

test.describe('TradeFlow pricing workbench browser and RBAC acceptance',()=>{
  test('sales resolves a real customer price and maintains customer-product preference only',async({page,request})=>{
    const sales=await loginApi(request,'demo.sales01');
    await authenticatePage(page,request,'demo.sales01');
    await page.goto('/#/products-pricing');
    await expect(page.getByRole('heading',{name:'产品与价格'})).toBeVisible();

    await expect(page.getByRole('button',{name:'新增产品'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'新增价目表'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'新增规则'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'新增关系'})).toBeVisible();

    const customerSelect=page.getByPlaceholder('选择客户');
    await selectElementOption(page,customerSelect,'Nordstern Technik GmbH');
    const productSelect=page.getByPlaceholder('选择产品');
    await productSelect.click();
    await productSelect.fill('SD500 Servo Drive');
    await page.getByRole('option',{name:/SD500 Servo Drive/}).click();

    await page.getByRole('button',{name:'解析当前价格'}).click();
    const priceDialog=page.getByRole('dialog',{name:'价格解析结果'});
    await expect(priceDialog).toBeVisible();
    await expect(priceDialog.getByText('Nordstern Technik GmbH',{exact:true})).toBeVisible();
    await expect(priceDialog.getByText('SD500 Servo Drive',{exact:true})).toBeVisible();
    await expect(priceDialog.getByText(/customer_price_list/)).toBeVisible();
    await page.keyboard.press('Escape');

    const note='UI pricing preference '+Date.now();
    await page.getByRole('tab',{name:'客户产品偏好'}).click();
    await page.getByRole('button',{name:'新增关系'}).click();
    const prefDialog=page.getByRole('dialog',{name:'客户产品关系'});
    await selectElementOption(page,prefDialog.getByLabel('客户'),'Nordstern Technik GmbH');
    await selectElementOption(page,prefDialog.getByLabel('产品'),'SV220 Smart Valve');
    await prefDialog.getByLabel('备注').fill(note);
    await prefDialog.getByRole('button',{name:'保存',exact:true}).click();
    await expect(page.getByText('客户产品关系已保存')).toBeVisible();
    await expect(page.getByRole('row',{name:new RegExp('Nordstern Technik GmbH.*SV220 Smart Valve')})).toBeVisible();

    const preferences=await getJson(request,'/api/customerProductPreferences?size=500',sales.headers);
    expect(preferences.data.some(x=>x.customer_id&&x.product_id&&x.notes===note)).toBeTruthy();
  });

  test('readonly can inspect pricing but cannot see product or preference mutation controls',async({page,request})=>{
    await authenticatePage(page,request,'demo.readonly');
    await page.goto('/#/products-pricing');
    await expect(page.getByRole('heading',{name:'产品与价格'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增产品'})).toHaveCount(0);
    await page.getByRole('tab',{name:'客户产品偏好'}).click();
    await expect(page.getByRole('button',{name:'新增关系'})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'删除'})).toHaveCount(0);
    await page.getByRole('tab',{name:'价目表 / 阶梯价'}).click();
    await expect(page.getByRole('button',{name:'新增价目表'})).toHaveCount(0);
    await page.getByRole('tab',{name:'市场规则'}).click();
    await expect(page.getByRole('button',{name:'新增规则'})).toHaveCount(0);
  });
});

test.describe('TradeFlow brand channel workbench browser and integrity acceptance',()=>{
  test('manager creates a channel relation and backend blocks a distribution cycle',async({page,request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-7);
    const brand=await postJson(request,'/api/brands',{
      name:'UI Channel Brand '+suffix,
      country:'Germany',
      group_name:'E2E Group',
      main_products:'Automation',
      positioning:'Test'
    },manager.headers);
    const upstream=await createOwnedCustomer(request,manager.headers,manager.user.id,'UI Channel Upstream');
    const downstream=await createOwnedCustomer(request,manager.headers,manager.user.id,'UI Channel Downstream');

    await authenticatePage(page,request,'demo.manager');
    await page.goto('/#/brands-channels');
    await expect(page.getByRole('heading',{name:'品牌与渠道网络'})).toBeVisible();
    await page.getByRole('tab',{name:'渠道网络'}).click();

    const brandSelect=page.getByPlaceholder('选择品牌');
    await selectElementOption(page,brandSelect,brand.name);
    await page.getByRole('button',{name:'新增渠道关系'}).click();
    const dialog=page.getByRole('dialog',{name:'新增渠道关系'});
    await selectElementOption(page,dialog.getByLabel('下游客户'),upstream.name);
    await dialog.getByLabel('授权/销售区域').fill('Germany E2E '+suffix);
    await dialog.getByRole('button',{name:'保存',exact:true}).click();
    await expect(page.getByText('渠道关系已保存')).toBeVisible();
    await expect(page.getByRole('row',{name:new RegExp(upstream.name)})).toBeVisible();

    const edge2=await postJson(request,'/api/channel-network',{
      brand_id:brand.id,
      upstream_customer_id:upstream.id,
      downstream_customer_id:downstream.id,
      relationship_type:'distributor',
      channel_level:2,
      territory:'Germany South',
      status:'active'
    },manager.headers);
    expect(edge2.id).toBeTruthy();

    const cycle=await request.post('/api/channel-network',{headers:manager.headers,data:{
      brand_id:brand.id,
      upstream_customer_id:downstream.id,
      downstream_customer_id:upstream.id,
      relationship_type:'sub_distributor',
      channel_level:3,
      territory:'Invalid cycle',
      status:'active'
    }});
    expect(cycle.status()).toBe(409);
    expect((await cycle.json()).error).toBe('channel_cycle');
  });

  test('sales can inspect brand network but cannot see brand/channel management controls',async({page,request})=>{
    await authenticatePage(page,request,'demo.sales01');
    await page.goto('/#/brands-channels');
    await expect(page.getByRole('heading',{name:'品牌与渠道网络'})).toBeVisible();
    await expect(page.getByRole('button',{name:'新增品牌'})).toHaveCount(0);
    await page.getByRole('tab',{name:'渠道网络'}).click();
    await expect(page.getByRole('button',{name:'新增渠道关系'})).toHaveCount(0);
  });
});

test.describe('TradeFlow sample pricing brand mobile acceptance',()=>{
  test.use({viewport:{width:390,height:844}});

  async function expectNoOverflow(page,label){
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(overflow,label+' must not create document-level horizontal overflow').toBeLessThanOrEqual(2);
  }

  test('sample pricing and brand workbenches remain inside phone viewport',async({page,request})=>{
    await authenticatePage(page,request,'demo.manager');
    for(const [route,heading] of [
      ['/#/sales/samples','样品管理'],
      ['/#/products-pricing','产品与价格'],
      ['/#/brands-channels','品牌与渠道网络']
    ]){
      await page.goto(route);
      await expect(page.getByRole('heading',{name:heading})).toBeVisible();
      await expectNoOverflow(page,heading);
    }
  });
});
