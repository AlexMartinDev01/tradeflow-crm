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
  contracts:[],
  orders:[{id:'so1',order_no:'SO-DEMO-001',customer_id:'c1',quotation_id:'q1',status:'production',currency:'USD',incoterm:'FOB',payment_terms:'30% deposit, 70% before shipment',total:95000,requested_delivery:'2026-11-30',created_at:now(),updated_at:now()}],
  orderItems:[{id:'oi1',order_id:'so1',product_name:'Demo Pump X1',quantity:100,unit:'pcs',unit_price:950,amount:95000}],
  payments:[{id:'pay1',customer_id:'c1',order_id:'so1',type:'deposit',amount:28500,currency:'USD',status:'paid',due_at:'2026-09-20',paid_at:'2026-09-19',created_at:now()}],
  shipments:[{id:'sh1',order_id:'so1',status:'booked',carrier:'Demo Shipping',destination_port:'Hamburg',etd:'2026-11-01',eta:'2026-11-25',booking_no:'BK-DEMO-001',created_at:now()}],
  aftersales:[{id:'as1',ticket_no:'AS-DEMO-001',customer_id:'c1',order_id:'so1',category:'quality',severity:'normal',subject:'设备运行噪音偏高',description:'客户反馈首批设备运行噪音高于预期。',responsible_team:'Quality',solution:'检查运输固定件并重新校准底座，同时复核安装水平度。',status:'resolved',satisfaction:5,opened_at:now(),closed_at:null,updated_at:now()}],
  campaigns:[],documents:[],
  tags:[{id:'tag1',name:'重点客户'},{id:'tag2',name:'德国市场'}],
  views:[],
  departments:[{id:'d1',name:'海外销售部',manager_user_id:'u1',enabled:1,member_count:1}],
  channelConfigs:[{id:'cc1',channel_key:'email',name:'Email',link_mode:'email',enabled:1,sort_order:10},{id:'cc2',channel_key:'whatsapp',name:'WhatsApp',link_mode:'template',url_template:'https://wa.me/{digits}',enabled:1,sort_order:20}],
  exchangeRates:[{id:'fx1',base_currency:'USD',quote_currency:'CNY',rate:7.12,rate_date:'2026-09-26',source:'demo',created_by_name:'演示管理员'}],
  knowledge:[{id:'kb1',title:'设备运行噪音偏高的排查方案',category:'quality',summary:'运输固定件、底座与安装水平度排查',content:'1. 检查运输固定件是否完全拆除。\n2. 校准设备底座。\n3. 使用水平仪复核安装面。\n4. 空载与负载分别测试噪音。',tags:['quality','installation'],status:'published',source_ticket_id:'as1',source_ticket_no:'AS-DEMO-001',use_count:3,created_by_name:'演示管理员',updated_at:now()}],
  automationRules:[{key:'quotation_expiry',name:'报价到期提醒',enabled:1,config:{days:3,priority:'high'}},{key:'inquiry_response_sla',name:'询盘首次响应 SLA',enabled:1,config:{hours:24,priority:'urgent'}}],
  automationCustom:[{id:'ar1',name:'A类客户90天未跟进提醒',entity_type:'customers',enabled:1,conditions:[{field:'grade',operator:'eq',value:'A'},{field:'days_since_activity',operator:'gte',value:90}],actions:[{type:'create_task',title:'请跟进 {name}',priority:'high',due_days:0}],last_run_at:now(),created_by_name:'演示管理员'}],
  automationLogs:[{id:'al1',rule_key:'quotation_expiry',message:'为即将到期报价创建跟进任务',entity_type:'quotation',entity_id:'q1',created_at:now()}],
  reports:[{id:'rp1',name:'订单按月份统计',entity_type:'orders',dimension:'month',metric:'count',chart_type:'bar',filters:{currency:'USD'},is_shared:1,created_by_name:'演示管理员',updated_at:now()}],
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
  if(path==='/users/lookup')return resp(s.users);
  if(path==='/tags')return resp({data:s.tags||[],total:(s.tags||[]).length,page:1,size:(s.tags||[]).length});
  if(path==='/views')return resp(s.views||[]);
  if(path==='/departments')return resp(s.departments||[]);
  if(path==='/settings/channels')return resp(s.channelConfigs||[]);
  if(path==='/settings/exchange-rates')return resp(s.exchangeRates||[]);
  if(path==='/aftersales/summary')return resp({total:s.aftersales.length,open:s.aftersales.filter((x:any)=>!['resolved','closed'].includes(x.status)).length,overdue:0,critical:s.aftersales.filter((x:any)=>x.severity==='critical').length});
  if(path==='/knowledge'){let arr=[...(s.knowledge||[])];if(params.category)arr=arr.filter((x:any)=>x.category===params.category);if(params.status&&params.status!=='all')arr=arr.filter((x:any)=>x.status===params.status);if(params.q){const q=String(params.q).toLowerCase();arr=arr.filter((x:any)=>[x.title,x.summary,x.content,(x.tags||[]).join(' ')].some(v=>String(v||'').toLowerCase().includes(q)))}return resp(arr)}
  if(path==='/knowledge/recommend'){return resp((s.knowledge||[]).filter((x:any)=>x.status==='published').map((x:any)=>({...x,relevance:9.5})).slice(0,8))}
  if(path==='/reports/catalog')return resp({
    customers:{label:'客户',dimensions:{country:'国家',industry:'行业',status:'客户状态',grade:'客户等级',source:'客户来源',owner:'负责人',month:'创建月份'},metrics:{count:'客户数',annual_sales:'年销售额合计',avg_annual_sales:'平均年销售额'},filters:['country','status','grade','source','industry','owner_id']},
    orders:{label:'订单',dimensions:{status:'订单状态',currency:'币种',incoterm:'Incoterm',country:'客户国家',owner:'负责人',month:'订单月份'},metrics:{count:'订单数',total:'订单金额合计',avg_total:'平均订单额'},filters:['country','status','currency','owner_id','incoterm']},
    opportunities:{label:'商机',dimensions:{stage:'销售阶段',currency:'币种',country:'客户国家',owner:'负责人',month:'创建月份'},metrics:{count:'商机数',expected:'预计金额合计',weighted:'加权预测金额'},filters:['country','status','currency','owner_id']},
    quotations:{label:'报价',dimensions:{status:'报价状态',currency:'币种',incoterm:'Incoterm',country:'客户国家',owner:'负责人',month:'报价月份'},metrics:{count:'报价数',total:'报价金额合计',avg_margin:'平均毛利率'},filters:['country','status','currency','owner_id','incoterm']},
    payments:{label:'回款/应收',dimensions:{status:'回款状态',type:'款项类型',currency:'币种',country:'客户国家',owner:'负责人',due_month:'应付月份'},metrics:{count:'记录数',amount:'金额合计'},filters:['country','status','currency','owner_id','type']},
    aftersales:{label:'售后/投诉',dimensions:{status:'工单状态',category:'问题分类',severity:'严重度',team:'责任部门',country:'客户国家',owner:'负责人',month:'开启月份'},metrics:{count:'工单数',avg_satisfaction:'平均满意度'},filters:['country','status','owner_id','category','severity']},
    shipments:{label:'出运',dimensions:{status:'出运状态',carrier:'船公司/承运人',destination:'目的港',country:'客户国家',owner:'负责人',month:'ETD月份'},metrics:{count:'出运批次数'},filters:['country','status','owner_id','carrier','destination']}
  });
  if(path==='/reports')return resp(s.reports||[]);
  if(path==='/automation/rules')return resp(s.automationRules||[]);
  if(path==='/automation/logs')return resp(s.automationLogs||[]);
  if(path==='/automation/custom')return resp(s.automationCustom||[]);
  if(path==='/automation/custom/catalog')return resp({entities:{
    customers:{label:'客户',fields:{status:{label:'客户状态',kind:'string',operators:['eq','neq']},grade:{label:'客户等级',kind:'string',operators:['eq','neq']},country:{label:'国家',kind:'string',operators:['eq','neq','contains']},source:{label:'来源',kind:'string',operators:['eq','neq','contains']},days_since_activity:{label:'距上次跟进天数',kind:'number',operators:['gte','lte','eq']}},actions:['create_task','set_customer_status','set_customer_grade','add_tag']},
    opportunities:{label:'商机',fields:{stage:{label:'商机阶段',kind:'string',operators:['eq','neq']},probability:{label:'成交概率%',kind:'number',operators:['gte','lte','eq']},expected_amount:{label:'预计金额',kind:'number',operators:['gte','lte','eq']},days_to_close:{label:'距预计成交日天数',kind:'number',operators:['gte','lte','eq']}},actions:['create_task','set_opportunity_stage']},
    orders:{label:'订单',fields:{status:{label:'订单状态',kind:'string',operators:['eq','neq']},total:{label:'订单金额',kind:'number',operators:['gte','lte','eq']},days_to_delivery:{label:'距要求交期天数',kind:'number',operators:['gte','lte','eq']}},actions:['create_task','set_order_status']},
    quotations:{label:'报价',fields:{status:{label:'报价状态',kind:'string',operators:['eq','neq']},total:{label:'报价金额',kind:'number',operators:['gte','lte','eq']},margin_rate:{label:'毛利率%',kind:'number',operators:['gte','lte','eq']},days_to_expiry:{label:'距报价到期天数',kind:'number',operators:['gte','lte','eq']}},actions:['create_task','set_quotation_status']},
    aftersales:{label:'售后',fields:{status:{label:'工单状态',kind:'string',operators:['eq','neq']},severity:{label:'严重度',kind:'string',operators:['eq','neq']},days_to_sla:{label:'距 SLA 截止天数',kind:'number',operators:['gte','lte','eq']}},actions:['create_task','set_aftersales_status']}
  },actions:{create_task:{label:'创建跟进任务'},set_customer_status:{label:'修改客户状态'},set_customer_grade:{label:'修改客户等级'},add_tag:{label:'添加客户标签'},set_opportunity_stage:{label:'推进商机阶段'},set_order_status:{label:'修改订单状态'},set_quotation_status:{label:'修改报价状态'},set_aftersales_status:{label:'修改售后状态'}}});
  if(path==='/customers/data-quality'){const data=s.customers.map((x:any)=>({...x,owner_name:'演示管理员',active_contact_count:s.contacts.filter((c:any)=>c.customer_id===x.id).length,active_channel_count:s.channels.length,last_activity_at:s.activities[0]?.occurred_at,days_since_activity:4,quality_score:92,issues:x.website?[]:['invalid_website'],duplicate_reasons:[]}));return resp({summary:{total_customers:data.length,customers_with_issues:data.filter((x:any)=>x.issues.length).length,average_score:data.length?data.reduce((a:number,x:any)=>a+x.quality_score,0)/data.length:100,issues:{}},data})}

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
  if(path==='/reports/run'){const entity=String(b.entity_type||'orders'),dim=String(b.dimension||'month'),metric=String(b.metric||'count');let rows:any[]=[];if(entity==='orders')rows=[{dimension_value:'2026-09',metric_value:s.orders.length},{dimension_value:'2026-10',metric_value:2}];else if(entity==='customers')rows=[{dimension_value:'Germany',metric_value:s.customers.length},{dimension_value:'USA',metric_value:2}];else if(entity==='opportunities')rows=[{dimension_value:'qualification',metric_value:s.opportunities.length},{dimension_value:'negotiation',metric_value:2}];else if(entity==='aftersales')rows=[{dimension_value:'quality',metric_value:s.aftersales.length},{dimension_value:'delivery',metric_value:1}];else rows=[{dimension_value:'Demo',metric_value:1}];return resp({spec:b,entity_label:entity,dimension_label:dim,metric_label:metric,rows,total:rows.reduce((a:any,x:any)=>a+Number(x.metric_value||0),0)})}
  if(path==='/automation/custom/preview')return resp({total_scanned:25,matched_count:3,sample:[{entity_id:'c1',customer_id:'c1',name:'Nordlicht Import GmbH',status:'following',owner_id:'u1'}]});
  if(path==='/automation/run')return resp({created:2,updated:1,custom_rules:[{id:'ar1',name:'A类客户90天未跟进提醒',matched:3,actions_applied:3}]});
  if(path.startsWith('/knowledge/from-ticket/')){const id=uid(),ticketId=pathParts(path)[2],ticket=s.aftersales.find((x:any)=>x.id===ticketId);const obj={id,title:b.title||ticket?.subject||'售后解决方案',category:ticket?.category||'',summary:b.summary||'',content:ticket?.solution||'',tags:b.tags||[],status:b.status||'draft',source_ticket_id:ticketId,source_ticket_no:ticket?.ticket_no,use_count:0,created_by_name:'演示管理员',updated_at:now()};s.knowledge.unshift(obj);persist(s);return resp({id})}
  if(path.match(/^\/knowledge\/[^/]+\/apply$/)){const id=pathParts(path)[1],article=s.knowledge.find((x:any)=>x.id===id),ticket=s.aftersales.find((x:any)=>x.id===b.ticket_id);if(ticket&&article){ticket.solution=article.content;article.use_count=Number(article.use_count||0)+1;persist(s)}return resp({ok:true,solution:article?.content||''})}

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
  const s=load(),[res,id]=pathParts(path),key=collMap[res];
  if(res==='knowledge'&&id){const obj=(s.knowledge||[]).find((x:any)=>x.id===id);if(obj){Object.assign(obj,b,{updated_at:now()});persist(s);return resp(obj)}}
  if(res==='reports'&&id){const obj=(s.reports||[]).find((x:any)=>x.id===id);if(obj){Object.assign(obj,b,{updated_at:now()});persist(s);return resp(obj)}}
  if(path.startsWith('/automation/custom/')&&id){const obj=(s.automationCustom||[]).find((x:any)=>x.id===id);if(obj){Object.assign(obj,b,{updated_at:now()});persist(s);return resp(obj)}}
  if(key&&id){const obj=s[key].find((x:any)=>x.id===id);Object.assign(obj,b,{updated_at:now()});audit(s,'update',res,id);persist(s);return resp(obj)}return resp({});
 },
 async delete(path:string){
  const s=load(),[res,id]=pathParts(path),key=collMap[res];if(key&&id){s[key]=s[key].filter((x:any)=>x.id!==id);if(res==='contacts')s.channels=s.channels.filter((x:any)=>x.contact_id!==id);audit(s,'delete',res,id);persist(s);return resp({ok:true})}return resp({ok:false});
 }
};
