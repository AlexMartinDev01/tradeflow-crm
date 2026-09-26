type R={data:any};
const KEY='tradeflow-pages-demo-v1';
const uid=()=>globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now();
const now=()=>new Date().toISOString();
const seed=()=>({
  users:[{id:'u1',username:'admin',display_name:'演示管理员',role:'admin',enabled:1}],
  customers:[{id:'c1',name:'Nordlicht Import GmbH',english_name:'Nordlicht Import GmbH',country:'Germany',city:'Hamburg',website:'https://example.com',industry:'Industrial Equipment',customer_types:['Importer','Distributor'],status:'following',grade:'A',source:'Exhibition',timezone:'Europe/Berlin',language:'English',tax_no:'DE-DEMO-001',business_scope:'Industrial equipment distribution',custom_fields:{annual_purchase:'USD 500K–1M',certification:'CE / RoHS'},created_at:now(),updated_at:now()}],
  contacts:[{id:'ct1',customer_id:'c1',name:'Anna Schmidt',title:'Purchasing Manager',department:'Procurement',role:'Decision Maker',language:'English',timezone:'Europe/Berlin',is_primary:1,created_at:now(),updated_at:now()}],
  channels:[
    {id:'ch1',contact_id:'ct1',channel:'email',value:'anna@example.com',label:'Business',is_primary:1,preferred_time:'09:00-11:00 CET',created_at:now()},
    {id:'ch2',contact_id:'ct1',channel:'whatsapp',value:'491701234567',label:'WhatsApp',is_primary:0,preferred_time:'09:00-11:00 CET',created_at:now()},
    {id:'ch3',contact_id:'ct1',channel:'linkedin',value:'https://linkedin.com',label:'LinkedIn',is_primary:0,created_at:now()}
  ],
  brands:[{id:'b1',name:'Demo Industrial',website:'https://example.com',country:'Germany',group_name:'Demo Group',main_products:'Industrial equipment',created_at:now(),updated_at:now()}],
  customerBrands:[{id:'cb1',customer_id:'c1',brand_id:'b1',relation_type:'Distributor',authorized_regions:['Germany','Austria'],exclusive:0,start_date:'2026-01-01',end_date:'2027-12-31',created_at:now()}],
  customFields:[
    {id:'cf1',entity_type:'customer',field_key:'annual_purchase',label:'年采购规模',data_type:'select',options:['< USD 100K','USD 100K–500K','USD 500K–1M','> USD 1M'],group_name:'业务属性',required:0,unique_value:0,searchable:1,visible_roles:[],sort_order:10,enabled:1,created_at:now()},
    {id:'cf2',entity_type:'customer',field_key:'certification',label:'认证要求',data_type:'text',options:[],group_name:'业务属性',required:0,unique_value:0,searchable:1,visible_roles:[],sort_order:20,enabled:1,created_at:now()}
  ],
  activities:[{id:'a1',customer_id:'c1',contact_id:'ct1',type:'whatsapp',subject:'展会后跟进',content:'客户确认需要 100 台设备的正式报价。',result:'等待报价',next_action:'48小时内发送报价',occurred_at:now(),created_at:now()}],
  tasks:[{id:'t1',customer_id:'c1',title:'发送正式报价',description:'按 FOB Hamburg 条件发送',due_at:new Date(Date.now()+86400000).toISOString(),status:'todo',priority:'high',created_at:now(),updated_at:now()}],
  inquiries:[{id:'i1',inquiry_no:'INQ-DEMO-001',customer_id:'c1',contact_id:'ct1',source:'Exhibition',status:'new',products:['Demo Pump X1'],quantity:'100 pcs',target_price:'USD 950',incoterm:'FOB',destination_port:'Hamburg',requested_delivery:'2026-11-30',received_at:now(),notes:'需要 CE 认证',created_at:now(),updated_at:now()}],
  opportunities:[{id:'o1',customer_id:'c1',inquiry_id:null,name:'2026 Q4 Distributor Project',stage:'qualification',expected_amount:95000,currency:'USD',expected_close_date:'2026-11-15',probability:30,competitor:'Competitor A',notes:'重点客户',created_at:now(),updated_at:now()}],
  quotations:[{id:'q1',quote_no:'QT-DEMO-001',customer_id:'c1',contact_id:'ct1',opportunity_id:'o1',version:1,currency:'USD',incoterm:'FOB',payment_terms:'30% deposit, 70% before shipment',moq:'50 pcs',packaging:'Export wooden case',lead_time:'30 days',valid_until:'2026-10-31',subtotal:95000,discount:0,total:95000,margin_rate:36.84,status:'draft',notes:'Demo quotation',created_at:now(),updated_at:now()}],
  quotationItems:[{id:'qi1',quotation_id:'q1',product_code:'PUMP-X1',product_name:'Demo Pump X1',quantity:100,unit:'pcs',unit_price:950,amount:95000,cost:600,spec:'220V / CE'}],
  samples:[{id:'s1',customer_id:'c1',opportunity_id:'o1',product:'Demo Pump X1',quantity:'1 pc',fee:200,currency:'USD',courier:'DHL',tracking_no:'DHL-DEMO-001',sent_at:null,delivered_at:null,feedback:'',status:'requested',created_at:now(),updated_at:now()}],
  products:[{id:'p1',sku:'PUMP-X1',name:'Demo Pump X1',category:'Pump',base_price:950,currency:'USD',certifications:['CE'],created_at:now(),updated_at:now()}],
  contracts:[],orders:[],orderItems:[],payments:[],shipments:[],aftersales:[],campaigns:[],documents:[],
  audit:[{id:'au1',user_name:'演示管理员',action:'demo_seed',entity_type:'system',entity_id:'-',ip:'browser',created_at:now()}]
});
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||seed()}catch{return seed()}};
const persist=(s:any)=>localStorage.setItem(KEY,JSON.stringify(s));
const resp=(data:any):Promise<R>=>Promise.resolve({data});
const pathParts=(p:string)=>p.split('?')[0].split('/').filter(Boolean);
const collMap:any={customers:'customers',contacts:'contacts',channels:'channels',brands:'brands',customerBrands:'customerBrands',customFields:'customFields',activities:'activities',tasks:'tasks',inquiries:'inquiries',opportunities:'opportunities',quotations:'quotations',quotationItems:'quotationItems',samples:'samples',products:'products',contracts:'contracts',orders:'orders',orderItems:'orderItems',payments:'payments',shipments:'shipments',aftersales:'aftersales',campaigns:'campaigns',documents:'documents',users:'users'};
const number=(prefix:string)=>`${prefix}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const audit=(s:any,action:string,type:string,id:string)=>s.audit.unshift({id:uid(),user_name:'演示管理员',action,entity_type:type,entity_id:id,ip:'browser',created_at:now()});

function target(channel:string,value:string){
  const c=(channel||'').toLowerCase(),v=String(value||'').trim();
  if(c==='email')return `mailto:${encodeURIComponent(v)}`;
  if(c==='phone')return `tel:${v.replace(/[^+\d]/g,'')}`;
  if(c==='whatsapp')return `https://wa.me/${v.replace(/\D/g,'')}`;
  if(c==='telegram')return v.startsWith('http')?v:`https://t.me/${v.replace(/^@/,'')}`;
  if(['website','linkedin','facebook','messenger','instagram','vk','line','x','store'].includes(c))return /^https?:\/\//i.test(v)?v:`https://${v}`;
  return v;
}

export const demoApi={
 async get(path:string,config:any={}){
  const s=load(), params=config?.params||{};
  if(path==='/auth/me')return resp(s.users[0]);
  if(path==='/dashboard')return resp({customers:s.customers.length,contacts:s.contacts.length,openTasks:s.tasks.filter((x:any)=>x.status!=='done').length,inquiries:s.inquiries.length,opportunities:s.opportunities.filter((x:any)=>!['won','lost'].includes(x.stage)).length,quotations:s.quotations.length,orders:s.orders.length,overduePayments:s.payments.filter((x:any)=>x.status!=='paid'&&x.due_at&&x.due_at<now()).length,recentActivities:s.activities.slice(0,10).map((a:any)=>({...a,customer_name:s.customers.find((c:any)=>c.id===a.customer_id)?.name})),dueTasks:s.tasks.filter((x:any)=>x.status!=='done').slice(0,10).map((t:any)=>({...t,customer_name:s.customers.find((c:any)=>c.id===t.customer_id)?.name}))});
  if(path==='/search'){const q=String(params.q||'').toLowerCase();return resp(s.customers.filter((x:any)=>[x.name,x.english_name,x.website,x.tax_no].some(v=>String(v||'').toLowerCase().includes(q))))}
  if(path==='/audit')return resp(s.audit);
  if(path==='/analytics/funnel')return resp({inquiries:s.inquiries.length,opportunities:s.opportunities.length,quotations:s.quotations.length,samples:s.samples.length,orders:s.orders.length});
  if(path.startsWith('/workflows/quotations/')&&path.endsWith('/full')){const id=pathParts(path)[2];const q=s.quotations.find((x:any)=>x.id===id);return resp({...q,items:s.quotationItems.filter((x:any)=>x.quotation_id===id)})}
  const [res,id]=pathParts(path);const key=collMap[res];if(key){let arr=[...(s[key]||[])];if(id)return resp(arr.find((x:any)=>x.id===id));for(const k of ['customer_id','contact_id','order_id'])if(params[k])arr=arr.filter((x:any)=>x[k]===params[k]);return resp({data:arr,total:arr.length,page:1,size:arr.length})}
  return resp({});
 },
 async post(path:string,b:any={}){
  const s=load();
  if(path==='/auth/login'){localStorage.setItem('token','github-pages-demo');return resp({token:'github-pages-demo',expires_at:'2099-12-31',user:s.users[0]})}
  if(path==='/auth/logout'){localStorage.removeItem('token');return resp({ok:true})}
  if(path==='/tools/link')return resp({target:target(b.channel,b.value),copyFallback:false});
  let m=path.match(/^\/workflows\/inquiries\/([^/]+)\/to-opportunity$/);
  if(m){const i=s.inquiries.find((x:any)=>x.id===m![1]);let o=s.opportunities.find((x:any)=>x.inquiry_id===i.id);if(!o){o={id:uid(),customer_id:i.customer_id,inquiry_id:i.id,name:b.name||('商机 '+i.inquiry_no),stage:b.stage||'qualification',expected_amount:Number(b.expected_amount||0),currency:b.currency||'USD',expected_close_date:b.expected_close_date||'',probability:Number(b.probability||20),competitor:b.competitor||'',notes:b.notes||'',created_at:now(),updated_at:now()};s.opportunities.unshift(o);i.status='converted';audit(s,'convert_inquiry_to_opportunity','opportunities',o.id)}persist(s);return resp(o)}
  m=path.match(/^\/workflows\/opportunities\/([^/]+)\/to-quotation$/);
  if(m){const o=s.opportunities.find((x:any)=>x.id===m![1]);const q={id:uid(),quote_no:number('QT'),customer_id:o.customer_id,contact_id:b.contact_id||'',opportunity_id:o.id,version:1,currency:b.currency||o.currency||'USD',incoterm:b.incoterm||'',payment_terms:b.payment_terms||'',moq:b.moq||'',packaging:b.packaging||'',lead_time:b.lead_time||'',valid_until:b.valid_until||'',subtotal:0,discount:0,total:0,margin_rate:null,status:'draft',notes:b.notes||'',created_at:now(),updated_at:now()};s.quotations.unshift(q);audit(s,'create_quotation_from_opportunity','quotations',q.id);persist(s);return resp(q)}
  m=path.match(/^\/workflows\/quotations\/([^/]+)\/recalculate$/);
  if(m){const q=s.quotations.find((x:any)=>x.id===m![1]),items=s.quotationItems.filter((x:any)=>x.quotation_id===q.id);let subtotal=0,cost=0;for(const it of items){it.amount=Number(it.quantity||0)*Number(it.unit_price||0);subtotal+=it.amount;cost+=Number(it.quantity||0)*Number(it.cost||0)}q.subtotal=subtotal;q.total=Math.max(0,subtotal-Number(q.discount||0));q.margin_rate=q.total?((q.total-cost)/q.total*100):null;q.updated_at=now();audit(s,'recalculate','quotations',q.id);persist(s);return resp({...q,items})}
  m=path.match(/^\/workflows\/quotations\/([^/]+)\/copy-version$/);
  if(m){const q=s.quotations.find((x:any)=>x.id===m![1]),max=Math.max(...s.quotations.filter((x:any)=>x.opportunity_id===q.opportunity_id).map((x:any)=>Number(x.version||0)),0);const nq={...q,id:uid(),quote_no:number('QT'),version:max+1,status:'draft',created_at:now(),updated_at:now()};s.quotations.unshift(nq);for(const it of s.quotationItems.filter((x:any)=>x.quotation_id===q.id))s.quotationItems.push({...it,id:uid(),quotation_id:nq.id});audit(s,'copy_version','quotations',nq.id);persist(s);return resp({...nq,items:s.quotationItems.filter((x:any)=>x.quotation_id===nq.id)})}
  m=path.match(/^\/workflows\/quotations\/([^/]+)\/submit$/);if(m){const q=s.quotations.find((x:any)=>x.id===m![1]);q.status='pending_approval';q.updated_at=now();audit(s,'submit_approval','quotations',q.id);persist(s);return resp(q)}
  m=path.match(/^\/workflows\/quotations\/([^/]+)\/approve$/);if(m){const q=s.quotations.find((x:any)=>x.id===m![1]);q.status='approved';q.updated_at=now();audit(s,'approve','quotations',q.id);persist(s);return resp(q)}
  m=path.match(/^\/workflows\/quotations\/([^/]+)\/to-order$/);
  if(m){const q=s.quotations.find((x:any)=>x.id===m![1]);let o=s.orders.find((x:any)=>x.quotation_id===q.id);if(!o){o={id:uid(),order_no:number('SO'),customer_id:q.customer_id,quotation_id:q.id,customer_po:b.customer_po||'',status:'pending',currency:q.currency,incoterm:q.incoterm,payment_terms:q.payment_terms,total:q.total,requested_delivery:b.requested_delivery||'',notes:b.notes||q.notes||'',created_at:now(),updated_at:now()};s.orders.unshift(o);for(const it of s.quotationItems.filter((x:any)=>x.quotation_id===q.id))s.orderItems.push({id:uid(),order_id:o.id,product_name:it.product_name,quantity:it.quantity,unit:it.unit,unit_price:it.unit_price,amount:it.amount});q.status='accepted';const opp=s.opportunities.find((x:any)=>x.id===q.opportunity_id);if(opp){opp.stage='won';opp.probability=100}audit(s,'convert_quotation_to_order','orders',o.id)}persist(s);return resp({...o,items:s.orderItems.filter((x:any)=>x.order_id===o.id)})}
  m=path.match(/^\/workflows\/samples\/([^/]+)\/mark-delivered$/);
  if(m){const sm=s.samples.find((x:any)=>x.id===m![1]);sm.status='delivered';sm.delivered_at=now();sm.updated_at=now();const t={id:uid(),customer_id:sm.customer_id,title:'跟进样品反馈',description:`样品：${sm.product}；运单：${sm.tracking_no||'-'}。请确认客户试用反馈并推动下一步。`,due_at:new Date(Date.now()+3*86400000).toISOString(),status:'todo',priority:'high',created_at:now(),updated_at:now()};s.tasks.unshift(t);audit(s,'sample_delivered','samples',sm.id);persist(s);return resp({sample:sm,task:t})}
  const [res]=pathParts(path),key=collMap[res];if(key){const obj={id:uid(),...b,created_at:now(),updated_at:now()};if(res==='inquiries'&&!obj.inquiry_no)obj.inquiry_no=number('INQ');if(res==='quotations'&&!obj.quote_no)obj.quote_no=number('QT');if(res==='contracts'&&!obj.contract_no)obj.contract_no=number('CT');if(res==='orders'&&!obj.order_no)obj.order_no=number('SO');if(res==='aftersales'&&!obj.ticket_no)obj.ticket_no=number('AS');s[key].unshift(obj);audit(s,'create',res,obj.id);persist(s);return resp(obj)}
  return resp({});
 },
 async patch(path:string,b:any={}){
  const s=load(),[res,id]=pathParts(path),key=collMap[res];if(key&&id){const obj=s[key].find((x:any)=>x.id===id);Object.assign(obj,b,{updated_at:now()});audit(s,'update',res,id);persist(s);return resp(obj)}return resp({});
 },
 async delete(path:string){
  const s=load(),[res,id]=pathParts(path),key=collMap[res];if(key&&id){s[key]=s[key].filter((x:any)=>x.id!==id);if(res==='contacts')s.channels=s.channels.filter((x:any)=>x.contact_id!==id);audit(s,'delete',res,id);persist(s);return resp({ok:true})}return resp({ok:false});
 }
};
