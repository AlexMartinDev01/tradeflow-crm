import {test,expect} from '@playwright/test';
import {loginApi,getJson,postJson} from './helpers.mjs';

test.describe('TradeFlow governance and operations',()=>{
  test('customer bulk preview/apply is scoped, auditable and single-use',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);

    const customer=await postJson(request,'/api/customers',{
      name:'Bulk Governance E2E '+suffix,
      customer_types:['Importer'],
      status:'potential',
      grade:'C',
      source:'E2E Bulk',
      country:'Germany'
    },manager.headers);

    const tags=await getJson(request,'/api/tags?size=200',manager.headers);
    expect(tags.data.length).toBeGreaterThan(0);
    const tag=tags.data[0];

    const preview=await postJson(request,'/api/customers/bulk/preview',{
      ids:[customer.id],
      operations:{
        set:{status:'following',grade:'A',source:'Bulk Verified'},
        add_tag_ids:[tag.id],
        remove_tag_ids:[]
      }
    },manager.headers);
    expect(preview.count).toBe(1);
    expect(preview.preview_id).toBeTruthy();
    expect(preview.sample[0].id).toBe(customer.id);

    const applied=await postJson(request,'/api/customers/bulk/apply',{preview_id:preview.preview_id},manager.headers);
    expect(applied.ok).toBe(true);
    expect(applied.count).toBe(1);

    const updated=await getJson(request,'/api/customers/'+customer.id,manager.headers);
    expect(updated.status).toBe('following');
    expect(updated.grade).toBe('A');
    expect(updated.source).toBe('Bulk Verified');

    const reused=await request.post('/api/customers/bulk/apply',{headers:manager.headers,data:{preview_id:preview.preview_id}});
    expect(reused.status()).toBe(409);
    expect((await reused.json()).error).toBe('bulk_preview_already_applied');
  });

  test('data quality summary respects the exact sales self scope',async({request})=>{
    const sales=await loginApi(request,'demo.sales01');
    const visible=await getJson(request,'/api/customers?size=500',sales.headers);
    const quality=await getJson(request,'/api/customers/data-quality',sales.headers);

    expect(visible.data.length).toBeGreaterThan(0);
    expect(quality.summary.total_customers).toBe(visible.data.length);
    for(const row of quality.data)expect(row.owner_id).toBe(sales.user.id);
  });

  test('custom reports persist, enforce currency safety and export CSV',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const name='E2E Revenue Report '+suffix;

    const blocked=await request.post('/api/reports/run',{headers:manager.headers,data:{
      entity_type:'orders',dimension:'month',metric:'total',chart_type:'bar',filters:{}
    }});
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).error).toBe('currency_filter_required');

    const created=await postJson(request,'/api/reports',{
      name,
      entity_type:'orders',
      dimension:'month',
      metric:'total',
      chart_type:'line',
      filters:{currency:'USD'},
      is_shared:true
    },manager.headers);
    expect(created.id).toBeTruthy();

    const list=await getJson(request,'/api/reports',manager.headers);
    const saved=list.find(x=>x.id===created.id);
    expect(saved).toBeTruthy();
    expect(saved.is_shared).toBe(1);

    const run=await postJson(request,'/api/reports/run',{
      entity_type:'orders',dimension:'month',metric:'total',chart_type:'line',filters:{currency:'USD'}
    },manager.headers);
    expect(run.rows.length).toBeGreaterThan(0);
    expect(run.total).toBeGreaterThan(0);

    const csv=await request.post('/api/reports/export',{headers:manager.headers,data:{
      entity_type:'orders',dimension:'month',metric:'total',chart_type:'table',filters:{currency:'USD'}
    }});
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    const body=await csv.text();
    expect(body).toContain('订单月份');
    expect(body).toContain('订单金额合计');

    const removed=await request.delete('/api/reports/'+created.id,{headers:manager.headers});
    expect(removed.status()).toBe(200);
    const after=await getJson(request,'/api/reports',manager.headers);
    expect(after.some(x=>x.id===created.id)).toBe(false);
  });

  test('custom automation can preview, execute and write an execution log',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const rule={
      name:'E2E Grade A Follow-up '+suffix,
      entity_type:'customers',
      enabled:false,
      conditions:[{field:'grade',operator:'eq',value:'A'}],
      actions:[{type:'create_task',title:'E2E follow up {name} '+suffix,description:'Automated acceptance task',priority:'normal',due_days:1}]
    };

    const preview=await postJson(request,'/api/automation/custom/preview',rule,manager.headers);
    expect(preview.total_scanned).toBeGreaterThan(0);
    expect(preview.matched_count).toBeGreaterThan(0);
    expect(preview.sample.length).toBeGreaterThan(0);

    const created=await postJson(request,'/api/automation/custom',rule,manager.headers);
    expect(created.id).toBeTruthy();

    const enabled=await request.patch('/api/automation/custom/'+created.id,{headers:manager.headers,data:{enabled:true}});
    expect(enabled.status()).toBe(200);

    const run=await postJson(request,'/api/automation/run',{},manager.headers);
    const custom=run.custom_rules.find(x=>x.id===created.id);
    expect(custom).toBeTruthy();
    expect(custom.matched).toBeGreaterThan(0);
    expect(custom.actions_applied).toBeGreaterThan(0);

    const logs=await getJson(request,'/api/automation/logs',manager.headers);
    expect(logs.some(x=>x.rule_key==='custom:'+created.id)).toBe(true);

    const removed=await request.delete('/api/automation/custom/'+created.id,{headers:manager.headers});
    expect(removed.status()).toBe(200);
  });

  test('published knowledge can be recommended and applied back to an aftersales ticket',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const tickets=await getJson(request,'/api/aftersales?size=100',manager.headers);
    const ticket=tickets.data.find(x=>x.category==='quality'&&x.status!=='closed')||tickets.data.find(x=>x.category==='quality');
    expect(ticket).toBeTruthy();

    const recommendations=await getJson(request,'/api/knowledge/recommend?ticket_id='+ticket.id,manager.headers);
    expect(recommendations.length).toBeGreaterThan(0);
    const article=recommendations[0];
    const before=Number(article.use_count||0);

    const applied=await postJson(request,'/api/knowledge/'+article.id+'/apply',{ticket_id:ticket.id},manager.headers);
    expect(applied.ok).toBe(true);
    expect(applied.solution).toBeTruthy();

    const full=await getJson(request,'/api/workflows/aftersales/'+ticket.id+'/full',manager.headers);
    expect(full.solution).toBe(article.content);

    const refreshed=await getJson(request,'/api/knowledge/'+article.id,manager.headers);
    expect(Number(refreshed.use_count||0)).toBe(before+1);
  });
});
