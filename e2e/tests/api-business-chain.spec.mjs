import {test,expect} from '@playwright/test';
import {loginApi,getJson,postJson,plusDays} from './helpers.mjs';

test.describe('TradeFlow seeded business chain',()=>{
  test('manager sees a complete linked dataset across the core CRM chain',async({request})=>{
    const {headers}=await loginApi(request,'demo.manager');

    const dashboard=await getJson(request,'/api/dashboard',headers);
    expect(dashboard.customers).toBeGreaterThanOrEqual(18);
    expect(dashboard.inquiries).toBeGreaterThanOrEqual(12);
    expect(dashboard.quotations).toBeGreaterThanOrEqual(9);
    expect(dashboard.orders).toBeGreaterThanOrEqual(7);

    const customers=await getJson(request,'/api/customers?keyword=Nordstern&size=50',headers);
    const nordstern=customers.data.find(x=>x.name==='Nordstern Technik GmbH');
    expect(nordstern).toBeTruthy();

    const inquiries=await getJson(request,'/api/inquiries/sla-dashboard',headers);
    const inquiry=inquiries.rows.find(x=>x.customer_id===nordstern.id);
    expect(inquiry).toBeTruthy();

    const opportunities=await getJson(request,'/api/opportunities?size=200',headers);
    const opportunity=opportunities.data.find(x=>x.customer_id===nordstern.id);
    expect(opportunity).toBeTruthy();

    const quotations=await getJson(request,'/api/quotations?size=200',headers);
    const quotation=quotations.data.find(x=>x.customer_id===nordstern.id);
    expect(quotation).toBeTruthy();
    expect(Number(quotation.total||0)).toBeGreaterThan(0);

    const orders=await getJson(request,'/api/orders?size=200',headers);
    const order=orders.data.find(x=>x.customer_id===nordstern.id);
    expect(order).toBeTruthy();

    const fullOrder=await getJson(request,`/api/workflows/orders/${order.id}/full`,headers);
    expect(fullOrder.items.length).toBeGreaterThan(0);
    expect(fullOrder.payments.length).toBeGreaterThan(0);

    const aftersales=await getJson(request,'/api/aftersales?size=200',headers);
    expect(aftersales.data.length).toBeGreaterThanOrEqual(5);

    const knowledge=await getJson(request,'/api/knowledge?status=published',headers);
    expect(knowledge.length).toBeGreaterThanOrEqual(3);

    const reports=await getJson(request,'/api/reports',headers);
    expect(reports.length).toBeGreaterThanOrEqual(2);

    const automation=await getJson(request,'/api/automation/custom',headers);
    expect(automation.length).toBeGreaterThanOrEqual(2);
  });

  test('custom BI and knowledge recommendation execute against real seeded data',async({request})=>{
    const {headers}=await loginApi(request,'demo.manager');

    const report=await postJson(request,'/api/reports/run',{
      entity_type:'orders',
      dimension:'month',
      metric:'count',
      chart_type:'bar',
      filters:{currency:'USD'}
    },headers);
    expect(report.rows.length).toBeGreaterThan(0);
    expect(report.total).toBeGreaterThan(0);

    const tickets=await getJson(request,'/api/aftersales?size=100',headers);
    const ticket=tickets.data.find(x=>x.category==='quality');
    expect(ticket).toBeTruthy();

    const recommendations=await getJson(request,`/api/knowledge/recommend?ticket_id=${ticket.id}`,headers);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations[0].relevance).toBeGreaterThan(0);
  });
});

test.describe('TradeFlow writable end-to-end workflow',()=>{
  test('customer -> inquiry -> opportunity -> quotation -> order -> payment plan -> shipment',async({request})=>{
    const {headers}=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);

    const customer=await postJson(request,'/api/customers',{
      name:`E2E Automation Customer ${suffix}`,
      english_name:`E2E Automation Customer ${suffix}`,
      country:'Germany',
      city:'Hamburg',
      industry:'Industrial Automation',
      customer_types:['Importer','Distributor'],
      status:'potential',
      grade:'B',
      source:'E2E',
      language:'English',
      timezone:'Europe/Berlin',
      business_scope:'Automated end-to-end verification customer'
    },headers);
    expect(customer.id).toBeTruthy();

    const contact=await postJson(request,'/api/contacts',{
      customer_id:customer.id,
      name:'E2E Buyer',
      title:'Procurement Manager',
      department:'Procurement',
      role:'Decision Maker',
      is_primary:1,
      is_departed:0,
      influence_level:'high'
    },headers);
    expect(contact.id).toBeTruthy();

    const inquiry=await postJson(request,'/api/inquiries',{
      customer_id:customer.id,
      contact_id:contact.id,
      source:'E2E',
      status:'new',
      products:['E2E Servo Package'],
      quantity:'25 sets',
      target_price:'USD 2,500/set',
      incoterm:'FOB',
      destination_port:'Hamburg',
      requested_delivery:plusDays(60),
      received_at:new Date().toISOString(),
      notes:'Playwright E2E workflow'
    },headers);
    expect(inquiry.id).toBeTruthy();

    const responded=await postJson(request,`/api/workflows/inquiries/${inquiry.id}/respond`,{
      response_at:new Date().toISOString()
    },headers);
    expect(responded.first_response_at).toBeTruthy();

    const opportunity=await postJson(request,`/api/workflows/inquiries/${inquiry.id}/to-opportunity`,{
      name:`E2E Opportunity ${suffix}`,
      expected_amount:62500,
      currency:'USD',
      expected_close_date:plusDays(30),
      probability:60,
      competitor:'E2E Competitor'
    },headers);
    expect(opportunity.stage).toBeTruthy();

    const quotation=await postJson(request,`/api/workflows/opportunities/${opportunity.id}/to-quotation`,{
      contact_id:contact.id,
      currency:'USD',
      incoterm:'FOB',
      payment_terms:'30% deposit, 70% before shipment',
      valid_until:plusDays(20)
    },headers);
    expect(quotation.status).toBe('draft');

    const item=await postJson(request,'/api/quotationItems',{
      quotation_id:quotation.id,
      product_code:`E2E-${suffix}`,
      product_name:'E2E Servo Package',
      quantity:25,
      unit:'set',
      unit_price:2500,
      amount:62500,
      cost:1500,
      spec:'Playwright verification configuration'
    },headers);
    expect(item.id).toBeTruthy();

    const recalculated=await postJson(request,`/api/workflows/quotations/${quotation.id}/recalculate`,{},headers);
    expect(Number(recalculated.total)).toBe(62500);
    expect(Number(recalculated.margin_rate)).toBeGreaterThan(20);

    const submitted=await postJson(request,`/api/workflows/quotations/${quotation.id}/submit`,{},headers);
    expect(submitted.quotation.status).toBe('approved');

    const order=await postJson(request,`/api/workflows/quotations/${quotation.id}/to-order`,{
      customer_po:`PO-E2E-${suffix}`,
      requested_delivery:plusDays(55),
      notes:'Generated by Playwright'
    },headers);
    expect(order.id).toBeTruthy();

    const payments=await postJson(request,`/api/workflows/orders/${order.id}/payment-plan`,{
      deposit_percent:30,
      deposit_due:plusDays(3),
      balance_due:plusDays(45)
    },headers);
    expect(payments.length).toBe(2);

    const full=await getJson(request,`/api/workflows/orders/${order.id}/full`,headers);
    expect(full.items.length).toBe(1);

    const shipment=await postJson(request,`/api/workflows/orders/${order.id}/shipments`,{
      booking_no:`BK-E2E-${suffix}`,
      carrier:'E2E Shipping Line',
      forwarder:'E2E Forwarder',
      vessel_voyage:'E2E V001',
      port_of_loading:'Shanghai',
      destination_port:'Hamburg',
      etd:plusDays(25),
      eta:plusDays(50),
      status:'booking',
      items:full.items.map(x=>({order_item_id:x.id,product_name:x.product_name,quantity:x.quantity,unit:x.unit})),
      containers:[{container_type:'20GP',container_no:`E2EU${suffix}`,seal_no:`SEAL${suffix}`}]
    },headers);
    expect(shipment.id).toBeTruthy();

    const orderAfter=await getJson(request,`/api/workflows/orders/${order.id}/full`,headers);
    expect(orderAfter.shipments.some(x=>x.id===shipment.id)).toBeTruthy();
  });
});

test.describe('TradeFlow role boundaries',()=>{
  test('sales self scope only returns owned customers',async({request})=>{
    const {headers,user}=await loginApi(request,'demo.sales01');
    const customers=await getJson(request,'/api/customers?size=500',headers);
    expect(customers.data.length).toBeGreaterThan(0);
    for(const customer of customers.data)expect(customer.owner_id).toBe(user.id);
  });

  test('readonly cannot create a customer',async({request})=>{
    const {headers}=await loginApi(request,'demo.readonly');
    const response=await request.post('/api/customers',{headers,data:{
      name:'Readonly Must Not Create',
      customer_types:['Importer'],
      status:'potential',
      grade:'C'
    }});
    expect(response.status()).toBe(403);
  });

  test('readonly cannot generate commercial documents',async({request})=>{
    const {headers}=await loginApi(request,'demo.readonly');
    const orders=await getJson(request,'/api/orders?size=20',headers);
    expect(orders.data.length).toBeGreaterThan(0);
    const response=await request.post(`/api/workflows/orders/${orders.data[0].id}/generate-document`,{headers,data:{type:'PI'}});
    expect(response.status()).toBe(403);
  });

  test('finance can read receivables but cannot create customer master data',async({request})=>{
    const {headers}=await loginApi(request,'demo.finance');
    const payments=await getJson(request,'/api/payments?size=500',headers);
    expect(payments.data.length).toBeGreaterThan(0);

    const response=await request.post('/api/customers',{headers,data:{
      name:'Finance Must Not Create',
      customer_types:['Importer'],
      status:'potential',
      grade:'C'
    }});
    expect(response.status()).toBe(403);
  });
});
