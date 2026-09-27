import {test,expect} from '@playwright/test';
import {loginApi,getJson,postJson,plusDays} from './helpers.mjs';

async function createCustomer(request,headers,prefix){
  const suffix=Date.now().toString().slice(-8)+Math.random().toString(16).slice(2,6);
  return postJson(request,'/api/customers',{
    name:prefix+' '+suffix,
    customer_types:['Importer'],
    status:'potential',
    grade:'B',
    country:'Germany',
    source:'E2E transaction'
  },headers);
}

async function createOrder(request,headers,customer,total=10000){
  return postJson(request,'/api/orders',{
    customer_id:customer.id,
    status:'confirmed',
    currency:'USD',
    incoterm:'FOB',
    payment_terms:'30/70',
    total,
    requested_delivery:plusDays(45),
    notes:'Transaction integrity E2E'
  },headers);
}

test.describe('TradeFlow transaction integrity and business invariants',()=>{
  test('concurrent payment-plan creation produces one plan and never duplicates receivables',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customer=await createCustomer(request,manager.headers,'Payment Plan Atomic');
    const order=await createOrder(request,manager.headers,customer,10000);

    const payload={deposit_percent:30,deposit_due:plusDays(3),balance_due:plusDays(30)};
    const [a,b]=await Promise.all([
      request.post('/api/workflows/orders/'+order.id+'/payment-plan',{headers:manager.headers,data:payload}),
      request.post('/api/workflows/orders/'+order.id+'/payment-plan',{headers:manager.headers,data:payload})
    ]);
    const statuses=[a.status(),b.status()].sort((x,y)=>x-y);
    expect(statuses).toEqual([201,409]);

    const payments=await getJson(request,'/api/payments?order_id='+order.id+'&size=50',manager.headers);
    expect(payments.data).toHaveLength(2);
    expect(payments.data.map(x=>x.type).sort()).toEqual(['balance','deposit']);
    expect(payments.data.reduce((sum,x)=>sum+Number(x.amount||0),0)).toBeCloseTo(10000,2);

    const invalid=await request.post('/api/workflows/orders/'+order.id+'/payment-plan',{headers:manager.headers,data:{deposit_percent:'not-a-number'}});
    expect([400,409]).toContain(invalid.status());
  });

  test('sample delivery is idempotent and creates exactly one follow-up task',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customer=await createCustomer(request,manager.headers,'Sample Delivery Atomic');
    const sample=await postJson(request,'/api/samples',{
      customer_id:customer.id,
      product:'E2E validation sample',
      quantity:'2 sets',
      status:'sent',
      courier:'DHL',
      tracking_no:'E2E-SAMPLE-'+Date.now()
    },manager.headers);

    const first=await postJson(request,'/api/workflows/samples/'+sample.id+'/mark-delivered',{delivered_at:new Date().toISOString()},manager.headers);
    const second=await postJson(request,'/api/workflows/samples/'+sample.id+'/mark-delivered',{delivered_at:new Date().toISOString()},manager.headers);
    expect(first.sample.status).toBe('delivered');
    expect(second.sample.status).toBe('delivered');
    expect(first.task_created).toBe(true);
    expect(second.task_created).toBe(false);
    expect(first.task.id).toBe(second.task.id);

    const tasks=await getJson(request,'/api/tasks?customer_id='+customer.id+'&size=200',manager.headers);
    expect(tasks.data.filter(x=>x.automation_key==='sample-feedback:'+sample.id)).toHaveLength(1);
  });

  test('split shipments cannot use foreign order items or exceed the ordered quantity',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customer=await createCustomer(request,manager.headers,'Shipment Quantity Guard');
    const order=await createOrder(request,manager.headers,customer,5000);
    const item=await postJson(request,'/api/orderItems',{
      order_id:order.id,product_name:'E2E Servo',quantity:10,unit:'pcs',unit_price:500,amount:5000
    },manager.headers);

    const first=await postJson(request,'/api/workflows/orders/'+order.id+'/shipments',{
      booking_no:'BK-FIRST-'+Date.now(),status:'booking',
      items:[{order_item_id:item.id,product_name:'spoofed name is ignored',quantity:6,unit:'boxes'}],
      containers:[{container_type:'20GP',container_no:'E2E-C1',seal_no:'S1'}]
    },manager.headers);
    expect(first.items).toHaveLength(1);
    expect(Number(first.items[0].quantity)).toBe(6);
    expect(first.items[0].product_name).toBe('E2E Servo');
    expect(first.items[0].unit).toBe('pcs');

    const over=await request.post('/api/workflows/orders/'+order.id+'/shipments',{headers:manager.headers,data:{
      booking_no:'BK-OVER-'+Date.now(),status:'booking',
      items:[{order_item_id:item.id,quantity:5}],
      containers:[]
    }});
    expect(over.status()).toBe(409);
    expect((await over.json()).error).toBe('shipment_quantity_exceeds_order');

    const otherOrder=await createOrder(request,manager.headers,customer,1000);
    const otherItem=await postJson(request,'/api/orderItems',{
      order_id:otherOrder.id,product_name:'Other order item',quantity:2,unit:'pcs',unit_price:500,amount:1000
    },manager.headers);
    const foreign=await request.post('/api/workflows/orders/'+order.id+'/shipments',{headers:manager.headers,data:{
      booking_no:'BK-FOREIGN-'+Date.now(),items:[{order_item_id:otherItem.id,quantity:1}]
    }});
    expect(foreign.status()).toBe(400);
    expect((await foreign.json()).error).toBe('shipment_item_not_in_order');

    const second=await postJson(request,'/api/workflows/orders/'+order.id+'/shipments',{
      booking_no:'BK-SECOND-'+Date.now(),status:'booked',
      items:[{order_item_id:item.id,quantity:4}],
      containers:[]
    },manager.headers);
    expect(Number(second.items[0].quantity)).toBe(4);

    const listed=await getJson(request,'/api/workflows/orders/'+order.id+'/shipments',manager.headers);
    expect(listed.data).toHaveLength(2);
    expect(listed.data.flatMap(x=>x.items).reduce((sum,x)=>sum+Number(x.quantity||0),0)).toBe(10);
    const orderFull=await getJson(request,'/api/workflows/orders/'+order.id+'/full',manager.headers);
    const enriched=orderFull.items.find(x=>x.id===item.id);
    expect(Number(enriched.allocated_quantity)).toBe(10);
    expect(Number(enriched.remaining_quantity)).toBe(0);
  });

  test('contract creation always has V1 and concurrent revisions remain contiguous',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customer=await createCustomer(request,manager.headers,'Contract Version Atomic');

    const contract=await postJson(request,'/api/workflows/contracts',{
      customer_id:customer.id,
      amount:20000,
      currency:'USD',
      effective_from:plusDays(1),
      effective_to:plusDays(365),
      terms:'E2E initial contract'
    },manager.headers);

    const initial=await getJson(request,'/api/workflows/contracts/'+contract.id+'/full',manager.headers);
    expect(initial.current_version).toBe(1);
    expect(initial.versions.map(x=>x.version)).toEqual([1]);

    const [a,b]=await Promise.all([
      request.post('/api/workflows/contracts/'+contract.id+'/new-version',{headers:manager.headers,data:{amount:21000,terms:'Revision A'}}),
      request.post('/api/workflows/contracts/'+contract.id+'/new-version',{headers:manager.headers,data:{amount:22000,terms:'Revision B'}})
    ]);
    expect([a.status(),b.status()].sort((x,y)=>x-y)).toEqual([201,201]);

    const full=await getJson(request,'/api/workflows/contracts/'+contract.id+'/full',manager.headers);
    expect(full.current_version).toBe(3);
    expect(full.versions.map(x=>Number(x.version))).toEqual([3,2,1]);
    expect(new Set(full.versions.map(x=>Number(x.version))).size).toBe(3);
  });

  test('quotation approval status and approval history move together atomically',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const customer=await createCustomer(request,manager.headers,'Quotation Approval Atomic');
    const quotation=await postJson(request,'/api/quotations',{
      customer_id:customer.id,status:'draft',currency:'USD',incoterm:'FOB',payment_terms:'30/70',valid_until:plusDays(20)
    },manager.headers);
    await postJson(request,'/api/quotationItems',{
      quotation_id:quotation.id,
      product_code:'E2E-NONCATALOG',
      product_name:'E2E Low Margin Product',
      quantity:10,unit:'pcs',unit_price:100,amount:1000,cost:90,spec:'E2E'
    },manager.headers);
    const recalculated=await postJson(request,'/api/workflows/quotations/'+quotation.id+'/recalculate',{},manager.headers);
    expect(Number(recalculated.margin_rate)).toBeLessThan(20);

    const submitted=await postJson(request,'/api/workflows/quotations/'+quotation.id+'/submit',{},manager.headers);
    expect(submitted.quotation.status).toBe('pending_approval');
    expect(submitted.auto_approved).toBe(false);

    let evaluation=await getJson(request,'/api/workflows/quotations/'+quotation.id+'/evaluation',manager.headers);
    expect(evaluation.history.filter(x=>x.status==='pending')).toHaveLength(1);

    const duplicate=await request.post('/api/workflows/quotations/'+quotation.id+'/submit',{headers:manager.headers,data:{}});
    expect(duplicate.status()).toBe(409);

    const approved=await postJson(request,'/api/workflows/quotations/'+quotation.id+'/approve',{comment:'E2E approval'},manager.headers);
    expect(approved.status).toBe('approved');

    evaluation=await getJson(request,'/api/workflows/quotations/'+quotation.id+'/evaluation',manager.headers);
    expect(evaluation.history.filter(x=>x.status==='pending')).toHaveLength(0);
    expect(evaluation.history.filter(x=>x.status==='approved')).toHaveLength(1);
  });
});


test('opportunity to quotation conversion is atomic, advances stage and is idempotent',async({request})=>{
  const manager=await loginApi(request,'demo.manager');
  const customer=await createCustomer(request,manager.headers,'Opportunity Quote Atomic');
  const opportunity=await postJson(request,'/api/opportunities',{
    customer_id:customer.id,
    name:'Atomic quote opportunity '+Date.now(),
    stage:'solution',
    expected_amount:32000,
    currency:'USD',
    expected_close_date:plusDays(30),
    probability:55,
    notes:'E2E idempotent opportunity conversion'
  },manager.headers);

  const payload={currency:'USD',incoterm:'FOB',payment_terms:'30/70',valid_until:plusDays(20)};
  const [a,b]=await Promise.all([
    request.post('/api/workflows/opportunities/'+opportunity.id+'/to-quotation',{headers:manager.headers,data:payload}),
    request.post('/api/workflows/opportunities/'+opportunity.id+'/to-quotation',{headers:manager.headers,data:payload})
  ]);
  expect([a.status(),b.status()].sort((x,y)=>x-y)).toEqual([200,201]);
  const qa=await a.json(),qb=await b.json();
  expect(qa.id).toBe(qb.id);
  expect(qa.version).toBe(1);

  const opportunities=await getJson(request,'/api/opportunities?size=500',manager.headers);
  const refreshed=opportunities.data.find(x=>x.id===opportunity.id);
  expect(refreshed).toBeTruthy();
  expect(refreshed.stage).toBe('quotation');

  const quotations=await getJson(request,'/api/quotations?size=500',manager.headers);
  const initial=quotations.data.filter(x=>x.opportunity_id===opportunity.id&&Number(x.version)===1);
  expect(initial).toHaveLength(1);
  expect(initial[0].id).toBe(qa.id);
});
