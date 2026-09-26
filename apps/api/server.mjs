import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
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
CREATE TABLE IF NOT EXISTS order_items(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT, unit_price REAL NOT NULL, amount REAL NOT NULL, delivery_date TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, order_id TEXT, type TEXT, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', due_at TEXT, paid_at TEXT, status TEXT NOT NULL DEFAULT 'pending', bank_ref TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_profiles(id TEXT PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL, rating TEXT, credit_limit REAL, currency TEXT DEFAULT 'USD', payment_days INTEGER, insured_limit REAL, overdue_count INTEGER NOT NULL DEFAULT 0, max_overdue_days INTEGER NOT NULL DEFAULT 0, notes TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, booking_no TEXT, carrier TEXT, forwarder TEXT, vessel_voyage TEXT, container_type TEXT, container_no TEXT, bl_no TEXT, port_of_loading TEXT, destination_port TEXT, etd TEXT, eta TEXT, status TEXT NOT NULL DEFAULT 'booking', tracking_url TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, category TEXT, name TEXT NOT NULL, version TEXT, url TEXT, content_base64 TEXT, mime_type TEXT, notes TEXT, uploaded_by TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aftersales(id TEXT PRIMARY KEY, ticket_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, order_id TEXT, category TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'normal', subject TEXT NOT NULL, description TEXT NOT NULL, responsible_team TEXT, solution TEXT, status TEXT NOT NULL DEFAULT 'open', satisfaction INTEGER, opened_at TEXT NOT NULL, closed_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, segment_rule TEXT, status TEXT NOT NULL DEFAULT 'draft', scheduled_at TEXT, content TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, ip TEXT, request_id TEXT, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
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
function body(req) { return new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>{ raw+=c; if(raw.length>5_000_000){reject(new Error('payload too large'));req.destroy();}}); req.on('end',()=>{ if(!raw)return resolve({}); try{resolve(JSON.parse(raw));}catch{reject(new Error('invalid json'));}}); req.on('error',reject);}); }
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
      const results=db.prepare(`SELECT id,name,english_name,country,status,grade,website FROM customers WHERE deleted_at IS NULL AND (name LIKE ? OR english_name LIKE ? OR website LIKE ? OR tax_no LIKE ?) LIMIT 50`).all(like,like,like,like);
      return json(res,200,results);
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
        return json(res,200,{...q,items});
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
      if(req.method==='GET' && !id){
        const page=Math.max(1,Number(url.searchParams.get('page')||1)), size=Math.min(200,Math.max(1,Number(url.searchParams.get('size')||50))), offset=(page-1)*size;
        const customerId=url.searchParams.get('customer_id'); const contactId=url.searchParams.get('contact_id'); const orderId=url.searchParams.get('order_id'); const ownerId=url.searchParams.get('owner_id'); const tagId=url.searchParams.get('tag_id');
        const filters=[]; const args=[]; if(customerId && tableCols(table).includes('customer_id')){filters.push('customer_id=?');args.push(customerId);} if(contactId&&tableCols(table).includes('contact_id')){filters.push('contact_id=?');args.push(contactId);} if(orderId&&tableCols(table).includes('order_id')){filters.push('order_id=?');args.push(orderId);} if(table==='customers'){filters.push('deleted_at IS NULL'); if(ownerId){filters.push('owner_id=?');args.push(ownerId);} if(tagId){filters.push('EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=customers.id AND ct.tag_id=?)');args.push(tagId);}}
        const where=filters.length?`WHERE ${filters.join(' AND ')}`:''; const total=db.prepare(`SELECT COUNT(*) c FROM ${table} ${where}`).get(...args).c; const data=db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${tableCols(table).includes('updated_at')?'updated_at':'rowid'} DESC LIMIT ? OFFSET ?`).all(...args,size,offset).map(r=>decodeRow(r,cfg)); return json(res,200,{data,total,page,size});
      }
      if(req.method==='GET' && id){ const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id); return row?json(res,200,decodeRow(row,cfg)):json(res,404,{error:'not_found'}); }
      if(req.method==='POST' && !id){
        const b=await body(req), payload=sanitizePayload(cfg,b,true); if(table==='customers'){ if(!['admin','manager'].includes(user.role)) payload.owner_id=user.user_id; else if(!payload.owner_id) payload.owner_id=user.user_id; } const newId=randomUUID(), cols=['id',...Object.keys(payload)], vals=[newId,...Object.values(payload)]; if(tableCols(table).includes('created_at')){cols.push('created_at');vals.push(now());} if(tableCols(table).includes('updated_at')){cols.push('updated_at');vals.push(now());}
        if(table==='inquiries' && !payload.inquiry_no){cols.push('inquiry_no');vals.push(makeNo('INQ'));} if(table==='quotations'&&!payload.quote_no){cols.push('quote_no');vals.push(makeNo('QT'));} if(table==='contracts'&&!payload.contract_no){cols.push('contract_no');vals.push(makeNo('CT'));} if(table==='orders'&&!payload.order_no){cols.push('order_no');vals.push(makeNo('SO'));} if(table==='aftersales'&&!payload.ticket_no){cols.push('ticket_no');vals.push(makeNo('AS'));}
        if(table==='users'){ const password=String(b.password||'ChangeMe@123'); cols.push('password_hash');vals.push(hashPassword(password)); }
        db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...vals); audit(user,'create',key,newId,req,payload); return json(res,201,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(newId),cfg));
      }
      if(req.method==='PATCH' && id){ const b=await body(req), payload=sanitizePayload(cfg,b,false); if(table==='customers' && !['admin','manager'].includes(user.role)) delete payload.owner_id; if(table==='users' && b.password) payload.password_hash=hashPassword(String(b.password)); if(tableCols(table).includes('updated_at')) payload.updated_at=now(); const entries=Object.entries(payload); if(!entries.length) return json(res,400,{error:'no_fields'}); const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); db.prepare(`UPDATE ${table} SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),id); audit(user,'update',key,id,req,payload); return json(res,200,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),cfg)); }
      if(req.method==='DELETE' && id){ const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); if(table==='customers') db.prepare('UPDATE customers SET deleted_at=?,updated_at=? WHERE id=?').run(now(),now(),id); else db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); audit(user,'delete',key,id,req); return json(res,200,{ok:true}); }
    }

    return json(res,404,{error:'not_found',path:p});
  } catch(e){ console.error(req.requestId,e); return json(res,400,{error:'request_failed',message:e.message,request_id:req.requestId}); }
});
server.listen(PORT,HOST,()=>console.log(`TradeFlow API listening on http://${HOST}:${PORT}/api`));
