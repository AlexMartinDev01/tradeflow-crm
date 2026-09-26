import {test,expect} from '@playwright/test';
import {loginApi,getJson,postJson,plusDays} from './helpers.mjs';

test.describe.configure({mode:'serial',retries:0});

test.describe('TradeFlow resilience and failure-path safety',()=>{
  test('Excel import preview and commit isolate invalid rows and enforce manager-only permission',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const sales=await loginApi(request,'demo.sales01');
    const suffix=Date.now().toString().slice(-8);
    const uniqueName='Import Resilience E2E '+suffix;

    const preview=await postJson(request,'/api/customers/import/preview',{rows:[
      {country:'Germany',grade:'B'},
      {name:'Nordstern Technik GmbH',country:'Germany',grade:'A'},
      {name:uniqueName,country:'Netherlands',grade:'B',customer_types:'Importer;Distributor',source:'E2E Import'}
    ]},manager.headers);

    expect(preview.total).toBe(3);
    expect(preview.invalid).toBe(1);
    expect(preview.duplicates).toBeGreaterThanOrEqual(1);
    expect(preview.ready).toBeGreaterThanOrEqual(1);
    expect(preview.rows[0].status).toBe('invalid');

    const salesPreview=await request.post('/api/customers/import/preview',{headers:sales.headers,data:{rows:[{name:'Forbidden Import'}]}});
    expect(salesPreview.status()).toBe(403);

    const duplicate=preview.rows.find(x=>x.status==='duplicate');
    expect(duplicate?.matches?.[0]?.id).toBeTruthy();

    const committed=await postJson(request,'/api/customers/import/commit',{items:[
      {action:'create',row:{country:'France',grade:'C'}},
      {action:'create',row:{name:uniqueName,country:'Netherlands',grade:'B',customer_types:['Importer','Distributor'],source:'E2E Import'}},
      {action:'update',duplicate_id:duplicate.matches[0].id,row:{name:'Nordstern Technik GmbH',notes:'E2E import update '+suffix}},
      {action:'unexpected',row:{name:'Must Not Be Created '+suffix}}
    ]},manager.headers);

    expect(committed.created).toBe(1);
    expect(committed.updated).toBe(1);
    expect(committed.errors.length).toBe(2);
    expect(committed.errors.map(x=>x.message)).toContain('客户名称必填');
    expect(committed.errors.map(x=>x.message)).toContain('不支持的导入动作');

    const created=await getJson(request,'/api/customers?keyword='+encodeURIComponent(uniqueName)+'&size=20',manager.headers);
    expect(created.data.filter(x=>x.name===uniqueName)).toHaveLength(1);
  });

  test('attachment upload rejects dangerous and empty payloads without leaving metadata',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Unsafe Attachment E2E '+suffix,customer_types:['Importer'],status:'potential',grade:'B',country:'Germany',source:'E2E'
    },manager.headers);

    const blocked=await request.post('/api/files/upload',{headers:manager.headers,data:{
      entity_type:'customer',entity_id:customer.id,category:'security',file_name:'payload.exe',mime_type:'application/octet-stream',
      content_base64:Buffer.from('MZ fake executable').toString('base64')
    }});
    expect(blocked.status()).toBe(400);
    expect((await blocked.json()).error).toBe('blocked_file_type');

    const empty=await request.post('/api/files/upload',{headers:manager.headers,data:{
      entity_type:'customer',entity_id:customer.id,category:'security',file_name:'empty.txt',mime_type:'text/plain',content_base64:''
    }});
    expect(empty.status()).toBe(400);
    expect((await empty.json()).error).toBe('empty_file');

    const files=await getJson(request,'/api/files?entity_type=customer&entity_id='+customer.id,manager.headers);
    expect(files).toHaveLength(0);
  });

  test('two sales users racing for one public-pool customer produce exactly one winner',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const sales1=await loginApi(request,'demo.sales01');
    const sales2=await loginApi(request,'demo.sales02');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Concurrent Pool E2E '+suffix,customer_types:['Distributor'],status:'potential',grade:'C',country:'Spain',source:'E2E Concurrency'
    },manager.headers);
    await postJson(request,'/api/customers/'+customer.id+'/release-to-pool',{reason:'concurrency acceptance'},manager.headers);

    const [a,b]=await Promise.all([
      request.post('/api/public-pool/'+customer.id+'/claim',{headers:sales1.headers,data:{}}),
      request.post('/api/public-pool/'+customer.id+'/claim',{headers:sales2.headers,data:{}})
    ]);
    const statuses=[a.status(),b.status()].sort((x,y)=>x-y);
    expect(statuses).toEqual([200,409]);

    const current=await getJson(request,'/api/customers/'+customer.id,manager.headers);
    expect([sales1.user.id,sales2.user.id]).toContain(current.owner_id);
    expect(current.pool_status).toBe('assigned');
  });

  test('concurrent quotation conversion is idempotent and creates one order only',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Idempotent Order E2E '+suffix,customer_types:['Importer'],status:'following',grade:'A',country:'Germany',source:'E2E Idempotency'
    },manager.headers);
    const opportunity=await postJson(request,'/api/opportunities',{
      customer_id:customer.id,name:'Idempotency Opportunity '+suffix,stage:'quotation',expected_amount:25000,currency:'USD',probability:70
    },manager.headers);
    const quotation=await postJson(request,'/api/workflows/opportunities/'+opportunity.id+'/to-quotation',{
      currency:'USD',incoterm:'FOB',payment_terms:'30% deposit, 70% before shipment',valid_until:plusDays(20)
    },manager.headers);
    await postJson(request,'/api/quotationItems',{
      quotation_id:quotation.id,product_code:'E2E-IDEM-'+suffix,product_name:'Idempotency Test Product',quantity:10,unit:'set',unit_price:2500,amount:25000,cost:1500
    },manager.headers);
    await postJson(request,'/api/workflows/quotations/'+quotation.id+'/recalculate',{},manager.headers);
    const submitted=await postJson(request,'/api/workflows/quotations/'+quotation.id+'/submit',{},manager.headers);
    expect(submitted.quotation.status).toBe('approved');

    const payload={customer_po:'PO-IDEM-'+suffix,requested_delivery:plusDays(45),notes:'Concurrent conversion acceptance'};
    const [first,second]=await Promise.all([
      request.post('/api/workflows/quotations/'+quotation.id+'/to-order',{headers:manager.headers,data:payload}),
      request.post('/api/workflows/quotations/'+quotation.id+'/to-order',{headers:manager.headers,data:payload})
    ]);
    expect([first.status(),second.status()].sort((a,b)=>a-b)).toEqual([200,201]);
    const firstData=await first.json(),secondData=await second.json();
    expect(firstData.id).toBe(secondData.id);

    const orders=await getJson(request,'/api/orders?size=200',manager.headers);
    expect(orders.data.filter(x=>x.quotation_id===quotation.id)).toHaveLength(1);
  });


  test('disabled user immediately loses an already-issued session token',async({request})=>{
    const admin=await loginApi(request,'demo.admin');
    const suffix=Date.now().toString().slice(-8);
    const username='e2e.disabled.'+suffix;
    const created=await postJson(request,'/api/users',{
      username,
      display_name:'Disabled Session E2E '+suffix,
      role:'sales',
      password:'DisableTest#2026A',
      data_scope:'self',
      enabled:1
    },admin.headers);
    expect(created.id).toBeTruthy();

    const login=await request.post('/api/auth/login',{data:{username,password:'DisableTest#2026A'}});
    expect(login.status()).toBe(200);
    const loginData=await login.json();
    expect(loginData.token).toBeTruthy();
    const oldHeaders={Authorization:'Bearer '+loginData.token};

    const before=await request.get('/api/auth/me',{headers:oldHeaders});
    expect(before.status()).toBe(200);

    const disabled=await request.patch('/api/users/'+created.id,{headers:admin.headers,data:{enabled:0}});
    expect(disabled.status()).toBe(200);

    const after=await request.get('/api/auth/me',{headers:oldHeaders});
    expect(after.status()).toBe(401);

    const relogin=await request.post('/api/auth/login',{data:{username,password:'DisableTest#2026A'}});
    expect(relogin.status()).toBe(401);
  });

  test('malformed JSON is rejected as an explicit 400 invalid_json error',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const base=process.env.E2E_BASE_URL||'http://127.0.0.1:18080';
    const response=await fetch(base+'/api/customers',{
      method:'POST',
      headers:{...manager.headers,'content-type':'application/json'},
      body:'{"name":"broken-json"'
    });
    expect(response.status).toBe(400);
    const payload=await response.json();
    expect(payload.error).toBe('invalid_json');
    expect(payload.request_id).toBeTruthy();
  });

  test('oversized attachment returns 413 and leaves no document metadata',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Oversized Attachment E2E '+suffix,customer_types:['Importer'],status:'potential',grade:'B',country:'Germany',source:'E2E'
    },manager.headers);

    const raw=Buffer.alloc(15*1024*1024+1,65);
    const response=await request.post('/api/files/upload',{headers:manager.headers,data:{
      entity_type:'customer',entity_id:customer.id,category:'limit',file_name:'too-large.bin',mime_type:'application/octet-stream',
      content_base64:raw.toString('base64')
    }});
    expect(response.status()).toBe(413);
    const payload=await response.json();
    expect(payload.error).toBe('file_too_large');
    expect(Number(payload.max_bytes)).toBe(15*1024*1024);

    const files=await getJson(request,'/api/files?entity_type=customer&entity_id='+customer.id,manager.headers);
    expect(files).toHaveLength(0);
  });

  test('path-like attachment filename is normalized and cannot escape upload root',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Path Safety E2E '+suffix,customer_types:['Importer'],status:'potential',grade:'B',country:'Germany',source:'E2E'
    },manager.headers);

    const uploaded=await postJson(request,'/api/files/upload',{
      entity_type:'customer',entity_id:customer.id,category:'path-safety',
      file_name:'../../nested/../safe-note.txt',mime_type:'text/plain',
      content_base64:Buffer.from('path-safe '+suffix).toString('base64')
    },manager.headers);
    expect(uploaded.original_name).toBe('safe-note.txt');
    expect(uploaded.name).toBe('safe-note.txt');

    const download=await request.get('/api/documents/'+uploaded.id+'/download',{headers:manager.headers});
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe('path-safe '+suffix);
  });
});
