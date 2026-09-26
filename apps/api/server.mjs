import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac, createHash } from 'node:crypto';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.resolve('./tradeflow.db');
const APP_SECRET = process.env.APP_SECRET || 'dev-only-change-me';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const WEB_DIST = process.env.WEB_DIST || path.resolve('./apps/web/dist');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve('./uploads');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const schema = `
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'sales', enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY, name TEXT NOT NULL, english_name TEXT, local_name TEXT, country TEXT, region TEXT, city TEXT, address TEXT, postal_code TEXT, website TEXT, industry TEXT, customer_types TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'potential', grade TEXT, source TEXT, timezone TEXT, language TEXT, tax_no TEXT, registration_no TEXT, owner_id TEXT, annual_sales REAL, employee_count INTEGER, business_scope TEXT, service_regions TEXT NOT NULL DEFAULT '[]', notes TEXT, custom_fields TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL, title TEXT, department TEXT, role TEXT, language TEXT, timezone TEXT, is_primary INTEGER NOT NULL DEFAULT 0, is_departed INTEGER NOT NULL DEFAULT 0, birthday TEXT, influence_level TEXT, attitude TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS contact_channels(id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, channel TEXT NOT NULL, value TEXT NOT NULL, label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, preferred_time TEXT, created_at TEXT NOT NULL, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS brands(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, logo_url TEXT, website TEXT, country TEXT, group_name TEXT, main_products TEXT, positioning TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer_brands(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, brand_id TEXT NOT NULL, relation_type TEXT NOT NULL, authorized_regions TEXT NOT NULL DEFAULT '[]', exclusive INTEGER NOT NULL DEFAULT 0, start_date TEXT, end_date TEXT, sales_share REAL, price_band TEXT, notes TEXT, created_at TEXT NOT NULL, UNIQUE(customer_id, brand_id, relation_type), FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, category TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer_tags(customer_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(customer_id,tag_id), FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS custom_field_defs(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, field_key TEXT NOT NULL, label TEXT NOT NULL, data_type TEXT NOT NULL, options TEXT NOT NULL DEFAULT '[]', group_name TEXT, required INTEGER NOT NULL DEFAULT 0, unique_value INTEGER NOT NULL DEFAULT 0, searchable INTEGER NOT NULL DEFAULT 1, visible_roles TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, UNIQUE(entity_type, field_key));
CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, contact_id TEXT, type TEXT NOT NULL, subject TEXT, content TEXT NOT NULL, result TEXT, next_action TEXT, occurred_at TEXT NOT NULL, created_by TEXT, attachments TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, customer_id TEXT, title TEXT NOT NULL, description TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', assigned_to TEXT, created_by TEXT, reminder_at TEXT, recurring_rule TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inquiries(id TEXT PRIMARY KEY, inquiry_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, contact_id TEXT, source TEXT, status TEXT NOT NULL DEFAULT 'new', products TEXT NOT NULL DEFAULT '[]', quantity TEXT, target_price TEXT, incoterm TEXT, destination_port TEXT, requested_delivery TEXT, attachments TEXT NOT NULL DEFAULT '[]', received_at TEXT NOT NULL, first_response_at TEXT, owner_id TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, inquiry_id TEXT, name TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'qualification', expected_amount REAL, currency TEXT DEFAULT 'USD', expected_close_date TEXT, probability REAL, competitor TEXT, loss_reason TEXT, owner_id TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotations(id TEXT PRIMARY KEY, quote_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, contact_id TEXT, opportunity_id TEXT, version INTEGER NOT NULL DEFAULT 1, currency TEXT NOT NULL DEFAULT 'USD', incoterm TEXT, payment_terms TEXT, moq TEXT, packaging TEXT, lead_time TEXT, valid_until TEXT, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, margin_rate REAL, status TEXT NOT NULL DEFAULT 'draft', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotation_items(id TEXT PRIMARY KEY, quotation_id TEXT NOT NULL, product_code TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit TEXT, unit_price REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, cost REAL, spec TEXT, FOREIGN KEY(quotation_id) REFERENCES quotations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, opportunity_id TEXT, product TEXT NOT NULL, quantity TEXT, fee REAL, currency TEXT DEFAULT 'USD', courier TEXT, tracking_no TEXT, sent_at TEXT, delivered_at TEXT, feedback TEXT, status TEXT NOT NULL DEFAULT 'requested', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, category TEXT, description TEXT, certifications TEXT NOT NULL DEFAULT '[]', base_price REAL, currency TEXT DEFAULT 'USD', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY, contract_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, quotation_id TEXT, amount REAL, currency TEXT DEFAULT 'USD', signed_at TEXT, effective_from TEXT, effective_to TEXT, status TEXT DEFAULT 'draft', terms TEXT, attachments TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, quotation_id TEXT, contract_id TEXT, customer_po TEXT, status TEXT NOT NULL DEFAULT 'pending', currency TEXT DEFAULT 'USD', incoterm TEXT, payment_terms TEXT, total REAL NOT NULL DEFAULT 0, requested_delivery TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_changes(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, changed_by TEXT, note TEXT, created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS order_items(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT, unit_price REAL NOT NULL, amount REAL NOT NULL, delivery_date TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, order_id TEXT, type TEXT, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', due_at TEXT, paid_at TEXT, status TEXT NOT NULL DEFAULT 'pending', bank_ref TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_profiles(id TEXT PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL, rating TEXT, credit_limit REAL, currency TEXT DEFAULT 'USD', payment_days INTEGER, insured_limit REAL, overdue_count INTEGER NOT NULL DEFAULT 0, max_overdue_days INTEGER NOT NULL DEFAULT 0, notes TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, booking_no TEXT, carrier TEXT, forwarder TEXT, vessel_voyage TEXT, container_type TEXT, container_no TEXT, bl_no TEXT, port_of_loading TEXT, destination_port TEXT, etd TEXT, eta TEXT, status TEXT NOT NULL DEFAULT 'booking', tracking_url TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipment_items(id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, order_item_id TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT, created_at TEXT NOT NULL, FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS shipment_containers(id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, container_type TEXT, container_no TEXT, seal_no TEXT, created_at TEXT NOT NULL, FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, category TEXT, name TEXT NOT NULL, version TEXT, url TEXT, content_base64 TEXT, mime_type TEXT, notes TEXT, uploaded_by TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aftersales(id TEXT PRIMARY KEY, ticket_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, order_id TEXT, category TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'normal', subject TEXT NOT NULL, description TEXT NOT NULL, responsible_team TEXT, solution TEXT, status TEXT NOT NULL DEFAULT 'open', satisfaction INTEGER, opened_at TEXT NOT NULL, closed_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, segment_rule TEXT, status TEXT NOT NULL DEFAULT 'draft', scheduled_at TEXT, content TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, ip TEXT, request_id TEXT, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS automation_rules(key TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, config TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS automation_logs(id TEXT PRIMARY KEY, rule_key TEXT NOT NULL, message TEXT NOT NULL, entity_type TEXT, entity_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS saved_views(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entity_type TEXT NOT NULL, name TEXT NOT NULL, filters TEXT NOT NULL DEFAULT '{}', is_shared INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_activities_customer_time ON activities(customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_inquiries_customer ON inquiries(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_customer ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_due ON payments(status, due_at);
`;
db.exec(schema);
try{db.exec("ALTER TABLE tasks ADD COLUMN automation_key TEXT");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_automation_key ON tasks(automation_key)");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN storage_path TEXT");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN size_bytes INTEGER");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN checksum TEXT");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN original_name TEXT");}catch{}
try{db.exec("ALTER TABLE aftersales ADD COLUMN sla_due_at TEXT");}catch{}
try{db.exec("ALTER TABLE aftersales ADD COLUMN closed_at TEXT");}catch{}
try{db.exec("ALTER TABLE aftersales ADD COLUMN satisfaction_note TEXT");}catch{}

const now = () => new Date().toISOString();
const parseJSON = (v, fallback = null) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password, stored) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h,'hex'); const b = scryptSync(password,salt,64); return a.length===b.length && timingSafeEqual(a,b); };
const hashToken = token => createHmac('sha256', APP_SECRET).update(token).digest('hex');

function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (!count) {
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),'admin','系统管理员',hashPassword('Admin@123456'),'admin',now());
    const cid = randomUUID();
    db.prepare(`INSERT INTO customers(id,name,english_name,country,city,website,industry,customer_types,status,grade,source,timezone,language,owner_id,business_scope,service_regions,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(cid,'示例国际贸易有限公司','Demo Global Trading Ltd.','Germany','Hamburg','https://example.com','Industrial Equipment',JSON.stringify(['Importer','Distributor']),'following','A','Exhibition','Europe/Berlin','English',db.prepare('SELECT id FROM users LIMIT 1').get().id,'Industrial equipment distribution',JSON.stringify(['Germany','EU']),'系统初始化示例客户',now(),now());
    const contactId = randomUUID();
    db.prepare('INSERT INTO contacts(id,customer_id,name,title,department,role,language,timezone,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(contactId,cid,'Anna Schmidt','Purchasing Manager','Procurement','Decision Maker','English','Europe/Berlin',1,now(),now());
    const channels = [['email','anna@example.com'],['whatsapp','491701234567'],['linkedin','https://linkedin.com'],['website','https://example.com']];
    for (const [channel,value] of channels) db.prepare('INSERT INTO contact_channels(id,contact_id,channel,value,is_primary,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),contactId,channel,value,channel==='email'?1:0,now());
  }
}

seed();
const automationDefaults=[
  ['overdue_payment','逾期回款提醒',1,{priority:'urgent'}],
  ['quotation_expiry','报价到期提醒',1,{days:3,priority:'high'}],
  ['brand_expiry','品牌授权到期提醒',1,{days:30,priority:'high'}],
  ['dormant_customer','沉默客户识别',1,{days:60,priority:'normal'}]
];
for(const [key,name,enabled,config] of automationDefaults){
  db.prepare('INSERT OR IGNORE INTO automation_rules(key,name,enabled,config,updated_at) VALUES(?,?,?,?,?)').run(key,name,enabled,JSON.stringify(config),now());
}
function autoTask(key,customerId,title,description,dueAt,priority='normal',assignedTo=null){
  const exists=db.prepare('SELECT id FROM tasks WHERE automation_key=? LIMIT 1').get(key); if(exists)return false;
  db.prepare('INSERT INTO tasks(id,customer_id,title,description,due_at,status,priority,assigned_to,created_by,automation_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(randomUUID(),customerId||null,title,description,dueAt||now(),'todo',priority,assignedTo||null,null,key,now(),now());
  return true;
}
function automationLog(ruleKey,message,entityType=null,entityId=null){
  db.prepare('INSERT INTO automation_logs(id,rule_key,message,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),ruleKey,message,entityType,entityId,now());
}
function getRule(key){
  const r=db.prepare('SELECT * FROM automation_rules WHERE key=?').get(key); return r?{...r,config:parseJSON(r.config,{})}:null;
}
function runAutomationSweep(){
  const result={created:0,updated:0,checked_at:now()};
  const overdue=getRule('overdue_payment');
  if(overdue?.enabled){
    const rows=db.prepare("SELECT p.*,c.owner_id,c.name customer_name FROM payments p JOIN customers c ON c.id=p.customer_id WHERE p.status!='paid' AND p.due_at IS NOT NULL AND p.due_at < ?").all(now());
    for(const x of rows){
      if(x.status!=='overdue'){db.prepare("UPDATE payments SET status='overdue',updated_at=? WHERE id=?").run(now(),x.id);result.updated++;}
      const key=`payment-overdue:${x.id}`;
      if(autoTask(key,x.customer_id,`逾期回款：${x.customer_name}`,`应收 ${x.currency||''} ${Number(x.amount||0).toFixed(2)} 已超过到期日 ${x.due_at}`,now(),overdue.config.priority||'urgent',x.owner_id)){result.created++;automationLog('overdue_payment','生成逾期回款任务','payment',x.id);}
    }
  }
  const qr=getRule('quotation_expiry');
  if(qr?.enabled){
    const days=Number(qr.config.days||3),limit=new Date(Date.now()+days*86400000).toISOString().slice(0,10);
    const rows=db.prepare("SELECT q.*,c.owner_id,c.name customer_name FROM quotations q JOIN customers c ON c.id=q.customer_id WHERE q.status NOT IN ('accepted','rejected','expired') AND q.valid_until IS NOT NULL AND q.valid_until <= ?").all(limit);
    for(const x of rows){const key=`quote-expire:${x.id}`;if(autoTask(key,x.customer_id,`报价即将到期：${x.quote_no}`,`${x.customer_name} 的报价有效期至 ${x.valid_until}`,x.valid_until,qr.config.priority||'high',x.owner_id)){result.created++;automationLog('quotation_expiry','生成报价到期任务','quotation',x.id);}}
  }
  const br=getRule('brand_expiry');
  if(br?.enabled){
    const days=Number(br.config.days||30),limit=new Date(Date.now()+days*86400000).toISOString().slice(0,10);
    const rows=db.prepare("SELECT cb.*,b.name brand_name,c.name customer_name,c.owner_id FROM customer_brands cb JOIN brands b ON b.id=cb.brand_id JOIN customers c ON c.id=cb.customer_id WHERE cb.end_date IS NOT NULL AND cb.end_date <= ?").all(limit);
    for(const x of rows){const key=`brand-expire:${x.id}`;if(autoTask(key,x.customer_id,`品牌授权即将到期：${x.brand_name}`,`${x.customer_name} 的 ${x.brand_name} 授权关系将于 ${x.end_date} 到期`,x.end_date,br.config.priority||'high',x.owner_id)){result.created++;automationLog('brand_expiry','生成品牌授权到期任务','customer_brand',x.id);}}
  }
  const dr=getRule('dormant_customer');
  if(dr?.enabled){
    const days=Number(dr.config.days||60),cutoff=new Date(Date.now()-days*86400000).toISOString();
    const rows=db.prepare(`SELECT c.*,MAX(a.occurred_at) last_activity FROM customers c LEFT JOIN activities a ON a.customer_id=c.id WHERE c.deleted_at IS NULL AND c.status IN ('potential','contacted','following','quoted','sample','negotiating') GROUP BY c.id HAVING COALESCE(MAX(a.occurred_at),c.created_at) < ?`).all(cutoff);
    for(const x of rows){
      if(x.status!=='dormant'){db.prepare("UPDATE customers SET status='dormant',updated_at=? WHERE id=?").run(now(),x.id);result.updated++;}
      const key=`customer-dormant:${x.id}`;if(autoTask(key,x.id,`沉默客户需要重新激活：${x.name}`,`超过 ${days} 天没有有效跟进，请评估是否重新联系或转入公海。`,now(),dr.config.priority||'normal',x.owner_id)){result.created++;automationLog('dormant_customer','客户自动标记为沉默并生成任务','customer',x.id);}
    }
  }
  return result;
}
let automationRunning=false;
setInterval(()=>{if(automationRunning)return;automationRunning=true;try{runAutomationSweep();}catch(e){console.error('automation sweep failed',e);}finally{automationRunning=false;}},10*60*1000).unref();


const resourceMap = {
  customers:{table:'customers', json:['customer_types','service_regions','custom_fields'], required:['name']},
  contacts:{table:'contacts', required:['customer_id','name']},
  channels:{table:'contact_channels', required:['contact_id','channel','value']},
  brands:{table:'brands', required:['name']},
  customerBrands:{table:'customer_brands', json:['authorized_regions'], required:['customer_id','brand_id','relation_type']},
  tags:{table:'tags', required:['name']},
  customFields:{table:'custom_field_defs', json:['options','visible_roles'], required:['entity_type','field_key','label','data_type']},
  activities:{table:'activities', json:['attachments'], required:['customer_id','type','content']},
  tasks:{table:'tasks', required:['title']},
  inquiries:{table:'inquiries', json:['products','attachments'], required:['customer_id']},
  opportunities:{table:'opportunities', required:['customer_id','name']},
  quotations:{table:'quotations', required:['customer_id']},
  quotationItems:{table:'quotation_items', required:['quotation_id','product_name']},
  samples:{table:'samples', required:['customer_id','product']},
  products:{table:'products', json:['certifications'], required:['name']},
  contracts:{table:'contracts', json:['attachments'], required:['customer_id']},
  orders:{table:'orders', required:['customer_id']},
  orderItems:{table:'order_items', required:['order_id','product_name','quantity','unit_price','amount']},
  payments:{table:'payments', required:['customer_id','amount']},
  creditProfiles:{table:'credit_profiles', required:['customer_id']},
  shipments:{table:'shipments', required:['order_id']},
  documents:{table:'documents', required:['entity_type','entity_id','name']},
  aftersales:{table:'aftersales', required:['customer_id','category','subject','description']},
  campaigns:{table:'campaigns', required:['name','type']},
  users:{table:'users', required:['username','display_name','role']}
};

const MIME_TYPES = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'
};
function serveFrontend(req,res,pathname){
  if(!['GET','HEAD'].includes(req.method)){
    res.writeHead(405,{'content-type':'text/plain; charset=utf-8','allow':'GET, HEAD'}); return res.end('Method Not Allowed');
  }
  if(!fs.existsSync(WEB_DIST)){
    res.writeHead(503,{'content-type':'text/plain; charset=utf-8'}); return res.end('Frontend build is not available');
  }
  let relative;
  try { relative=decodeURIComponent(pathname==='/'?'index.html':pathname.replace(/^\/+/,'')); }
  catch { relative='index.html'; }
  const root=path.resolve(WEB_DIST);
  let file=path.resolve(root,relative);
  if(file!==root && !file.startsWith(root+path.sep)){
    res.writeHead(400,{'content-type':'text/plain; charset=utf-8'}); return res.end('Bad Request');
  }
  if(!fs.existsSync(file) || fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
  const ext=path.extname(file).toLowerCase();
  const isIndex=path.basename(file)==='index.html';
  res.writeHead(200,{
    'content-type':MIME_TYPES[ext]||'application/octet-stream',
    'cache-control':isIndex?'no-cache':'public, max-age=31536000, immutable',
    'x-content-type-options':'nosniff'
  });
  if(req.method==='HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function json(res, status, data, extraHeaders={}) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':CORS_ORIGIN,'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',...extraHeaders});
  res.end(JSON.stringify(data));
}
function body(req) { return new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>{ raw+=c; if(raw.length>25_000_000){reject(new Error('payload too large'));req.destroy();}}); req.on('end',()=>{ if(!raw)return resolve({}); try{resolve(JSON.parse(raw));}catch{reject(new Error('invalid json'));}}); req.on('error',reject);}); }
function columns(table) { return db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name); }
const colCache = new Map();
function tableCols(table){ if(!colCache.has(table)) colCache.set(table,columns(table)); return colCache.get(table); }
function decodeRow(row, cfg){ if(!row) return row; const r={...row}; for(const k of (cfg.json||[])) r[k]=parseJSON(r[k], Array.isArray(r[k])?[]: (k==='custom_fields'?{}:[])); if(cfg.table==='users') delete r.password_hash; return r; }
function auth(req){ const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) return null; const token=h.slice(7); const s=db.prepare(`SELECT s.*,u.username,u.display_name,u.role,u.enabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(hashToken(token),now()); return s&&s.enabled?s:null; }
function audit(user, action, entityType, entityId, req, detail={}){ db.prepare('INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,ip,request_id,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),user?.user_id||null,action,entityType||null,entityId||null,req.socket.remoteAddress||'',req.requestId||'',JSON.stringify(detail),now()); }
function makeNo(prefix){ return `${prefix}-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

function normalizeCompanyName(v=''){
  return String(v).toLowerCase().normalize('NFKC')
    .replace(/&/g,'and')
    .replace(/[\s\p{P}\p{S}]+/gu,'')
    .replace(/(limited|ltd|incorporated|inc|corporation|corp|company|co|llc|gmbh|sarl|bv|plc)$/i,'');
}
function normalizeDomain(v=''){
  let x=String(v).trim().toLowerCase();
  if(!x) return '';
  try { return new URL(/^https?:\/\//i.test(x)?x:`https://${x}`).hostname.replace(/^www\./,''); }
  catch { return x.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]; }
}
function duplicateCandidates(input){
  const nameKey=normalizeCompanyName(input.name||input.english_name||'');
  const domain=normalizeDomain(input.website||'');
  const tax=String(input.tax_no||'').replace(/\s+/g,'').toLowerCase();
  const reg=String(input.registration_no||'').replace(/\s+/g,'').toLowerCase();
  const email=String(input.email||'').trim().toLowerCase();
  const phone=String(input.phone||'').replace(/\D/g,'');
  const rows=db.prepare(`SELECT c.*,u.display_name owner_name,u.role owner_role
    FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.deleted_at IS NULL`).all();
  const channelOwners=new Map();
  if(email||phone){
    for(const r of db.prepare(`SELECT cc.channel,cc.value,c.customer_id FROM contact_channels cc
      JOIN contacts c ON c.id=cc.contact_id`).all()){
      const key=r.channel==='email'?String(r.value||'').trim().toLowerCase():String(r.value||'').replace(/\D/g,'');
      if(key) channelOwners.set(`${r.channel}:${key}`,r.customer_id);
    }
  }
  return rows.map(r=>{
    let score=0; const reasons=[];
    const rn=normalizeCompanyName(r.name||r.english_name||'');
    const rd=normalizeDomain(r.website||'');
    const rt=String(r.tax_no||'').replace(/\s+/g,'').toLowerCase();
    const rr=String(r.registration_no||'').replace(/\s+/g,'').toLowerCase();
    if(tax && rt && tax===rt){score+=100;reasons.push('税号一致');}
    if(reg && rr && reg===rr){score+=100;reasons.push('注册号一致');}
    if(domain && rd && domain===rd){score+=90;reasons.push('官网域名一致');}
    if(nameKey && rn && nameKey===rn){score+=80;reasons.push('公司名称一致');}
    if(email && channelOwners.get(`email:${email}`)===r.id){score+=100;reasons.push('邮箱已存在');}
    if(phone && channelOwners.get(`phone:${phone}`)===r.id){score+=100;reasons.push('电话已存在');}
    return {id:r.id,name:r.name,english_name:r.english_name,country:r.country,status:r.status,grade:r.grade,owner_id:r.owner_id,owner_name:r.owner_name,owner_role:r.owner_role,score,reasons};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,10);
}

function sanitizePayload(cfg, payload, isCreate=false){
  const cols=tableCols(cfg.table); const out={};
  for(const [k,v] of Object.entries(payload||{})) if(cols.includes(k) && !['id','created_at','updated_at','deleted_at','password_hash'].includes(k)) out[k]=(cfg.json||[]).includes(k)?JSON.stringify(v??(k==='custom_fields'?{}:[])):v;
  if(isCreate){ for(const r of (cfg.required||[])) if(out[r]===undefined||out[r]===null||out[r]==='') throw new Error(`missing required field: ${r}`); }
  return out;
}

const writePolicy={
  admin:'*',manager:'*',
  sales:new Set(['customers','contacts','channels','customerBrands','activities','tasks','inquiries','opportunities','quotations','quotationItems','samples','contracts','orders','orderItems','shipments','documents','aftersales']),
  followup:new Set(['customers','contacts','channels','activities','tasks','inquiries','samples','aftersales']),
  finance:new Set(['payments','creditProfiles']),
  readonly:new Set()
};
function canWriteResource(role,key){
  const p=writePolicy[role]??new Set(); return p==='*'||p.has(key);
}
function scopedRole(user){return ['sales','followup'].includes(user.role);}
function customerOwnedBy(user,customerId){
  if(!customerId||!scopedRole(user)) return true;
  return !!db.prepare('SELECT 1 ok FROM customers WHERE id=? AND owner_id=? AND deleted_at IS NULL').get(customerId,user.user_id);
}
function resourceCustomerId(key,payloadOrId,isId=false){
  try{
    if(!isId){
      const p=payloadOrId||{};
      if(p.customer_id)return p.customer_id;
      if(key==='channels'&&p.contact_id)return db.prepare('SELECT customer_id FROM contacts WHERE id=?').get(p.contact_id)?.customer_id;
      if(key==='quotationItems'&&p.quotation_id)return db.prepare('SELECT customer_id FROM quotations WHERE id=?').get(p.quotation_id)?.customer_id;
      if(key==='orderItems'&&p.order_id)return db.prepare('SELECT customer_id FROM orders WHERE id=?').get(p.order_id)?.customer_id;
      if(key==='shipments'&&p.order_id)return db.prepare('SELECT customer_id FROM orders WHERE id=?').get(p.order_id)?.customer_id;
      if(key==='documents'&&p.entity_type==='customer')return p.entity_id;
      if(key==='documents'&&p.entity_type==='order')return db.prepare('SELECT customer_id FROM orders WHERE id=?').get(p.entity_id)?.customer_id;
      return null;
    }
    const id=payloadOrId;
    const cfg=resourceMap[key]; if(!cfg)return null; const table=cfg.table;
    if(tableCols(table).includes('customer_id'))return db.prepare(`SELECT customer_id FROM ${table} WHERE id=?`).get(id)?.customer_id;
    if(key==='channels')return db.prepare('SELECT c.customer_id FROM contact_channels cc JOIN contacts c ON c.id=cc.contact_id WHERE cc.id=?').get(id)?.customer_id;
    if(key==='quotationItems')return db.prepare('SELECT q.customer_id FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id WHERE qi.id=?').get(id)?.customer_id;
    if(key==='orderItems')return db.prepare('SELECT o.customer_id FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=?').get(id)?.customer_id;
    if(key==='shipments')return db.prepare('SELECT o.customer_id FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.id=?').get(id)?.customer_id;
    return null;
  }catch{return null;}
}
function protectRow(key,row,user){
  if(!row)return row; const r={...row};
  if(!['admin','manager'].includes(user.role)){
    if(key==='quotations')delete r.margin_rate;
    if(key==='quotationItems')delete r.cost;
  }
  return r;
}


function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function companyProfile(){
  const r=db.prepare("SELECT value FROM settings WHERE key='company_profile'").get();
  return parseJSON(r?.value,{name:'Seller Company',address:'',email:'',phone:'',bank:'',tax_no:''});
}
function renderOrderDocument(type,order,customer,items,shipment){
  const cp=companyProfile(),title={PI:'PROFORMA INVOICE',CI:'COMMERCIAL INVOICE',PL:'PACKING LIST',BL:'DRAFT BILL OF LADING',CO:'DRAFT CERTIFICATE OF ORIGIN'}[type]||type;
  const rows=items.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.product_name)}</td><td>${esc(x.quantity)}</td><td>${esc(x.unit||'')}</td><td>${type==='PL'||type==='BL'||type==='CO'?'':esc(Number(x.unit_price||0).toFixed(2))}</td><td>${type==='PL'||type==='BL'||type==='CO'?'':esc(Number(x.amount||0).toFixed(2))}</td></tr>`).join('');
  const ship=shipment?`<div class="box"><b>Shipment</b><br>Booking: ${esc(shipment.booking_no||'')} &nbsp; Carrier: ${esc(shipment.carrier||'')} &nbsp; Vessel/Voyage: ${esc(shipment.vessel_voyage||'')}<br>POL: ${esc(shipment.port_of_loading||'')} &nbsp; POD: ${esc(shipment.destination_port||'')} &nbsp; ETD: ${esc(shipment.etd||'')} &nbsp; ETA: ${esc(shipment.eta||'')}<br>BL No.: ${esc(shipment.bl_no||'')}</div>`:'';
  const draft=(type==='BL'||type==='CO')?'<div class="draft">DRAFT — for review only; final document must be issued/endorsed by the authorized carrier or authority.</div>':'';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:38px}h1{text-align:center;font-size:24px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}.box{border:1px solid #ccd4df;padding:12px;line-height:1.7}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #ccd4df;padding:8px;text-align:left}th{background:#f1f4f8}.total{text-align:right;font-size:18px;margin-top:16px}.draft{border:2px solid #b42318;padding:10px;text-align:center;font-weight:bold;margin:12px 0}.foot{margin-top:30px;font-size:12px;color:#667085}</style></head><body>
  <h1>${title}</h1>${draft}
  <div class="meta"><div class="box"><b>Exporter / Seller</b><br>${esc(cp.name)}<br>${esc(cp.address)}<br>${esc(cp.email)} ${esc(cp.phone)}</div><div class="box"><b>Buyer / Consignee</b><br>${esc(customer.name)}<br>${esc(customer.address||'')}<br>${esc(customer.country||'')}</div></div>
  <div class="box">Order No.: <b>${esc(order.order_no)}</b> &nbsp; Customer PO: ${esc(order.customer_po||'')} &nbsp; Date: ${new Date().toISOString().slice(0,10)}<br>Incoterm: ${esc(order.incoterm||'')} &nbsp; Payment Terms: ${esc(order.payment_terms||'')} &nbsp; Currency: ${esc(order.currency||'USD')}</div>
  ${ship}
  <table><thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>${type==='PL'||type==='BL'||type==='CO'?'':'Unit Price'}</th><th>${type==='PL'||type==='BL'||type==='CO'?'':'Amount'}</th></tr></thead><tbody>${rows}</tbody></table>
  ${type==='PI'||type==='CI'?`<div class="total"><b>Total: ${esc(order.currency||'USD')} ${Number(order.total||0).toFixed(2)}</b></div>`:''}
  ${type==='PL'?'<div class="foot">Packing/weight/carton details should be completed with final warehouse data before issue.</div>':''}
  ${type==='CO'?'<div class="foot">Country of Origin: ____________________ &nbsp; Authorized signature/stamp: ____________________</div>':''}
  <div class="foot">Generated by TradeFlow CRM · Document data should be reviewed before external use.</div>
  </body></html>`;
}


function aftersalesSlaDue(severity='normal',openedAt=now()){
  const hours={critical:24,high:72,normal:168,low:336}[String(severity).toLowerCase()]||168;
  return new Date(new Date(openedAt).getTime()+hours*3600_000).toISOString();
}
const MAX_UPLOAD_BYTES=15*1024*1024;
const BLOCKED_UPLOAD_EXT=new Set(['.exe','.dll','.bat','.cmd','.com','.scr','.msi','.ps1','.sh','.apk','.dmg','.pkg','.jar','.js','.mjs','.cjs','.html','.htm','.svg']);
const INLINE_PREVIEW_MIME=new Set(['application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain','text/csv']);
function safeUploadName(name='file'){
  const base=path.basename(String(name)).replace(/[^\p{L}\p{N}._()\- ]/gu,'_').slice(0,180)||'file';
  return base;
}
function attachmentCustomerId(entityType,entityId){
  try{
    if(entityType==='customer') return entityId;
    if(entityType==='order') return db.prepare('SELECT customer_id FROM orders WHERE id=?').get(entityId)?.customer_id||null;
    if(entityType==='inquiry') return db.prepare('SELECT customer_id FROM inquiries WHERE id=?').get(entityId)?.customer_id||null;
    if(entityType==='opportunity') return db.prepare('SELECT customer_id FROM opportunities WHERE id=?').get(entityId)?.customer_id||null;
    if(entityType==='quotation') return db.prepare('SELECT customer_id FROM quotations WHERE id=?').get(entityId)?.customer_id||null;
    if(entityType==='sample') return db.prepare('SELECT customer_id FROM samples WHERE id=?').get(entityId)?.customer_id||null;
    if(entityType==='contract') return db.prepare('SELECT customer_id FROM contracts WHERE id=?').get(entityId)?.customer_id||null;
    if(entityType==='shipment') return db.prepare('SELECT o.customer_id FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.id=?').get(entityId)?.customer_id||null;
    if(entityType==='aftersales') return db.prepare('SELECT customer_id FROM aftersales WHERE id=?').get(entityId)?.customer_id||null;
    return null;
  }catch{return null;}
}
function documentBuffer(d){
  if(d.storage_path){
    const root=path.resolve(UPLOAD_DIR),file=path.resolve(root,d.storage_path);
    if(file===root||!file.startsWith(root+path.sep)||!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  }
  return d.content_base64?Buffer.from(d.content_base64,'base64'):Buffer.alloc(0);
}
function removeStoredDocumentFile(d){
  if(!d?.storage_path)return;
  const root=path.resolve(UPLOAD_DIR),file=path.resolve(root,d.storage_path);
  if(file!==root&&file.startsWith(root+path.sep)&&fs.existsSync(file))fs.unlinkSync(file);
}

const rate = new Map();
function rateLimit(req){ const ip=req.socket.remoteAddress||'x', t=Date.now(), w=60_000; const x=rate.get(ip)||{start:t,count:0}; if(t-x.start>w){x.start=t;x.count=0;} x.count++; rate.set(ip,x); return x.count<=300; }

const server = http.createServer(async (req,res)=>{
  req.requestId=randomUUID();
  if(req.method==='OPTIONS') return json(res,204,{});
  res.setHeader('x-request-id',req.requestId); res.setHeader('x-content-type-options','nosniff'); res.setHeader('x-frame-options','DENY'); res.setHeader('referrer-policy','same-origin');
  if(!rateLimit(req)) return json(res,429,{error:'rate_limited'});
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const p=url.pathname;
  try {
    if(!p.startsWith('/api/')) return serveFrontend(req,res,p);
    if(p==='/api/health') return json(res,200,{ok:true,service:'tradeflow-api',time:now()});
    if(p==='/api/auth/login' && req.method==='POST'){
      const b=await body(req); const u=db.prepare('SELECT * FROM users WHERE username=? AND enabled=1').get(b.username||'');
      if(!u || !verifyPassword(b.password||'',u.password_hash)) return json(res,401,{error:'invalid_credentials'});
      const token=randomBytes(32).toString('base64url'), sid=randomUUID(), exp=new Date(Date.now()+12*3600_000).toISOString();
      db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run(sid,u.id,hashToken(token),exp,now());
      audit({user_id:u.id},'login','user',u.id,req); return json(res,200,{token,expires_at:exp,user:{id:u.id,username:u.username,display_name:u.display_name,role:u.role}});
    }
    const user=auth(req); if(!user) return json(res,401,{error:'unauthorized'});
    if(p==='/api/auth/me') return json(res,200,{id:user.user_id,username:user.username,display_name:user.display_name,role:user.role});
    if(p==='/api/auth/logout' && req.method==='POST'){ const token=(req.headers.authorization||'').slice(7); db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); return json(res,200,{ok:true}); }

    if(p==='/api/automation/rules' && req.method==='GET'){
      if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
      return json(res,200,db.prepare('SELECT * FROM automation_rules ORDER BY key').all().map(r=>({...r,config:parseJSON(r.config,{})})));
    }
    if(p==='/api/automation/rules' && req.method==='PATCH'){
      if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
      const b=await body(req), key=String(b.key||''); const old=getRule(key); if(!old)return json(res,404,{error:'not_found'});
      const enabled=b.enabled===undefined?old.enabled:(b.enabled?1:0),config=b.config===undefined?old.config:b.config;
      db.prepare('UPDATE automation_rules SET enabled=?,config=?,updated_at=? WHERE key=?').run(enabled,JSON.stringify(config||{}),now(),key);
      audit(user,'update','automation_rule',key,req,{enabled,config}); return json(res,200,getRule(key));
    }
    if(p==='/api/automation/run' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
      const result=runAutomationSweep(); audit(user,'run','automation',null,req,result); return json(res,200,result);
    }
    if(p==='/api/automation/logs' && req.method==='GET'){
      if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
      return json(res,200,db.prepare('SELECT * FROM automation_logs ORDER BY created_at DESC LIMIT 200').all());
    }

    if(p==='/api/dashboard' && req.method==='GET'){
      const q=(sql,...a)=>db.prepare(sql).get(...a).c;
      return json(res,200,{
        customers:q('SELECT COUNT(*) c FROM customers WHERE deleted_at IS NULL'),
        contacts:q('SELECT COUNT(*) c FROM contacts'),
        openTasks:q("SELECT COUNT(*) c FROM tasks WHERE status!='done'"),
        inquiries:q('SELECT COUNT(*) c FROM inquiries'),
        opportunities:q("SELECT COUNT(*) c FROM opportunities WHERE stage NOT IN ('won','lost')"),
        quotations:q('SELECT COUNT(*) c FROM quotations'),
        orders:q('SELECT COUNT(*) c FROM orders'),
        overduePayments:q("SELECT COUNT(*) c FROM payments WHERE status!='paid' AND due_at IS NOT NULL AND due_at < ?",now()),
        recentActivities:db.prepare('SELECT a.*,c.name customer_name FROM activities a JOIN customers c ON c.id=a.customer_id ORDER BY a.occurred_at DESC LIMIT 10').all(),
        dueTasks:db.prepare("SELECT t.*,c.name customer_name FROM tasks t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.status!='done' ORDER BY COALESCE(t.due_at,'9999') LIMIT 10").all()
      });
    }
    if(p==='/api/search' && req.method==='GET'){
      const term=(url.searchParams.get('q')||'').trim(); if(!term) return json(res,200,[]); const like=`%${term}%`;
      const results=db.prepare(`
        SELECT DISTINCT c.id,c.name,c.english_name,c.country,c.city,c.industry,c.status,c.grade,c.website,c.tax_no,c.registration_no,c.owner_id,u.display_name owner_name
        FROM customers c
        LEFT JOIN users u ON u.id=c.owner_id
        WHERE c.deleted_at IS NULL AND (
          c.name LIKE ? OR c.english_name LIKE ? OR c.local_name LIKE ? OR c.website LIKE ? OR c.tax_no LIKE ? OR c.registration_no LIKE ? OR c.business_scope LIKE ? OR c.custom_fields LIKE ?
          OR EXISTS (SELECT 1 FROM contacts ct WHERE ct.customer_id=c.id AND (ct.name LIKE ? OR ct.title LIKE ? OR ct.department LIKE ?))
          OR EXISTS (SELECT 1 FROM contacts ct JOIN contact_channels cc ON cc.contact_id=ct.id WHERE ct.customer_id=c.id AND cc.value LIKE ?)
          OR EXISTS (SELECT 1 FROM customer_tags x JOIN tags t ON t.id=x.tag_id WHERE x.customer_id=c.id AND t.name LIKE ?)
          OR EXISTS (SELECT 1 FROM customer_brands cb JOIN brands b ON b.id=cb.brand_id WHERE cb.customer_id=c.id AND b.name LIKE ?)
        )
        ORDER BY c.updated_at DESC LIMIT 100`).all(like,like,like,like,like,like,like,like,like,like,like,like,like,like);
      return json(res,200,results);
    }

    if(p==='/api/views' && req.method==='GET'){
      const entity=url.searchParams.get('entity_type')||'customers';
      const rows=db.prepare('SELECT * FROM saved_views WHERE entity_type=? AND (user_id=? OR is_shared=1) ORDER BY updated_at DESC').all(entity,user.user_id)
        .map(r=>({...r,filters:parseJSON(r.filters,{})}));
      return json(res,200,rows);
    }
    if(p==='/api/views' && req.method==='POST'){
      const b=await body(req), name=String(b.name||'').trim(); if(!name) return json(res,400,{error:'name_required'});
      const id=randomUUID(); db.prepare('INSERT INTO saved_views(id,user_id,entity_type,name,filters,is_shared,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(id,user.user_id,b.entity_type||'customers',name,JSON.stringify(b.filters||{}),b.is_shared?1:0,now(),now());
      audit(user,'create','saved_view',id,req,{name,entity_type:b.entity_type||'customers'});
      return json(res,201,{id,user_id:user.user_id,entity_type:b.entity_type||'customers',name,filters:b.filters||{},is_shared:b.is_shared?1:0});
    }
    {
      const vm=p.match(/^\/api\/views\/([0-9a-f-]+)$/);
      if(vm && req.method==='DELETE'){
        const row=db.prepare('SELECT * FROM saved_views WHERE id=?').get(vm[1]); if(!row) return json(res,404,{error:'not_found'});
        if(row.user_id!==user.user_id && user.role!=='admin') return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM saved_views WHERE id=?').run(vm[1]); audit(user,'delete','saved_view',vm[1],req); return json(res,200,{ok:true});
      }
    }

    if(p==='/api/audit' && req.method==='GET'){
      if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
      return json(res,200,db.prepare('SELECT a.*,u.display_name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 500').all().map(x=>({...x,detail:parseJSON(x.detail,{})})));
    }
    if(p==='/api/analytics/funnel' && req.method==='GET'){
      const one=sql=>db.prepare(sql).get().c; return json(res,200,{inquiries:one('SELECT COUNT(*) c FROM inquiries'), opportunities:one('SELECT COUNT(*) c FROM opportunities'), quotations:one('SELECT COUNT(*) c FROM quotations'), samples:one('SELECT COUNT(*) c FROM samples'), orders:one('SELECT COUNT(*) c FROM orders')});
    }
    if(p==='/api/analytics/customers-by-country' && req.method==='GET') return json(res,200,db.prepare(`SELECT COALESCE(country,'Unknown') name, COUNT(*) value FROM customers WHERE deleted_at IS NULL GROUP BY country ORDER BY value DESC LIMIT 30`).all());
    if(p==='/api/analytics/customers-by-type' && req.method==='GET'){
      const all=db.prepare('SELECT customer_types FROM customers WHERE deleted_at IS NULL').all(); const m={}; for(const r of all) for(const t of parseJSON(r.customer_types,[])) m[t]=(m[t]||0)+1; return json(res,200,Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value));
    }
    if(p==='/api/settings/channels' && req.method==='GET') return json(res,200,['email','phone','whatsapp','wechat','line','vk','telegram','viber','kakaotalk','zalo','linkedin','facebook','messenger','instagram','x','skype','teams','zoom','website','store']);
    if(p==='/api/tools/link' && req.method==='POST'){
      const b=await body(req), v=String(b.value||'').trim(), c=String(b.channel||'').toLowerCase(); let target='';
      if(c==='email') target=`mailto:${encodeURIComponent(v)}`; else if(c==='phone') target=`tel:${v.replace(/[^+\d]/g,'')}`; else if(c==='whatsapp') target=`https://wa.me/${v.replace(/\D/g,'')}`; else if(c==='telegram') target=v.startsWith('http')?v:`https://t.me/${v.replace(/^@/,'')}`; else if(['website','linkedin','facebook','messenger','instagram','vk','line','x','store'].includes(c)) target=/^https?:\/\//i.test(v)?v:`https://${v}`; else target=v;
      return json(res,200,{target,copyFallback:!target});
    }










    // ---- Aftersales / complaint ticket workflow ----
    if(p==='/api/aftersales/summary' && req.method==='GET'){
      const rows=scopedRole(user)?
        db.prepare("SELECT a.* FROM aftersales a JOIN customers c ON c.id=a.customer_id WHERE c.owner_id=?").all(user.user_id):
        db.prepare("SELECT * FROM aftersales").all();
      const open=rows.filter(x=>!['resolved','closed'].includes(x.status)).length;
      const overdue=rows.filter(x=>!['resolved','closed'].includes(x.status)&&x.sla_due_at&&x.sla_due_at<now()).length;
      const resolved=rows.filter(x=>['resolved','closed'].includes(x.status)).length;
      const critical=rows.filter(x=>String(x.severity).toLowerCase()==='critical'&&!['closed'].includes(x.status)).length;
      return json(res,200,{total:rows.length,open,overdue,resolved,critical});
    }
    {
      const afull=p.match(/^\/api\/workflows\/aftersales\/([0-9a-f-]+)\/full$/);
      if(afull&&req.method==='GET'){
        const a=db.prepare(`SELECT a.*,c.name customer_name,o.order_no FROM aftersales a
          JOIN customers c ON c.id=a.customer_id LEFT JOIN orders o ON o.id=a.order_id WHERE a.id=?`).get(afull[1]);
        if(!a)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,a.customer_id))return json(res,403,{error:'forbidden'});
        const docs=db.prepare("SELECT id,entity_type,entity_id,category,name,original_name,version,mime_type,size_bytes,notes,created_at,storage_path IS NOT NULL stored FROM documents WHERE entity_type='aftersales' AND entity_id=? ORDER BY created_at DESC").all(a.id);
        return json(res,200,{...a,sla_status:['resolved','closed'].includes(a.status)?'completed':(a.sla_due_at&&a.sla_due_at<now()?'overdue':'within_sla'),documents:docs});
      }
      const astatus=p.match(/^\/api\/workflows\/aftersales\/([0-9a-f-]+)\/status$/);
      if(astatus&&req.method==='POST'){
        const a=db.prepare('SELECT * FROM aftersales WHERE id=?').get(astatus[1]);if(!a)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,a.customer_id))return json(res,403,{error:'forbidden'});
        if(!canWriteResource(user.role,'aftersales'))return json(res,403,{error:'forbidden'});
        const b=await body(req),next=String(b.status||''),allowed=['open','investigating','awaiting_customer','resolved','closed'];
        if(!allowed.includes(next))return json(res,400,{error:'invalid_status'});
        const resolvedAt=['resolved','closed'].includes(next)?(a.resolved_at||now()):null,closedAt=next==='closed'?now():null;
        db.prepare('UPDATE aftersales SET status=?,resolved_at=?,closed_at=COALESCE(?,closed_at),solution=COALESCE(?,solution),updated_at=? WHERE id=?').run(next,resolvedAt,closedAt,b.solution||null,now(),a.id);
        audit(user,'change_status','aftersales',a.id,req,{from:a.status,to:next,solution:b.solution||null});
        return json(res,200,db.prepare('SELECT * FROM aftersales WHERE id=?').get(a.id));
      }
      const arate=p.match(/^\/api\/workflows\/aftersales\/([0-9a-f-]+)\/satisfaction$/);
      if(arate&&req.method==='POST'){
        const a=db.prepare('SELECT * FROM aftersales WHERE id=?').get(arate[1]);if(!a)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,a.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),score=Math.min(5,Math.max(1,Number(b.satisfaction||0)));if(!score)return json(res,400,{error:'invalid_score'});
        db.prepare('UPDATE aftersales SET satisfaction=?,satisfaction_note=?,updated_at=? WHERE id=?').run(score,b.note||null,now(),a.id);
        audit(user,'rate','aftersales',a.id,req,{satisfaction:score});return json(res,200,db.prepare('SELECT * FROM aftersales WHERE id=?').get(a.id));
      }
    }

    // ---- Real file attachments: filesystem storage + document metadata ----
    if(p==='/api/files' && req.method==='GET'){
      const entityType=String(url.searchParams.get('entity_type')||''),entityId=String(url.searchParams.get('entity_id')||'');
      if(!entityType||!entityId)return json(res,400,{error:'entity_required'});
      const cid=attachmentCustomerId(entityType,entityId);
      if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
      const rows=db.prepare('SELECT id,entity_type,entity_id,category,name,original_name,version,mime_type,size_bytes,checksum,notes,uploaded_by,created_at,storage_path IS NOT NULL stored FROM documents WHERE entity_type=? AND entity_id=? ORDER BY created_at DESC').all(entityType,entityId);
      return json(res,200,rows);
    }
    if(p==='/api/files/upload' && req.method==='POST'){
      if(!canWriteResource(user.role,'documents'))return json(res,403,{error:'forbidden'});
      const b=await body(req),entityType=String(b.entity_type||''),entityId=String(b.entity_id||''),originalName=safeUploadName(b.file_name||'file');
      if(!entityType||!entityId)return json(res,400,{error:'entity_required'});
      const cid=attachmentCustomerId(entityType,entityId);
      if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
      if(!cid&&entityType!=='customer')return json(res,400,{error:'invalid_entity'});
      const ext=path.extname(originalName).toLowerCase(); if(BLOCKED_UPLOAD_EXT.has(ext))return json(res,400,{error:'blocked_file_type'});
      let raw=String(b.content_base64||''); const comma=raw.indexOf(','); if(comma>=0)raw=raw.slice(comma+1);
      let buf;try{buf=Buffer.from(raw,'base64');}catch{return json(res,400,{error:'invalid_file_data'});}
      if(!buf.length)return json(res,400,{error:'empty_file'});
      if(buf.length>MAX_UPLOAD_BYTES)return json(res,413,{error:'file_too_large',max_bytes:MAX_UPLOAD_BYTES});
      const category=String(b.category||'attachment'),mime=String(b.mime_type||'application/octet-stream').slice(0,120);
      const count=db.prepare('SELECT COUNT(*) c FROM documents WHERE entity_type=? AND entity_id=? AND category=? AND COALESCE(original_name,name)=?').get(entityType,entityId,category,originalName).c;
      const version=`V${Number(count)+1}`,id=randomUUID(),storedName=`${id}${ext}`,relative=path.join(entityType,entityId,storedName);
      const dir=path.resolve(UPLOAD_DIR,entityType,entityId);fs.mkdirSync(dir,{recursive:true});
      const full=path.resolve(UPLOAD_DIR,relative),root=path.resolve(UPLOAD_DIR);
      if(!full.startsWith(root+path.sep))return json(res,400,{error:'invalid_path'});
      fs.writeFileSync(full,buf,{flag:'wx'});
      const checksum=createHash('sha256').update(buf).digest('hex');
      db.prepare('INSERT INTO documents(id,entity_type,entity_id,category,name,original_name,version,storage_path,size_bytes,checksum,mime_type,notes,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,entityType,entityId,category,originalName,originalName,version,relative,buf.length,checksum,mime,b.notes||null,user.user_id,now());
      audit(user,'upload','documents',id,req,{entity_type:entityType,entity_id:entityId,name:originalName,size:buf.length,checksum});
      return json(res,201,db.prepare('SELECT id,entity_type,entity_id,category,name,original_name,version,mime_type,size_bytes,checksum,notes,uploaded_by,created_at FROM documents WHERE id=?').get(id));
    }
    {
      const fileDelete=p.match(/^\/api\/files\/([0-9a-f-]+)$/);
      if(fileDelete&&req.method==='DELETE'){
        if(!canWriteResource(user.role,'documents'))return json(res,403,{error:'forbidden'});
        const d=db.prepare('SELECT * FROM documents WHERE id=?').get(fileDelete[1]);if(!d)return json(res,404,{error:'not_found'});
        const cid=attachmentCustomerId(d.entity_type,d.entity_id);if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
        removeStoredDocumentFile(d);db.prepare('DELETE FROM documents WHERE id=?').run(d.id);audit(user,'delete_file','documents',d.id,req,{name:d.name});return json(res,200,{ok:true});
      }
    }

    // ---- Commercial document generation ----
    {
      const genDoc=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/generate-document$/);
      if(genDoc&&req.method==='POST'){
        const o=db.prepare('SELECT * FROM orders WHERE id=?').get(genDoc[1]);if(!o)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,o.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),type=String(b.type||'').toUpperCase();if(!['PI','CI','PL','BL','CO'].includes(type))return json(res,400,{error:'unsupported_document_type'});
        const customer=db.prepare('SELECT * FROM customers WHERE id=?').get(o.customer_id),items=db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
        let shipment=null;if(b.shipment_id)shipment=db.prepare('SELECT * FROM shipments WHERE id=? AND order_id=?').get(b.shipment_id,o.id);if(!shipment)shipment=db.prepare('SELECT * FROM shipments WHERE order_id=? ORDER BY created_at DESC LIMIT 1').get(o.id)||null;
        const html=renderOrderDocument(type,o,customer,items,shipment),count=db.prepare('SELECT COUNT(*) c FROM documents WHERE entity_type=? AND entity_id=? AND category=?').get('order',o.id,type).c,version=`V${Number(count)+1}`,id=randomUUID(),name=`${type}_${o.order_no}_${version}.html`;
        db.prepare('INSERT INTO documents(id,entity_type,entity_id,category,name,version,content_base64,mime_type,notes,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'order',o.id,type,name,version,Buffer.from(html,'utf8').toString('base64'),'text/html',type==='BL'||type==='CO'?'Draft generated by system':null,user.user_id,now());
        audit(user,'generate_document','documents',id,req,{order_id:o.id,type,version});return json(res,201,{id,name,category:type,version,mime_type:'text/html'});
      }
      const previewDoc=p.match(/^\/api\/documents\/([0-9a-f-]+)\/preview$/);
      if(previewDoc&&req.method==='GET'){
        const d=db.prepare('SELECT * FROM documents WHERE id=?').get(previewDoc[1]);if(!d)return json(res,404,{error:'not_found'});
        const cid=attachmentCustomerId(d.entity_type,d.entity_id);if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
        const buf=documentBuffer(d);if(buf===null)return json(res,404,{error:'file_missing'});
        const mime=d.mime_type||'application/octet-stream';
        if(d.storage_path&&!INLINE_PREVIEW_MIME.has(mime))return json(res,415,{error:'preview_not_supported',mime_type:mime});
        res.writeHead(200,{'content-type':mime,'content-disposition':'inline','cache-control':'no-store','x-content-type-options':'nosniff'});return res.end(buf);
      }
      const downloadDoc=p.match(/^\/api\/documents\/([0-9a-f-]+)\/download$/);
      if(downloadDoc&&req.method==='GET'){
        const d=db.prepare('SELECT * FROM documents WHERE id=?').get(downloadDoc[1]);if(!d)return json(res,404,{error:'not_found'});
        const cid=attachmentCustomerId(d.entity_type,d.entity_id);if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
        const buf=documentBuffer(d);if(buf===null)return json(res,404,{error:'file_missing'});
        const filename=safeUploadName(d.original_name||d.name||'document');
        res.writeHead(200,{'content-type':d.mime_type||'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,'content-length':String(buf.length),'x-content-type-options':'nosniff'});return res.end(buf);
      }
    }

    // ---- Split shipments / containers / shipment quantities ----
    function refreshOrderShipmentStatus(orderId){
      const ordered=Number(db.prepare('SELECT COALESCE(SUM(quantity),0) q FROM order_items WHERE order_id=?').get(orderId).q||0);
      const shipped=Number(db.prepare(`SELECT COALESCE(SUM(si.quantity),0) q FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE s.order_id=? AND s.status IN ('departed','arrived','delivered')`).get(orderId).q||0);
      const delivered=Number(db.prepare(`SELECT COALESCE(SUM(si.quantity),0) q FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE s.order_id=? AND s.status='delivered'`).get(orderId).q||0);
      let status=null;
      if(ordered>0&&delivered>=ordered)status='completed';
      else if(ordered>0&&shipped>=ordered)status='shipped';
      else if(shipped>0)status='partial_shipped';
      if(status)db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(status,now(),orderId);
      return {ordered,shipped,delivered,status};
    }
    {
      const listShip=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/shipments$/);
      if(listShip && req.method==='GET'){
        const order=db.prepare('SELECT * FROM orders WHERE id=?').get(listShip[1]);if(!order)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,order.customer_id))return json(res,403,{error:'forbidden'});
        const rows=db.prepare('SELECT * FROM shipments WHERE order_id=? ORDER BY created_at DESC').all(order.id).map(x=>({...x,items:db.prepare('SELECT * FROM shipment_items WHERE shipment_id=?').all(x.id),containers:db.prepare('SELECT * FROM shipment_containers WHERE shipment_id=?').all(x.id)}));
        return json(res,200,{data:rows,summary:refreshOrderShipmentStatus(order.id)});
      }
      if(listShip && req.method==='POST'){
        const order=db.prepare('SELECT * FROM orders WHERE id=?').get(listShip[1]);if(!order)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,order.customer_id))return json(res,403,{error:'forbidden'});
        if(!canWriteResource(user.role,'shipments'))return json(res,403,{error:'forbidden'});
        const b=await body(req),id=randomUUID();
        db.prepare('INSERT INTO shipments(id,order_id,booking_no,carrier,forwarder,vessel_voyage,bl_no,port_of_loading,destination_port,etd,eta,status,tracking_url,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,order.id,b.booking_no||null,b.carrier||null,b.forwarder||null,b.vessel_voyage||null,b.bl_no||null,b.port_of_loading||null,b.destination_port||null,b.etd||null,b.eta||null,b.status||'booking',b.tracking_url||null,b.notes||null,now(),now());
        const insItem=db.prepare('INSERT INTO shipment_items(id,shipment_id,order_item_id,product_name,quantity,unit,created_at) VALUES(?,?,?,?,?,?,?)');
        for(const x of (Array.isArray(b.items)?b.items:[]))if(Number(x.quantity||0)>0)insItem.run(randomUUID(),id,x.order_item_id||null,x.product_name||'',Number(x.quantity),x.unit||null,now());
        const insC=db.prepare('INSERT INTO shipment_containers(id,shipment_id,container_type,container_no,seal_no,created_at) VALUES(?,?,?,?,?,?)');
        for(const x of (Array.isArray(b.containers)?b.containers:[]))insC.run(randomUUID(),id,x.container_type||null,x.container_no||null,x.seal_no||null,now());
        audit(user,'create','shipment',id,req,{order_id:order.id});return json(res,201,{...db.prepare('SELECT * FROM shipments WHERE id=?').get(id),items:db.prepare('SELECT * FROM shipment_items WHERE shipment_id=?').all(id),containers:db.prepare('SELECT * FROM shipment_containers WHERE shipment_id=?').all(id)});
      }
      const sfull=p.match(/^\/api\/workflows\/shipments\/([0-9a-f-]+)\/full$/);
      if(sfull&&req.method==='GET'){
        const sh=db.prepare('SELECT s.*,o.customer_id,o.order_no FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.id=?').get(sfull[1]);if(!sh)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,sh.customer_id))return json(res,403,{error:'forbidden'});
        return json(res,200,{...sh,items:db.prepare('SELECT * FROM shipment_items WHERE shipment_id=?').all(sh.id),containers:db.prepare('SELECT * FROM shipment_containers WHERE shipment_id=?').all(sh.id)});
      }
      const sstatus=p.match(/^\/api\/workflows\/shipments\/([0-9a-f-]+)\/status$/);
      if(sstatus&&req.method==='POST'){
        const sh=db.prepare('SELECT s.*,o.customer_id FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.id=?').get(sstatus[1]);if(!sh)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,sh.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),allowed=['booking','booked','stuffed','customs','departed','arrived','delivered'],next=String(b.status||'');
        if(!allowed.includes(next))return json(res,400,{error:'invalid_status'});
        db.prepare('UPDATE shipments SET status=?,updated_at=? WHERE id=?').run(next,now(),sh.id);
        const summary=refreshOrderShipmentStatus(sh.order_id);audit(user,'change_status','shipment',sh.id,req,{from:sh.status,to:next});return json(res,200,{shipment:db.prepare('SELECT * FROM shipments WHERE id=?').get(sh.id),summary});
      }
    }

    // ---- Finance: payment plans, receipts and customer credit ----
    if(p==='/api/finance/summary' && req.method==='GET'){
      const customerId=url.searchParams.get('customer_id');
      const where=customerId?' WHERE customer_id=?':'',args=customerId?[customerId]:[];
      const payments=db.prepare(`SELECT * FROM payments${where}`).all(...args);
      const paid=payments.filter(x=>x.status==='paid').reduce((a,x)=>a+Number(x.amount||0),0);
      const outstanding=payments.filter(x=>x.status!=='paid').reduce((a,x)=>a+Number(x.amount||0),0);
      const overdue=payments.filter(x=>x.status!=='paid'&&x.due_at&&x.due_at<now()).reduce((a,x)=>a+Number(x.amount||0),0);
      let credit=null;
      if(customerId)credit=db.prepare('SELECT * FROM credit_profiles WHERE customer_id=?').get(customerId)||null;
      const limit=Number(credit?.credit_limit||0),available=limit?Math.max(0,limit-outstanding):null;
      return json(res,200,{paid,outstanding,overdue,credit_limit:limit||null,credit_available:available,payment_count:payments.length,credit});
    }
    {
      const plan=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/payment-plan$/);
      if(plan && req.method==='POST'){
        const o=db.prepare('SELECT * FROM orders WHERE id=?').get(plan[1]);if(!o)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,o.customer_id))return json(res,403,{error:'forbidden'});
        if(!canWriteResource(user.role,'payments')&&!['admin','manager','sales'].includes(user.role))return json(res,403,{error:'forbidden'});
        const existing=db.prepare('SELECT COUNT(*) c FROM payments WHERE order_id=?').get(o.id).c;if(existing)return json(res,409,{error:'payment_plan_exists'});
        const b=await body(req),depositPct=Math.min(100,Math.max(0,Number(b.deposit_percent??30))),deposit=Number((o.total*depositPct/100).toFixed(2)),balance=Number((o.total-deposit).toFixed(2));
        const ins=db.prepare('INSERT INTO payments(id,customer_id,order_id,type,amount,currency,due_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
        if(deposit>0)ins.run(randomUUID(),o.customer_id,o.id,'deposit',deposit,o.currency,b.deposit_due||now().slice(0,10),'pending',now(),now());
        if(balance>0)ins.run(randomUUID(),o.customer_id,o.id,'balance',balance,o.currency,b.balance_due||o.requested_delivery||null,'pending',now(),now());
        audit(user,'create_payment_plan','orders',o.id,req,{deposit_percent:depositPct});return json(res,201,db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY due_at').all(o.id));
      }
      const paidRoute=p.match(/^\/api\/workflows\/payments\/([0-9a-f-]+)\/mark-paid$/);
      if(paidRoute && req.method==='POST'){
        if(!['admin','manager','finance'].includes(user.role))return json(res,403,{error:'forbidden'});
        const pay=db.prepare('SELECT * FROM payments WHERE id=?').get(paidRoute[1]);if(!pay)return json(res,404,{error:'not_found'});
        const b=await body(req);db.prepare("UPDATE payments SET status='paid',paid_at=?,bank_ref=?,updated_at=? WHERE id=?").run(b.paid_at||now(),b.bank_ref||pay.bank_ref||null,now(),pay.id);
        audit(user,'mark_paid','payments',pay.id,req,{paid_at:b.paid_at||now(),bank_ref:b.bank_ref||null});return json(res,200,db.prepare('SELECT * FROM payments WHERE id=?').get(pay.id));
      }
      const creditRoute=p.match(/^\/api\/customers\/([0-9a-f-]+)\/credit-profile$/);
      if(creditRoute && ['GET','PUT'].includes(req.method)){
        const customerId=creditRoute[1];if(scopedRole(user)&&!customerOwnedBy(user,customerId))return json(res,403,{error:'forbidden'});
        if(req.method==='GET'){return json(res,200,db.prepare('SELECT * FROM credit_profiles WHERE customer_id=?').get(customerId)||null);}
        if(!['admin','manager','finance'].includes(user.role))return json(res,403,{error:'forbidden'});
        const b=await body(req),old=db.prepare('SELECT * FROM credit_profiles WHERE customer_id=?').get(customerId),id=old?.id||randomUUID();
        if(old)db.prepare('UPDATE credit_profiles SET rating=?,credit_limit=?,currency=?,payment_days=?,insured_limit=?,notes=?,updated_at=? WHERE customer_id=?').run(b.rating||null,Number(b.credit_limit||0),b.currency||'USD',Number(b.payment_days||0),Number(b.insured_limit||0),b.notes||null,now(),customerId);
        else db.prepare('INSERT INTO credit_profiles(id,customer_id,rating,credit_limit,currency,payment_days,insured_limit,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,customerId,b.rating||null,Number(b.credit_limit||0),b.currency||'USD',Number(b.payment_days||0),Number(b.insured_limit||0),b.notes||null,now());
        audit(user,'upsert','credit_profile',id,req,{customer_id:customerId});return json(res,200,db.prepare('SELECT * FROM credit_profiles WHERE customer_id=?').get(customerId));
      }
    }

    // ---- Dedicated order execution workflow ----
    {
      const ofull=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/full$/);
      if(ofull && req.method==='GET'){
        const o=db.prepare('SELECT o.*,c.name customer_name,c.english_name customer_english_name FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?').get(ofull[1]);
        if(!o)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,o.customer_id))return json(res,403,{error:'forbidden'});
        return json(res,200,{...o,
          items:db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY rowid').all(o.id),
          payments:db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY COALESCE(due_at,created_at)').all(o.id),
          shipments:db.prepare('SELECT * FROM shipments WHERE order_id=? ORDER BY created_at DESC').all(o.id),
          documents:db.prepare("SELECT * FROM documents WHERE entity_type='order' AND entity_id=? ORDER BY created_at DESC").all(o.id),
          changes:db.prepare('SELECT oc.*,u.display_name changed_by_name FROM order_changes oc LEFT JOIN users u ON u.id=oc.changed_by WHERE order_id=? ORDER BY created_at DESC').all(o.id)
        });
      }
      const ostatus=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/status$/);
      if(ostatus && req.method==='POST'){
        const o=db.prepare('SELECT * FROM orders WHERE id=?').get(ostatus[1]);if(!o)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,o.customer_id))return json(res,403,{error:'forbidden'});
        if(!canWriteResource(user.role,'orders'))return json(res,403,{error:'forbidden'});
        const b=await body(req),next=String(b.status||'').trim();const allowed=['pending','confirmed','production','ready','partial_shipped','shipped','partial_delivered','completed','cancelled'];
        if(!allowed.includes(next))return json(res,400,{error:'invalid_status'});
        db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(next,now(),o.id);
        db.prepare('INSERT INTO order_changes(id,order_id,field_name,old_value,new_value,changed_by,note,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),o.id,'status',o.status,next,user.user_id,b.note||null,now());
        audit(user,'change_status','orders',o.id,req,{from:o.status,to:next,note:b.note||null});return json(res,200,db.prepare('SELECT * FROM orders WHERE id=?').get(o.id));
      }
      const orecalc=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/recalculate$/);
      if(orecalc && req.method==='POST'){
        const o=db.prepare('SELECT * FROM orders WHERE id=?').get(orecalc[1]);if(!o)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,o.customer_id))return json(res,403,{error:'forbidden'});
        const total=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM order_items WHERE order_id=?').get(o.id).total;
        db.prepare('UPDATE orders SET total=?,updated_at=? WHERE id=?').run(total,now(),o.id);
        return json(res,200,{...db.prepare('SELECT * FROM orders WHERE id=?').get(o.id),items:db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id)});
      }
    }

    // ---- Customer Excel import / preview / export data ----
    if(p==='/api/customers/import/preview' && req.method==='POST'){
      const b=await body(req), rows=Array.isArray(b.rows)?b.rows.slice(0,2000):[];
      const out=rows.map((row,index)=>{
        const clean={};
        for(const k of ['name','english_name','local_name','country','region','city','address','postal_code','website','industry','status','grade','source','timezone','language','tax_no','registration_no','annual_sales','employee_count','business_scope','notes']){
          if(row[k]!==undefined && row[k]!==null && row[k]!=='') clean[k]=row[k];
        }
        for(const k of ['customer_types','service_regions']){
          const v=row[k]; if(Array.isArray(v)) clean[k]=v; else if(v) clean[k]=String(v).split(/[;,，；|]/).map(x=>x.trim()).filter(Boolean);
        }
        const errors=[]; if(!String(clean.name||'').trim()) errors.push('客户名称必填');
        const matches=errors.length?[]:duplicateCandidates(clean);
        return {index,row:clean,errors,matches,status:errors.length?'invalid':matches.length?'duplicate':'ready'};
      });
      return json(res,200,{rows:out,total:out.length,invalid:out.filter(x=>x.status==='invalid').length,duplicates:out.filter(x=>x.status==='duplicate').length,ready:out.filter(x=>x.status==='ready').length});
    }
    if(p==='/api/customers/import/commit' && req.method==='POST'){
      const b=await body(req), items=Array.isArray(b.items)?b.items.slice(0,2000):[];
      const result={created:0,updated:0,skipped:0,errors:[]};
      db.exec('BEGIN IMMEDIATE');
      try{
        for(let i=0;i<items.length;i++){
          const item=items[i]||{}, action=item.action||'skip', raw=item.row||{};
          if(action==='skip'){result.skipped++;continue;}
          const cfg=resourceMap.customers, payload=sanitizePayload(cfg,raw,action==='create');
          if(!payload.name){result.errors.push({index:i,message:'客户名称必填'});continue;}
          if(action==='update'){
            const target=String(item.duplicate_id||''); const old=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(target);
            if(!old){result.errors.push({index:i,message:'重复客户不存在'});continue;}
            if(!['admin','manager'].includes(user.role) && old.owner_id!==user.user_id){result.skipped++;continue;}
            delete payload.owner_id; payload.updated_at=now();
            const es=Object.entries(payload); if(es.length) db.prepare(`UPDATE customers SET ${es.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...es.map(([,v])=>v),target);
            audit(user,'import_update','customers',target,req,{index:i}); result.updated++;
          }else{
            payload.owner_id=['admin','manager'].includes(user.role)&&raw.owner_id?raw.owner_id:user.user_id;
            const newId=randomUUID(), cols=['id',...Object.keys(payload),'created_at','updated_at'], vals=[newId,...Object.values(payload),now(),now()];
            db.prepare(`INSERT INTO customers(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...vals);
            audit(user,'import_create','customers',newId,req,{index:i}); result.created++;
          }
        }
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return json(res,200,result);
    }
    if(p==='/api/customers/export-data' && req.method==='GET'){
      const filters=['c.deleted_at IS NULL'],args=[];
      const exacts=['country','status','grade','source','industry','owner_id'];
      for(const k of exacts){const v=url.searchParams.get(k);if(v){filters.push(`c.${k}=?`);args.push(v);}}
      const tagId=url.searchParams.get('tag_id'); if(tagId){filters.push('EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=c.id AND ct.tag_id=?)');args.push(tagId);}
      const customerType=url.searchParams.get('customer_type'); if(customerType){filters.push('c.customer_types LIKE ?');args.push(`%"${customerType}"%`);}
      const rows=db.prepare(`SELECT c.*,u.display_name owner_name FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE ${filters.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 5000`).all(...args)
        .map(r=>decodeRow(r,resourceMap.customers));
      return json(res,200,rows);
    }


    // ---- Unified customer 360 timeline ----
    {
      const tl=p.match(/^\/api\/customers\/([0-9a-f-]+)\/timeline$/);
      if(tl && req.method==='GET'){
        const customerId=tl[1];
        const c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(customerId);
        if(!c) return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,customerId)) return json(res,403,{error:'forbidden'});
        const events=[];
        events.push({type:'customer',time:c.created_at,title:'客户创建',summary:c.name,entity_id:c.id,status:c.status});
        for(const x of db.prepare('SELECT * FROM activities WHERE customer_id=?').all(customerId)) events.push({type:'activity',time:x.occurred_at||x.created_at,title:x.subject||`${x.type} 跟进`,summary:x.content,entity_id:x.id,status:x.result});
        for(const x of db.prepare('SELECT * FROM inquiries WHERE customer_id=?').all(customerId)) events.push({type:'inquiry',time:x.received_at||x.created_at,title:`询盘 ${x.inquiry_no}`,summary:[(parseJSON(x.products,[])||[]).join('、'),x.quantity,x.target_price].filter(Boolean).join(' · '),entity_id:x.id,status:x.status});
        for(const x of db.prepare('SELECT * FROM opportunities WHERE customer_id=?').all(customerId)) events.push({type:'opportunity',time:x.created_at,title:`商机：${x.name}`,summary:x.expected_amount?`${x.currency||''} ${x.expected_amount}`:'',entity_id:x.id,status:x.stage});
        for(const x of db.prepare('SELECT * FROM quotations WHERE customer_id=?').all(customerId)) events.push({type:'quotation',time:x.created_at,title:`报价 ${x.quote_no} · V${x.version}`,summary:`${x.currency||''} ${Number(x.total||0).toFixed(2)}`,entity_id:x.id,status:x.status});
        for(const x of db.prepare('SELECT * FROM samples WHERE customer_id=?').all(customerId)) events.push({type:'sample',time:x.sent_at||x.created_at,title:`样品：${x.product}`,summary:[x.courier,x.tracking_no].filter(Boolean).join(' · '),entity_id:x.id,status:x.status});
        for(const x of db.prepare('SELECT * FROM contracts WHERE customer_id=?').all(customerId)) events.push({type:'contract',time:x.signed_at||x.created_at,title:`合同 ${x.contract_no}`,summary:`${x.currency||''} ${Number(x.amount||0).toFixed(2)}`,entity_id:x.id,status:x.status});
        for(const x of db.prepare('SELECT * FROM orders WHERE customer_id=?').all(customerId)) events.push({type:'order',time:x.created_at,title:`订单 ${x.order_no}`,summary:`${x.currency||''} ${Number(x.total||0).toFixed(2)}`,entity_id:x.id,status:x.status});
        for(const x of db.prepare('SELECT * FROM payments WHERE customer_id=?').all(customerId)) events.push({type:'payment',time:x.paid_at||x.due_at||x.created_at,title:`${x.type||'回款'} ${x.status==='paid'?'到账':'计划'}`,summary:`${x.currency||''} ${Number(x.amount||0).toFixed(2)}`,entity_id:x.id,status:x.status});
        for(const x of db.prepare(`SELECT s.* FROM shipments s JOIN orders o ON o.id=s.order_id WHERE o.customer_id=?`).all(customerId)) events.push({type:'shipment',time:x.etd||x.created_at,title:`出运 ${x.booking_no||x.bl_no||''}`,summary:[x.carrier,x.container_no,x.destination_port].filter(Boolean).join(' · '),entity_id:x.id,status:x.status});
        for(const x of db.prepare('SELECT * FROM aftersales WHERE customer_id=?').all(customerId)) events.push({type:'aftersales',time:x.opened_at,title:`售后：${x.subject}`,summary:x.category,entity_id:x.id,status:x.status});
        events.sort((a,b)=>String(b.time||'').localeCompare(String(a.time||'')));
        return json(res,200,events);
      }
    }

    // ---- Customer ownership, tags and duplicate/collision protection ----
    if(p==='/api/users/lookup' && req.method==='GET'){
      return json(res,200,db.prepare("SELECT id,username,display_name,role FROM users WHERE enabled=1 ORDER BY display_name").all());
    }
    if(p==='/api/customers/duplicate-check' && req.method==='POST'){
      const b=await body(req);
      return json(res,200,{matches:duplicateCandidates(b),checked_at:now()});
    }
    {
      const tm=p.match(/^\/api\/customers\/([0-9a-f-]+)\/tags$/);
      if(tm && req.method==='GET'){
        const rows=db.prepare(`SELECT t.* FROM tags t JOIN customer_tags ct ON ct.tag_id=t.id
          WHERE ct.customer_id=? ORDER BY COALESCE(t.category,''),t.name`).all(tm[1]);
        return json(res,200,rows);
      }
      if(tm && req.method==='POST'){
        const b=await body(req); let tagId=String(b.tag_id||'');
        if(!tagId){
          const name=String(b.name||'').trim(); if(!name) return json(res,400,{error:'tag_name_required'});
          let tag=db.prepare('SELECT * FROM tags WHERE name=?').get(name);
          if(!tag){ tagId=randomUUID(); db.prepare('INSERT INTO tags(id,name,category,created_at) VALUES(?,?,?,?)').run(tagId,name,b.category||null,now()); }
          else tagId=tag.id;
        }
        db.prepare('INSERT OR IGNORE INTO customer_tags(customer_id,tag_id) VALUES(?,?)').run(tm[1],tagId);
        audit(user,'add_tag','customers',tm[1],req,{tag_id:tagId});
        return json(res,201,db.prepare('SELECT * FROM tags WHERE id=?').get(tagId));
      }
      const tdel=p.match(/^\/api\/customers\/([0-9a-f-]+)\/tags\/([0-9a-f-]+)$/);
      if(tdel && req.method==='DELETE'){
        db.prepare('DELETE FROM customer_tags WHERE customer_id=? AND tag_id=?').run(tdel[1],tdel[2]);
        audit(user,'remove_tag','customers',tdel[1],req,{tag_id:tdel[2]});
        return json(res,200,{ok:true});
      }
      const transfer=p.match(/^\/api\/customers\/([0-9a-f-]+)\/transfer$/);
      if(transfer && req.method==='POST'){
        if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
        const b=await body(req), ownerId=String(b.owner_id||'');
        const owner=db.prepare('SELECT id,display_name,role FROM users WHERE id=? AND enabled=1').get(ownerId);
        if(!owner) return json(res,400,{error:'invalid_owner'});
        const before=db.prepare('SELECT owner_id FROM customers WHERE id=? AND deleted_at IS NULL').get(transfer[1]);
        if(!before) return json(res,404,{error:'not_found'});
        db.prepare('UPDATE customers SET owner_id=?,updated_at=? WHERE id=?').run(ownerId,now(),transfer[1]);
        audit(user,'transfer_owner','customers',transfer[1],req,{from:before.owner_id,to:ownerId});
        return json(res,200,{ok:true,owner});
      }
    }

    // ---- Sales workflow actions: inquiry -> opportunity -> quotation -> order / sample follow-up ----
    {
      const wm=p.match(/^\/api\/workflows\/inquiries\/([0-9a-f-]+)\/to-opportunity$/);
      if(wm && req.method==='POST'){
        const inquiry=db.prepare('SELECT * FROM inquiries WHERE id=?').get(wm[1]);
        if(!inquiry) return json(res,404,{error:'inquiry_not_found'});
        const existing=db.prepare('SELECT * FROM opportunities WHERE inquiry_id=? ORDER BY created_at DESC LIMIT 1').get(inquiry.id);
        if(existing) return json(res,200,existing);
        const b=await body(req), id=randomUUID();
        db.prepare('INSERT INTO opportunities(id,customer_id,inquiry_id,name,stage,expected_amount,currency,expected_close_date,probability,competitor,owner_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,inquiry.customer_id,inquiry.id,b.name||('商机 '+inquiry.inquiry_no),b.stage||'qualification',Number(b.expected_amount||0),b.currency||'USD',b.expected_close_date||null,Number(b.probability||20),b.competitor||null,b.owner_id||inquiry.owner_id||user.user_id,b.notes||inquiry.notes||null,now(),now());
        db.prepare("UPDATE inquiries SET status='converted',updated_at=? WHERE id=?").run(now(),inquiry.id);
        audit(user,'convert_inquiry_to_opportunity','opportunities',id,req,{inquiry_id:inquiry.id});
        return json(res,201,db.prepare('SELECT * FROM opportunities WHERE id=?').get(id));
      }

      const wo=p.match(/^\/api\/workflows\/opportunities\/([0-9a-f-]+)\/to-quotation$/);
      if(wo && req.method==='POST'){
        const opp=db.prepare('SELECT * FROM opportunities WHERE id=?').get(wo[1]);
        if(!opp) return json(res,404,{error:'opportunity_not_found'});
        const b=await body(req), id=randomUUID(), quoteNo=makeNo('QT');
        db.prepare(`INSERT INTO quotations(id,quote_no,customer_id,contact_id,opportunity_id,version,currency,incoterm,payment_terms,moq,packaging,lead_time,valid_until,subtotal,discount,total,margin_rate,status,notes,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id,quoteNo,opp.customer_id,b.contact_id||null,opp.id,1,b.currency||opp.currency||'USD',b.incoterm||null,b.payment_terms||null,b.moq||null,b.packaging||null,b.lead_time||null,b.valid_until||null,0,0,0,null,'draft',b.notes||opp.notes||null,now(),now());
        audit(user,'create_quotation_from_opportunity','quotations',id,req,{opportunity_id:opp.id});
        return json(res,201,db.prepare('SELECT * FROM quotations WHERE id=?').get(id));
      }

      const qfull=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/full$/);
      if(qfull && req.method==='GET'){
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qfull[1]);
        if(!q) return json(res,404,{error:'quotation_not_found'});
        const items=db.prepare('SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY rowid').all(q.id);
        const safeQ=protectRow('quotations',q,user); const safeItems=items.map(x=>protectRow('quotationItems',x,user)); return json(res,200,{...safeQ,items:safeItems});
      }

      const qrecalc=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/recalculate$/);
      if(qrecalc && req.method==='POST'){
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qrecalc[1]);
        if(!q) return json(res,404,{error:'quotation_not_found'});
        const items=db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(q.id);
        let subtotal=0,totalCost=0;
        const upd=db.prepare('UPDATE quotation_items SET amount=? WHERE id=?');
        for(const item of items){ const amount=Number(item.quantity||0)*Number(item.unit_price||0); subtotal+=amount; totalCost+=Number(item.quantity||0)*Number(item.cost||0); upd.run(amount,item.id); }
        const discount=Number(q.discount||0), total=Math.max(0,subtotal-discount), marginRate=total>0?((total-totalCost)/total*100):null;
        db.prepare('UPDATE quotations SET subtotal=?,total=?,margin_rate=?,updated_at=? WHERE id=?').run(subtotal,total,marginRate,now(),q.id);
        audit(user,'recalculate','quotations',q.id,req,{subtotal,total,margin_rate:marginRate});
        return json(res,200,{...db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id),items:db.prepare('SELECT * FROM quotation_items WHERE quotation_id=? ORDER BY rowid').all(q.id)});
      }

      const qcopy=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/copy-version$/);
      if(qcopy && req.method==='POST'){
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qcopy[1]);
        if(!q) return json(res,404,{error:'quotation_not_found'});
        const maxv=db.prepare('SELECT COALESCE(MAX(version),0) v FROM quotations WHERE opportunity_id IS ? AND customer_id=?').get(q.opportunity_id,q.customer_id).v;
        const id=randomUUID(), quoteNo=makeNo('QT');
        db.prepare(`INSERT INTO quotations(id,quote_no,customer_id,contact_id,opportunity_id,version,currency,incoterm,payment_terms,moq,packaging,lead_time,valid_until,subtotal,discount,total,margin_rate,status,notes,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(id,quoteNo,q.customer_id,q.contact_id,q.opportunity_id,Number(maxv)+1,q.currency,q.incoterm,q.payment_terms,q.moq,q.packaging,q.lead_time,q.valid_until,q.subtotal,q.discount,q.total,q.margin_rate,'draft',q.notes,now(),now());
        const items=db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(q.id);
        const ins=db.prepare('INSERT INTO quotation_items(id,quotation_id,product_code,product_name,quantity,unit,unit_price,amount,cost,spec) VALUES(?,?,?,?,?,?,?,?,?,?)');
        for(const it of items) ins.run(randomUUID(),id,it.product_code,it.product_name,it.quantity,it.unit,it.unit_price,it.amount,it.cost,it.spec);
        audit(user,'copy_version','quotations',id,req,{from_quotation_id:q.id,version:Number(maxv)+1});
        return json(res,201,{...db.prepare('SELECT * FROM quotations WHERE id=?').get(id),items:db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(id)});
      }

      const qsubmit=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/submit$/);
      if(qsubmit && req.method==='POST'){
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qsubmit[1]);
        if(!q) return json(res,404,{error:'quotation_not_found'});
        db.prepare("UPDATE quotations SET status='pending_approval',updated_at=? WHERE id=?").run(now(),q.id);
        audit(user,'submit_approval','quotations',q.id,req);
        return json(res,200,db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id));
      }

      const qapprove=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/approve$/);
      if(qapprove && req.method==='POST'){
        if(!['admin','manager'].includes(user.role)) return json(res,403,{error:'forbidden'});
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qapprove[1]);
        if(!q) return json(res,404,{error:'quotation_not_found'});
        db.prepare("UPDATE quotations SET status='approved',updated_at=? WHERE id=?").run(now(),q.id);
        audit(user,'approve','quotations',q.id,req);
        return json(res,200,db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id));
      }

      const qorder=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/to-order$/);
      if(qorder && req.method==='POST'){
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qorder[1]);
        if(!q) return json(res,404,{error:'quotation_not_found'});
        if(!['approved','sent','accepted'].includes(q.status)) return json(res,409,{error:'quotation_not_approved'});
        const existing=db.prepare('SELECT * FROM orders WHERE quotation_id=? ORDER BY created_at DESC LIMIT 1').get(q.id);
        if(existing) return json(res,200,existing);
        const b=await body(req), id=randomUUID();
        db.prepare('INSERT INTO orders(id,order_no,customer_id,quotation_id,customer_po,status,currency,incoterm,payment_terms,total,requested_delivery,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,makeNo('SO'),q.customer_id,q.id,b.customer_po||null,'pending',q.currency,q.incoterm,q.payment_terms,q.total,b.requested_delivery||null,b.notes||q.notes||null,now(),now());
        const items=db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(q.id);
        const ins=db.prepare('INSERT INTO order_items(id,order_id,product_name,quantity,unit,unit_price,amount) VALUES(?,?,?,?,?,?,?)');
        for(const it of items) ins.run(randomUUID(),id,it.product_name,it.quantity,it.unit,it.unit_price,it.amount);
        db.prepare("UPDATE quotations SET status='accepted',updated_at=? WHERE id=?").run(now(),q.id);
        if(q.opportunity_id) db.prepare("UPDATE opportunities SET stage='won',probability=100,updated_at=? WHERE id=?").run(now(),q.opportunity_id);
        audit(user,'convert_quotation_to_order','orders',id,req,{quotation_id:q.id});
        return json(res,201,{...db.prepare('SELECT * FROM orders WHERE id=?').get(id),items:db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id)});
      }

      const sdel=p.match(/^\/api\/workflows\/samples\/([0-9a-f-]+)\/mark-delivered$/);
      if(sdel && req.method==='POST'){
        const s=db.prepare('SELECT * FROM samples WHERE id=?').get(sdel[1]);
        if(!s) return json(res,404,{error:'sample_not_found'});
        const b=await body(req), deliveredAt=b.delivered_at||now();
        db.prepare("UPDATE samples SET status='delivered',delivered_at=?,updated_at=? WHERE id=?").run(deliveredAt,now(),s.id);
        const taskId=randomUUID(), due=new Date(new Date(deliveredAt).getTime()+3*24*3600_000).toISOString();
        db.prepare('INSERT INTO tasks(id,customer_id,title,description,due_at,status,priority,assigned_to,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(taskId,s.customer_id,'跟进样品反馈',`样品：${s.product}；运单：${s.tracking_no||'-'}。请确认客户试用反馈并推动下一步。`,due,'todo','high',user.user_id,user.user_id,now(),now());
        audit(user,'sample_delivered','samples',s.id,req,{task_id:taskId});
        return json(res,200,{sample:db.prepare('SELECT * FROM samples WHERE id=?').get(s.id),task:db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId)});
      }
    }

    const m=p.match(/^\/api\/([A-Za-z]+)(?:\/([0-9a-f-]+))?$/);
    if(m && resourceMap[m[1]]){
      const key=m[1], id=m[2], cfg=resourceMap[key], table=cfg.table;
      if(key==='users' && user.role!=='admin') return json(res,403,{error:'forbidden'});
      if(key==='customFields' && !['admin','manager'].includes(user.role) && req.method!=='GET') return json(res,403,{error:'forbidden'});
      if(req.method!=='GET' && !canWriteResource(user.role,key)) return json(res,403,{error:'forbidden'});
      if(req.method==='GET' && !id){
        const page=Math.max(1,Number(url.searchParams.get('page')||1)), size=Math.min(200,Math.max(1,Number(url.searchParams.get('size')||50))), offset=(page-1)*size;
        const customerId=url.searchParams.get('customer_id'); const contactId=url.searchParams.get('contact_id'); const orderId=url.searchParams.get('order_id'); const ownerId=url.searchParams.get('owner_id'); const tagId=url.searchParams.get('tag_id');
        const filters=[]; const args=[]; if(customerId && tableCols(table).includes('customer_id')){filters.push('customer_id=?');args.push(customerId);} if(contactId&&tableCols(table).includes('contact_id')){filters.push('contact_id=?');args.push(contactId);} if(orderId&&tableCols(table).includes('order_id')){filters.push('order_id=?');args.push(orderId);} if(scopedRole(user)){ if(table==='customers'){filters.push('owner_id=?');args.push(user.user_id);} else if(tableCols(table).includes('customer_id')){filters.push('customer_id IN (SELECT id FROM customers WHERE owner_id=? AND deleted_at IS NULL)');args.push(user.user_id);} else if(key==='channels'){filters.push('contact_id IN (SELECT ct.id FROM contacts ct JOIN customers c ON c.id=ct.customer_id WHERE c.owner_id=? AND c.deleted_at IS NULL)');args.push(user.user_id);} else if(key==='quotationItems'){filters.push('quotation_id IN (SELECT q.id FROM quotations q JOIN customers c ON c.id=q.customer_id WHERE c.owner_id=? AND c.deleted_at IS NULL)');args.push(user.user_id);} else if(key==='orderItems'){filters.push('order_id IN (SELECT o.id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.owner_id=? AND c.deleted_at IS NULL)');args.push(user.user_id);} else if(key==='shipments'){filters.push('order_id IN (SELECT o.id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.owner_id=? AND c.deleted_at IS NULL)');args.push(user.user_id);} } if(table==='customers'){filters.push('deleted_at IS NULL'); const exacts=['owner_id','country','status','grade','source','industry']; for(const k of exacts){const v=url.searchParams.get(k);if(v){filters.push(`${k}=?`);args.push(v);}} const customerType=url.searchParams.get('customer_type'); if(customerType){filters.push('customer_types LIKE ?');args.push(`%"${customerType}"%`);} if(tagId){filters.push('EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=customers.id AND ct.tag_id=?)');args.push(tagId);}}
        const where=filters.length?`WHERE ${filters.join(' AND ')}`:''; const total=db.prepare(`SELECT COUNT(*) c FROM ${table} ${where}`).get(...args).c; const data=db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${tableCols(table).includes('updated_at')?'updated_at':'rowid'} DESC LIMIT ? OFFSET ?`).all(...args,size,offset).map(r=>protectRow(key,decodeRow(r,cfg),user)); return json(res,200,{data,total,page,size});
      }
      if(req.method==='GET' && id){ const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id); if(!row)return json(res,404,{error:'not_found'}); const cid=key==='customers'?row.id:resourceCustomerId(key,id,true); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); return json(res,200,protectRow(key,decodeRow(row,cfg),user)); }
      if(req.method==='POST' && !id){
        const b=await body(req), payload=sanitizePayload(cfg,b,true); if(table==='customers'){ if(!['admin','manager'].includes(user.role)) payload.owner_id=user.user_id; else if(!payload.owner_id) payload.owner_id=user.user_id; } else { const cid=resourceCustomerId(key,payload,false); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); } const newId=randomUUID(), cols=['id',...Object.keys(payload)], vals=[newId,...Object.values(payload)]; if(tableCols(table).includes('created_at')){cols.push('created_at');vals.push(now());} if(tableCols(table).includes('updated_at')){cols.push('updated_at');vals.push(now());}
        if(table==='inquiries' && !payload.inquiry_no){cols.push('inquiry_no');vals.push(makeNo('INQ'));} if(table==='quotations'&&!payload.quote_no){cols.push('quote_no');vals.push(makeNo('QT'));} if(table==='contracts'&&!payload.contract_no){cols.push('contract_no');vals.push(makeNo('CT'));} if(table==='orders'&&!payload.order_no){cols.push('order_no');vals.push(makeNo('SO'));} if(table==='aftersales'){if(!payload.ticket_no){cols.push('ticket_no');vals.push(makeNo('AS'));} if(!payload.opened_at){const opened=now();cols.push('opened_at');vals.push(opened);if(tableCols(table).includes('sla_due_at')){cols.push('sla_due_at');vals.push(aftersalesSlaDue(payload.severity||'normal',opened));}}}
        if(table==='users'){ const password=String(b.password||'ChangeMe@123'); cols.push('password_hash');vals.push(hashPassword(password)); }
        db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...vals); audit(user,'create',key,newId,req,payload); return json(res,201,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(newId),cfg));
      }
      if(req.method==='PATCH' && id){ const cid=key==='customers'?id:resourceCustomerId(key,id,true); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); const b=await body(req), payload=sanitizePayload(cfg,b,false); if(table==='customers' && !['admin','manager'].includes(user.role)) delete payload.owner_id; if(table==='users' && b.password) payload.password_hash=hashPassword(String(b.password)); if(tableCols(table).includes('updated_at')) payload.updated_at=now(); const entries=Object.entries(payload); if(!entries.length) return json(res,400,{error:'no_fields'}); const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); db.prepare(`UPDATE ${table} SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),id); audit(user,'update',key,id,req,payload); return json(res,200,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),cfg)); }
      if(req.method==='DELETE' && id){ const cid=key==='customers'?id:resourceCustomerId(key,id,true); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); if(table==='customers') db.prepare('UPDATE customers SET deleted_at=?,updated_at=? WHERE id=?').run(now(),now(),id); else db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); audit(user,'delete',key,id,req); return json(res,200,{ok:true}); }
    }

    return json(res,404,{error:'not_found',path:p});
  } catch(e){ console.error(req.requestId,e); return json(res,400,{error:'request_failed',message:e.message,request_id:req.requestId}); }
});
server.listen(PORT,HOST,()=>console.log(`TradeFlow API listening on http://${HOST}:${PORT}/api`));
