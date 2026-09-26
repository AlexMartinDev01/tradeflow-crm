import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const DB_FILE = process.env.DB_FILE || path.resolve('./tradeflow.db');
const APP_SECRET = process.env.APP_SECRET || 'dev-only-change-me';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

fs.mkdirSync(path.resolve('./uploads'), { recursive: true });
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

    const m=p.match(/^\/api\/([A-Za-z]+)(?:\/([0-9a-f-]+))?$/);
    if(m && resourceMap[m[1]]){
      const key=m[1], id=m[2], cfg=resourceMap[key], table=cfg.table;
      if(key==='users' && user.role!=='admin') return json(res,403,{error:'forbidden'});
      if(req.method==='GET' && !id){
        const page=Math.max(1,Number(url.searchParams.get('page')||1)), size=Math.min(200,Math.max(1,Number(url.searchParams.get('size')||50))), offset=(page-1)*size;
        const customerId=url.searchParams.get('customer_id'); const contactId=url.searchParams.get('contact_id'); const orderId=url.searchParams.get('order_id');
        const filters=[]; const args=[]; if(customerId && tableCols(table).includes('customer_id')){filters.push('customer_id=?');args.push(customerId);} if(contactId&&tableCols(table).includes('contact_id')){filters.push('contact_id=?');args.push(contactId);} if(orderId&&tableCols(table).includes('order_id')){filters.push('order_id=?');args.push(orderId);} if(table==='customers') filters.push('deleted_at IS NULL');
        const where=filters.length?`WHERE ${filters.join(' AND ')}`:''; const total=db.prepare(`SELECT COUNT(*) c FROM ${table} ${where}`).get(...args).c; const data=db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${tableCols(table).includes('updated_at')?'updated_at':'rowid'} DESC LIMIT ? OFFSET ?`).all(...args,size,offset).map(r=>decodeRow(r,cfg)); return json(res,200,{data,total,page,size});
      }
      if(req.method==='GET' && id){ const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id); return row?json(res,200,decodeRow(row,cfg)):json(res,404,{error:'not_found'}); }
      if(req.method==='POST' && !id){
        const b=await body(req), payload=sanitizePayload(cfg,b,true), newId=randomUUID(), cols=['id',...Object.keys(payload)], vals=[newId,...Object.values(payload)]; if(tableCols(table).includes('created_at')){cols.push('created_at');vals.push(now());} if(tableCols(table).includes('updated_at')){cols.push('updated_at');vals.push(now());}
        if(table==='inquiries' && !payload.inquiry_no){cols.push('inquiry_no');vals.push(makeNo('INQ'));} if(table==='quotations'&&!payload.quote_no){cols.push('quote_no');vals.push(makeNo('QT'));} if(table==='contracts'&&!payload.contract_no){cols.push('contract_no');vals.push(makeNo('CT'));} if(table==='orders'&&!payload.order_no){cols.push('order_no');vals.push(makeNo('SO'));} if(table==='aftersales'&&!payload.ticket_no){cols.push('ticket_no');vals.push(makeNo('AS'));}
        if(table==='users'){ const password=String(b.password||'ChangeMe@123'); cols.push('password_hash');vals.push(hashPassword(password)); }
        db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...vals); audit(user,'create',key,newId,req,payload); return json(res,201,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(newId),cfg));
      }
      if(req.method==='PATCH' && id){ const b=await body(req), payload=sanitizePayload(cfg,b,false); if(table==='users' && b.password) payload.password_hash=hashPassword(String(b.password)); if(tableCols(table).includes('updated_at')) payload.updated_at=now(); const entries=Object.entries(payload); if(!entries.length) return json(res,400,{error:'no_fields'}); const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); db.prepare(`UPDATE ${table} SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),id); audit(user,'update',key,id,req,payload); return json(res,200,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),cfg)); }
      if(req.method==='DELETE' && id){ const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); if(table==='customers') db.prepare('UPDATE customers SET deleted_at=?,updated_at=? WHERE id=?').run(now(),now(),id); else db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); audit(user,'delete',key,id,req); return json(res,200,{ok:true}); }
    }

    return json(res,404,{error:'not_found',path:p});
  } catch(e){ console.error(req.requestId,e); return json(res,400,{error:'request_failed',message:e.message,request_id:req.requestId}); }
});
server.listen(PORT,HOST,()=>console.log(`TradeFlow API listening on http://${HOST}:${PORT}/api`));
