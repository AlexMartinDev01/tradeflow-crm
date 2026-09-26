import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const DB_FILE=process.env.DB_FILE||path.join(ROOT,'.data','tradeflow.db');
const BATCH='FULL_DEMO_2026_V1';
const DEMO_ID_PREFIX='d3adbeef-';
const DEFAULT_PASSWORD='Demo@TradeFlow2026!';

if(!fs.existsSync(DB_FILE)){
  console.error('[Seed] Database not found:',DB_FILE);
  console.error('[Seed] Start TradeFlow once before seeding.');
  process.exit(1);
}

const db=new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON;');

const tableExists=t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const cols=t=>tableExists(t)?db.prepare(\`PRAGMA table_info(\${t})\`).all().map(x=>x.name):[];
const colCache=new Map();
const tableCols=t=>{if(!colCache.has(t))colCache.set(t,cols(t));return colCache.get(t);};
const now=()=>new Date().toISOString();
const d=(offset=0)=>{
  const x=new Date();x.setUTCDate(x.getUTCDate()+offset);return x.toISOString().slice(0,10);
};
const dt=(offset=0,hour=9)=>{
  const x=new Date();x.setUTCDate(x.getUTCDate()+offset);x.setUTCHours(hour,0,0,0);return x.toISOString();
};
const j=v=>JSON.stringify(v);
const hashPassword=(password,salt=randomBytes(16).toString('hex'))=>\`\${salt}:\${scryptSync(password,salt,64).toString('hex')}\`;
const did=(group,index)=>\`d3adbeef-\${Number(group).toString(16).padStart(4,'0')}-4000-8000-\${Number(index).toString(16).padStart(12,'0')}\`;

function insert(table,row){
  if(!tableExists(table))return null;
  const allowed=new Set(tableCols(table)),entries=Object.entries(row).filter(([k])=>allowed.has(k));
  if(!entries.length)return null;
  const names=entries.map(([k])=>k),values=entries.map(([,v])=>v);
  db.prepare(\`INSERT INTO \${table}(\${names.join(',')}) VALUES(\${names.map(()=>'?').join(',')})\`).run(...values);
  return row.id||null;
}
function update(table,id,patch){
  if(!tableExists(table))return;
  const allowed=new Set(tableCols(table)),entries=Object.entries(patch).filter(([k])=>allowed.has(k));
  if(!entries.length)return;
  db.prepare(\`UPDATE \${table} SET \${entries.map(([k])=>k+'=?').join(',')} WHERE id=?\`).run(...entries.map(([,v])=>v),id);
}
function ensureByUnique(table,uniqueField,value,row){
  if(!tableExists(table))return row.id||null;
  const found=db.prepare(\`SELECT * FROM \${table} WHERE \${uniqueField}=? LIMIT 1\`).get(value);
  if(found)return found.id;
  insert(table,row);return row.id;
}
function count(table){
  if(!tableExists(table))return 0;
  return Number(db.prepare(\`SELECT COUNT(*) c FROM \${table}\`).get().c||0);
}

fs.mkdirSync(path.dirname(DB_FILE),{recursive:true});
const backupDir=path.join(path.dirname(DB_FILE),'backups');
fs.mkdirSync(backupDir,{recursive:true});
const backup=path.join(backupDir,\`pre-full-demo-\${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite\`);
try{
  db.exec(\`VACUUM INTO '\${backup.replaceAll("'","''")}'\`);
  console.log('[Seed] Backup created:',backup);
}catch(e){
  console.warn('[Seed] Backup warning:',e.message);
}

console.log('[Seed] Cleaning previous',BATCH,'rows only...');
db.exec('PRAGMA foreign_keys=OFF;');
const childTables=[
  'campaign_events','campaign_recipients','marketing_consents','marketing_segments','email_templates','campaigns',
  'knowledge_articles','aftersales','customs_declaration_items','customs_declarations','shipment_containers','shipment_items','shipments',
  'credit_profiles','payments','order_items','order_changes','orders','contract_versions','contracts','samples','quotation_approvals',
  'quotation_items','quotations','opportunities','inquiries','tasks','activities','price_list_items','price_lists',
  'customer_product_preferences','product_market_rules','products','channel_network_links','customer_brands',
  'contact_channels','contacts','saved_views','report_definitions','automation_custom_rules','exchange_rates'
];
for(const t of childTables){
  if(tableExists(t)&&tableCols(t).includes('id')) db.prepare(\`DELETE FROM \${t} WHERE id LIKE ?\`).run(DEMO_ID_PREFIX+'%');
}
if(tableExists('customer_tags'))db.prepare("DELETE FROM customer_tags WHERE customer_id LIKE ?").run(DEMO_ID_PREFIX+'%');
if(tableExists('customer_collaborators'))db.prepare("DELETE FROM customer_collaborators WHERE customer_id LIKE ? OR user_id LIKE ?").run(DEMO_ID_PREFIX+'%',DEMO_ID_PREFIX+'%');
if(tableExists('sessions'))db.prepare("DELETE FROM sessions WHERE user_id LIKE ?").run(DEMO_ID_PREFIX+'%');
if(tableExists('auth_challenges'))db.prepare("DELETE FROM auth_challenges WHERE user_id LIKE ?").run(DEMO_ID_PREFIX+'%');
for(const t of ['tags','brands','customers','departments','users']){
  if(tableExists(t)&&tableCols(t).includes('id'))db.prepare(\`DELETE FROM \${t} WHERE id LIKE ?\`).run(DEMO_ID_PREFIX+'%');
}
db.exec('PRAGMA foreign_keys=ON;');

const createdAt=dt(-150,8);

// Departments
const deptDefs=[
  {id:did(1,1),name:'海外销售一部（演示）'},
  {id:did(1,2),name:'海外销售二部（演示）'},
  {id:did(1,3),name:'国际业务运营部（演示）'},
  {id:did(1,4),name:'财务与风控部（演示）'},
  {id:did(1,5),name:'客户成功与售后部（演示）'}
];
for(const x of deptDefs)insert('departments',{...x,parent_id:null,manager_user_id:null,enabled:1,created_at:createdAt,updated_at:now()});

// Users
const userDefs=[
  {id:did(2,1),username:'demo.manager',display_name:'林嘉宁',role:'manager',department_id:deptDefs[0].id,data_scope:'all'},
  {id:did(2,2),username:'demo.sales01',display_name:'陈子涵',role:'sales',department_id:deptDefs[0].id,data_scope:'self'},
  {id:did(2,3),username:'demo.sales02',display_name:'周予安',role:'sales',department_id:deptDefs[0].id,data_scope:'self'},
  {id:did(2,4),username:'demo.sales03',display_name:'宋知夏',role:'sales',department_id:deptDefs[1].id,data_scope:'self'},
  {id:did(2,5),username:'demo.followup',display_name:'许言清',role:'followup',department_id:deptDefs[2].id,data_scope:'department'},
  {id:did(2,6),username:'demo.finance',display_name:'唐静怡',role:'finance',department_id:deptDefs[3].id,data_scope:'all'},
  {id:did(2,7),username:'demo.service',display_name:'沈若川',role:'followup',department_id:deptDefs[4].id,data_scope:'department'},
  {id:did(2,8),username:'demo.readonly',display_name:'业务观察员',role:'readonly',department_id:deptDefs[2].id,data_scope:'all'}
];
for(const u of userDefs)insert('users',{
  ...u,password_hash:hashPassword(DEFAULT_PASSWORD),enabled:1,must_change_password:0,password_changed_at:now(),failed_login_count:0,
  locked_until:null,totp_enabled:0,created_at:createdAt
});
update('departments',deptDefs[0].id,{manager_user_id:userDefs[0].id});
update('departments',deptDefs[1].id,{manager_user_id:userDefs[0].id});
update('departments',deptDefs[2].id,{manager_user_id:userDefs[4].id});
update('departments',deptDefs[3].id,{manager_user_id:userDefs[5].id});
update('departments',deptDefs[4].id,{manager_user_id:userDefs[6].id});

// Tags
const tagDefs=[
  ['重点客户','priority'],['高潜客户','value'],['欧洲市场','market'],['北美市场','market'],['亚太市场','market'],['中东市场','market'],
  ['价格敏感','profile'],['交期敏感','profile'],['OEM/ODM','profile'],['渠道客户','profile'],['需认证跟进','risk'],['回款关注','risk']
].map((x,i)=>({id:did(3,i+1),name:x[0]+'（演示）',category:x[1],created_at:createdAt}));
for(const t of tagDefs)insert('tags',t);

// Brands
const brandDefs=[
  {id:did(4,1),name:'Novaris Motion',country:'Germany',group_name:'Novaris Group',main_products:'Servo drives, control systems',positioning:'Premium industrial automation',website:'https://novaris.example.com'},
  {id:did(4,2),name:'Aurelia Control',country:'Italy',group_name:'Aurelia Industries',main_products:'Sensors, valves, control cabinets',positioning:'Mid-high industrial control',website:'https://aurelia.example.com'},
  {id:did(4,3),name:'BluePeak Industrial',country:'Singapore',group_name:'BluePeak Holdings',main_products:'Packaging and smart factory solutions',positioning:'Asia-Pacific channel brand',website:'https://bluepeak.example.com'}
];
for(const b of brandDefs)insert('brands',{...b,logo_url:null,created_at:createdAt,updated_at:now()});

// Products
const productDefs=[
  {id:did(5,1),sku:'TF-SD500',name:'SD500 Servo Drive',category:'Industrial Automation',description:'5kW high precision servo drive',certifications:['CE','RoHS'],base_price:1180,currency:'USD',floor_price:930,hs_code:'8504409999',customs_name:'Servo drive',origin_country:'China',declaration_elements:{brand:'TradeFlow Demo',model:'SD500',usage:'Industrial motion control'}},
  {id:did(5,2),sku:'TF-SV220',name:'SV220 Smart Valve',category:'Process Control',description:'Smart electric control valve DN50',certifications:['CE','RoHS'],base_price:760,currency:'USD',floor_price:590,hs_code:'8481804090',customs_name:'Electric control valve',origin_country:'China',declaration_elements:{material:'Stainless steel',model:'SV220'}},
  {id:did(5,3),sku:'TF-PS80',name:'PS80 Pressure Sensor',category:'Sensors',description:'Industrial pressure sensor 0-16bar',certifications:['CE','RoHS','UKCA'],base_price:128,currency:'USD',floor_price:92,hs_code:'9026209090',customs_name:'Pressure sensor',origin_country:'China',declaration_elements:{range:'0-16bar',output:'4-20mA'}},
  {id:did(5,4),sku:'TF-PK300',name:'PK300 Packaging Controller',category:'Packaging Automation',description:'Packaging line PLC/HMI controller',certifications:['CE','RoHS'],base_price:2450,currency:'USD',floor_price:1980,hs_code:'8537109090',customs_name:'Industrial control cabinet',origin_country:'China',declaration_elements:{voltage:'380V',usage:'Packaging line control'}},
  {id:did(5,5),sku:'TF-IO16',name:'IO16 Remote I/O Module',category:'Industrial Automation',description:'16-channel industrial remote I/O',certifications:['CE','RoHS'],base_price:185,currency:'USD',floor_price:138,hs_code:'8538900000',customs_name:'Remote I/O module',origin_country:'China',declaration_elements:{channels:16,protocol:'Modbus TCP'}},
  {id:did(5,6),sku:'TF-SPK01',name:'Annual Spare Parts Kit',category:'Spare Parts',description:'Recommended one-year spare parts package',certifications:['RoHS'],base_price:980,currency:'USD',floor_price:720,hs_code:'8479909090',customs_name:'Industrial spare parts kit',origin_country:'China',declaration_elements:{usage:'Maintenance spare parts'}}
];
for(const p of productDefs)insert('products',{...p,certifications:j(p.certifications),declaration_elements:j(p.declaration_elements),active:1,created_at:createdAt,updated_at:now()});

// Product market rules
const marketRules=[
  [1,'Germany','certification',['CE','RoHS'],'EU market requires CE/RoHS docs before shipment'],
  [1,'United Kingdom','certification',['UKCA'],'UK projects require UKCA documentation'],
  [2,'United States','certification',['UL'],'UL requested for selected US projects'],
  [3,'Germany','certification',['CE','RoHS'],'CE/RoHS required'],
  [4,'United Arab Emirates','documentation',[],'Provide Arabic/English manuals for project delivery']
];
marketRules.forEach((x,i)=>insert('product_market_rules',{id:did(6,i+1),product_id:productDefs[x[0]-1].id,country:x[1],rule_type:x[2],required_certifications:j(x[3]),notes:x[4],active:1,created_at:createdAt,updated_at:now()}));

// Customers
const countries=[
  ['Nordstern Technik GmbH','Nordstern Technik GmbH','Germany','Hamburg','Industrial Distribution',['Importer','Distributor'],'following','A','Hannover Messe','Europe/Berlin','English',userDefs[1].id,3800000,86,'Industrial automation distribution',['Germany','Austria'],'DE123456789','HRB 88210'],
  ['AlpenWerk Automation AG','AlpenWerk Automation AG','Switzerland','Zurich','Industrial Automation',['Distributor','End User'],'negotiating','A','Referral','Europe/Zurich','German',userDefs[2].id,5200000,120,'Automation integration and machinery',['Switzerland','Southern Germany'],'CHE-118.993.201','CHE-118.993.201'],
  ['Maison Industrie SAS','Maison Industrie SAS','France','Lyon','Industrial Equipment',['Importer','Wholesaler'],'quoted','B','Website Inquiry','Europe/Paris','French',userDefs[1].id,2100000,54,'Industrial components wholesale',['France','Belgium'],'FR45881234567','881234567'],
  ['Rossi Automazione S.r.l.','Rossi Automazione S.r.l.','Italy','Milan','Automation',['Distributor','System Integrator'],'sample','A','Exhibition','Europe/Rome','Italian',userDefs[3].id,3300000,75,'Factory automation projects',['Italy'],'IT10293847561','MI-202611'],
  ['Iberia Motion S.L.','Iberia Motion S.L.','Spain','Barcelona','Industrial Distribution',['Distributor'],'contacted','B','LinkedIn','Europe/Madrid','Spanish',userDefs[3].id,1800000,38,'Motion control distribution',['Spain','Portugal'],'ESB76234519','B76234519'],
  ['Britannia Process Ltd.','Britannia Process Ltd.','United Kingdom','Manchester','Process Control',['Importer','Distributor'],'following','B','Google','Europe/London','English',userDefs[2].id,2900000,62,'Valves and process control',['United Kingdom','Ireland'],'GB218765432','09876543'],
  ['MapleTech Controls Inc.','MapleTech Controls Inc.','Canada','Toronto','Industrial Automation',['Importer','Distributor'],'negotiating','A','Referral','America/Toronto','English',userDefs[1].id,4600000,97,'Automation controls distribution',['Canada'],'CA892334455','ON-774521'],
  ['Prairie Systems LLC','Prairie Systems LLC','United States','Chicago','Packaging Automation',['End User','OEM/ODM'],'quoted','A','Website Inquiry','America/Chicago','English',userDefs[2].id,6400000,145,'Packaging machinery OEM',['United States'],'US36-5588112','IL-5588112'],
  ['Gulf Horizon Trading LLC','Gulf Horizon Trading LLC','United Arab Emirates','Dubai','Industrial Trading',['Importer','Agent'],'following','A','Dubai Exhibition','Asia/Dubai','English',userDefs[3].id,4100000,70,'Industrial project supply',['UAE','Oman','Qatar'],'AE100883920','CN-778210'],
  ['DesertLink Projects Co.','DesertLink Projects Co.','Saudi Arabia','Riyadh','Industrial Projects',['Project Customer','End User'],'potential','B','Partner Referral','Asia/Riyadh','English',userDefs[3].id,7200000,180,'Industrial project contracting',['Saudi Arabia'],'SA311223344','CR10109384'],
  ['LionCity Engineering Pte. Ltd.','LionCity Engineering Pte. Ltd.','Singapore','Singapore','System Integration',['Distributor','System Integrator'],'won','A','Existing Customer','Asia/Singapore','English',userDefs[1].id,5100000,88,'Smart factory integration',['Singapore','Malaysia','Indonesia'],'SG201912345N','201912345N'],
  ['Pacific Motion Pty Ltd.','Pacific Motion Pty Ltd.','Australia','Melbourne','Industrial Distribution',['Importer','Distributor'],'following','B','Google','Australia/Melbourne','English',userDefs[2].id,2700000,48,'Motion products distribution',['Australia','New Zealand'],'AU82123456789','ACN 123456789'],
  ['Kanto Mechatronics Co., Ltd.','Kanto Mechatronics Co., Ltd.','Japan','Yokohama','Mechatronics',['Importer','OEM/ODM'],'sample','A','Tokyo Exhibition','Asia/Tokyo','Japanese',userDefs[1].id,8900000,210,'Mechatronics and machine building',['Japan'],'JP13-0123-456789','130123456789'],
  ['HanRiver Factory Solutions Co., Ltd.','HanRiver Factory Solutions Co., Ltd.','South Korea','Seoul','Smart Factory',['Distributor','System Integrator'],'quoted','B','LinkedIn','Asia/Seoul','Korean',userDefs[3].id,3500000,66,'Smart factory solutions',['South Korea'],'KR220-88-12345','110111-7788990'],
  ['Mekong Automation JSC','Mekong Automation JSC','Vietnam','Ho Chi Minh City','Automation',['Distributor'],'contacted','B','Website Inquiry','Asia/Ho_Chi_Minh','Vietnamese',userDefs[2].id,1600000,42,'Industrial automation distribution',['Vietnam','Cambodia'],'VN0312345678','0312345678'],
  ['Siam Packaging Systems Co., Ltd.','Siam Packaging Systems Co., Ltd.','Thailand','Bangkok','Packaging Machinery',['OEM/ODM','End User'],'following','B','Bangkok Exhibition','Asia/Bangkok','English',userDefs[3].id,2400000,58,'Packaging machine manufacturing',['Thailand'],'TH0105558123456','0105558123456'],
  ['Andes Industrial SpA','Andes Industrial SpA','Chile','Santiago','Industrial Distribution',['Importer','Distributor'],'dormant','C','Legacy','America/Santiago','Spanish',userDefs[2].id,1300000,31,'Industrial products distribution',['Chile','Peru'],'CL76.123.456-7','76543210'],
  ['Cape Automation (Pty) Ltd.','Cape Automation (Pty) Ltd.','South Africa','Johannesburg','Automation',['Distributor','End User'],'lost','C','Website Inquiry','Africa/Johannesburg','English',userDefs[1].id,1200000,28,'Industrial automation supply',['South Africa'],'ZA4123456789','2019/123456/07']
];
const customers=countries.map((x,i)=>({
  id:did(10,i+1),name:x[0],english_name:x[1],local_name:null,country:x[2],region:'',city:x[3],
  address:(100+i)+' Demo Business Park, '+x[3],postal_code:'D'+String(10000+i),website:\`https://customer\${i+1}.example.com\`,
  industry:x[4],customer_types:j(x[5]),status:x[6],grade:x[7],source:x[8],timezone:x[9],language:x[10],owner_id:x[11],
  annual_sales:x[12],employee_count:x[13],business_scope:x[14],service_regions:j(x[15]),tax_no:x[16],registration_no:x[17],
  notes:\`[\${BATCH}] 仿真业务客户，用于完整系统验收。禁止对示例联系方式进行真实营销发送。\`,
  custom_fields:j({demo_batch:BATCH,purchase_cycle:i%3===0?'Quarterly':'Project-based',price_sensitivity:i%4===0?'High':'Medium'}),
  created_at:dt(-140+i*4,8),updated_at:dt(-2+(i%7),10),deleted_at:null
}));
for(const c of customers)insert('customers',c);

// Contacts + channels
const firstNames=['Anna','Markus','Claire','Luca','Sofia','Oliver','Emily','Michael','Omar','Faisal','Ethan','Charlotte','Haruto','Jiwoo','Minh','Narin','Mateo','Thabo'];
const lastNames=['Schmidt','Keller','Martin','Rossi','Garcia','Brown','Chen','Walker','Al Mansoori','Al Saud','Tan','Wilson','Sato','Kim','Nguyen','Sukhum','Rojas','Mokoena'];
const contacts=[];
for(let i=0;i<customers.length;i++){
  const primary={id:did(11,i*2+1),customer_id:customers[i].id,name:\`\${firstNames[i]} \${lastNames[i]}\`,title:i%3===0?'Procurement Director':'Purchasing Manager',department:'Procurement',role:'Decision Maker',language:customers[i].language,timezone:customers[i].timezone,is_primary:1,is_departed:0,birthday:\`198\${i%10}-\${String((i%12)+1).padStart(2,'0')}-\${String((i%20)+5).padStart(2,'0')}\`,influence_level:'high',attitude:i%5===0?'positive':'neutral',notes:'Primary purchasing contact',created_at:dt(-130+i*3),updated_at:dt(-3+i%4)};
  contacts.push(primary);insert('contacts',primary);
  const secondary={id:did(11,i*2+2),customer_id:customers[i].id,name:\`Alex \${lastNames[(i+5)%lastNames.length]}\`,title:i%2===0?'Technical Manager':'Finance Manager',department:i%2===0?'Engineering':'Finance',role:i%2===0?'Technical Influencer':'Finance Approver',language:customers[i].language,timezone:customers[i].timezone,is_primary:0,is_departed:0,birthday:null,influence_level:'medium',attitude:'neutral',notes:'Secondary stakeholder',created_at:dt(-120+i*3),updated_at:dt(-4+i%5)};
  contacts.push(secondary);insert('contacts',secondary);
  const domain=\`customer\${i+1}.example.com\`;
  const channels=[
    ['email',\`\${firstNames[i].toLowerCase()}.\${lastNames[i].toLowerCase().replace(/\\s/g,'')}@\${domain}\`,1,'Work email'],
    ['phone',\`+1-555-\${String(2000+i).padStart(4,'0')}\`,0,'Office'],
    ['whatsapp',\`+1555\${String(300000+i).padStart(6,'0')}\`,0,'WhatsApp'],
    ['linkedin',\`https://www.linkedin.com/in/demo-\${i+1}\`,0,'LinkedIn']
  ];
  channels.forEach((x,k)=>insert('contact_channels',{id:did(12,i*10+k+1),contact_id:primary.id,channel:x[0],value:x[1],label:x[3],is_primary:x[2],preferred_time:'09:00-16:00 local',created_at:dt(-110+i)}));
  insert('contact_channels',{id:did(12,i*10+5),contact_id:secondary.id,channel:'email',value:\`alex.\${i+1}@\${domain}\`,label:'Work email',is_primary:1,preferred_time:'10:00-15:00 local',created_at:dt(-108+i)});
}

// Customer tags
const tagAssignments=[
  [0,[0,2,9]],[1,[0,2,7]],[2,[2,6]],[3,[0,2,8]],[4,[2,6]],[5,[2,10]],[6,[0,3,9]],[7,[0,3,8]],[8,[0,5,9]],[9,[1,5,7]],
  [10,[0,4,9]],[11,[4,7]],[12,[0,4,8,10]],[13,[4,10]],[14,[4,6]],[15,[4,7,8]],[16,[6,7]],[17,[10]]
];
for(const [ci,tis] of tagAssignments)for(const ti of tis)insert('customer_tags',{customer_id:customers[ci].id,tag_id:tagDefs[ti].id});

// Brands / customer brand relations
[
  [0,0,'distributor',['Germany','Austria'],1],[1,0,'distributor',['Switzerland'],0],[3,1,'agent',['Italy'],1],[6,0,'importer',['Canada'],0],
  [8,2,'agent',['UAE','Oman'],1],[10,2,'distributor',['Singapore','Malaysia'],0],[12,1,'OEM/ODM',['Japan'],0],[13,2,'distributor',['South Korea'],0]
].forEach((x,i)=>insert('customer_brands',{id:did(13,i+1),customer_id:customers[x[0]].id,brand_id:brandDefs[x[1]].id,relation_type:x[2],authorized_regions:j(x[3]),exclusive:x[4],start_date:d(-180),end_date:d(365),sales_share:20+i*5,price_band:i%2?'B':'A',notes:\`[\${BATCH}] Channel relationship\`,created_at:dt(-150+i)}));

// Distribution network
[
  [brandDefs[0].id,null,customers[0].id,'importer',1,'Germany',1],
  [brandDefs[0].id,customers[0].id,customers[1].id,'distributor',2,'Switzerland',0],
  [brandDefs[1].id,null,customers[3].id,'agent',1,'Italy',1],
  [brandDefs[2].id,null,customers[8].id,'agent',1,'GCC',1],
  [brandDefs[2].id,null,customers[10].id,'distributor',1,'Singapore/Malaysia',0],
  [brandDefs[2].id,customers[10].id,customers[14].id,'sub_distributor',2,'Vietnam',0]
].forEach((x,i)=>insert('channel_network_links',{id:did(14,i+1),brand_id:x[0],upstream_customer_id:x[1],downstream_customer_id:x[2],relationship_type:x[3],channel_level:x[4],territory:x[5],exclusive:x[6],start_date:d(-180),end_date:d(365),status:'active',notes:'Demo distribution network',created_at:dt(-150),updated_at:now()}));

// Customer product preferences
for(let i=0;i<12;i++)insert('customer_product_preferences',{id:did(15,i+1),customer_id:customers[i].id,product_id:productDefs[i%productDefs.length].id,preference_type:i===5?'avoid':'interested',interest_level:i%3===0?'high':'medium',notes:i===5?'Needs local certification before purchase':'Active product interest',created_at:dt(-90+i),updated_at:dt(-10+i%4)});

// Price lists
const priceLists=[
  {id:did(16,1),name:'EU Distributor 2026 Demo',customer_id:null,currency:'EUR',valid_from:d(-120),valid_to:d(180),status:'active',notes:'Demo EU distributor price list'},
  {id:did(16,2),name:'North America 2026 Demo',customer_id:null,currency:'USD',valid_from:d(-120),valid_to:d(180),status:'active',notes:'Demo North America price list'},
  {id:did(16,3),name:'Nordstern Key Account Demo',customer_id:customers[0].id,currency:'EUR',valid_from:d(-90),valid_to:d(180),status:'active',notes:'Key account negotiated pricing'}
];
priceLists.forEach(x=>insert('price_lists',{...x,created_at:dt(-100),updated_at:now()}));
let pli=1;
for(const pl of priceLists)for(let p=0;p<productDefs.length;p++){
  const base=productDefs[p].base_price*(pl.currency==='EUR'?0.92:1)*(pl.customer_id?0.88:0.94);
  insert('price_list_items',{id:did(17,pli++),price_list_id:pl.id,product_id:productDefs[p].id,min_qty:1,max_qty:49,unit_price:Number(base.toFixed(2)),discount_percent:pl.customer_id?12:6,notes:'Demo tier 1',created_at:dt(-90)});
  insert('price_list_items',{id:did(17,pli++),price_list_id:pl.id,product_id:productDefs[p].id,min_qty:50,max_qty:null,unit_price:Number((base*0.94).toFixed(2)),discount_percent:pl.customer_id?17:11,notes:'Demo volume tier',created_at:dt(-90)});
}

// Activities and tasks
const activityTypes=['email','call','meeting','whatsapp','visit'];
let ai=1,ti=1;
for(let i=0;i<customers.length;i++){
  const pc=contacts[i*2];
  const owner=customers[i].owner_id;
  const events=[
    [-30+i%5,activityTypes[i%5],'Initial requirement discussion','Confirmed application, quantity and target delivery','Send product recommendation and budget quote'],
    [-14+i%4,activityTypes[(i+2)%5],'Technical/Commercial follow-up','Customer requested updated lead time and certification pack','Prepare revised proposal'],
    [-(i%7+1),activityTypes[(i+1)%5],'Latest follow-up','Next-step owner and timeline confirmed',i%4===0?'Arrange management call':'Follow up next week']
  ];
  for(const e of events)insert('activities',{id:did(18,ai++),customer_id:customers[i].id,contact_id:pc.id,type:e[1],subject:e[2],content:e[3],result:'Positive progress',next_action:e[4],occurred_at:dt(e[0],10+i%5),created_by:owner,attachments:j([]),created_at:dt(e[0],10+i%5)});
  if(i<14)insert('tasks',{id:did(19,ti++),customer_id:customers[i].id,title:i%3===0?'Follow up quotation decision':i%3===1?'Confirm technical parameters':'Schedule next customer call',description:\`[\${BATCH}] Generated realistic follow-up task\`,due_at:dt((i%6)-1,9),status:i%5===0?'done':'todo',priority:i%4===0?'high':'normal',assigned_to:owner,created_by:userDefs[0].id,reminder_at:dt((i%6)-1,8),recurring_rule:null,created_at:dt(-10),updated_at:now()});
}

// Inquiries
const inquiryDefs=[
  [0,'website','qualified',[0,2],'120 pcs','EUR 1,000 / set','FCA','Hamburg',25,-12,-11],
  [1,'referral','converted',[0,4],'80 sets','USD 980 / set','DAP','Basel',40,-28,-28],
  [2,'email','responded',[1,2],'200 pcs','EUR 600 / pc','CIF','Le Havre',35,-6,-5],
  [3,'exhibition','converted',[0,1],'50 sets','EUR 1,850 / line','FOB','Genoa',45,-45,-44],
  [5,'google','qualified',[1,2],'300 pcs','GBP 410 / pc','DAP','Felixstowe',30,-3,-2],
  [6,'referral','converted',[0,4],'160 pcs','USD 1,020 / set','CIF','Vancouver',50,-35,-35],
  [7,'website','qualified',[3,4],'12 lines','USD 2,300 / controller','FOB','Los Angeles',60,-8,-7],
  [8,'exhibition','converted',[1,3],'100 pcs','USD 1,100 / set','CIF','Jebel Ali',55,-50,-49],
  [10,'existing','converted',[0,5],'100 sets','USD 1,050 / set','FOB','Singapore',40,-70,-70],
  [12,'exhibition','responded',[0,2],'60 sets','JPY target requested','CIF','Yokohama',70,-4,-3],
  [13,'linkedin','new',[2,4],'250 pcs','USD 95 / pc','CIF','Busan',45,-1,null],
  [15,'exhibition','responded',[3,5],'20 sets','USD 3,100 / set','FOB','Laem Chabang',55,-10,-9]
];
const inquiries=[];
inquiryDefs.forEach((x,i)=>{
  const obj={id:did(20,i+1),inquiry_no:\`INQ-DEMO-\${String(i+1).padStart(3,'0')}\`,customer_id:customers[x[0]].id,contact_id:contacts[x[0]*2].id,source:x[1],status:x[2],products:j(x[3].map(p=>({product_id:productDefs[p].id,sku:productDefs[p].sku,name:productDefs[p].name}))),quantity:x[4],target_price:x[5],incoterm:x[6],destination_port:x[7],requested_delivery:d(x[8]),attachments:j([]),received_at:dt(x[9],8),first_response_at:x[10]===null?null:dt(x[10],12),owner_id:customers[x[0]].owner_id,notes:\`[\${BATCH}] Realistic inquiry scenario\`,created_at:dt(x[9],8),updated_at:dt(Math.min(-1,x[10]??x[9]),12)};
  inquiries.push(obj);insert('inquiries',obj);
});

// Opportunities
const oppDefs=[
  [0,0,'Nordstern 2026 Servo Upgrade','negotiation',142000,'EUR',18,75,'Siemens'],
  [1,1,'AlpenWerk Machine Line Project','quotation',128000,'USD',35,60,'Bosch Rexroth'],
  [2,2,'Maison Valve Distribution Q4','quotation',86000,'EUR',28,55,'Festo'],
  [3,3,'Rossi Packaging Retrofit','sample',95000,'EUR',42,50,'Omron'],
  [5,4,'Britannia Process Control Program','qualification',74000,'GBP',50,35,'Emerson'],
  [6,5,'MapleTech Western Canada Expansion','negotiation',188000,'USD',22,80,'Rockwell'],
  [7,6,'Prairie Packaging OEM Program','solution',260000,'USD',60,45,'Beckhoff'],
  [8,7,'Gulf Horizon GCC Distribution','negotiation',175000,'USD',30,70,'ABB'],
  [10,8,'LionCity Smart Factory Phase II','won',154000,'USD',-20,100,'Mitsubishi'],
  [12,9,'Kanto Compact Servo Validation','sample',118000,'USD',55,45,'Yaskawa']
];
const opportunities=[];
oppDefs.forEach((x,i)=>{
  const obj={id:did(21,i+1),customer_id:customers[x[0]].id,inquiry_id:inquiries[x[1]].id,name:x[2],stage:x[3],expected_amount:x[4],currency:x[5],expected_close_date:d(x[6]),probability:x[7],competitor:x[8],loss_reason:null,owner_id:customers[x[0]].owner_id,notes:\`[\${BATCH}] Pipeline opportunity\`,created_at:dt(-50+i*3),updated_at:dt(-i%5)};
  opportunities.push(obj);insert('opportunities',obj);
});

// Quotations and items
const quoteDefs=[
  [0,0,'EUR','FCA','30% deposit, 70% before shipment',0,2,120,965,0.24,'sent',20],
  [1,1,'USD','DAP','30% deposit, 70% before shipment',0,4,80,995,0.26,'approved',30],
  [2,2,'EUR','CIF','20% deposit, 80% before shipment',1,2,200,585,0.22,'sent',15],
  [3,3,'EUR','FOB','30% deposit, 70% before shipment',0,1,50,725,0.25,'sent',18],
  [5,4,'GBP','DAP','50% deposit, 50% before shipment',1,2,300,104,0.19,'pending_approval',12],
  [6,5,'USD','CIF','30% deposit, 70% before shipment',0,4,160,168,0.27,'accepted',25],
  [8,7,'USD','CIF','30% deposit, 70% before shipment',1,3,40,2320,0.23,'accepted',22],
  [10,8,'USD','FOB','T/T 30/70',0,5,100,910,0.28,'accepted',10],
  [12,9,'USD','CIF','30% deposit, 70% before shipment',0,2,60,118,0.21,'sent',30]
];
const quotations=[];
quoteDefs.forEach((x,i)=>{
  const prod1=productDefs[x[5]],prod2=productDefs[x[6]],q1=x[7],p1=x[8],q2=Math.max(10,Math.round(q1*0.4)),p2=Number((prod2.base_price*0.9).toFixed(2));
  const subtotal=Number((q1*p1+q2*p2).toFixed(2)),discount=i%4===0?Number((subtotal*0.03).toFixed(2)):0,total=subtotal-discount;
  const obj={id:did(22,i+1),quote_no:\`QT-DEMO-2026-\${String(i+1).padStart(3,'0')}\`,customer_id:customers[x[0]].id,contact_id:contacts[x[0]*2].id,opportunity_id:opportunities[x[1]].id,version:1,currency:x[2],incoterm:x[3],payment_terms:x[4],moq:'10 units',packaging:'Export carton/pallet',lead_time:'6-8 weeks',valid_until:d(x[11]),subtotal,discount,total,margin_rate:Number((x[9]*100).toFixed(1)),status:x[10],notes:\`[\${BATCH}] Commercial quotation\`,created_at:dt(-20+i),updated_at:dt(-5+i%3)};
  quotations.push(obj);insert('quotations',obj);
  insert('quotation_items',{id:did(23,i*2+1),quotation_id:obj.id,product_code:prod1.sku,product_name:prod1.name,quantity:q1,unit:'pcs',unit_price:p1,amount:Number((q1*p1).toFixed(2)),cost:Number((p1*(1-x[9])).toFixed(2)),spec:'Standard export configuration'});
  insert('quotation_items',{id:did(23,i*2+2),quotation_id:obj.id,product_code:prod2.sku,product_name:prod2.name,quantity:q2,unit:'pcs',unit_price:p2,amount:Number((q2*p2).toFixed(2)),cost:Number((p2*0.72).toFixed(2)),spec:'Accessory / supporting item'});
});


if(tableExists('quotation_approvals')){
  insert('quotation_approvals',{id:did(24,1),quotation_id:quotations[4].id,status:'pending',reasons:j([{code:'low_margin',label:'Margin below policy threshold'}]),submitted_by:customers[5].owner_id,decided_by:null,comment:null,submitted_at:dt(-2),decided_at:null});
  insert('quotation_approvals',{id:did(24,2),quotation_id:quotations[1].id,status:'approved',reasons:j([]),submitted_by:customers[1].owner_id,decided_by:userDefs[0].id,comment:'Approved for strategic account',submitted_at:dt(-12),decided_at:dt(-11)});
}

// Samples
[[3,3,0,'2 sets',0,'DHL','DHL-DEMO-001','delivered','Performance accepted, request commercial revision'],[12,9,0,'3 sets',150,'FedEx','FDX-DEMO-002','delivered','Technical validation in progress'],[2,2,1,'4 pcs',0,'UPS','UPS-DEMO-003','sent','Awaiting receipt'],[7,6,3,'1 set',250,'DHL','DHL-DEMO-004','requested','OEM controller evaluation']].forEach((x,i)=>insert('samples',{id:did(25,i+1),customer_id:customers[x[0]].id,opportunity_id:opportunities[x[1]].id,product:productDefs[x[2]].name,quantity:x[3],fee:x[4],currency:'USD',courier:x[5],tracking_no:x[6],sent_at:i===3?null:dt(-15+i*3),delivered_at:i<2?dt(-10+i*2):null,feedback:x[8],status:x[7],created_at:dt(-20+i*3),updated_at:now()}));

// Contracts
const contractDefs=[
  [1,1,128000,'USD','active',-10,365],
  [6,5,188000,'USD','active',-18,365],
  [8,6,109500,'USD','active',-25,365],
  [10,7,154000,'USD','active',-70,365],
  [0,0,142000,'EUR','draft',null,365],
  [3,3,95000,'EUR','draft',null,365]
];
const contracts=[];
contractDefs.forEach((x,i)=>{
  const obj={id:did(26,i+1),contract_no:\`CT-DEMO-2026-\${String(i+1).padStart(3,'0')}\`,customer_id:customers[x[0]].id,quotation_id:quotations[x[1]].id,amount:x[2],currency:x[3],signed_at:x[5]===null?null:d(x[5]),effective_from:x[5]===null?null:d(x[5]),effective_to:d(x[6]),status:x[4],terms:'Quality acceptance per approved specification. Incoterm and payment terms follow accepted quotation.',attachments:j([]),current_version:1,created_at:dt(-80+i*8),updated_at:now()};
  contracts.push(obj);insert('contracts',obj);
  if(tableExists('contract_versions'))insert('contract_versions',{id:did(27,i+1),contract_id:obj.id,version:1,amount:obj.amount,currency:obj.currency,effective_from:obj.effective_from,effective_to:obj.effective_to,terms:obj.terms,snapshot:j({source:'demo_seed',contract_no:obj.contract_no}),created_by:userDefs[0].id,created_at:obj.created_at});
});

// Orders
const orderDefs=[
  [10,7,3,'SO-DEMO-2026-001','PO-SG-260801','completed','USD','FOB',154000,-45],
  [6,5,1,'SO-DEMO-2026-002','PO-CA-260915','production','USD','CIF',188000,38],
  [8,6,2,'SO-DEMO-2026-003','PO-UAE-260922','ready','USD','CIF',109500,20],
  [1,1,0,'SO-DEMO-2026-004','PO-CH-260918','confirmed','USD','DAP',128000,42],
  [0,0,4,'SO-DEMO-2026-005','PO-DE-260925','pending','EUR','FCA',142000,50],
  [3,3,5,'SO-DEMO-2026-006','PO-IT-260920','production','EUR','FOB',95000,35],
  [7,6,null,'SO-DEMO-2026-007','PO-US-260830','partial_shipped','USD','FOB',226000,25]
];
const orders=[];
orderDefs.forEach((x,i)=>{
  const obj={id:did(28,i+1),order_no:x[3],customer_id:customers[x[0]].id,quotation_id:quotations[x[1]].id,contract_id:x[2]===null?null:contracts[x[2]].id,customer_po:x[4],status:x[5],currency:x[6],incoterm:x[7],payment_terms:'30% deposit, 70% before shipment',total:x[8],requested_delivery:d(x[9]),notes:\`[\${BATCH}] Sales order for end-to-end demo\`,created_at:dt(-60+i*5),updated_at:dt(-i%4)};
  orders.push(obj);insert('orders',obj);
  const pA=productDefs[i%productDefs.length],pB=productDefs[(i+2)%productDefs.length],qtyA=50+i*20,qtyB=20+i*10,priceA=Number((obj.total*0.72/qtyA).toFixed(2)),priceB=Number((obj.total*0.28/qtyB).toFixed(2));
  insert('order_items',{id:did(29,i*2+1),order_id:obj.id,product_id:pA.id,product_name:pA.name,quantity:qtyA,unit:'pcs',unit_price:priceA,amount:Number((qtyA*priceA).toFixed(2)),delivery_date:obj.requested_delivery});
  insert('order_items',{id:did(29,i*2+2),order_id:obj.id,product_id:pB.id,product_name:pB.name,quantity:qtyB,unit:'pcs',unit_price:priceB,amount:Number((qtyB*priceB).toFixed(2)),delivery_date:obj.requested_delivery});
});
if(tableExists('order_changes')){
  insert('order_changes',{id:did(30,1),order_id:orders[1].id,field_name:'requested_delivery',old_value:d(30),new_value:d(38),changed_by:userDefs[1].id,note:'Customer requested 8-day extension for site readiness',created_at:dt(-5)});
  insert('order_changes',{id:did(30,2),order_id:orders[6].id,field_name:'status',old_value:'production',new_value:'partial_shipped',changed_by:userDefs[2].id,note:'First batch shipped by air',created_at:dt(-3)});
}

// Payments
let payIndex=1;
for(let i=0;i<orders.length;i++){
  const o=orders[i],deposit=Number((o.total*0.3).toFixed(2)),balance=Number((o.total-deposit).toFixed(2));
  insert('payments',{id:did(31,payIndex++),customer_id:o.customer_id,order_id:o.id,type:'deposit',amount:deposit,currency:o.currency,due_at:dt(-45+i*5),paid_at:i===4?null:dt(-42+i*5),status:i===4?'overdue':'paid',bank_ref:i===4?null:\`BANK-DEMO-\${i+1}-D\`,notes:'30% deposit',created_at:dt(-50+i*5),updated_at:now()});
  insert('payments',{id:did(31,payIndex++),customer_id:o.customer_id,order_id:o.id,type:'balance',amount:balance,currency:o.currency,due_at:dt(i===0?-20:15+i*6),paid_at:i===0?dt(-18):null,status:i===0?'paid':(i===6?'partial':'pending'),bank_ref:i===0?'BANK-DEMO-SG-B':null,notes:'Balance payment before shipment',created_at:dt(-40+i*5),updated_at:now()});
}

// Credit profiles
for(let i=0;i<12;i++)insert('credit_profiles',{id:did(32,i+1),customer_id:customers[i].id,rating:i<4?'A':i<9?'B':'C',credit_limit:[250000,180000,120000][i%3],currency:i<6?'EUR':'USD',payment_days:i%3===0?30:15,insured_limit:i%2===0?100000:0,overdue_count:i===4?2:i===8?1:0,max_overdue_days:i===4?18:i===8?7:0,notes:\`[\${BATCH}] Credit profile\`,updated_at:now()});

// Shipments
const shipmentDefs=[
  [0,'BK-DEMO-SG-001','Maersk','Kuehne+Nagel','MAERSK DEMO 102E','40HQ','MSCU-DEMO-001','BL-DEMO-001','Shanghai','Singapore',-35,-20,'delivered'],
  [1,'BK-DEMO-CA-002','COSCO','DHL Global Forwarding','COSCO DEMO 88W','40GP','COSU-DEMO-002','BL-DEMO-002','Shanghai','Vancouver',8,28,'booked'],
  [2,'BK-DEMO-UAE-003','CMA CGM','Expeditors','CMA DEMO 16E','20GP','CMAU-DEMO-003','BL-DEMO-003','Ningbo','Jebel Ali',5,22,'ready'],
  [5,'BK-DEMO-IT-004','MSC','DSV','MSC DEMO 72W','20GP','MSCU-DEMO-004','BL-DEMO-004','Shanghai','Genoa',12,32,'booking'],
  [6,'BK-DEMO-US-005','FedEx Air','Expeditors','AIR DEMO','AIR','AIR-DEMO-005','AWB-DEMO-005','Shanghai','Chicago',-4,-2,'partial_delivered']
];
const shipments=[];
shipmentDefs.forEach((x,i)=>{
  const obj={id:did(33,i+1),order_id:orders[x[0]].id,booking_no:x[1],carrier:x[2],forwarder:x[3],vessel_voyage:x[4],container_type:x[5],container_no:x[6],bl_no:x[7],port_of_loading:x[8],destination_port:x[9],etd:d(x[10]),eta:d(x[11]),status:x[12],tracking_url:'https://tracking.example.com/'+x[1],notes:\`[\${BATCH}] Shipment\`,created_at:dt(-20+i*4),updated_at:now()};
  shipments.push(obj);insert('shipments',obj);
  const oi=db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(obj.order_id);
  oi.forEach((r,k)=>insert('shipment_items',{id:did(34,i*10+k+1),shipment_id:obj.id,order_item_id:r.id,product_name:r.product_name,quantity:i===4?Math.round(r.quantity*0.5):r.quantity,unit:r.unit,created_at:dt(-10+i)}));
  if(x[5]!=='AIR')insert('shipment_containers',{id:did(35,i+1),shipment_id:obj.id,container_type:x[5],container_no:x[6],seal_no:'SEAL-DEMO-'+String(i+1).padStart(3,'0'),created_at:dt(-10+i)});
});

// Customs declarations
for(let i=0;i<4;i++){
  const sh=shipments[i],ord=orders[shipmentDefs[i][0]],decl={id:did(36,i+1),declaration_no:\`CUS-DEMO-2026-\${String(i+1).padStart(3,'0')}\`,order_id:ord.id,shipment_id:sh.id,export_country:'China',destination_country:customers[shipmentDefs[i][0]===0?10:shipmentDefs[i][0]===1?6:shipmentDefs[i][0]===2?8:3].country,customs_office:i%2?'Shanghai Customs':'Ningbo Customs',declaration_date:d(-3+i*3),trade_mode:'General Trade',incoterm:ord.incoterm,currency:ord.currency,total_value:ord.total,status:i===0?'released':i===1?'submitted':'draft',notes:\`[\${BATCH}] Customs declaration\`,created_by:userDefs[4].id,created_at:dt(-8+i),updated_at:now()};
  insert('customs_declarations',decl);
  const items=db.prepare('SELECT * FROM order_items WHERE order_id=?').all(ord.id);
  items.forEach((r,k)=>{
    const p=productDefs.find(x=>x.id===r.product_id)||productDefs[0];
    insert('customs_declaration_items',{id:did(37,i*10+k+1),declaration_id:decl.id,order_item_id:r.id,product_id:p.id,product_name:r.product_name,hs_code:p.hs_code,customs_name:p.customs_name,quantity:r.quantity,unit:r.unit,unit_price:r.unit_price,total_value:r.amount,origin_country:'China',brand:'TradeFlow Demo',model:p.sku,material:p.category.includes('Valve')?'Stainless steel':'Industrial electronic assembly',usage:'Industrial automation',declaration_elements:j(p.declaration_elements),created_at:decl.created_at,updated_at:now()});
  });
}

// Aftersales + knowledge
const afterDefs=[
  [10,0,'quality','normal','Servo drive startup alarm after installation','Customer reported an alarm during first commissioning.','Technical Support','Firmware parameter mismatch identified; reset motor profile and reload approved parameter set.','closed',5,-28,-24],
  [6,1,'delivery','high','Partial shipment arrived two days late','Customer production plan was affected by customs inspection delay.','Logistics','Shared customs inspection evidence, revised ETA, and arranged priority local delivery.','resolved',4,-8,-2],
  [8,2,'documents','normal','Certificate pack missing Arabic cover page','Project team requested bilingual document package.','Documentation','Issued bilingual cover page and updated document checklist for GCC project shipments.','resolved',5,-12,-5],
  [3,5,'quality','critical','Valve actuator torque deviation','Incoming inspection found torque values outside agreed tolerance.','Quality','Quarantined affected batch, completed 8D analysis, replaced actuator lot and tightened outgoing inspection sampling.','investigating',null,-3,null],
  [7,6,'service','normal','OEM integration API clarification','Engineering team requested Modbus register mapping clarification.','Technical Support','Provided protocol map, sample configuration and remote review meeting.','open',null,-1,null]
];
const aftersales=[];
afterDefs.forEach((x,i)=>{
  const obj={id:did(38,i+1),ticket_no:\`AS-DEMO-2026-\${String(i+1).padStart(3,'0')}\`,customer_id:customers[x[0]].id,order_id:orders[x[1]].id,category:x[2],severity:x[3],subject:x[4],description:x[5],responsible_team:x[6],solution:x[7],status:x[8],satisfaction:x[9],opened_at:dt(x[10]),closed_at:x[11]===null?null:dt(x[11]),updated_at:now(),sla_due_at:dt(x[10]+(x[3]==='critical'?2:5))};
  aftersales.push(obj);insert('aftersales',obj);
});
for(let i=0;i<3;i++)insert('knowledge_articles',{id:did(39,i+1),title:[ 'Servo drive commissioning alarm troubleshooting','International shipment delay communication checklist','GCC bilingual document package checklist'][i],category:aftersales[i].category,summary:\`Validated resolution from \${aftersales[i].ticket_no}\`,content:aftersales[i].solution,tags:j([aftersales[i].category,'validated','demo']),status:'published',source_ticket_id:aftersales[i].id,use_count:[6,3,4][i],created_by:userDefs[6].id,created_at:dt(-20+i*3),updated_at:now()});

// Marketing
const segmentId=did(40,1),templateId=did(41,1),campaignId=did(42,1);
insert('marketing_segments',{id:segmentId,name:'欧洲 A/B 类自动化客户（演示）',rules:j({country:'Germany',grade:'A'}),is_shared:1,created_by:userDefs[0].id,created_at:dt(-20),updated_at:now()});
insert('email_templates',{id:templateId,name:'2026 Q4 产品更新（演示）',subject:'{{customer_name}} - Q4 automation product update',body:'Hi {{contact_name}},\\n\\nWe prepared a Q4 automation product update for {{customer_name}}.\\n\\nRegards,\\n{{company_name}}',created_at:dt(-20),updated_at:now()});
insert('campaigns',{id:campaignId,name:'2026 Q4 Europe Distributor Update（演示）',type:'email',segment_rule:j({grade:'A'}),status:'completed',scheduled_at:dt(-7),content:'Q4 product and lead-time update',created_at:dt(-15),updated_at:now()});
for(let i=0;i<8;i++){
  const c=customers[i],ct=contacts[i*2],email=db.prepare("SELECT value FROM contact_channels WHERE contact_id=? AND channel='email' LIMIT 1").get(ct.id)?.value||'';
  insert('marketing_consents',{id:did(43,i+1),customer_id:c.id,contact_id:ct.id,channel:'email',status:i===7?'opt_out':'opt_in',source:'demo_seed',updated_at:now()});
  insert('campaign_recipients',{id:did(44,i+1),campaign_id:campaignId,customer_id:c.id,contact_id:ct.id,address:email,status:i===7?'skipped':'sent',reason:i===7?'opt_out':null,personalized_subject:\`\${c.name} - Q4 automation product update\`,personalized_body:'Demo campaign content',sent_at:i===7?null:dt(-7,10),converted_at:i===1?dt(-2):null,created_at:dt(-8),attempt_count:i===7?0:1,provider_message_id:i===7?null:\`<demo-\${i+1}@tradeflow.local>\`,send_error:null,open_count:i<5?2:0,click_count:i<3?1:0,first_opened_at:i<5?dt(-6,9):null,last_opened_at:i<5?dt(-5,10):null,first_clicked_at:i<3?dt(-5,11):null,last_clicked_at:i<3?dt(-5,11):null,unsubscribed_at:i===7?dt(-6):null});
}

// Exchange rates
[
 ['USD','CNY',7.12],['EUR','CNY',8.39],['GBP','CNY',9.64],['USD','EUR',0.848],['USD','GBP',0.738],['USD','JPY',149.8],['USD','CAD',1.36],['USD','AUD',1.51]
].forEach((x,i)=>insert('exchange_rates',{id:did(45,i+1),base_currency:x[0],quote_currency:x[1],rate:x[2],rate_date:d(-1),source:'Demo Finance Reference',notes:\`[\${BATCH}] Non-live reference rate for system testing\`,created_by:userDefs[5].id,created_at:dt(-1),updated_at:now()}));

// Saved views / reports / custom automation
insert('saved_views',{id:did(46,1),user_id:userDefs[0].id,entity_type:'customers',name:'欧洲重点客户（演示）',filters:j({grade:'A',customer_type:'Distributor'}),is_shared:1,created_at:dt(-10),updated_at:now()});
insert('saved_views',{id:did(46,2),user_id:userDefs[1].id,entity_type:'customers',name:'我的待跟进客户（演示）',filters:j({status:'following'}),is_shared:0,created_at:dt(-9),updated_at:now()});
insert('report_definitions',{id:did(47,1),name:'订单按月份趋势（演示）',entity_type:'orders',dimension:'month',metric:'count',chart_type:'line',filters:j({currency:'USD'}),is_shared:1,created_by:userDefs[0].id,created_at:dt(-8),updated_at:now()});
insert('report_definitions',{id:did(47,2),name:'客户国家分布（演示）',entity_type:'customers',dimension:'country',metric:'count',chart_type:'bar',filters:j({}),is_shared:1,created_by:userDefs[0].id,created_at:dt(-8),updated_at:now()});
insert('automation_custom_rules',{id:did(48,1),name:'A类客户30天未跟进提醒（演示）',entity_type:'customers',enabled:1,conditions:j([{field:'grade',operator:'eq',value:'A'},{field:'days_since_activity',operator:'gte',value:30}]),actions:j([{type:'create_task',title:'请跟进 {name}',description:'A类客户超过30天未跟进',priority:'high',due_days:0}]),created_by:userDefs[0].id,last_run_at:null,created_at:dt(-5),updated_at:now()});
insert('automation_custom_rules',{id:did(48,2),name:'订单交期7天提醒（演示）',entity_type:'orders',enabled:1,conditions:j([{field:'days_to_delivery',operator:'lte',value:7},{field:'status',operator:'neq',value:'completed'}]),actions:j([{type:'create_task',title:'确认订单 {id} 交付准备',description:'订单进入交付窗口，请核对生产、单证和物流',priority:'high',due_days:0}]),created_by:userDefs[0].id,last_run_at:null,created_at:dt(-5),updated_at:now()});

// Company/demo settings
if(tableExists('settings')){
  const set=(key,value)=>db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key,j(value),now());
  set('demo_seed_info',{batch:BATCH,seeded_at:now(),password:DEFAULT_PASSWORD,warning:'Synthetic realistic demo data. Do not use demo contacts for real outreach.'});
  set('quotation_approval_policy',{min_margin_rate:20,max_discount_percent:10,special_payment_keywords:['OA','D/P','D/A'],block_below_floor_price:true});
}

console.log('\\n[Seed] FULL DEMO DATA READY');
console.log('[Seed] Batch:',BATCH);
console.log('[Seed] Database:',DB_FILE);
console.log('[Seed] Backup:',backup);
console.log('\\n[Seed] Demo login accounts (same password):',DEFAULT_PASSWORD);
for(const u of userDefs)console.log(\`  \${u.username.padEnd(16)} \${u.role.padEnd(9)} \${u.display_name}\`);

const summaryTables=['users','departments','customers','contacts','contact_channels','activities','tasks','inquiries','opportunities','quotations','quotation_items','products','contracts','orders','order_items','payments','credit_profiles','shipments','customs_declarations','aftersales','knowledge_articles','campaigns','campaign_recipients','report_definitions','automation_custom_rules'];
console.log('\\n[Seed] Current table counts:');
for(const t of summaryTables)console.log('  '+t.padEnd(28)+count(t));
console.log('\\n[Seed] Refresh the browser. No server restart is required for SQLite data changes.');
db.close();
