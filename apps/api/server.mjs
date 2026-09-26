import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHmac, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
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
CREATE TABLE IF NOT EXISTS departments(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, parent_id TEXT, manager_user_id TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS auth_challenges(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, challenge_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY, name TEXT NOT NULL, english_name TEXT, local_name TEXT, country TEXT, region TEXT, city TEXT, address TEXT, postal_code TEXT, website TEXT, industry TEXT, customer_types TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'potential', grade TEXT, source TEXT, timezone TEXT, language TEXT, tax_no TEXT, registration_no TEXT, owner_id TEXT, annual_sales REAL, employee_count INTEGER, business_scope TEXT, service_regions TEXT NOT NULL DEFAULT '[]', notes TEXT, custom_fields TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, FOREIGN KEY(owner_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL, title TEXT, department TEXT, role TEXT, language TEXT, timezone TEXT, is_primary INTEGER NOT NULL DEFAULT 0, is_departed INTEGER NOT NULL DEFAULT 0, birthday TEXT, influence_level TEXT, attitude TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS contact_channels(id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, channel TEXT NOT NULL, value TEXT NOT NULL, label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, preferred_time TEXT, created_at TEXT NOT NULL, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS channel_configs(id TEXT PRIMARY KEY, channel_key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, icon TEXT, link_mode TEXT NOT NULL DEFAULT 'copy', url_template TEXT, value_hint TEXT, copy_fallback INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS brands(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, logo_url TEXT, website TEXT, country TEXT, group_name TEXT, main_products TEXT, positioning TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer_brands(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, brand_id TEXT NOT NULL, relation_type TEXT NOT NULL, authorized_regions TEXT NOT NULL DEFAULT '[]', exclusive INTEGER NOT NULL DEFAULT 0, start_date TEXT, end_date TEXT, sales_share REAL, price_band TEXT, notes TEXT, created_at TEXT NOT NULL, UNIQUE(customer_id, brand_id, relation_type), FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS channel_network_links(id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, upstream_customer_id TEXT, downstream_customer_id TEXT NOT NULL, relationship_type TEXT NOT NULL DEFAULT 'distributor', channel_level INTEGER, territory TEXT, exclusive INTEGER NOT NULL DEFAULT 0, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(brand_id,upstream_customer_id,downstream_customer_id,relationship_type), FOREIGN KEY(brand_id) REFERENCES brands(id) ON DELETE CASCADE, FOREIGN KEY(upstream_customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(downstream_customer_id) REFERENCES customers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, category TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer_tags(customer_id TEXT NOT NULL, tag_id TEXT NOT NULL, PRIMARY KEY(customer_id,tag_id), FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS customer_collaborators(customer_id TEXT NOT NULL, user_id TEXT NOT NULL, added_by TEXT, created_at TEXT NOT NULL, PRIMARY KEY(customer_id,user_id), FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS public_pool_events(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, action TEXT NOT NULL, from_owner_id TEXT, to_owner_id TEXT, reason TEXT, operated_by TEXT, created_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS custom_field_defs(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, field_key TEXT NOT NULL, label TEXT NOT NULL, data_type TEXT NOT NULL, options TEXT NOT NULL DEFAULT '[]', group_name TEXT, required INTEGER NOT NULL DEFAULT 0, unique_value INTEGER NOT NULL DEFAULT 0, searchable INTEGER NOT NULL DEFAULT 1, visible_roles TEXT NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, UNIQUE(entity_type, field_key));
CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, contact_id TEXT, type TEXT NOT NULL, subject TEXT, content TEXT NOT NULL, result TEXT, next_action TEXT, occurred_at TEXT NOT NULL, created_by TEXT, attachments TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, customer_id TEXT, title TEXT NOT NULL, description TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'normal', assigned_to TEXT, created_by TEXT, reminder_at TEXT, recurring_rule TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inquiries(id TEXT PRIMARY KEY, inquiry_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, contact_id TEXT, source TEXT, status TEXT NOT NULL DEFAULT 'new', products TEXT NOT NULL DEFAULT '[]', quantity TEXT, target_price TEXT, incoterm TEXT, destination_port TEXT, requested_delivery TEXT, attachments TEXT NOT NULL DEFAULT '[]', received_at TEXT NOT NULL, first_response_at TEXT, owner_id TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, inquiry_id TEXT, name TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'qualification', expected_amount REAL, currency TEXT DEFAULT 'USD', expected_close_date TEXT, probability REAL, competitor TEXT, loss_reason TEXT, owner_id TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotations(id TEXT PRIMARY KEY, quote_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, contact_id TEXT, opportunity_id TEXT, version INTEGER NOT NULL DEFAULT 1, currency TEXT NOT NULL DEFAULT 'USD', incoterm TEXT, payment_terms TEXT, moq TEXT, packaging TEXT, lead_time TEXT, valid_until TEXT, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, margin_rate REAL, status TEXT NOT NULL DEFAULT 'draft', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quotation_items(id TEXT PRIMARY KEY, quotation_id TEXT NOT NULL, product_code TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 1, unit TEXT, unit_price REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, cost REAL, spec TEXT, FOREIGN KEY(quotation_id) REFERENCES quotations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS quotation_approvals(id TEXT PRIMARY KEY, quotation_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reasons TEXT NOT NULL DEFAULT '[]', submitted_by TEXT, decided_by TEXT, comment TEXT, submitted_at TEXT NOT NULL, decided_at TEXT, FOREIGN KEY(quotation_id) REFERENCES quotations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, opportunity_id TEXT, product TEXT NOT NULL, quantity TEXT, fee REAL, currency TEXT DEFAULT 'USD', courier TEXT, tracking_no TEXT, sent_at TEXT, delivered_at TEXT, feedback TEXT, status TEXT NOT NULL DEFAULT 'requested', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT NOT NULL, category TEXT, description TEXT, certifications TEXT NOT NULL DEFAULT '[]', base_price REAL, currency TEXT DEFAULT 'USD', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer_product_preferences(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, product_id TEXT NOT NULL, preference_type TEXT NOT NULL, interest_level TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(customer_id,product_id,preference_type), FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS price_lists(id TEXT PRIMARY KEY, name TEXT NOT NULL, customer_id TEXT, currency TEXT NOT NULL DEFAULT 'USD', valid_from TEXT, valid_to TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS price_list_items(id TEXT PRIMARY KEY, price_list_id TEXT NOT NULL, product_id TEXT NOT NULL, min_qty REAL NOT NULL DEFAULT 1, max_qty REAL, unit_price REAL NOT NULL, discount_percent REAL, notes TEXT, created_at TEXT NOT NULL, UNIQUE(price_list_id,product_id,min_qty), FOREIGN KEY(price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS product_market_rules(id TEXT PRIMARY KEY, product_id TEXT NOT NULL, country TEXT, rule_type TEXT NOT NULL, required_certifications TEXT NOT NULL DEFAULT '[]', notes TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY, contract_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, quotation_id TEXT, amount REAL, currency TEXT DEFAULT 'USD', signed_at TEXT, effective_from TEXT, effective_to TEXT, status TEXT DEFAULT 'draft', terms TEXT, attachments TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contract_versions(id TEXT PRIMARY KEY, contract_id TEXT NOT NULL, version INTEGER NOT NULL, amount REAL, currency TEXT, effective_from TEXT, effective_to TEXT, terms TEXT, snapshot TEXT NOT NULL DEFAULT '{}', created_by TEXT, created_at TEXT NOT NULL, UNIQUE(contract_id,version), FOREIGN KEY(contract_id) REFERENCES contracts(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, quotation_id TEXT, contract_id TEXT, customer_po TEXT, status TEXT NOT NULL DEFAULT 'pending', currency TEXT DEFAULT 'USD', incoterm TEXT, payment_terms TEXT, total REAL NOT NULL DEFAULT 0, requested_delivery TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_changes(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, changed_by TEXT, note TEXT, created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS order_items(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT, unit_price REAL NOT NULL, amount REAL NOT NULL, delivery_date TEXT, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, order_id TEXT, type TEXT, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', due_at TEXT, paid_at TEXT, status TEXT NOT NULL DEFAULT 'pending', bank_ref TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS credit_profiles(id TEXT PRIMARY KEY, customer_id TEXT UNIQUE NOT NULL, rating TEXT, credit_limit REAL, currency TEXT DEFAULT 'USD', payment_days INTEGER, insured_limit REAL, overdue_count INTEGER NOT NULL DEFAULT 0, max_overdue_days INTEGER NOT NULL DEFAULT 0, notes TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipments(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, booking_no TEXT, carrier TEXT, forwarder TEXT, vessel_voyage TEXT, container_type TEXT, container_no TEXT, bl_no TEXT, port_of_loading TEXT, destination_port TEXT, etd TEXT, eta TEXT, status TEXT NOT NULL DEFAULT 'booking', tracking_url TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shipment_items(id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, order_item_id TEXT, product_name TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT, created_at TEXT NOT NULL, FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS shipment_containers(id TEXT PRIMARY KEY, shipment_id TEXT NOT NULL, container_type TEXT, container_no TEXT, seal_no TEXT, created_at TEXT NOT NULL, FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS customs_declarations(id TEXT PRIMARY KEY, declaration_no TEXT UNIQUE NOT NULL, order_id TEXT NOT NULL, shipment_id TEXT, export_country TEXT, destination_country TEXT, customs_office TEXT, declaration_date TEXT, trade_mode TEXT, incoterm TEXT, currency TEXT, total_value REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', notes TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE, FOREIGN KEY(shipment_id) REFERENCES shipments(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS customs_declaration_items(id TEXT PRIMARY KEY, declaration_id TEXT NOT NULL, order_item_id TEXT, product_id TEXT, product_name TEXT NOT NULL, hs_code TEXT, customs_name TEXT, quantity REAL NOT NULL DEFAULT 0, unit TEXT, unit_price REAL NOT NULL DEFAULT 0, total_value REAL NOT NULL DEFAULT 0, origin_country TEXT, brand TEXT, model TEXT, material TEXT, usage TEXT, declaration_elements TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(declaration_id) REFERENCES customs_declarations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, category TEXT, name TEXT NOT NULL, version TEXT, url TEXT, content_base64 TEXT, mime_type TEXT, notes TEXT, uploaded_by TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aftersales(id TEXT PRIMARY KEY, ticket_no TEXT UNIQUE NOT NULL, customer_id TEXT NOT NULL, order_id TEXT, category TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'normal', subject TEXT NOT NULL, description TEXT NOT NULL, responsible_team TEXT, solution TEXT, status TEXT NOT NULL DEFAULT 'open', satisfaction INTEGER, opened_at TEXT NOT NULL, closed_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, segment_rule TEXT, status TEXT NOT NULL DEFAULT 'draft', scheduled_at TEXT, content TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS marketing_segments(id TEXT PRIMARY KEY, name TEXT NOT NULL, rules TEXT NOT NULL DEFAULT '{}', is_shared INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS email_templates(id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS marketing_consents(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, contact_id TEXT, channel TEXT NOT NULL DEFAULT 'email', status TEXT NOT NULL DEFAULT 'opt_in', source TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaign_recipients(id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, customer_id TEXT NOT NULL, contact_id TEXT, address TEXT, status TEXT NOT NULL DEFAULT 'prepared', reason TEXT, personalized_subject TEXT, personalized_body TEXT, sent_at TEXT, converted_at TEXT, created_at TEXT NOT NULL, UNIQUE(campaign_id,customer_id,contact_id,address));
CREATE TABLE IF NOT EXISTS integrations(id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, provider TEXT, base_url TEXT, enabled INTEGER NOT NULL DEFAULT 0, config TEXT NOT NULL DEFAULT '{}', secret_env TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS integration_deliveries(id TEXT PRIMARY KEY, integration_id TEXT NOT NULL, event TEXT NOT NULL, status TEXT NOT NULL, status_code INTEGER, response_excerpt TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_tokens(id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, role TEXT NOT NULL DEFAULT 'readonly', enabled INTEGER NOT NULL DEFAULT 1, expires_at TEXT, last_used_at TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, ip TEXT, request_id TEXT, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exchange_rates(id TEXT PRIMARY KEY, base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL, rate REAL NOT NULL, rate_date TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', notes TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(base_currency,quote_currency,rate_date,source));
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
try{db.exec("ALTER TABLE users ADD COLUMN totp_last_counter INTEGER NOT NULL DEFAULT -1");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN totp_secret_enc TEXT");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN password_changed_at TEXT");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN data_scope TEXT");}catch{}
try{db.exec("ALTER TABLE users ADD COLUMN department_id TEXT");}catch{}
try{db.exec("ALTER TABLE products ADD COLUMN declaration_elements TEXT NOT NULL DEFAULT '{}'");}catch{}
try{db.exec("ALTER TABLE products ADD COLUMN origin_country TEXT");}catch{}
try{db.exec("ALTER TABLE products ADD COLUMN customs_name TEXT");}catch{}
try{db.exec("ALTER TABLE products ADD COLUMN hs_code TEXT");}catch{}
try{db.exec("ALTER TABLE contracts ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1");}catch{}
try{db.exec("ALTER TABLE products ADD COLUMN floor_price REAL");}catch{}
try{db.exec("ALTER TABLE contacts ADD COLUMN anniversary TEXT");}catch{}
try{db.exec("ALTER TABLE tasks ADD COLUMN automation_key TEXT");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_automation_key ON tasks(automation_key)");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN storage_path TEXT");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN size_bytes INTEGER");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN checksum TEXT");}catch{}
try{db.exec("ALTER TABLE documents ADD COLUMN original_name TEXT");}catch{}
try{db.exec("ALTER TABLE aftersales ADD COLUMN sla_due_at TEXT");}catch{}
try{db.exec("ALTER TABLE aftersales ADD COLUMN closed_at TEXT");}catch{}
try{db.exec("ALTER TABLE aftersales ADD COLUMN satisfaction_note TEXT");}catch{}
try{db.exec("ALTER TABLE campaigns ADD COLUMN subject TEXT");}catch{}
try{db.exec("ALTER TABLE campaigns ADD COLUMN template_id TEXT");}catch{}
try{db.exec("ALTER TABLE campaigns ADD COLUMN segment_id TEXT");}catch{}
try{db.exec("ALTER TABLE campaigns ADD COLUMN sent_at TEXT");}catch{}
try{db.exec("ALTER TABLE customers ADD COLUMN pool_status TEXT NOT NULL DEFAULT 'assigned'");}catch{}
try{db.exec("ALTER TABLE customers ADD COLUMN pool_entered_at TEXT");}catch{}
try{db.exec("ALTER TABLE customers ADD COLUMN pool_reason TEXT");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_customers_pool ON customers(pool_status,pool_entered_at)");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_customer_collaborators_user ON customer_collaborators(user_id,customer_id)");}catch{}
try{db.exec("ALTER TABLE customers ADD COLUMN parent_customer_id TEXT");}catch{}
try{db.exec("ALTER TABLE customers ADD COLUMN organization_role TEXT");}catch{}
try{db.exec("ALTER TABLE customers ADD COLUMN merged_into_id TEXT");}catch{}
try{db.exec("ALTER TABLE contacts ADD COLUMN departed_at TEXT");}catch{}
try{db.exec("ALTER TABLE contacts ADD COLUMN successor_contact_id TEXT");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_customers_parent ON customers(parent_customer_id)");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id,status)");}catch{}
try{db.exec("CREATE INDEX IF NOT EXISTS idx_marketing_consents_lookup ON marketing_consents(customer_id,contact_id,channel,updated_at)");}catch{}

const now = () => new Date().toISOString();
const parseJSON = (v, fallback = null) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
const verifyPassword = (password, stored) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h,'hex'); const b = scryptSync(password,salt,64); return a.length===b.length && timingSafeEqual(a,b); };
const hashToken = token => createHmac('sha256', APP_SECRET).update(token).digest('hex');

function passwordPolicyErrors(password,username=''){
  const p=String(password||''),errors=[];
  if(p.length<10)errors.push('至少 10 位');
  if(!/[a-z]/.test(p))errors.push('至少 1 个小写字母');
  if(!/[A-Z]/.test(p))errors.push('至少 1 个大写字母');
  if(!/\d/.test(p))errors.push('至少 1 个数字');
  if(!/[^A-Za-z0-9]/.test(p))errors.push('至少 1 个特殊字符');
  if(username&&username.length>=3&&p.toLowerCase().includes(String(username).toLowerCase()))errors.push('不能包含用户名');
  const weak=['admin@123456','changeme@123','password123!','qwerty123!','123456789a!'];
  if(weak.includes(p.toLowerCase()))errors.push('不能使用系统默认或常见弱密码');
  return errors;
}
function assertStrongPassword(password,username=''){
  const errors=passwordPolicyErrors(password,username);if(errors.length){const e=new Error('weak_password');e.details=errors;throw e;}
}
function securityKey(){return createHash('sha256').update(APP_SECRET).digest();}
function encryptSecret(value){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',securityKey(),iv),body=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return [iv,tag,body].map(x=>x.toString('base64url')).join('.');
}
function decryptSecret(value){
  const [ivB64,tagB64,bodyB64]=String(value||'').split('.');if(!ivB64||!tagB64||!bodyB64)return '';
  const decipher=createDecipheriv('aes-256-gcm',securityKey(),Buffer.from(ivB64,'base64url'));decipher.setAuthTag(Buffer.from(tagB64,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(bodyB64,'base64url')),decipher.final()]).toString('utf8');
}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf){
  let bits=0,value=0,out='';for(const byte of buf){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5;}}
  if(bits>0)out+=B32[(value<<(5-bits))&31];return out;
}
function base32Decode(text){
  let bits=0,value=0,out=[];for(const ch of String(text||'').toUpperCase().replace(/=|\s/g,'')){const idx=B32.indexOf(ch);if(idx<0)continue;value=(value<<5)|idx;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}
  return Buffer.from(out);
}
function totpAt(secret,counter){
  const key=base32Decode(secret),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
  const h=createHmac('sha1',key).update(buf).digest(),off=h[h.length-1]&15,num=(h.readUInt32BE(off)&0x7fffffff)%1_000_000;
  return String(num).padStart(6,'0');
}
function verifyTotp(secret,code,lastCounter=-1){
  const input=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(input))return null;
  const current=Math.floor(Date.now()/1000/30);
  for(let delta=-1;delta<=1;delta++){const counter=current+delta;if(counter<=Number(lastCounter??-1))continue;const expected=totpAt(secret,counter);if(timingSafeEqual(Buffer.from(expected),Buffer.from(input)))return counter;}
  return null;
}
function sessionUserPayload(u){
  return {id:u.id,username:u.username,display_name:u.display_name,role:u.role,department_id:u.department_id||null,data_scope:u.data_scope||defaultDataScope(u.role),must_change_password:!!u.must_change_password,two_factor_enabled:!!u.totp_enabled};
}
function issueSession(userId){
  const token=randomBytes(32).toString('base64url'),sid=randomUUID(),exp=new Date(Date.now()+12*3600_000).toISOString();
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run(sid,userId,hashToken(token),exp,now());
  return {token,expires_at:exp};
}
function failLogin(u){
  const count=Number(u.failed_login_count||0)+1,locked=count>=5?new Date(Date.now()+15*60_000).toISOString():null;
  db.prepare('UPDATE users SET failed_login_count=?,locked_until=? WHERE id=?').run(locked?0:count,locked,u.id);
  return {count,locked_until:locked};
}


function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (!count) {
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,role,must_change_password,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),'admin','系统管理员',hashPassword('Admin@123456'),'admin',1,now());
    const cid = randomUUID();
    db.prepare(`INSERT INTO customers(id,name,english_name,country,city,website,industry,customer_types,status,grade,source,timezone,language,owner_id,business_scope,service_regions,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(cid,'示例国际贸易有限公司','Demo Global Trading Ltd.','Germany','Hamburg','https://example.com','Industrial Equipment',JSON.stringify(['Importer','Distributor']),'following','A','Exhibition','Europe/Berlin','English',db.prepare('SELECT id FROM users LIMIT 1').get().id,'Industrial equipment distribution',JSON.stringify(['Germany','EU']),'系统初始化示例客户',now(),now());
    const contactId = randomUUID();
    db.prepare('INSERT INTO contacts(id,customer_id,name,title,department,role,language,timezone,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(contactId,cid,'Anna Schmidt','Purchasing Manager','Procurement','Decision Maker','English','Europe/Berlin',1,now(),now());
    const channels = [['email','anna@example.com'],['whatsapp','491701234567'],['linkedin','https://linkedin.com'],['website','https://example.com']];
    for (const [channel,value] of channels) db.prepare('INSERT INTO contact_channels(id,contact_id,channel,value,is_primary,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),contactId,channel,value,channel==='email'?1:0,now());
  }
}


function nextAnnualOccurrence(dateValue, fromDate=new Date()){
  if(!dateValue)return null;
  const m=String(dateValue).match(/(?:\d{4}-)?(\d{2})-(\d{2})/); if(!m)return null;
  const month=Number(m[1]),day=Number(m[2]); if(month<1||month>12||day<1||day>31)return null;
  let year=fromDate.getFullYear();
  let d=new Date(Date.UTC(year,month-1,day,9,0,0));
  const today=new Date(Date.UTC(fromDate.getFullYear(),fromDate.getMonth(),fromDate.getDate(),0,0,0));
  if(d<today)d=new Date(Date.UTC(year+1,month-1,day,9,0,0));
  return d;
}
function customerInsights(customerId){
  const c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(customerId); if(!c)return null;
  const primaryContact=db.prepare('SELECT * FROM contacts WHERE customer_id=? AND is_departed=0 ORDER BY is_primary DESC,created_at LIMIT 1').get(customerId);
  const channelCount=Number(db.prepare('SELECT COUNT(*) c FROM contact_channels cc JOIN contacts ct ON ct.id=cc.contact_id WHERE ct.customer_id=? AND ct.is_departed=0').get(customerId).c||0);
  const brandCount=Number(db.prepare('SELECT COUNT(*) c FROM customer_brands WHERE customer_id=?').get(customerId).c||0);
  const tagCount=Number(db.prepare('SELECT COUNT(*) c FROM customer_tags WHERE customer_id=?').get(customerId).c||0);
  const customFields=parseJSON(c.custom_fields,{})||{};
  const checks=[
    ['客户名称',c.name,8],['英文名称',c.english_name,4],['国家/地区',c.country,6],['城市',c.city,4],['官网',c.website,6],['行业',c.industry,5],
    ['客户类型',parseJSON(c.customer_types,[]).length,6],['状态',c.status,4],['等级',c.grade,5],['来源',c.source,5],['时区',c.timezone,4],['语言',c.language,4],
    ['税号/注册号',c.tax_no||c.registration_no,6],['主营业务',c.business_scope,6],['主要联系人',primaryContact?.id,10],['联系方式',channelCount,8],
    ['品牌关系',brandCount,6],['客户标签',tagCount,4],['自定义属性',Object.keys(customFields).length,4]
  ];
  const totalWeight=checks.reduce((a,x)=>a+Number(x[2]),0);
  const earned=checks.reduce((a,x)=>a+(x[1]?Number(x[2]):0),0);
  const completeness=Math.round(earned/totalWeight*100);
  const missing=checks.filter(x=>!x[1]).map(x=>String(x[0]));

  const orderRows=db.prepare("SELECT currency,COUNT(*) order_count,COALESCE(SUM(total),0) revenue,COALESCE(AVG(total),0) avg_order_value,MAX(created_at) last_order_at FROM orders WHERE customer_id=? AND status!='cancelled' GROUP BY currency ORDER BY revenue DESC").all(customerId);
  const orderCount=Number(db.prepare("SELECT COUNT(*) c FROM orders WHERE customer_id=? AND status!='cancelled'").get(customerId).c||0);
  const lastActivity=db.prepare('SELECT MAX(occurred_at) t FROM activities WHERE customer_id=?').get(customerId)?.t||null;
  const openOpp=db.prepare("SELECT COUNT(*) c,COALESCE(MAX(probability),0) max_probability FROM opportunities WHERE customer_id=? AND stage NOT IN ('won','lost')").get(customerId);
  const contactCount=Number(db.prepare('SELECT COUNT(*) c FROM contacts WHERE customer_id=? AND is_departed=0').get(customerId).c||0);

  let recencyPoints=0,daysSinceActivity=null;
  if(lastActivity){
    daysSinceActivity=Math.max(0,Math.floor((Date.now()-new Date(lastActivity).getTime())/86400000));
    recencyPoints=daysSinceActivity<=7?20:daysSinceActivity<=30?15:daysSinceActivity<=60?10:daysSinceActivity<=120?5:0;
  }
  const completenessPoints=completeness*0.25;
  const opportunityPoints=Math.min(15,Number(openOpp?.max_probability||0)*0.15);
  const orderPoints=orderCount>=2?15:orderCount===1?8:0;
  const gradePoints=({A:15,B:10,C:5,D:0}[String(c.grade||'').toUpperCase()]??0);
  const contactPoints=Math.min(10,contactCount*5);
  const potentialScore=Math.max(0,Math.min(100,Math.round(completenessPoints+recencyPoints+opportunityPoints+orderPoints+gradePoints+contactPoints)));

  return {
    completeness:{score:completeness,missing,completed:checks.length-missing.length,total:checks.length},
    value:{lifetime_value_by_currency:orderRows,order_count:orderCount,last_order_at:orderRows.map(x=>x.last_order_at).filter(Boolean).sort().reverse()[0]||null},
    engagement:{last_activity_at:lastActivity,days_since_activity:daysSinceActivity,active_contacts:contactCount,open_opportunities:Number(openOpp?.c||0),max_opportunity_probability:Number(openOpp?.max_probability||0)},
    potential:{score:potentialScore,method:'rule_based_v1',components:{completeness:Math.round(completenessPoints),recency:recencyPoints,opportunity:Math.round(opportunityPoints),orders:orderPoints,grade:gradePoints,contacts:contactPoints}}
  };
}

function chooseInquiryOwner(customerId,fallbackUserId){
  if(customerId){
    const owner=db.prepare("SELECT u.id FROM customers c JOIN users u ON u.id=c.owner_id WHERE c.id=? AND u.enabled=1").get(customerId);
    if(owner?.id)return owner.id;
  }
  const row=db.prepare(`SELECT u.id,COUNT(i.id) open_count
    FROM users u LEFT JOIN inquiries i ON i.owner_id=u.id AND i.status NOT IN ('converted','closed','lost')
    WHERE u.enabled=1 AND u.role IN ('sales','followup')
    GROUP BY u.id ORDER BY open_count ASC,u.display_name ASC LIMIT 1`).get();
  return row?.id||fallbackUserId;
}
function inquirySlaInfo(row,hours){
  const received=new Date(row.received_at||row.created_at).getTime();
  const responded=row.first_response_at?new Date(row.first_response_at).getTime():null;
  const deadline=received+Number(hours||4)*3600000;
  const end=responded||Date.now();
  const minutes=Math.max(0,Math.round((end-received)/60000));
  return {...row,response_minutes:responded?minutes:null,sla_deadline:new Date(deadline).toISOString(),sla_status:responded?(responded<=deadline?'within_sla':'breached'):(Date.now()>deadline?'overdue':'pending')};
}

function getQuotationApprovalPolicy(){
  const row=db.prepare("SELECT value FROM settings WHERE key='quotation_approval_policy'").get();
  return row?parseJSON(row.value,{}):{min_margin_rate:20,max_discount_percent:10,special_payment_keywords:['OA','D/P','D/A'],block_below_floor_price:true};
}
function evaluateQuotationApproval(quotationId){
  const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(quotationId); if(!q)return null;
  const items=db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(quotationId);
  const policy=getQuotationApprovalPolicy(),reasons=[],belowFloor=[];
  const discountPct=Number(q.subtotal||0)>0?Number(q.discount||0)/Number(q.subtotal||0)*100:0;
  if(q.margin_rate!=null && Number(q.margin_rate)<Number(policy.min_margin_rate??20)) reasons.push({code:'low_margin',label:`毛利率 ${Number(q.margin_rate).toFixed(2)}% 低于阈值 ${Number(policy.min_margin_rate??20)}%`});
  if(discountPct>Number(policy.max_discount_percent??10)) reasons.push({code:'high_discount',label:`折扣 ${discountPct.toFixed(2)}% 超过阈值 ${Number(policy.max_discount_percent??10)}%`});
  const terms=String(q.payment_terms||'').toUpperCase();
  const matched=(policy.special_payment_keywords||[]).filter(x=>terms.includes(String(x).toUpperCase()));
  if(matched.length)reasons.push({code:'special_payment_terms',label:`特殊付款条件：${matched.join(' / ')}`});
  for(const item of items){
    const product=db.prepare('SELECT id,sku,name,floor_price FROM products WHERE (sku=? AND ?<>"") OR name=? LIMIT 1').get(item.product_code||'',item.product_code||'',item.product_name);
    if(product?.floor_price!=null && Number(product.floor_price)>0 && Number(item.unit_price)<Number(product.floor_price)){
      belowFloor.push({item_id:item.id,product_id:product.id,product_name:item.product_name,unit_price:Number(item.unit_price),floor_price:Number(product.floor_price)});
    }
  }
  if(belowFloor.length)reasons.push({code:'below_floor_price',label:`${belowFloor.length} 个产品低于底价`});
  return {quotation:q,policy,reasons,below_floor_items:belowFloor,discount_percent:Number(discountPct.toFixed(2)),requires_approval:reasons.some(x=>x.code!=='below_floor_price')||belowFloor.length>0,blocked:!!policy.block_below_floor_price&&belowFloor.length>0};
}


function safeChannelKey(v=''){return String(v).trim().toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40);}
function channelConfigByKey(key){return db.prepare('SELECT * FROM channel_configs WHERE channel_key=? AND enabled=1').get(safeChannelKey(key));}
function buildChannelTarget(config,value){
  const v=String(value||'').trim(); if(!v||!config)return '';
  const mode=String(config.link_mode||'copy');
  if(mode==='copy')return '';
  if(mode==='email')return `mailto:${encodeURIComponent(v)}`;
  if(mode==='phone')return `tel:${v.replace(/[^+\d]/g,'')}`;
  if(mode==='direct_url')return /^https?:\/\//i.test(v)?v:`https://${v}`;
  if(mode==='template'){
    let target=String(config.url_template||'')
      .replaceAll('{value}',v)
      .replaceAll('{encoded}',encodeURIComponent(v))
      .replaceAll('{digits}',v.replace(/\D/g,''))
      .replaceAll('{phone}',v.replace(/[^+\d]/g,''))
      .replaceAll('{username}',v.replace(/^@/,''));
    const scheme=(target.match(/^([a-z][a-z0-9+.-]*):/i)||[])[1]?.toLowerCase();
    if(!scheme||['javascript','data','file','vbscript','about'].includes(scheme))return '';
    return target;
  }
  return '';
}


function currencyCode(v=''){return String(v).trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,8);}
function latestFxDirect(from,to,date){
  return db.prepare(`SELECT * FROM exchange_rates WHERE base_currency=? AND quote_currency=? AND rate_date<=? ORDER BY rate_date DESC,updated_at DESC LIMIT 1`).get(from,to,date);
}
function resolveFxRate(fromCurrency,toCurrency,date=now().slice(0,10)){
  const from=currencyCode(fromCurrency),to=currencyCode(toCurrency);if(!from||!to)return null;
  if(from===to)return {from,to,rate:1,rate_date:date,source:'identity',path:[from]};
  const direct=latestFxDirect(from,to,date);if(direct)return {from,to,rate:Number(direct.rate),rate_date:direct.rate_date,source:direct.source,path:[from,to],rate_ids:[direct.id]};
  const inverse=latestFxDirect(to,from,date);if(inverse&&Number(inverse.rate)>0)return {from,to,rate:1/Number(inverse.rate),rate_date:inverse.rate_date,source:`inverse:${inverse.source}`,path:[from,to],rate_ids:[inverse.id]};
  const pivot='USD';
  if(from!==pivot&&to!==pivot){
    const a=resolveFxRate(from,pivot,date),b=resolveFxRate(pivot,to,date);
    if(a&&b)return {from,to,rate:a.rate*b.rate,rate_date:[a.rate_date,b.rate_date].sort()[0],source:'cross:USD',path:[from,pivot,to],rate_ids:[...(a.rate_ids||[]),...(b.rate_ids||[])]};
  }
  return null;
}

seed();

const channelDefaults=[
  ['email','Email','email',null,'name@example.com',1,10],
  ['phone','Phone','phone',null,'+1 555 123 4567',1,20],
  ['whatsapp','WhatsApp','template','https://wa.me/{digits}','Country code + phone number',1,30],
  ['wechat','WeChat','copy',null,'WeChat ID',1,40],
  ['line','LINE','copy',null,'LINE ID or profile URL',1,50],
  ['vk','VK','direct_url',null,'Profile URL',1,60],
  ['telegram','Telegram','template','https://t.me/{username}','@username',1,70],
  ['viber','Viber','copy',null,'Viber number/ID',1,80],
  ['kakaotalk','KakaoTalk','copy',null,'KakaoTalk ID',1,90],
  ['zalo','Zalo','copy',null,'Zalo number/ID',1,100],
  ['linkedin','LinkedIn','direct_url',null,'Profile URL',1,110],
  ['facebook','Facebook','direct_url',null,'Profile URL',1,120],
  ['messenger','Messenger','direct_url',null,'Messenger URL',1,130],
  ['instagram','Instagram','direct_url',null,'Profile URL',1,140],
  ['x','X / Twitter','direct_url',null,'Profile URL',1,150],
  ['skype','Skype','template','skype:{value}?chat','Skype ID',1,160],
  ['teams','Microsoft Teams','direct_url',null,'Teams meeting/chat URL',1,170],
  ['zoom','Zoom','direct_url',null,'Zoom URL',1,180],
  ['website','Website','direct_url',null,'https://example.com',1,190],
  ['store','E-commerce Store','direct_url',null,'Store URL',1,200]
];
for(const [key,name,mode,tpl,hint,copyFallback,sortOrder] of channelDefaults){
  const id=randomUUID();
  db.prepare('INSERT OR IGNORE INTO channel_configs(id,channel_key,name,link_mode,url_template,value_hint,copy_fallback,enabled,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,key,name,mode,tpl,hint,copyFallback,1,sortOrder,now(),now());
}

const automationDefaults=[
  ['overdue_payment','逾期回款提醒',1,{priority:'urgent'}],
  ['quotation_expiry','报价到期提醒',1,{days:3,priority:'high'}],
  ['brand_expiry','品牌授权到期提醒',1,{days:30,priority:'high'}],
  ['dormant_customer','沉默客户识别',1,{days:60,priority:'normal'}],
  ['contact_anniversary','联系人生日/纪念日提醒',1,{days:7,priority:'normal'}],
  ['inquiry_response_sla','询盘首次响应 SLA',1,{hours:4,priority:'high'}]
];
for(const [key,name,enabled,config] of automationDefaults){
  db.prepare('INSERT OR IGNORE INTO automation_rules(key,name,enabled,config,updated_at) VALUES(?,?,?,?,?)').run(key,name,enabled,JSON.stringify(config),now());
}
db.prepare("INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES('public_pool_rule',?,?)")
  .run(JSON.stringify({enabled:true,inactive_days:90,protect_grades:['A'],eligible_statuses:['potential','contacted','following','dormant']}),now());

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

  const ir=getRule('inquiry_response_sla');
  if(ir?.enabled){
    const hours=Number(ir.config.hours||4),cutoff=new Date(Date.now()-hours*3600000).toISOString();
    const rows=db.prepare(`SELECT i.*,c.name customer_name,c.owner_id customer_owner FROM inquiries i JOIN customers c ON c.id=i.customer_id
      WHERE i.first_response_at IS NULL AND i.status NOT IN ('converted','closed','lost') AND i.received_at < ?`).all(cutoff);
    for(const x of rows){
      const key=`inquiry-sla:${x.id}`,assignee=x.owner_id||x.customer_owner;
      if(autoTask(key,x.customer_id,`询盘响应超时：${x.inquiry_no}`,`${x.customer_name} 的询盘已超过 ${hours} 小时未记录首次响应，请立即跟进。`,now(),ir.config.priority||'high',assignee)){result.created++;automationLog('inquiry_response_sla','生成询盘响应超时任务','inquiry',x.id);}
    }
  }

  const ar=getRule('contact_anniversary');
  if(ar?.enabled){
    const days=Number(ar.config.days||7),today=new Date(),limitMs=days*86400000;
    const rows=db.prepare(`SELECT ct.*,c.name customer_name,c.owner_id FROM contacts ct JOIN customers c ON c.id=ct.customer_id WHERE ct.is_departed=0 AND c.deleted_at IS NULL AND (ct.birthday IS NOT NULL OR ct.anniversary IS NOT NULL)`).all();
    for(const x of rows){
      for(const kind of ['birthday','anniversary']){
        const value=x[kind]; if(!value)continue;
        const occurrence=nextAnnualOccurrence(value,today); if(!occurrence)continue;
        const diff=occurrence.getTime()-Date.now(); if(diff<0||diff>limitMs)continue;
        const label=kind==='birthday'?'生日':'纪念日',year=occurrence.getUTCFullYear(),key=`contact-${kind}:${x.id}:${year}`;
        const due=occurrence.toISOString();
        if(autoTask(key,x.customer_id,`${x.name} ${label}提醒`,`${x.customer_name} 的联系人 ${x.name} 将在 ${due.slice(0,10)} 迎来${label}，请提前准备问候或客户维护动作。`,due,ar.config.priority||'normal',x.owner_id)){result.created++;automationLog('contact_anniversary',`生成联系人${label}任务`,'contact',x.id);}
      }
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
  products:{table:'products', json:['certifications','declaration_elements'], required:['name']},
  customerProductPreferences:{table:'customer_product_preferences', required:['customer_id','product_id','preference_type']},
  priceLists:{table:'price_lists', required:['name']},
  priceListItems:{table:'price_list_items', required:['price_list_id','product_id','min_qty','unit_price']},
  productMarketRules:{table:'product_market_rules', json:['required_certifications'], required:['product_id','rule_type']},
  contracts:{table:'contracts', json:['attachments'], required:['customer_id']},
  orders:{table:'orders', required:['customer_id']},
  orderItems:{table:'order_items', required:['order_id','product_name','quantity','unit_price','amount']},
  payments:{table:'payments', required:['customer_id','amount']},
  creditProfiles:{table:'credit_profiles', required:['customer_id']},
  shipments:{table:'shipments', required:['order_id']},
  documents:{table:'documents', required:['entity_type','entity_id','name']},
  aftersales:{table:'aftersales', required:['customer_id','category','subject','description']},
  campaigns:{table:'campaigns', json:['segment_rule'], required:['name','type']},
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
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':CORS_ORIGIN,'access-control-allow-headers':'content-type, authorization','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS',...extraHeaders});
  res.end(JSON.stringify(data));
}
function body(req) { return new Promise((resolve,reject)=>{ let raw=''; req.on('data',c=>{ raw+=c; if(raw.length>25_000_000){reject(new Error('payload too large'));req.destroy();}}); req.on('end',()=>{ if(!raw)return resolve({}); try{resolve(JSON.parse(raw));}catch{reject(new Error('invalid json'));}}); req.on('error',reject);}); }
function columns(table) { return db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name); }
const colCache = new Map();
function tableCols(table){ if(!colCache.has(table)) colCache.set(table,columns(table)); return colCache.get(table); }
function decodeRow(row, cfg){ if(!row) return row; const r={...row}; for(const k of (cfg.json||[])) r[k]=parseJSON(r[k], Array.isArray(r[k])?[]: (k==='custom_fields'?{}:[])); if(cfg.table==='users'){delete r.password_hash;delete r.totp_secret_enc;delete r.totp_last_counter;} return r; }

function marketingSegmentCustomers(rules={},user=null,limit=1000){
  const filters=['c.deleted_at IS NULL',"c.status!='blacklist'"],args=[];
  const exacts=['country','status','grade','source','industry','owner_id'];
  for(const k of exacts){if(rules[k]){filters.push(`c.${k}=?`);args.push(rules[k]);}}
  if(rules.customer_type){filters.push('c.customer_types LIKE ?');args.push(`%"${rules.customer_type}"%`);}
  if(rules.tag_id){filters.push('EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=c.id AND ct.tag_id=?)');args.push(rules.tag_id);}
  if(user&&scopedRole(user)){const access=customerScopeClause(user,'c');if(access.sql){filters.push(access.sql.replace(/^\s*AND\s*/,'').trim());args.push(...access.args);}}
  const customers=db.prepare(`SELECT c.* FROM customers c WHERE ${filters.join(' AND ')} ORDER BY c.updated_at DESC LIMIT ?`).all(...args,Math.min(5000,Math.max(1,Number(limit||1000))));
  return customers.map(c=>{
    const contact=db.prepare("SELECT * FROM contacts WHERE customer_id=? AND is_departed=0 ORDER BY is_primary DESC,created_at LIMIT 1").get(c.id)||null;
    const email=contact?db.prepare("SELECT value FROM contact_channels WHERE contact_id=? AND channel='email' ORDER BY is_primary DESC,created_at LIMIT 1").get(contact.id)?.value||null:null;
    return {...c,contact_id:contact?.id||null,contact_name:contact?.name||null,email};
  });
}
function marketingConsent(customerId,contactId,channel='email'){
  const r=db.prepare(`SELECT status FROM marketing_consents WHERE customer_id=? AND channel=? AND (contact_id=? OR contact_id IS NULL) ORDER BY CASE WHEN contact_id=? THEN 0 ELSE 1 END,updated_at DESC LIMIT 1`).get(customerId,channel,contactId||'',contactId||'');
  return r?.status||'unknown';
}
function renderMarketingText(text='',ctx={}){
  const vars={customer_name:ctx.customer_name||'',contact_name:ctx.contact_name||'',country:ctx.country||'',company_name:companyProfile().name||'',email:ctx.email||''};
  return String(text).replace(/{{\s*([a-z_]+)\s*}}/gi,(_,k)=>vars[String(k).toLowerCase()]??'');
}
async function emitIntegrationEvent(event,payload){
  const rows=db.prepare("SELECT * FROM integrations WHERE enabled=1 AND type='webhook'").all();
  for(const row of rows){
    const cfg=parseJSON(row.config,{})||{},events=Array.isArray(cfg.events)?cfg.events:['*'];
    if(!events.includes('*')&&!events.includes(event))continue;
    const secret=row.secret_env?process.env[row.secret_env]||'':'';
    const bodyText=JSON.stringify({event,time:now(),data:payload});
    const headers={'content-type':'application/json','user-agent':'TradeFlow-CRM/1.0'};
    if(secret)headers['x-tradeflow-signature']=createHmac('sha256',secret).update(bodyText).digest('hex');
    let status='failed',statusCode=null,excerpt='';
    try{
      const target=row.base_url||cfg.url;if(!target)throw new Error('missing webhook url');
      const res=await fetch(target,{method:'POST',headers,body:bodyText,signal:AbortSignal.timeout(7000)});
      statusCode=res.status;excerpt=(await res.text()).slice(0,500);status=res.ok?'success':'failed';
    }catch(e){excerpt=String(e?.message||e).slice(0,500);}
    try{db.prepare('INSERT INTO integration_deliveries(id,integration_id,event,status,status_code,response_excerpt,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),row.id,event,status,statusCode,excerpt,now());}catch{}
  }
}

function auth(req){
  const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;const token=h.slice(7),hashed=hashToken(token);
  const session=db.prepare(`SELECT s.*,u.username,u.display_name,u.role,u.enabled,u.department_id,u.data_scope,u.must_change_password,u.totp_enabled,u.password_changed_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).get(hashed,now());
  if(session&&session.enabled)return session;
  const api=db.prepare("SELECT * FROM api_tokens WHERE token_hash=? AND enabled=1 AND (expires_at IS NULL OR expires_at>?)").get(hashed,now());
  if(api){db.prepare('UPDATE api_tokens SET last_used_at=? WHERE id=?').run(now(),api.id);return {user_id:null,username:`api:${api.name}`,display_name:api.name,role:api.role,enabled:1,department_id:null,data_scope:['admin','manager','finance','readonly'].includes(api.role)?'all':'self',api_token_id:api.id};}
  return null;
}
function audit(user, action, entityType, entityId, req, detail={}){
  db.prepare('INSERT INTO audit_logs(id,user_id,action,entity_type,entity_id,ip,request_id,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(),user?.user_id||null,action,entityType||null,entityId||null,req.socket.remoteAddress||'',req.requestId||'',JSON.stringify(detail),now());
  const event=`${entityType||'system'}.${action}`;queueMicrotask(()=>emitIntegrationEvent(event,{entity_type:entityType,entity_id:entityId,detail,request_id:req.requestId||null}).catch(()=>{}));
}
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
  sales:new Set(['customers','contacts','channels','customerBrands','activities','tasks','inquiries','opportunities','quotations','quotationItems','samples','contracts','orders','orderItems','shipments','documents','aftersales','customerProductPreferences']),
  followup:new Set(['customers','contacts','channels','activities','tasks','inquiries','samples','aftersales']),
  finance:new Set(['payments','creditProfiles']),
  readonly:new Set()
};
function canWriteResource(role,key){
  const p=writePolicy[role]??new Set(); return p==='*'||p.has(key);
}
function defaultDataScope(role){
  return ['admin','manager','finance','readonly'].includes(role)?'all':'self';
}
function userDataScope(user){
  const value=String(user?.data_scope||'').toLowerCase();
  return ['self','department','all'].includes(value)?value:defaultDataScope(user?.role);
}
function scopedRole(user){return userDataScope(user)!=='all';}
function customerIsOwner(user,customerId){
  if(!customerId)return false;
  return !!db.prepare('SELECT 1 ok FROM customers WHERE id=? AND owner_id=? AND deleted_at IS NULL').get(customerId,user.user_id);
}
function customerOwnedBy(user,customerId){
  if(!customerId)return true;
  const scope=userDataScope(user);if(scope==='all')return true;
  if(scope==='department'&&user.department_id){
    return !!db.prepare(`SELECT 1 ok FROM customers c LEFT JOIN users ou ON ou.id=c.owner_id
      WHERE c.id=? AND c.deleted_at IS NULL AND (c.owner_id=? OR ou.department_id=? OR EXISTS(SELECT 1 FROM customer_collaborators cc WHERE cc.customer_id=c.id AND cc.user_id=?))`)
      .get(customerId,user.user_id,user.department_id,user.user_id);
  }
  return !!db.prepare(`SELECT 1 ok FROM customers c WHERE c.id=? AND c.deleted_at IS NULL
    AND (c.owner_id=? OR EXISTS(SELECT 1 FROM customer_collaborators cc WHERE cc.customer_id=c.id AND cc.user_id=?))`).get(customerId,user.user_id,user.user_id);
}
function customerScopeClause(user,alias='c'){
  const scope=userDataScope(user);if(scope==='all')return {sql:'',args:[]};
  if(scope==='department'&&user.department_id){
    return {sql:` AND (${alias}.owner_id=? OR EXISTS(SELECT 1 FROM users du WHERE du.id=${alias}.owner_id AND du.department_id=?) OR EXISTS(SELECT 1 FROM customer_collaborators cc WHERE cc.customer_id=${alias}.id AND cc.user_id=?))`,args:[user.user_id,user.department_id,user.user_id]};
  }
  return {sql:` AND (${alias}.owner_id=? OR EXISTS(SELECT 1 FROM customer_collaborators cc WHERE cc.customer_id=${alias}.id AND cc.user_id=?))`,args:[user.user_id,user.user_id]};
}
function getPublicPoolRule(){
  const row=db.prepare("SELECT value FROM settings WHERE key='public_pool_rule'").get();
  return parseJSON(row?.value,{enabled:true,inactive_days:90,protect_grades:['A'],eligible_statuses:['potential','contacted','following','dormant']});
}
function hasActiveCustomerBusiness(customerId){
  const opp=db.prepare("SELECT COUNT(*) c FROM opportunities WHERE customer_id=? AND stage NOT IN ('won','lost')").get(customerId).c;
  const ord=db.prepare("SELECT COUNT(*) c FROM orders WHERE customer_id=? AND status NOT IN ('completed','cancelled')").get(customerId).c;
  return Number(opp)>0||Number(ord)>0;
}
function moveCustomerToPool(customerId,reason,operatorId=null){
  const c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(customerId);if(!c)return null;
  db.prepare("UPDATE customers SET owner_id=NULL,pool_status='public',pool_entered_at=?,pool_reason=?,updated_at=? WHERE id=?").run(now(),reason||'manual',now(),customerId);
  db.prepare('DELETE FROM customer_collaborators WHERE customer_id=?').run(customerId);
  db.prepare('INSERT INTO public_pool_events(id,customer_id,action,from_owner_id,to_owner_id,reason,operated_by,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(randomUUID(),customerId,'release',c.owner_id||null,null,reason||'manual',operatorId||null,now());
  return db.prepare('SELECT * FROM customers WHERE id=?').get(customerId);
}

function mergeCustomers(sourceId,targetId,operatorId){
  if(!sourceId||!targetId||sourceId===targetId)throw new Error('invalid_merge');
  const source=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(sourceId);
  const target=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(targetId);
  if(!source||!target)throw new Error('customer_not_found');
  db.exec('BEGIN IMMEDIATE');
  try{
    const directTables=['contacts','activities','tasks','inquiries','opportunities','quotations','samples','contracts','orders','payments','aftersales','customer_product_preferences'];
    for(const table of directTables){
      if(table==='customer_product_preferences')continue;
      if(tableCols(table).includes('customer_id'))db.prepare(`UPDATE ${table} SET customer_id=? WHERE customer_id=?`).run(targetId,sourceId);
    }

    db.prepare(`INSERT OR IGNORE INTO customer_tags(customer_id,tag_id)
      SELECT ?,tag_id FROM customer_tags WHERE customer_id=?`).run(targetId,sourceId);
    db.prepare('DELETE FROM customer_tags WHERE customer_id=?').run(sourceId);

    db.prepare(`INSERT OR IGNORE INTO customer_collaborators(customer_id,user_id,added_by,created_at)
      SELECT ?,user_id,added_by,created_at FROM customer_collaborators WHERE customer_id=?`).run(targetId,sourceId);
    db.prepare('DELETE FROM customer_collaborators WHERE customer_id=?').run(sourceId);

    db.prepare(`INSERT OR IGNORE INTO customer_brands(id,customer_id,brand_id,relation_type,authorized_regions,exclusive,start_date,end_date,sales_share,price_band,notes,created_at)
      SELECT id,?,brand_id,relation_type,authorized_regions,exclusive,start_date,end_date,sales_share,price_band,notes,created_at FROM customer_brands WHERE customer_id=?`).run(targetId,sourceId);
    db.prepare('DELETE FROM customer_brands WHERE customer_id=?').run(sourceId);

    db.prepare(`INSERT OR IGNORE INTO customer_product_preferences(id,customer_id,product_id,preference_type,interest_level,notes,created_at,updated_at)
      SELECT id,?,product_id,preference_type,interest_level,notes,created_at,updated_at FROM customer_product_preferences WHERE customer_id=?`).run(targetId,sourceId);
    db.prepare('DELETE FROM customer_product_preferences WHERE customer_id=?').run(sourceId);

    const sourceCredit=db.prepare('SELECT * FROM credit_profiles WHERE customer_id=?').get(sourceId);
    const targetCredit=db.prepare('SELECT * FROM credit_profiles WHERE customer_id=?').get(targetId);
    if(sourceCredit&&!targetCredit)db.prepare('UPDATE credit_profiles SET customer_id=? WHERE customer_id=?').run(targetId,sourceId);
    else if(sourceCredit)db.prepare('DELETE FROM credit_profiles WHERE customer_id=?').run(sourceId);

    db.prepare("UPDATE documents SET entity_id=? WHERE entity_type='customer' AND entity_id=?").run(targetId,sourceId);
    db.prepare('UPDATE marketing_consents SET customer_id=? WHERE customer_id=?').run(targetId,sourceId);
    try{db.prepare('UPDATE OR IGNORE campaign_recipients SET customer_id=? WHERE customer_id=?').run(targetId,sourceId);}catch{}
    db.prepare('DELETE FROM campaign_recipients WHERE customer_id=?').run(sourceId);
    db.prepare('UPDATE public_pool_events SET customer_id=? WHERE customer_id=?').run(targetId,sourceId);
    db.prepare('UPDATE customers SET parent_customer_id=? WHERE parent_customer_id=?').run(targetId,sourceId);

    const sourceTypes=parseJSON(source.customer_types,[])||[],targetTypes=parseJSON(target.customer_types,[])||[];
    const mergedTypes=[...new Set([...targetTypes,...sourceTypes])];
    const sourceRegions=parseJSON(source.service_regions,[])||[],targetRegions=parseJSON(target.service_regions,[])||[];
    const mergedRegions=[...new Set([...targetRegions,...sourceRegions])];
    const sourceCustom=parseJSON(source.custom_fields,{})||{},targetCustom=parseJSON(target.custom_fields,{})||{};
    db.prepare(`UPDATE customers SET customer_types=?,service_regions=?,custom_fields=?,notes=?,updated_at=? WHERE id=?`)
      .run(JSON.stringify(mergedTypes),JSON.stringify(mergedRegions),JSON.stringify({...sourceCustom,...targetCustom}),
        [target.notes,source.notes?`[Merged from ${source.name}] ${source.notes}`:null].filter(Boolean).join('\n'),now(),targetId);

    db.prepare(`UPDATE customers SET deleted_at=?,merged_into_id=?,owner_id=NULL,pool_status='merged',updated_at=? WHERE id=?`).run(now(),targetId,now(),sourceId);
    db.exec('COMMIT');
    return {source_id:sourceId,target_id:targetId};
  }catch(e){db.exec('ROLLBACK');throw e;}
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

function customFieldDefs(entityType='customer'){
  return db.prepare('SELECT * FROM custom_field_defs WHERE entity_type=? AND enabled=1 ORDER BY sort_order,id').all(entityType)
    .map(r=>({...r,options:parseJSON(r.options,[]),visible_roles:parseJSON(r.visible_roles,[])}));
}
function customFieldVisible(def,role){
  const roles=Array.isArray(def.visible_roles)?def.visible_roles:[];
  return roles.length===0||roles.includes(role)||role==='admin';
}
function customValueKey(v){
  if(v===null||v===undefined||v==='')return '';
  return typeof v==='object'?JSON.stringify(v):String(v).trim().toLowerCase();
}
function validateCustomFieldValue(def,value){
  if(value===null||value===undefined||value==='')return null;
  switch(def.data_type){
    case 'number':case 'amount': if(!Number.isFinite(Number(value)))return '必须是数字';break;
    case 'date': if(Number.isNaN(Date.parse(String(value))))return '必须是有效日期';break;
    case 'email': if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))return '邮箱格式无效';break;
    case 'url': try{new URL(/^https?:\/\//i.test(String(value))?String(value):`https://${value}`);}catch{return '网址格式无效';}break;
    case 'boolean': if(![true,false,0,1,'0','1'].includes(value))return '必须是是/否值';break;
    case 'select': if(Array.isArray(def.options)&&def.options.length&&!def.options.includes(value))return '不在允许选项中';break;
    case 'multi_select':
      if(!Array.isArray(value))return '必须是多选数组';
      if(Array.isArray(def.options)&&def.options.length&&value.some(x=>!def.options.includes(x)))return '包含不允许的选项';
      break;
  }
  return null;
}
function applyCustomerCustomFieldRules(incoming,role,customerId=null,existing={}){
  const defs=customFieldDefs('customer'),visibleDefs=defs.filter(d=>customFieldVisible(d,role)),visibleKeys=new Set(visibleDefs.map(d=>d.field_key));
  const merged={...(existing||{})};
  for(const [k,v] of Object.entries(incoming||{}))if(visibleKeys.has(k))merged[k]=v;
  const errors=[];
  for(const def of visibleDefs){
    const value=merged[def.field_key];
    if(def.required&&(value===null||value===undefined||value===''||(Array.isArray(value)&&!value.length)))errors.push({field:def.field_key,label:def.label,error:'必填'});
    const typeError=validateCustomFieldValue(def,value);if(typeError)errors.push({field:def.field_key,label:def.label,error:typeError});
    if(def.unique_value&&customValueKey(value)){
      const rows=db.prepare('SELECT id,custom_fields FROM customers WHERE deleted_at IS NULL AND id!=?').all(customerId||'');
      const wanted=customValueKey(value);
      if(rows.some(r=>customValueKey(parseJSON(r.custom_fields,{})?.[def.field_key])===wanted))errors.push({field:def.field_key,label:def.label,error:'值必须唯一'});
    }
  }
  if(errors.length){const e=new Error('custom_field_validation_failed');e.details=errors;throw e;}
  return merged;
}

function protectRow(key,row,user){
  if(!row)return row; const r={...row};
  if(!['admin','manager'].includes(user.role)){
    if(key==='quotations')delete r.margin_rate;
    if(key==='quotationItems')delete r.cost;
  }
  if(key==='customers'&&r.custom_fields&&typeof r.custom_fields==='object'){
    const allowed=new Set(customFieldDefs('customer').filter(d=>customFieldVisible(d,user.role)).map(d=>d.field_key));
    r.custom_fields=Object.fromEntries(Object.entries(r.custom_fields).filter(([k])=>allowed.has(k)));
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



function renderCustomsDataSheet(declaration,order,customer,items,shipment){
  const cp=companyProfile(),itemRows=items.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.hs_code||'')}</td><td>${esc(x.customs_name||x.product_name)}</td><td>${esc(x.product_name)}</td><td>${esc(x.quantity)}</td><td>${esc(x.unit||'')}</td><td>${esc(Number(x.unit_price||0).toFixed(2))}</td><td>${esc(Number(x.total_value||0).toFixed(2))}</td><td>${esc(x.origin_country||'')}</td><td>${esc([x.brand,x.model,x.material,x.usage].filter(Boolean).join(' / '))}</td></tr>`).join('');
  const ship=shipment?`<div class="box"><b>Shipment</b><br>Booking: ${esc(shipment.booking_no||'')} &nbsp; Carrier: ${esc(shipment.carrier||'')} &nbsp; Vessel/Voyage: ${esc(shipment.vessel_voyage||'')}<br>POL: ${esc(shipment.port_of_loading||'')} &nbsp; POD: ${esc(shipment.destination_port||'')} &nbsp; ETD: ${esc(shipment.etd||'')} &nbsp; ETA: ${esc(shipment.eta||'')}<br>BL No.: ${esc(shipment.bl_no||'')}</div>`:'';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Customs Declaration Data Sheet</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:34px}h1{text-align:center}.draft{border:2px solid #b42318;padding:10px;text-align:center;font-weight:bold;margin:12px 0}.box{border:1px solid #ccd4df;padding:12px;line-height:1.7;margin:12px 0}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccd4df;padding:7px}th{background:#f1f4f8}.foot{margin-top:22px;font-size:12px;color:#667085}</style></head><body>
  <h1>CUSTOMS DECLARATION DATA SHEET</h1><div class="draft">INTERNAL DATA SHEET — NOT AN OFFICIAL CUSTOMS DECLARATION OR CLEARANCE CERTIFICATE</div>
  <div class="box"><b>Exporter:</b> ${esc(cp.name)}<br><b>Buyer:</b> ${esc(customer.name)} · ${esc(customer.country||'')}<br><b>Order:</b> ${esc(order.order_no)} &nbsp; <b>Internal Declaration No.:</b> ${esc(declaration.declaration_no)}<br><b>Export Country:</b> ${esc(declaration.export_country||'')} &nbsp; <b>Destination:</b> ${esc(declaration.destination_country||customer.country||'')} &nbsp; <b>Trade Mode:</b> ${esc(declaration.trade_mode||'')}<br><b>Customs Office:</b> ${esc(declaration.customs_office||'')} &nbsp; <b>Incoterm:</b> ${esc(declaration.incoterm||order.incoterm||'')} &nbsp; <b>Currency:</b> ${esc(declaration.currency||order.currency||'USD')}</div>
  ${ship}
  <table><thead><tr><th>#</th><th>HS Code</th><th>Customs Name</th><th>Product</th><th>Qty</th><th>Unit</th><th>Unit Price</th><th>Total</th><th>Origin</th><th>Declaration Elements</th></tr></thead><tbody>${itemRows}</tbody></table>
  <div class="foot">Total declared value: <b>${esc(declaration.currency||order.currency||'USD')} ${Number(declaration.total_value||0).toFixed(2)}</b><br>This document is generated from TradeFlow CRM for internal preparation/review. Official submission, customs acceptance and clearance must be performed/confirmed through the competent customs authority or authorized service provider.</div>
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
    if(entityType==='customs') return db.prepare('SELECT o.customer_id FROM customs_declarations cd JOIN orders o ON o.id=cd.order_id WHERE cd.id=?').get(entityId)?.customer_id||null;
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
      const b=await body(req),username=String(b.username||'').trim(),u=db.prepare('SELECT * FROM users WHERE username=? AND enabled=1').get(username);
      if(!u)return json(res,401,{error:'invalid_credentials',message:'用户名或密码错误'});
      if(u.locked_until&&u.locked_until>now())return json(res,423,{error:'account_locked',message:'账号因连续登录失败已临时锁定',locked_until:u.locked_until});
      if(!verifyPassword(b.password||'',u.password_hash)){
        const failed=failLogin(u);audit({user_id:u.id},'login_failed','user',u.id,req,{locked_until:failed.locked_until});
        if(failed.locked_until)return json(res,423,{error:'account_locked',message:'连续失败次数过多，账号已锁定 15 分钟',locked_until:failed.locked_until});
        return json(res,401,{error:'invalid_credentials',message:`用户名或密码错误，还可尝试 ${Math.max(0,5-failed.count)} 次`});
      }
      db.prepare('UPDATE users SET failed_login_count=0,locked_until=NULL WHERE id=?').run(u.id);
      if(u.totp_enabled){
        db.prepare('DELETE FROM auth_challenges WHERE user_id=? OR expires_at<?').run(u.id,now());
        const challenge=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+5*60_000).toISOString();
        db.prepare('INSERT INTO auth_challenges(id,user_id,challenge_hash,expires_at,attempts,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),u.id,hashToken(challenge),expiresAt,0,now());
        audit({user_id:u.id},'login_password_ok','user',u.id,req,{two_factor_required:true});
        return json(res,200,{two_factor_required:true,challenge_token:challenge,expires_at:expiresAt,user:{username:u.username,display_name:u.display_name}});
      }
      const session=issueSession(u.id);audit({user_id:u.id},'login','user',u.id,req);
      return json(res,200,{...session,user:sessionUserPayload(u)});
    }
    if(p==='/api/auth/2fa/verify' && req.method==='POST'){
      const b=await body(req),challenge=String(b.challenge_token||''),row=db.prepare('SELECT * FROM auth_challenges WHERE challenge_hash=? AND expires_at>?').get(hashToken(challenge),now());
      if(!row)return json(res,401,{error:'invalid_challenge',message:'二次验证已过期，请重新登录'});
      const u=db.prepare('SELECT * FROM users WHERE id=? AND enabled=1').get(row.user_id);if(!u||!u.totp_enabled)return json(res,401,{error:'invalid_challenge'});
      const counter=verifyTotp(decryptSecret(u.totp_secret_enc),b.code,u.totp_last_counter);
      if(counter===null){
        const attempts=Number(row.attempts||0)+1;db.prepare('UPDATE auth_challenges SET attempts=? WHERE id=?').run(attempts,row.id);
        if(attempts>=5)db.prepare('DELETE FROM auth_challenges WHERE id=?').run(row.id);
        audit({user_id:u.id},'two_factor_failed','user',u.id,req,{attempts});
        return json(res,401,{error:'invalid_two_factor_code',message:attempts>=5?'验证失败次数过多，请重新登录':'动态验证码错误'});
      }
      db.prepare('DELETE FROM auth_challenges WHERE id=?').run(row.id);db.prepare('UPDATE users SET totp_last_counter=? WHERE id=?').run(counter,u.id);
      const session=issueSession(u.id);audit({user_id:u.id},'login','user',u.id,req,{two_factor:true});
      return json(res,200,{...session,user:sessionUserPayload(u)});
    }
    const user=auth(req); if(!user) return json(res,401,{error:'unauthorized'});
    if(user.must_change_password && !['/api/auth/me','/api/auth/logout','/api/auth/security-status','/api/auth/change-password'].includes(p)){
      return json(res,428,{error:'password_change_required',message:'必须先修改初始或重置密码'});
    }
    if(p==='/api/auth/me') return json(res,200,{id:user.user_id,username:user.username,display_name:user.display_name,role:user.role,department_id:user.department_id||null,data_scope:userDataScope(user),must_change_password:!!user.must_change_password,two_factor_enabled:!!user.totp_enabled,password_changed_at:user.password_changed_at||null});
    if(p==='/api/auth/security-status' && req.method==='GET'){
      if(!user.user_id)return json(res,403,{error:'human_account_required'});
      const u=db.prepare('SELECT username,must_change_password,password_changed_at,totp_enabled,locked_until,failed_login_count FROM users WHERE id=?').get(user.user_id);
      return json(res,200,{...u,two_factor_enabled:!!u.totp_enabled,password_policy:{min_length:10,upper:true,lower:true,digit:true,special:true}});
    }
    if(p==='/api/auth/change-password' && req.method==='POST'){
      if(!user.user_id)return json(res,403,{error:'human_account_required'});
      const b=await body(req),u=db.prepare('SELECT * FROM users WHERE id=?').get(user.user_id);
      if(!verifyPassword(String(b.current_password||''),u.password_hash))return json(res,400,{error:'current_password_invalid',message:'当前密码错误'});
      if(String(b.current_password||'')===String(b.new_password||''))return json(res,400,{error:'password_unchanged',message:'新密码不能与当前密码相同'});
      assertStrongPassword(b.new_password,u.username);
      db.prepare('UPDATE users SET password_hash=?,must_change_password=0,password_changed_at=?,failed_login_count=0,locked_until=NULL WHERE id=?').run(hashPassword(String(b.new_password)),now(),u.id);
      const currentHash=hashToken((req.headers.authorization||'').slice(7));db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(u.id,currentHash);
      audit(user,'change_password','user',u.id,req);return json(res,200,{ok:true,must_change_password:false,password_changed_at:now()});
    }
    if(p==='/api/auth/2fa/setup' && req.method==='POST'){
      if(!user.user_id)return json(res,403,{error:'human_account_required'});
      const b=await body(req),u=db.prepare('SELECT * FROM users WHERE id=?').get(user.user_id);
      if(u.must_change_password)return json(res,409,{error:'must_change_password',message:'请先修改初始/重置密码'});
      if(!verifyPassword(String(b.current_password||''),u.password_hash))return json(res,400,{error:'current_password_invalid',message:'当前密码错误'});
      const secret=base32Encode(randomBytes(20)),uri=`otpauth://totp/TradeFlow:${encodeURIComponent(u.username)}?secret=${secret}&issuer=TradeFlow&algorithm=SHA1&digits=6&period=30`;
      db.prepare('UPDATE users SET totp_secret_enc=?,totp_enabled=0,totp_last_counter=-1 WHERE id=?').run(encryptSecret(secret),u.id);
      audit(user,'two_factor_setup','user',u.id,req);return json(res,200,{secret,otpauth_uri:uri});
    }
    if(p==='/api/auth/2fa/enable' && req.method==='POST'){
      if(!user.user_id)return json(res,403,{error:'human_account_required'});
      const b=await body(req),u=db.prepare('SELECT * FROM users WHERE id=?').get(user.user_id);
      if(!verifyPassword(String(b.current_password||''),u.password_hash))return json(res,400,{error:'current_password_invalid',message:'当前密码错误'});
      if(!u.totp_secret_enc)return json(res,409,{error:'setup_required',message:'请先生成 2FA 密钥'});
      const counter=verifyTotp(decryptSecret(u.totp_secret_enc),b.code,-1);if(counter===null)return json(res,400,{error:'invalid_two_factor_code',message:'动态验证码错误'});
      db.prepare('UPDATE users SET totp_enabled=1,totp_last_counter=? WHERE id=?').run(counter,u.id);audit(user,'two_factor_enabled','user',u.id,req);return json(res,200,{ok:true,two_factor_enabled:true});
    }
    if(p==='/api/auth/2fa/disable' && req.method==='POST'){
      if(!user.user_id)return json(res,403,{error:'human_account_required'});
      const b=await body(req),u=db.prepare('SELECT * FROM users WHERE id=?').get(user.user_id);
      if(!verifyPassword(String(b.current_password||''),u.password_hash))return json(res,400,{error:'current_password_invalid',message:'当前密码错误'});
      if(u.totp_enabled){
        const counter=verifyTotp(decryptSecret(u.totp_secret_enc),b.code,u.totp_last_counter);if(counter===null)return json(res,400,{error:'invalid_two_factor_code',message:'动态验证码错误'});
      }
      db.prepare('UPDATE users SET totp_enabled=0,totp_secret_enc=NULL,totp_last_counter=-1 WHERE id=?').run(u.id);db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(u.id);
      audit(user,'two_factor_disabled','user',u.id,req);return json(res,200,{ok:true,two_factor_enabled:false});
    }
    if(p==='/api/auth/logout' && req.method==='POST'){ const token=(req.headers.authorization||'').slice(7); db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token)); return json(res,200,{ok:true}); }

    // ---- Departments and data scopes ----
    if(p==='/api/departments' && req.method==='GET'){
      return json(res,200,db.prepare(`SELECT d.*,p.name parent_name,u.display_name manager_name,
        (SELECT COUNT(*) FROM users ux WHERE ux.department_id=d.id AND ux.enabled=1) member_count
        FROM departments d LEFT JOIN departments p ON p.id=d.parent_id LEFT JOIN users u ON u.id=d.manager_user_id ORDER BY d.name`).all());
    }
    if(p==='/api/departments' && req.method==='POST'){
      if(user.role!=='admin')return json(res,403,{error:'forbidden'});
      const b=await body(req),name=String(b.name||'').trim();if(!name)return json(res,400,{error:'name_required'});
      const id=randomUUID();db.prepare('INSERT INTO departments(id,name,parent_id,manager_user_id,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(id,name,b.parent_id||null,b.manager_user_id||null,b.enabled===false?0:1,now(),now());
      audit(user,'create','department',id,req,{name});return json(res,201,db.prepare('SELECT * FROM departments WHERE id=?').get(id));
    }
    {
      const dm=p.match(/^\/api\/departments\/([0-9a-f-]+)$/);
      if(dm&&req.method==='PATCH'){
        if(user.role!=='admin')return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM departments WHERE id=?').get(dm[1]);if(!old)return json(res,404,{error:'not_found'});
        const b=await body(req);db.prepare('UPDATE departments SET name=?,parent_id=?,manager_user_id=?,enabled=?,updated_at=? WHERE id=?')
          .run(b.name??old.name,b.parent_id===undefined?old.parent_id:(b.parent_id||null),b.manager_user_id===undefined?old.manager_user_id:(b.manager_user_id||null),b.enabled===undefined?old.enabled:(b.enabled?1:0),now(),old.id);
        audit(user,'update','department',old.id,req,b);return json(res,200,db.prepare('SELECT * FROM departments WHERE id=?').get(old.id));
      }
      if(dm&&req.method==='DELETE'){
        if(user.role!=='admin')return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM departments WHERE id=?').get(dm[1]);if(!old)return json(res,404,{error:'not_found'});
        const members=Number(db.prepare('SELECT COUNT(*) c FROM users WHERE department_id=?').get(old.id).c||0),children=Number(db.prepare('SELECT COUNT(*) c FROM departments WHERE parent_id=?').get(old.id).c||0);
        if(members||children)return json(res,409,{error:'department_in_use',members,children});
        db.prepare('DELETE FROM departments WHERE id=?').run(old.id);audit(user,'delete','department',old.id,req);return json(res,200,{ok:true});
      }
    }

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




    // ---- Product preferences, price lists, tier pricing and market rules ----
    if(p==='/api/pricing/history' && req.method==='GET'){
      const customerId=String(url.searchParams.get('customer_id')||''),productId=String(url.searchParams.get('product_id')||'');
      if(!customerId||!productId)return json(res,400,{error:'customer_and_product_required'});
      if(scopedRole(user)&&!customerOwnedBy(user,customerId))return json(res,403,{error:'forbidden'});
      const product=db.prepare('SELECT * FROM products WHERE id=?').get(productId);if(!product)return json(res,404,{error:'product_not_found'});
      const quoteRows=db.prepare(`SELECT q.quote_no reference,q.created_at occurred_at,qi.quantity,qi.unit_price,q.currency,'quotation' source_type,q.status
        FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id
        WHERE q.customer_id=? AND (qi.product_code=? OR qi.product_name=?)
        ORDER BY q.created_at DESC`).all(customerId,product.sku||'',product.name);
      const orderRows=db.prepare(`SELECT o.order_no reference,o.created_at occurred_at,oi.quantity,oi.unit_price,o.currency,'order' source_type,o.status
        FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE o.customer_id=? AND (oi.product_id=? OR oi.product_name=?)
        ORDER BY o.created_at DESC`).all(customerId,productId,product.name);
      return json(res,200,[...quoteRows,...orderRows].sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))));
    }

    if(p==='/api/pricing/resolve' && req.method==='GET'){
      const customerId=String(url.searchParams.get('customer_id')||''),productId=String(url.searchParams.get('product_id')||''),qty=Math.max(0,Number(url.searchParams.get('quantity')||1));
      if(!customerId||!productId)return json(res,400,{error:'customer_and_product_required'});
      if(scopedRole(user)&&!customerOwnedBy(user,customerId))return json(res,403,{error:'forbidden'});
      const customer=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(customerId),product=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(productId);
      if(!customer||!product)return json(res,404,{error:'not_found'});
      const today=now().slice(0,10);
      const rules=db.prepare("SELECT * FROM product_market_rules WHERE product_id=? AND active=1 AND (country IS NULL OR country='' OR country=?)").all(productId,customer.country||'').map(r=>({...r,required_certifications:parseJSON(r.required_certifications,[])}));
      const prohibited=rules.find(r=>r.rule_type==='prohibited');
      const required=[...new Set(rules.filter(r=>r.rule_type==='requires_certification').flatMap(r=>r.required_certifications||[]))];
      const pref=db.prepare("SELECT * FROM customer_product_preferences WHERE customer_id=? AND product_id=? AND preference_type IN ('prohibited','unsuitable') ORDER BY updated_at DESC LIMIT 1").get(customerId,productId);
      const list=db.prepare(`SELECT pl.*,pli.id item_id,pli.min_qty,pli.max_qty,pli.unit_price,pli.discount_percent
        FROM price_lists pl JOIN price_list_items pli ON pli.price_list_id=pl.id
        WHERE pli.product_id=? AND pl.status='active' AND (pl.customer_id=? OR pl.customer_id IS NULL)
          AND (pl.valid_from IS NULL OR pl.valid_from<=?) AND (pl.valid_to IS NULL OR pl.valid_to>=?)
          AND pli.min_qty<=? AND (pli.max_qty IS NULL OR pli.max_qty>=?)
        ORDER BY CASE WHEN pl.customer_id=? THEN 0 ELSE 1 END,pli.min_qty DESC,pl.updated_at DESC LIMIT 1`).get(productId,customerId,today,today,qty,qty,customerId);
      const unitPrice=list?Number(list.unit_price):Number(product.base_price||0),currency=list?.currency||product.currency||'USD';
      const targetCurrency=currencyCode(url.searchParams.get('target_currency')||''),fx=targetCurrency&&targetCurrency!==currencyCode(currency)?resolveFxRate(currency,targetCurrency,today):null;
      const finalCurrency=fx?targetCurrency:currency,finalUnit=fx?Number((unitPrice*fx.rate).toFixed(6)):unitPrice;
      return json(res,200,{
        customer:{id:customer.id,name:customer.name,country:customer.country},
        product:{id:product.id,sku:product.sku,name:product.name,base_price:product.base_price,currency:product.currency,certifications:parseJSON(product.certifications,[])},
        quantity:qty,unit_price:finalUnit,currency:finalCurrency,total:Number((finalUnit*qty).toFixed(2)),
        original_price:{unit_price:unitPrice,currency,total:Number((unitPrice*qty).toFixed(2))},
        fx:fx||null,fx_missing:!!targetCurrency&&targetCurrency!==currencyCode(currency)&&!fx,
        price_source:list?{type:list.customer_id?'customer_price_list':'general_price_list',price_list_id:list.id,price_list_name:list.name,tier:{min_qty:list.min_qty,max_qty:list.max_qty,discount_percent:list.discount_percent}}:{type:'base_price'},
        allowed:!(prohibited||pref),block_reason:pref?`customer_${pref.preference_type}`:(prohibited?'market_prohibited':null),
        required_certifications:required,market_rules:rules
      });
    }

    if(p==='/api/pricing/price-lists' && req.method==='GET'){
      const customerId=url.searchParams.get('customer_id');const rows=customerId?
        db.prepare('SELECT * FROM price_lists WHERE customer_id=? OR customer_id IS NULL ORDER BY updated_at DESC').all(customerId):
        db.prepare('SELECT * FROM price_lists ORDER BY updated_at DESC').all();
      return json(res,200,rows);
    }
    if(p==='/api/pricing/price-lists' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req);if(!String(b.name||'').trim())return json(res,400,{error:'name_required'});
      const id=randomUUID();db.prepare('INSERT INTO price_lists(id,name,customer_id,currency,valid_from,valid_to,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id,b.name,b.customer_id||null,b.currency||'USD',b.valid_from||null,b.valid_to||null,b.status||'active',b.notes||null,now(),now());
      audit(user,'create','price_list',id,req,{name:b.name,customer_id:b.customer_id||null});return json(res,201,db.prepare('SELECT * FROM price_lists WHERE id=?').get(id));
    }
    {
      const pl=p.match(/^\/api\/pricing\/price-lists\/([0-9a-f-]+)$/);
      if(pl&&req.method==='GET'){
        const row=db.prepare('SELECT * FROM price_lists WHERE id=?').get(pl[1]);if(!row)return json(res,404,{error:'not_found'});
        return json(res,200,{...row,items:db.prepare(`SELECT pli.*,p.sku,p.name product_name FROM price_list_items pli JOIN products p ON p.id=pli.product_id WHERE pli.price_list_id=? ORDER BY p.name,pli.min_qty`).all(row.id)});
      }
      if(pl&&req.method==='PATCH'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM price_lists WHERE id=?').get(pl[1]);if(!old)return json(res,404,{error:'not_found'});
        const b=await body(req);db.prepare('UPDATE price_lists SET name=?,customer_id=?,currency=?,valid_from=?,valid_to=?,status=?,notes=?,updated_at=? WHERE id=?').run(b.name??old.name,b.customer_id===undefined?old.customer_id:(b.customer_id||null),b.currency??old.currency,b.valid_from===undefined?old.valid_from:(b.valid_from||null),b.valid_to===undefined?old.valid_to:(b.valid_to||null),b.status??old.status,b.notes===undefined?old.notes:b.notes,now(),old.id);
        return json(res,200,db.prepare('SELECT * FROM price_lists WHERE id=?').get(old.id));
      }
      if(pl&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM price_lists WHERE id=?').run(pl[1]);audit(user,'delete','price_list',pl[1],req);return json(res,200,{ok:true});
      }
    }
    if(p==='/api/pricing/price-list-items' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),id=randomUUID();if(!b.price_list_id||!b.product_id||b.unit_price===undefined)return json(res,400,{error:'missing_fields'});
      db.prepare('INSERT INTO price_list_items(id,price_list_id,product_id,min_qty,max_qty,unit_price,discount_percent,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id,b.price_list_id,b.product_id,Number(b.min_qty||1),b.max_qty===null||b.max_qty===''?null:Number(b.max_qty),Number(b.unit_price),b.discount_percent===null||b.discount_percent===''?null:Number(b.discount_percent),b.notes||null,now());
      return json(res,201,db.prepare('SELECT * FROM price_list_items WHERE id=?').get(id));
    }
    {
      const pli=p.match(/^\/api\/pricing\/price-list-items\/([0-9a-f-]+)$/);
      if(pli&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM price_list_items WHERE id=?').run(pli[1]);return json(res,200,{ok:true});
      }
    }

    // ---- Marketing segments, templates, consent and campaign recipients ----
    if(p==='/api/marketing/segments' && req.method==='GET'){
      const rows=db.prepare('SELECT * FROM marketing_segments WHERE created_by=? OR is_shared=1 ORDER BY updated_at DESC').all(user.user_id)
        .map(r=>({...r,rules:parseJSON(r.rules,{})}));return json(res,200,rows);
    }
    if(p==='/api/marketing/segments' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),name=String(b.name||'').trim();if(!name)return json(res,400,{error:'name_required'});
      const id=randomUUID();db.prepare('INSERT INTO marketing_segments(id,name,rules,is_shared,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,JSON.stringify(b.rules||{}),b.is_shared?1:0,user.user_id,now(),now());
      audit(user,'create','marketing_segment',id,req,{name});return json(res,201,{id,name,rules:b.rules||{},is_shared:b.is_shared?1:0});
    }
    if(p==='/api/marketing/segments/preview' && req.method==='POST'){
      const b=await body(req),rows=marketingSegmentCustomers(b.rules||{},user,Number(b.limit||500));
      return json(res,200,{total:rows.length,data:rows.map(x=>({id:x.id,name:x.name,country:x.country,grade:x.grade,source:x.source,contact_id:x.contact_id,contact_name:x.contact_name,email:x.email,consent:marketingConsent(x.id,x.contact_id,'email')}))});
    }
    {
      const segDel=p.match(/^\/api\/marketing\/segments\/([0-9a-f-]+)$/);
      if(segDel&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const row=db.prepare('SELECT * FROM marketing_segments WHERE id=?').get(segDel[1]);if(!row)return json(res,404,{error:'not_found'});
        db.prepare('DELETE FROM marketing_segments WHERE id=?').run(row.id);audit(user,'delete','marketing_segment',row.id,req);return json(res,200,{ok:true});
      }
    }

    if(p==='/api/marketing/templates' && req.method==='GET')return json(res,200,db.prepare('SELECT * FROM email_templates ORDER BY updated_at DESC').all());
    if(p==='/api/marketing/templates' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req);if(!b.name||!b.subject||!b.body)return json(res,400,{error:'missing_fields'});
      const id=randomUUID();db.prepare('INSERT INTO email_templates(id,name,subject,body,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,b.name,b.subject,b.body,now(),now());
      audit(user,'create','email_template',id,req,{name:b.name});return json(res,201,db.prepare('SELECT * FROM email_templates WHERE id=?').get(id));
    }
    {
      const tpl=p.match(/^\/api\/marketing\/templates\/([0-9a-f-]+)$/);
      if(tpl&&req.method==='PATCH'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const b=await body(req),old=db.prepare('SELECT * FROM email_templates WHERE id=?').get(tpl[1]);if(!old)return json(res,404,{error:'not_found'});
        db.prepare('UPDATE email_templates SET name=?,subject=?,body=?,updated_at=? WHERE id=?').run(b.name??old.name,b.subject??old.subject,b.body??old.body,now(),old.id);
        return json(res,200,db.prepare('SELECT * FROM email_templates WHERE id=?').get(old.id));
      }
      if(tpl&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM email_templates WHERE id=?').run(tpl[1]);return json(res,200,{ok:true});
      }
    }

    if(p==='/api/marketing/consent' && req.method==='POST'){
      const b=await body(req),customerId=String(b.customer_id||''),contactId=b.contact_id?String(b.contact_id):null,channel=String(b.channel||'email'),status=String(b.status||'opt_out');
      if(!customerId)return json(res,400,{error:'customer_required'});
      if(scopedRole(user)&&!customerOwnedBy(user,customerId))return json(res,403,{error:'forbidden'});
      db.prepare('DELETE FROM marketing_consents WHERE customer_id=? AND channel=? AND ((contact_id IS NULL AND ? IS NULL) OR contact_id=?)').run(customerId,channel,contactId,contactId);
      const id=randomUUID();db.prepare('INSERT INTO marketing_consents(id,customer_id,contact_id,channel,status,source,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,customerId,contactId,channel,status,b.source||'manual',now());
      audit(user,'consent','customer',customerId,req,{channel,status,contact_id:contactId});return json(res,200,{id,customer_id:customerId,contact_id:contactId,channel,status});
    }

    {
      const prep=p.match(/^\/api\/marketing\/campaigns\/([0-9a-f-]+)\/prepare$/);
      if(prep&&req.method==='POST'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const campaign=db.prepare('SELECT * FROM campaigns WHERE id=?').get(prep[1]);if(!campaign)return json(res,404,{error:'not_found'});
        let rules=parseJSON(campaign.segment_rule,{})||{};
        if(campaign.segment_id){const seg=db.prepare('SELECT * FROM marketing_segments WHERE id=?').get(campaign.segment_id);if(seg)rules=parseJSON(seg.rules,{})||rules;}
        const template=campaign.template_id?db.prepare('SELECT * FROM email_templates WHERE id=?').get(campaign.template_id):null;
        const subject=campaign.subject||template?.subject||campaign.name,bodyText=campaign.content||template?.body||'';
        const candidates=marketingSegmentCustomers(rules,user,5000);
        db.prepare("DELETE FROM campaign_recipients WHERE campaign_id=? AND status='prepared'").run(campaign.id);
        const ins=db.prepare('INSERT OR IGNORE INTO campaign_recipients(id,campaign_id,customer_id,contact_id,address,status,reason,personalized_subject,personalized_body,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
        let prepared=0,skipped=0;
        for(const x of candidates){
          const consent=marketingConsent(x.id,x.contact_id,'email'),blocked=!x.email||['opt_out','blocked'].includes(consent);
          const ctx={customer_name:x.name,contact_name:x.contact_name,country:x.country,email:x.email};
          ins.run(randomUUID(),campaign.id,x.id,x.contact_id,x.email||null,blocked?'skipped':'prepared',!x.email?'no_email':(['opt_out','blocked'].includes(consent)?consent:null),renderMarketingText(subject,ctx),renderMarketingText(bodyText,ctx),now());
          if(blocked)skipped++;else prepared++;
        }
        db.prepare("UPDATE campaigns SET status='prepared',updated_at=? WHERE id=?").run(now(),campaign.id);
        audit(user,'prepare','campaign',campaign.id,req,{prepared,skipped});return json(res,200,{prepared,skipped,total:candidates.length});
      }
      const rec=p.match(/^\/api\/marketing\/campaigns\/([0-9a-f-]+)\/recipients$/);
      if(rec&&req.method==='GET'){
        const rows=db.prepare(`SELECT cr.*,c.name customer_name,ct.name contact_name FROM campaign_recipients cr JOIN customers c ON c.id=cr.customer_id LEFT JOIN contacts ct ON ct.id=cr.contact_id WHERE cr.campaign_id=? ORDER BY cr.created_at DESC`).all(rec[1]);
        return json(res,200,rows);
      }
      const stats=p.match(/^\/api\/marketing\/campaigns\/([0-9a-f-]+)\/stats$/);
      if(stats&&req.method==='GET'){
        const campaign=db.prepare('SELECT * FROM campaigns WHERE id=?').get(stats[1]);if(!campaign)return json(res,404,{error:'not_found'});
        const rs=db.prepare('SELECT * FROM campaign_recipients WHERE campaign_id=?').all(campaign.id);
        let converted=0,revenue=0;
        for(const r of rs){const o=db.prepare('SELECT COALESCE(SUM(total),0) revenue,COUNT(*) c FROM orders WHERE customer_id=? AND created_at>=?').get(r.customer_id,campaign.created_at);if(Number(o.c)>0){converted++;revenue+=Number(o.revenue||0);if(!r.converted_at)db.prepare('UPDATE campaign_recipients SET converted_at=? WHERE id=?').run(now(),r.id);}}
        return json(res,200,{total:rs.length,prepared:rs.filter(x=>x.status==='prepared').length,sent:rs.filter(x=>x.status==='sent').length,skipped:rs.filter(x=>x.status==='skipped').length,converted,revenue,conversion_rate:rs.length?converted/rs.length*100:0});
      }
      const sent=p.match(/^\/api\/marketing\/recipients\/([0-9a-f-]+)\/mark-sent$/);
      if(sent&&req.method==='POST'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const r=db.prepare('SELECT * FROM campaign_recipients WHERE id=?').get(sent[1]);if(!r)return json(res,404,{error:'not_found'});
        db.prepare("UPDATE campaign_recipients SET status='sent',sent_at=? WHERE id=?").run(now(),r.id);return json(res,200,{ok:true});
      }
    }

    // ---- Integration configuration, webhook testing and API tokens ----
    if(p==='/api/integrations' && req.method==='GET'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      return json(res,200,db.prepare('SELECT * FROM integrations ORDER BY updated_at DESC').all().map(r=>({...r,config:parseJSON(r.config,{})})));
    }
    if(p==='/api/integrations' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),id=randomUUID();if(!b.name||!b.type)return json(res,400,{error:'missing_fields'});
      db.prepare('INSERT INTO integrations(id,name,type,provider,base_url,enabled,config,secret_env,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,b.name,b.type,b.provider||null,b.base_url||null,b.enabled?1:0,JSON.stringify(b.config||{}),b.secret_env||null,now(),now());
      audit(user,'create','integration',id,req,{name:b.name,type:b.type});return json(res,201,{id});
    }
    {
      const integ=p.match(/^\/api\/integrations\/([0-9a-f-]+)$/);
      if(integ&&req.method==='PATCH'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM integrations WHERE id=?').get(integ[1]);if(!old)return json(res,404,{error:'not_found'});
        const b=await body(req);db.prepare('UPDATE integrations SET name=?,type=?,provider=?,base_url=?,enabled=?,config=?,secret_env=?,updated_at=? WHERE id=?').run(b.name??old.name,b.type??old.type,b.provider??old.provider,b.base_url??old.base_url,b.enabled===undefined?old.enabled:(b.enabled?1:0),JSON.stringify(b.config??parseJSON(old.config,{})),b.secret_env??old.secret_env,now(),old.id);
        return json(res,200,{ok:true});
      }
      if(integ&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM integrations WHERE id=?').run(integ[1]);return json(res,200,{ok:true});
      }
      const test=p.match(/^\/api\/integrations\/([0-9a-f-]+)\/test$/);
      if(test&&req.method==='POST'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const row=db.prepare('SELECT * FROM integrations WHERE id=?').get(test[1]);if(!row)return json(res,404,{error:'not_found'});
        if(row.type!=='webhook')return json(res,400,{error:'test_not_supported'});
        const cfg=parseJSON(row.config,{})||{},secret=row.secret_env?process.env[row.secret_env]||'':'',bodyText=JSON.stringify({event:'integration.test',time:now(),data:{message:'TradeFlow webhook test'}});
        const headers={'content-type':'application/json','user-agent':'TradeFlow-CRM/1.0'};if(secret)headers['x-tradeflow-signature']=createHmac('sha256',secret).update(bodyText).digest('hex');
        try{const res=await fetch(row.base_url||cfg.url,{method:'POST',headers,body:bodyText,signal:AbortSignal.timeout(7000)});const txt=(await res.text()).slice(0,500);db.prepare('INSERT INTO integration_deliveries(id,integration_id,event,status,status_code,response_excerpt,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),row.id,'integration.test',res.ok?'success':'failed',res.status,txt,now());return json(res,res.ok?200:502,{ok:res.ok,status:res.status,response:txt});}
        catch(e){return json(res,502,{ok:false,error:String(e?.message||e)});}
      }
      const deliveries=p.match(/^\/api\/integrations\/([0-9a-f-]+)\/deliveries$/);
      if(deliveries&&req.method==='GET'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        return json(res,200,db.prepare('SELECT * FROM integration_deliveries WHERE integration_id=? ORDER BY created_at DESC LIMIT 100').all(deliveries[1]));
      }
    }

    if(p==='/api/api-tokens' && req.method==='GET'){
      if(user.role!=='admin')return json(res,403,{error:'forbidden'});
      return json(res,200,db.prepare('SELECT id,name,role,enabled,expires_at,last_used_at,created_at FROM api_tokens ORDER BY created_at DESC').all());
    }
    if(p==='/api/api-tokens' && req.method==='POST'){
      if(user.role!=='admin')return json(res,403,{error:'forbidden'});
      const b=await body(req),raw=`tf_${randomBytes(32).toString('base64url')}`,id=randomUUID(),role=['readonly','finance','sales','manager'].includes(b.role)?b.role:'readonly';
      db.prepare('INSERT INTO api_tokens(id,name,token_hash,role,enabled,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(id,b.name||'API Token',hashToken(raw),role,1,b.expires_at||null,now());
      audit(user,'create','api_token',id,req,{name:b.name||'API Token',role});return json(res,201,{id,token:raw,name:b.name||'API Token',role,expires_at:b.expires_at||null});
    }
    {
      const tok=p.match(/^\/api\/api-tokens\/([0-9a-f-]+)$/);
      if(tok&&req.method==='DELETE'){
        if(user.role!=='admin')return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM api_tokens WHERE id=?').run(tok[1]);audit(user,'revoke','api_token',tok[1],req);return json(res,200,{ok:true});
      }
    }

    if(p==='/api/analytics/overview' && req.method==='GET'){
      const months=Math.min(24,Math.max(3,Number(url.searchParams.get('months')||12)));
      const access=customerScopeClause(user,'c'),customerScope=access.sql,scopeArgs=access.args;
      const orderScope=access.sql,orderArgs=access.args;
      const monthStart=new Date();monthStart.setMonth(monthStart.getMonth()-months+1);monthStart.setDate(1);monthStart.setHours(0,0,0,0);
      const startIso=monthStart.toISOString();

      const newCustomers=db.prepare(`SELECT substr(c.created_at,1,7) month,COUNT(*) value FROM customers c WHERE c.deleted_at IS NULL AND c.created_at>=?${customerScope} GROUP BY substr(c.created_at,1,7) ORDER BY month`).all(startIso,...scopeArgs);
      const orderRevenue=db.prepare(`SELECT substr(o.created_at,1,7) month,COUNT(*) orders,COALESCE(SUM(o.total),0) revenue FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.created_at>=?${orderScope} GROUP BY substr(o.created_at,1,7) ORDER BY month`).all(startIso,...orderArgs);

      const funnel=db.prepare(`SELECT op.stage,COUNT(*) count,COALESCE(SUM(op.expected_amount),0) amount FROM opportunities op JOIN customers c ON c.id=op.customer_id WHERE 1=1${customerScope} GROUP BY op.stage`).all(...scopeArgs);
      const forecast=db.prepare(`SELECT COALESCE(SUM(COALESCE(op.expected_amount,0)*COALESCE(op.probability,0)/100.0),0) weighted,COALESCE(SUM(COALESCE(op.expected_amount,0)),0) pipeline FROM opportunities op JOIN customers c ON c.id=op.customer_id WHERE op.stage NOT IN ('won','lost')${customerScope}`).get(...scopeArgs);

      const source=db.prepare(`SELECT COALESCE(c.source,'Unknown') source,COUNT(DISTINCT c.id) customers,COUNT(DISTINCT o.id) orders,COALESCE(SUM(o.total),0) revenue FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE c.deleted_at IS NULL${customerScope} GROUP BY COALESCE(c.source,'Unknown') ORDER BY revenue DESC,customers DESC LIMIT 20`).all(...scopeArgs);

      let salespeople=db.prepare(`SELECT u.id,u.display_name,u.role,u.department_id,
        COUNT(DISTINCT c.id) customers,
        COUNT(DISTINCT a.id) activities,
        COUNT(DISTINCT o.id) orders,
        COALESCE(SUM(o.total),0) revenue
        FROM users u LEFT JOIN customers c ON c.owner_id=u.id AND c.deleted_at IS NULL
        LEFT JOIN activities a ON a.customer_id=c.id
        LEFT JOIN orders o ON o.customer_id=c.id
        WHERE u.enabled=1 AND u.role IN ('admin','manager','sales','followup')
        GROUP BY u.id ORDER BY revenue DESC,activities DESC LIMIT 30`).all();
      if(userDataScope(user)==='self')salespeople=salespeople.filter(x=>x.id===user.user_id);
      else if(userDataScope(user)==='department'&&user.department_id)salespeople=salespeople.filter(x=>x.department_id===user.department_id);

      const customerValue=db.prepare(`SELECT c.id,c.name,COUNT(DISTINCT o.id) order_count,COALESCE(SUM(o.total),0) revenue,
        COALESCE(SUM(CASE WHEN q.margin_rate IS NOT NULL THEN o.total*q.margin_rate/100.0 ELSE 0 END),0) estimated_gross_profit
        FROM customers c JOIN orders o ON o.customer_id=c.id LEFT JOIN quotations q ON q.id=o.quotation_id
        WHERE c.deleted_at IS NULL${customerScope}
        GROUP BY c.id ORDER BY revenue DESC LIMIT 20`).all(...scopeArgs);

      const brands=db.prepare(`SELECT b.name,COUNT(DISTINCT cb.customer_id) customers,COALESCE(SUM(cb.sales_share),0) sales_share_sum
        FROM brands b JOIN customer_brands cb ON cb.brand_id=b.id JOIN customers c ON c.id=cb.customer_id
        WHERE c.deleted_at IS NULL${customerScope} GROUP BY b.id ORDER BY customers DESC LIMIT 20`).all(...scopeArgs);

      const orderCustomerRows=db.prepare(`SELECT c.id,COUNT(o.id) cnt FROM customers c JOIN orders o ON o.customer_id=c.id WHERE c.deleted_at IS NULL${customerScope} GROUP BY c.id`).all(...scopeArgs);
      const buyers=orderCustomerRows.length,repeatBuyers=orderCustomerRows.filter(x=>Number(x.cnt)>=2).length,repurchaseRate=buyers?repeatBuyers/buyers*100:0;
      const totalRevenue=db.prepare(`SELECT COALESCE(SUM(o.total),0) v FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.deleted_at IS NULL${orderScope}`).get(...orderArgs).v;
      const totalCustomers=db.prepare(`SELECT COUNT(*) c FROM customers c WHERE c.deleted_at IS NULL${customerScope}`).get(...scopeArgs).c;
      const openOpps=db.prepare(`SELECT COUNT(*) c FROM opportunities op JOIN customers c ON c.id=op.customer_id WHERE op.stage NOT IN ('won','lost')${customerScope}`).get(...scopeArgs).c;

      return json(res,200,{
        summary:{total_customers:totalCustomers,total_revenue:Number(totalRevenue||0),open_opportunities:openOpps,pipeline:Number(forecast.pipeline||0),weighted_forecast:Number(forecast.weighted||0),buyers,repeat_buyers:repeatBuyers,repurchase_rate:repurchaseRate},
        new_customers:newCustomers,order_revenue:orderRevenue,funnel,source,salespeople,customer_value:customerValue,brands
      });
    }

    if(p==='/api/dashboard' && req.method==='GET'){
      const access=customerScopeClause(user,'c'),scope=access.sql,args=access.args;
      const one=(sql,a=[])=>Number(db.prepare(sql).get(...a).c||0);
      const customers=one(`SELECT COUNT(*) c FROM customers c WHERE c.deleted_at IS NULL${scope}`,args);
      const contacts=one(`SELECT COUNT(*) c FROM contacts ct JOIN customers c ON c.id=ct.customer_id WHERE c.deleted_at IS NULL${scope}`,args);
      const inquiries=one(`SELECT COUNT(*) c FROM inquiries i JOIN customers c ON c.id=i.customer_id WHERE c.deleted_at IS NULL${scope}`,args);
      const opportunities=one(`SELECT COUNT(*) c FROM opportunities o JOIN customers c ON c.id=o.customer_id WHERE c.deleted_at IS NULL AND o.stage NOT IN ('won','lost')${scope}`,args);
      const quotations=one(`SELECT COUNT(*) c FROM quotations q JOIN customers c ON c.id=q.customer_id WHERE c.deleted_at IS NULL${scope}`,args);
      const orders=one(`SELECT COUNT(*) c FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.deleted_at IS NULL${scope}`,args);
      const overduePayments=one(`SELECT COUNT(*) c FROM payments p JOIN customers c ON c.id=p.customer_id WHERE c.deleted_at IS NULL AND p.status!='paid' AND p.due_at IS NOT NULL AND p.due_at < ?${scope}`,[now(),...args]);
      let openTasks,dueTasks;
      if(userDataScope(user)==='all'){
        openTasks=one("SELECT COUNT(*) c FROM tasks WHERE status!='done'");
        dueTasks=db.prepare("SELECT t.*,c.name customer_name FROM tasks t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.status!='done' ORDER BY COALESCE(t.due_at,'9999') LIMIT 10").all();
      }else{
        openTasks=one(`SELECT COUNT(*) c FROM tasks t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.status!='done' AND (t.assigned_to=? OR (c.id IS NOT NULL AND c.deleted_at IS NULL${scope}))`,[user.user_id,...args]);
        dueTasks=db.prepare(`SELECT t.*,c.name customer_name FROM tasks t LEFT JOIN customers c ON c.id=t.customer_id WHERE t.status!='done' AND (t.assigned_to=? OR (c.id IS NOT NULL AND c.deleted_at IS NULL${scope})) ORDER BY COALESCE(t.due_at,'9999') LIMIT 10`).all(user.user_id,...args);
      }
      const recentActivities=db.prepare(`SELECT a.*,c.name customer_name FROM activities a JOIN customers c ON c.id=a.customer_id WHERE c.deleted_at IS NULL${scope} ORDER BY a.occurred_at DESC LIMIT 10`).all(...args);
      return json(res,200,{customers,contacts,openTasks,inquiries,opportunities,quotations,orders,overduePayments,recentActivities,dueTasks});
    }
    if(p==='/api/search' && req.method==='GET'){
      const term=(url.searchParams.get('q')||'').trim();if(!term)return json(res,200,[]);const like=`%${term}%`,access=customerScopeClause(user,'c'),scope=access.sql,scopeArgs=access.args;
      const base=db.prepare(`
        SELECT DISTINCT c.*,u.display_name owner_name
        FROM customers c LEFT JOIN users u ON u.id=c.owner_id
        WHERE c.deleted_at IS NULL${scope} AND (
          c.name LIKE ? OR c.english_name LIKE ? OR c.local_name LIKE ? OR c.website LIKE ? OR c.tax_no LIKE ? OR c.registration_no LIKE ? OR c.business_scope LIKE ?
          OR EXISTS (SELECT 1 FROM contacts ct WHERE ct.customer_id=c.id AND (ct.name LIKE ? OR ct.title LIKE ? OR ct.department LIKE ?))
          OR EXISTS (SELECT 1 FROM contacts ct JOIN contact_channels cc ON cc.contact_id=ct.id WHERE ct.customer_id=c.id AND cc.value LIKE ?)
          OR EXISTS (SELECT 1 FROM customer_tags x JOIN tags t ON t.id=x.tag_id WHERE x.customer_id=c.id AND t.name LIKE ?)
          OR EXISTS (SELECT 1 FROM customer_brands cb JOIN brands b ON b.id=cb.brand_id WHERE cb.customer_id=c.id AND b.name LIKE ?)
        ) ORDER BY c.updated_at DESC LIMIT 100`).all(...scopeArgs,like,like,like,like,like,like,like,like,like,like,like,like,like);
      const searchableDefs=customFieldDefs('customer').filter(d=>d.searchable&&customFieldVisible(d,user.role)),lower=term.toLowerCase();
      const customCandidates=db.prepare(`SELECT c.*,u.display_name owner_name FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.deleted_at IS NULL${scope} ORDER BY c.updated_at DESC LIMIT 2000`).all(...scopeArgs)
        .filter(r=>{const cf=parseJSON(r.custom_fields,{})||{};return searchableDefs.some(d=>String(cf[d.field_key]??'').toLowerCase().includes(lower));});
      const map=new Map();for(const r of [...base,...customCandidates])if(!map.has(r.id))map.set(r.id,protectRow('customers',decodeRow(r,resourceMap.customers),user));
      return json(res,200,[...map.values()].slice(0,100));
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
      const access=customerScopeClause(user,'c'),scope=access.sql,args=access.args;
      const one=(table,alias,extra='')=>Number(db.prepare(`SELECT COUNT(*) c FROM ${table} ${alias} JOIN customers c ON c.id=${alias}.customer_id WHERE c.deleted_at IS NULL ${extra}${scope}`).get(...args).c||0);
      return json(res,200,{inquiries:one('inquiries','i'),opportunities:one('opportunities','o'," AND o.stage NOT IN ('won','lost')"),quotations:one('quotations','q'),samples:one('samples','s'),orders:one('orders','o')});
    }
    if(p==='/api/analytics/customers-by-country' && req.method==='GET'){
      const access=customerScopeClause(user,'c');return json(res,200,db.prepare(`SELECT COALESCE(c.country,'Unknown') name,COUNT(*) value FROM customers c WHERE c.deleted_at IS NULL${access.sql} GROUP BY c.country ORDER BY value DESC LIMIT 30`).all(...access.args));
    }
    if(p==='/api/analytics/customers-by-type' && req.method==='GET'){
      const access=customerScopeClause(user,'c'),all=db.prepare(`SELECT c.customer_types FROM customers c WHERE c.deleted_at IS NULL${access.sql}`).all(...access.args);const m={};for(const r of all)for(const t of parseJSON(r.customer_types,[]))m[t]=(m[t]||0)+1;return json(res,200,Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value));
    }
    // ---- Auditable exchange rates / currency conversion ----
    if(p==='/api/settings/exchange-rates' && req.method==='GET'){
      const base=currencyCode(url.searchParams.get('base')||''),quote=currencyCode(url.searchParams.get('quote')||'');
      const filters=[],args=[];if(base){filters.push('base_currency=?');args.push(base);}if(quote){filters.push('quote_currency=?');args.push(quote);}
      const where=filters.length?`WHERE ${filters.join(' AND ')}`:'';
      return json(res,200,db.prepare(`SELECT er.*,u.display_name created_by_name FROM exchange_rates er LEFT JOIN users u ON u.id=er.created_by ${where} ORDER BY rate_date DESC,base_currency,quote_currency LIMIT 1000`).all(...args));
    }
    if(p==='/api/settings/exchange-rates' && req.method==='POST'){
      if(!['admin','manager','finance'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),base=currencyCode(b.base_currency),quote=currencyCode(b.quote_currency),rate=Number(b.rate),date=String(b.rate_date||now().slice(0,10)),source=String(b.source||'manual').trim()||'manual';
      if(!base||!quote||base===quote||!Number.isFinite(rate)||rate<=0)return json(res,400,{error:'invalid_rate'});
      const id=randomUUID();
      db.prepare(`INSERT INTO exchange_rates(id,base_currency,quote_currency,rate,rate_date,source,notes,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(base_currency,quote_currency,rate_date,source) DO UPDATE SET rate=excluded.rate,notes=excluded.notes,created_by=excluded.created_by,updated_at=excluded.updated_at`)
        .run(id,base,quote,rate,date,source,b.notes||null,user.user_id,now(),now());
      const row=db.prepare('SELECT * FROM exchange_rates WHERE base_currency=? AND quote_currency=? AND rate_date=? AND source=?').get(base,quote,date,source);
      audit(user,'upsert','exchange_rate',row.id,req,{base_currency:base,quote_currency:quote,rate,date,source});return json(res,201,row);
    }
    {
      const fx=p.match(/^\/api\/settings\/exchange-rates\/([0-9a-f-]+)$/);
      if(fx&&req.method==='DELETE'){
        if(!['admin','manager','finance'].includes(user.role))return json(res,403,{error:'forbidden'});
        const row=db.prepare('SELECT * FROM exchange_rates WHERE id=?').get(fx[1]);if(!row)return json(res,404,{error:'not_found'});
        db.prepare('DELETE FROM exchange_rates WHERE id=?').run(row.id);audit(user,'delete','exchange_rate',row.id,req,row);return json(res,200,{ok:true});
      }
    }
    if(p==='/api/fx/convert' && req.method==='GET'){
      const amount=Number(url.searchParams.get('amount')||0),from=currencyCode(url.searchParams.get('from')||''),to=currencyCode(url.searchParams.get('to')||''),date=String(url.searchParams.get('date')||now().slice(0,10));
      if(!Number.isFinite(amount)||!from||!to)return json(res,400,{error:'amount_from_to_required'});
      const fx=resolveFxRate(from,to,date);if(!fx)return json(res,404,{error:'rate_not_found',from,to,date});
      return json(res,200,{amount,converted:Number((amount*fx.rate).toFixed(6)),...fx});
    }

    if(p==='/api/settings/channels' && req.method==='GET'){
      const all=url.searchParams.get('all')==='1'&&['admin','manager'].includes(user.role);
      const rows=db.prepare(`SELECT * FROM channel_configs ${all?'':'WHERE enabled=1'} ORDER BY sort_order,name`).all();
      return json(res,200,rows);
    }
    if(p==='/api/settings/channels' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),key=safeChannelKey(b.channel_key),name=String(b.name||'').trim();
      if(!key||!name)return json(res,400,{error:'key_and_name_required'});
      if(db.prepare('SELECT 1 FROM channel_configs WHERE channel_key=?').get(key))return json(res,409,{error:'channel_key_exists'});
      const modes=['copy','email','phone','direct_url','template'];if(!modes.includes(b.link_mode||'copy'))return json(res,400,{error:'invalid_link_mode'});
      const id=randomUUID();db.prepare('INSERT INTO channel_configs(id,channel_key,name,icon,link_mode,url_template,value_hint,copy_fallback,enabled,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,key,name,b.icon||null,b.link_mode||'copy',b.url_template||null,b.value_hint||null,b.copy_fallback===false?0:1,b.enabled===false?0:1,Number(b.sort_order||0),now(),now());
      audit(user,'create','channel_config',id,req,{channel_key:key,name});return json(res,201,db.prepare('SELECT * FROM channel_configs WHERE id=?').get(id));
    }
    {
      const cm=p.match(/^\/api\/settings\/channels\/([0-9a-f-]+)$/);
      if(cm&&req.method==='PATCH'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM channel_configs WHERE id=?').get(cm[1]);if(!old)return json(res,404,{error:'not_found'});
        const b=await body(req),key=b.channel_key===undefined?old.channel_key:safeChannelKey(b.channel_key),name=b.name===undefined?old.name:String(b.name||'').trim(),mode=b.link_mode===undefined?old.link_mode:b.link_mode;
        if(!key||!name)return json(res,400,{error:'key_and_name_required'});if(!['copy','email','phone','direct_url','template'].includes(mode))return json(res,400,{error:'invalid_link_mode'});
        const dup=db.prepare('SELECT id FROM channel_configs WHERE channel_key=? AND id!=?').get(key,old.id);if(dup)return json(res,409,{error:'channel_key_exists'});
        db.prepare('UPDATE channel_configs SET channel_key=?,name=?,icon=?,link_mode=?,url_template=?,value_hint=?,copy_fallback=?,enabled=?,sort_order=?,updated_at=? WHERE id=?')
          .run(key,name,b.icon===undefined?old.icon:(b.icon||null),mode,b.url_template===undefined?old.url_template:(b.url_template||null),b.value_hint===undefined?old.value_hint:(b.value_hint||null),b.copy_fallback===undefined?old.copy_fallback:(b.copy_fallback?1:0),b.enabled===undefined?old.enabled:(b.enabled?1:0),b.sort_order===undefined?old.sort_order:Number(b.sort_order||0),now(),old.id);
        audit(user,'update','channel_config',old.id,req,{channel_key:key,name});return json(res,200,db.prepare('SELECT * FROM channel_configs WHERE id=?').get(old.id));
      }
      if(cm&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM channel_configs WHERE id=?').get(cm[1]);if(!old)return json(res,404,{error:'not_found'});
        const used=Number(db.prepare('SELECT COUNT(*) c FROM contact_channels WHERE channel=?').get(old.channel_key).c||0);
        if(used)return json(res,409,{error:'channel_in_use',usage_count:used});
        db.prepare('DELETE FROM channel_configs WHERE id=?').run(old.id);audit(user,'delete','channel_config',old.id,req,{channel_key:old.channel_key});return json(res,200,{ok:true});
      }
    }
    if(p==='/api/tools/link' && req.method==='POST'){
      const b=await body(req),value=String(b.value||'').trim(),key=safeChannelKey(b.channel),config=channelConfigByKey(key);
      const target=buildChannelTarget(config,value);
      return json(res,200,{target,copyFallback:config?!!config.copy_fallback:true,channel:config||null});
    }










    // ---- Aftersales / complaint ticket workflow ----
    if(p==='/api/aftersales/summary' && req.method==='GET'){
      const access=customerScopeClause(user,'c');
      const rows=db.prepare(`SELECT a.* FROM aftersales a JOIN customers c ON c.id=a.customer_id WHERE c.deleted_at IS NULL${access.sql}`).all(...access.args);
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

    // ---- Customs declaration preparation / HS Code workflow ----
    if(p==='/api/customs-declarations' && req.method==='GET'){
      const access=customerScopeClause(user,'c');
      const rows=db.prepare(`SELECT cd.*,o.order_no,o.customer_id,c.name customer_name,s.booking_no,s.bl_no FROM customs_declarations cd JOIN orders o ON o.id=cd.order_id JOIN customers c ON c.id=o.customer_id LEFT JOIN shipments s ON s.id=cd.shipment_id WHERE c.deleted_at IS NULL${access.sql} ORDER BY cd.updated_at DESC LIMIT 500`).all(...access.args);
      return json(res,200,rows);
    }
    {
      const createCustoms=p.match(/^\/api\/workflows\/orders\/([0-9a-f-]+)\/customs-declaration$/);
      if(createCustoms&&req.method==='POST'){
        const order=db.prepare('SELECT * FROM orders WHERE id=?').get(createCustoms[1]);if(!order)return json(res,404,{error:'order_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,order.customer_id))return json(res,403,{error:'forbidden'});
        if(!['admin','manager','sales'].includes(user.role))return json(res,403,{error:'forbidden'});
        const b=await body(req);
        let shipment=null;if(b.shipment_id){shipment=db.prepare('SELECT * FROM shipments WHERE id=? AND order_id=?').get(b.shipment_id,order.id);if(!shipment)return json(res,400,{error:'invalid_shipment'});}
        const id=randomUUID(),declarationNo=makeNo('DEC'),customer=db.prepare('SELECT * FROM customers WHERE id=?').get(order.customer_id);
        db.prepare('INSERT INTO customs_declarations(id,declaration_no,order_id,shipment_id,export_country,destination_country,customs_office,declaration_date,trade_mode,incoterm,currency,total_value,status,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,declarationNo,order.id,shipment?.id||null,b.export_country||null,b.destination_country||customer.country||null,b.customs_office||null,b.declaration_date||now().slice(0,10),b.trade_mode||'General Trade',b.incoterm||order.incoterm||null,b.currency||order.currency||'USD',0,'draft',b.notes||null,user.user_id,now(),now());

        let sourceItems=[];
        if(shipment){
          sourceItems=db.prepare(`SELECT si.order_item_id,si.product_name,si.quantity,si.unit,oi.product_id,oi.unit_price
            FROM shipment_items si LEFT JOIN order_items oi ON oi.id=si.order_item_id WHERE si.shipment_id=?`).all(shipment.id);
        }else{
          sourceItems=db.prepare('SELECT id order_item_id,product_id,product_name,quantity,unit,unit_price FROM order_items WHERE order_id=?').all(order.id);
        }
        const ins=db.prepare('INSERT INTO customs_declaration_items(id,declaration_id,order_item_id,product_id,product_name,hs_code,customs_name,quantity,unit,unit_price,total_value,origin_country,brand,model,material,usage,declaration_elements,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        let total=0;
        for(const x of sourceItems){
          let prod=null;if(x.product_id)prod=db.prepare('SELECT * FROM products WHERE id=?').get(x.product_id);if(!prod)prod=db.prepare('SELECT * FROM products WHERE name=? LIMIT 1').get(x.product_name);
          const els=parseJSON(prod?.declaration_elements,{})||{},qty=Number(x.quantity||0),unitPrice=Number(x.unit_price||0),amount=Number((qty*unitPrice).toFixed(2));total+=amount;
          ins.run(randomUUID(),id,x.order_item_id||null,x.product_id||prod?.id||null,x.product_name,prod?.hs_code||null,prod?.customs_name||x.product_name,qty,x.unit||null,unitPrice,amount,prod?.origin_country||b.export_country||null,els.brand||null,els.model||null,els.material||null,els.usage||null,JSON.stringify(els),now(),now());
        }
        db.prepare('UPDATE customs_declarations SET total_value=?,updated_at=? WHERE id=?').run(total,now(),id);
        audit(user,'create','customs_declaration',id,req,{order_id:order.id,shipment_id:shipment?.id||null});
        return json(res,201,db.prepare('SELECT * FROM customs_declarations WHERE id=?').get(id));
      }

      const cfull=p.match(/^\/api\/workflows\/customs\/([0-9a-f-]+)\/full$/);
      if(cfull&&req.method==='GET'){
        const d=db.prepare('SELECT cd.*,o.order_no,o.customer_id,c.name customer_name,c.country customer_country,s.booking_no,s.bl_no,s.carrier,s.vessel_voyage,s.port_of_loading,s.destination_port,s.etd,s.eta FROM customs_declarations cd JOIN orders o ON o.id=cd.order_id JOIN customers c ON c.id=o.customer_id LEFT JOIN shipments s ON s.id=cd.shipment_id WHERE cd.id=?').get(cfull[1]);
        if(!d)return json(res,404,{error:'not_found'});if(scopedRole(user)&&!customerOwnedBy(user,d.customer_id))return json(res,403,{error:'forbidden'});
        const items=db.prepare('SELECT * FROM customs_declaration_items WHERE declaration_id=? ORDER BY rowid').all(d.id).map(x=>({...x,declaration_elements:parseJSON(x.declaration_elements,{})}));
        const documents=db.prepare("SELECT * FROM documents WHERE entity_type='customs' AND entity_id=? ORDER BY created_at DESC").all(d.id);
        return json(res,200,{...d,items,documents});
      }

      const csave=p.match(/^\/api\/workflows\/customs\/([0-9a-f-]+)$/);
      if(csave&&req.method==='PUT'){
        const old=db.prepare('SELECT cd.*,o.customer_id FROM customs_declarations cd JOIN orders o ON o.id=cd.order_id WHERE cd.id=?').get(csave[1]);if(!old)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,old.customer_id))return json(res,403,{error:'forbidden'});if(!['admin','manager','sales'].includes(user.role))return json(res,403,{error:'forbidden'});
        const b=await body(req);
        db.exec('BEGIN IMMEDIATE');
        try{
          db.prepare('UPDATE customs_declarations SET export_country=?,destination_country=?,customs_office=?,declaration_date=?,trade_mode=?,incoterm=?,currency=?,notes=?,updated_at=? WHERE id=?')
            .run(b.export_country??old.export_country,b.destination_country??old.destination_country,b.customs_office??old.customs_office,b.declaration_date??old.declaration_date,b.trade_mode??old.trade_mode,b.incoterm??old.incoterm,b.currency??old.currency,b.notes??old.notes,now(),old.id);
          let total=0;
          const upd=db.prepare('UPDATE customs_declaration_items SET hs_code=?,customs_name=?,quantity=?,unit=?,unit_price=?,total_value=?,origin_country=?,brand=?,model=?,material=?,usage=?,declaration_elements=?,updated_at=? WHERE id=? AND declaration_id=?');
          for(const x of (Array.isArray(b.items)?b.items:[])){
            const qty=Number(x.quantity||0),unitPrice=Number(x.unit_price||0),amount=Number((qty*unitPrice).toFixed(2));total+=amount;
            const elements={...(x.declaration_elements||{}),brand:x.brand||'',model:x.model||'',material:x.material||'',usage:x.usage||''};
            upd.run(x.hs_code||null,x.customs_name||x.product_name,qty,x.unit||null,unitPrice,amount,x.origin_country||null,x.brand||null,x.model||null,x.material||null,x.usage||null,JSON.stringify(elements),now(),x.id,old.id);
            if(x.product_id&&b.sync_product_master){
              db.prepare('UPDATE products SET hs_code=?,customs_name=?,origin_country=?,declaration_elements=?,updated_at=? WHERE id=?').run(x.hs_code||null,x.customs_name||null,x.origin_country||null,JSON.stringify(elements),now(),x.product_id);
            }
          }
          if(!(Array.isArray(b.items)&&b.items.length)) total=Number(db.prepare('SELECT COALESCE(SUM(total_value),0) v FROM customs_declaration_items WHERE declaration_id=?').get(old.id).v||0);
          db.prepare('UPDATE customs_declarations SET total_value=?,updated_at=? WHERE id=?').run(total,now(),old.id);
          db.exec('COMMIT');
        }catch(e){db.exec('ROLLBACK');throw e;}
        audit(user,'update','customs_declaration',old.id,req,{sync_product_master:!!b.sync_product_master});
        return json(res,200,db.prepare('SELECT * FROM customs_declarations WHERE id=?').get(old.id));
      }

      const cstatus=p.match(/^\/api\/workflows\/customs\/([0-9a-f-]+)\/status$/);
      if(cstatus&&req.method==='POST'){
        const d=db.prepare('SELECT cd.*,o.customer_id FROM customs_declarations cd JOIN orders o ON o.id=cd.order_id WHERE cd.id=?').get(cstatus[1]);if(!d)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,d.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),next=String(b.status||''),allowed=['draft','reviewed','ready','submitted','cleared','rejected'];
        if(!allowed.includes(next))return json(res,400,{error:'invalid_status'});
        db.prepare('UPDATE customs_declarations SET status=?,updated_at=? WHERE id=?').run(next,now(),d.id);
        audit(user,'change_status','customs_declaration',d.id,req,{from:d.status,to:next,note:b.note||null,recorded_only:true});
        return json(res,200,db.prepare('SELECT * FROM customs_declarations WHERE id=?').get(d.id));
      }

      const cdoc=p.match(/^\/api\/workflows\/customs\/([0-9a-f-]+)\/generate-data-sheet$/);
      if(cdoc&&req.method==='POST'){
        const d=db.prepare('SELECT cd.*,o.customer_id FROM customs_declarations cd JOIN orders o ON o.id=cd.order_id WHERE cd.id=?').get(cdoc[1]);if(!d)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,d.customer_id))return json(res,403,{error:'forbidden'});
        const order=db.prepare('SELECT * FROM orders WHERE id=?').get(d.order_id),customer=db.prepare('SELECT * FROM customers WHERE id=?').get(order.customer_id),items=db.prepare('SELECT * FROM customs_declaration_items WHERE declaration_id=?').all(d.id),shipment=d.shipment_id?db.prepare('SELECT * FROM shipments WHERE id=?').get(d.shipment_id):null;
        const html=renderCustomsDataSheet(d,order,customer,items,shipment),count=db.prepare("SELECT COUNT(*) c FROM documents WHERE entity_type='customs' AND entity_id=? AND category='CUSTOMS_DATA'").get(d.id).c,version=`V${Number(count)+1}`,docId=randomUUID(),name=`CUSTOMS_DATA_${d.declaration_no}_${version}.html`;
        db.prepare('INSERT INTO documents(id,entity_type,entity_id,category,name,version,content_base64,mime_type,notes,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(docId,'customs',d.id,'CUSTOMS_DATA',name,version,Buffer.from(html,'utf8').toString('base64'),'text/html','Internal draft/data sheet only — not official customs filing',user.user_id,now());
        audit(user,'generate_document','documents',docId,req,{customs_declaration_id:d.id,type:'CUSTOMS_DATA'});
        return json(res,201,{id:docId,name,version,mime_type:'text/html'});
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

    // ---- Contract workbench / versioning ----
    {
      if(p==='/api/workflows/contracts' && req.method==='POST'){
        const b=await body(req),customerId=String(b.customer_id||'');if(!customerId)return json(res,400,{error:'customer_required'});
        const customer=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(customerId);if(!customer)return json(res,404,{error:'customer_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,customerId))return json(res,403,{error:'forbidden'});
        if(!canWriteResource(user.role,'contracts'))return json(res,403,{error:'forbidden'});
        const id=randomUUID(),no=makeNo('CT'),amount=Number(b.amount||0),currency=b.currency||'USD',terms=b.terms||'';
        db.prepare('INSERT INTO contracts(id,contract_no,customer_id,quotation_id,amount,currency,effective_from,effective_to,status,terms,attachments,current_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,no,customerId,b.quotation_id||null,amount,currency,b.effective_from||null,b.effective_to||null,'draft',terms,'[]',1,now(),now());
        db.prepare('INSERT INTO contract_versions(id,contract_id,version,amount,currency,effective_from,effective_to,terms,snapshot,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),id,1,amount,currency,b.effective_from||null,b.effective_to||null,terms,JSON.stringify({manual:true}),user.user_id,now());
        audit(user,'create','contracts',id,req,{manual:true});return json(res,201,db.prepare('SELECT * FROM contracts WHERE id=?').get(id));
      }

      const qcontract=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/to-contract$/);
      if(qcontract&&req.method==='POST'){
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qcontract[1]);if(!q)return json(res,404,{error:'quotation_not_found'});
        if(!['approved','sent','accepted'].includes(q.status))return json(res,409,{error:'quotation_not_approved'});
        if(scopedRole(user)&&!customerOwnedBy(user,q.customer_id))return json(res,403,{error:'forbidden'});
        const existing=db.prepare('SELECT * FROM contracts WHERE quotation_id=? ORDER BY created_at DESC LIMIT 1').get(q.id);
        if(existing)return json(res,200,existing);
        const b=await body(req),id=randomUUID(),no=makeNo('CT'),terms=b.terms||q.payment_terms||'';
        db.prepare('INSERT INTO contracts(id,contract_no,customer_id,quotation_id,amount,currency,effective_from,effective_to,status,terms,attachments,current_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id,no,q.customer_id,q.id,q.total,q.currency,b.effective_from||null,b.effective_to||null,'draft',terms,'[]',1,now(),now());
        db.prepare('INSERT INTO contract_versions(id,contract_id,version,amount,currency,effective_from,effective_to,terms,snapshot,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),id,1,q.total,q.currency,b.effective_from||null,b.effective_to||null,terms,JSON.stringify({quotation_id:q.id,quote_no:q.quote_no,quotation_version:q.version}),user.user_id,now());
        audit(user,'create_contract_from_quotation','contracts',id,req,{quotation_id:q.id});
        return json(res,201,db.prepare('SELECT * FROM contracts WHERE id=?').get(id));
      }

      const cfull=p.match(/^\/api\/workflows\/contracts\/([0-9a-f-]+)\/full$/);
      if(cfull&&req.method==='GET'){
        const c=db.prepare('SELECT ct.*,cu.name customer_name,cu.english_name customer_english_name,q.quote_no FROM contracts ct JOIN customers cu ON cu.id=ct.customer_id LEFT JOIN quotations q ON q.id=ct.quotation_id WHERE ct.id=?').get(cfull[1]);
        if(!c)return json(res,404,{error:'contract_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,c.customer_id))return json(res,403,{error:'forbidden'});
        const versions=db.prepare('SELECT cv.*,u.display_name created_by_name FROM contract_versions cv LEFT JOIN users u ON u.id=cv.created_by WHERE cv.contract_id=? ORDER BY cv.version DESC').all(c.id).map(v=>({...v,snapshot:parseJSON(v.snapshot,{})}));
        const orders=db.prepare('SELECT * FROM orders WHERE contract_id=? ORDER BY created_at DESC').all(c.id);
        const documents=db.prepare("SELECT * FROM documents WHERE entity_type='contract' AND entity_id=? ORDER BY created_at DESC").all(c.id);
        return json(res,200,{...c,versions,orders,documents});
      }

      const cver=p.match(/^\/api\/workflows\/contracts\/([0-9a-f-]+)\/new-version$/);
      if(cver&&req.method==='POST'){
        const c=db.prepare('SELECT * FROM contracts WHERE id=?').get(cver[1]);if(!c)return json(res,404,{error:'contract_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,c.customer_id))return json(res,403,{error:'forbidden'});
        if(!canWriteResource(user.role,'contracts'))return json(res,403,{error:'forbidden'});
        const b=await body(req),next=Number(c.current_version||1)+1;
        const amount=b.amount===undefined?c.amount:Number(b.amount),currency=b.currency||c.currency,effectiveFrom=b.effective_from===undefined?c.effective_from:(b.effective_from||null),effectiveTo=b.effective_to===undefined?c.effective_to:(b.effective_to||null),terms=b.terms===undefined?c.terms:b.terms;
        db.prepare("UPDATE contracts SET amount=?,currency=?,effective_from=?,effective_to=?,terms=?,current_version=?,status='draft',updated_at=? WHERE id=?").run(amount,currency,effectiveFrom,effectiveTo,terms,next,now(),c.id);
        db.prepare('INSERT INTO contract_versions(id,contract_id,version,amount,currency,effective_from,effective_to,terms,snapshot,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),c.id,next,amount,currency,effectiveFrom,effectiveTo,terms,JSON.stringify({previous_version:c.current_version||1}),user.user_id,now());
        audit(user,'new_version','contracts',c.id,req,{version:next});return json(res,201,db.prepare('SELECT * FROM contracts WHERE id=?').get(c.id));
      }

      const cstatus=p.match(/^\/api\/workflows\/contracts\/([0-9a-f-]+)\/status$/);
      if(cstatus&&req.method==='POST'){
        const c=db.prepare('SELECT * FROM contracts WHERE id=?').get(cstatus[1]);if(!c)return json(res,404,{error:'contract_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,c.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),next=String(b.status||''),allowed=['draft','pending_signature','signed','active','expired','terminated'];
        if(!allowed.includes(next))return json(res,400,{error:'invalid_status'});
        const signedAt=next==='signed'||next==='active'?(b.signed_at||c.signed_at||now()):c.signed_at;
        db.prepare('UPDATE contracts SET status=?,signed_at=?,updated_at=? WHERE id=?').run(next,signedAt,now(),c.id);
        audit(user,'change_status','contracts',c.id,req,{from:c.status,to:next});return json(res,200,db.prepare('SELECT * FROM contracts WHERE id=?').get(c.id));
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



    // ---- Customer profile completeness / value / potential insights ----
    {
      const im=p.match(/^\/api\/customers\/([0-9a-f-]+)\/insights$/);
      if(im && req.method==='GET'){
        const customerId=im[1];
        const c=db.prepare('SELECT id FROM customers WHERE id=? AND deleted_at IS NULL').get(customerId); if(!c)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,customerId))return json(res,403,{error:'forbidden'});
        return json(res,200,customerInsights(customerId));
      }
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

    // ---- Brand / customer channel distribution network ----
    if(p==='/api/channel-network' && req.method==='GET'){
      const brandId=String(url.searchParams.get('brand_id')||'');
      const where=brandId?'WHERE n.brand_id=?':'',args=brandId?[brandId]:[];
      const rows=db.prepare(`SELECT n.*,b.name brand_name,up.name upstream_name,down.name downstream_name
        FROM channel_network_links n JOIN brands b ON b.id=n.brand_id
        LEFT JOIN customers up ON up.id=n.upstream_customer_id JOIN customers down ON down.id=n.downstream_customer_id
        ${where} ORDER BY b.name,COALESCE(n.channel_level,999),n.created_at`).all(...args);
      return json(res,200,rows);
    }
    if(p==='/api/channel-network/tree' && req.method==='GET'){
      const brandId=String(url.searchParams.get('brand_id')||'');if(!brandId)return json(res,400,{error:'brand_required'});
      const brand=db.prepare('SELECT * FROM brands WHERE id=?').get(brandId);if(!brand)return json(res,404,{error:'brand_not_found'});
      const edges=db.prepare(`SELECT n.*,up.name upstream_name,down.name downstream_name FROM channel_network_links n
        LEFT JOIN customers up ON up.id=n.upstream_customer_id JOIN customers down ON down.id=n.downstream_customer_id WHERE n.brand_id=? ORDER BY COALESCE(n.channel_level,999),n.created_at`).all(brandId);
      const byParent=new Map();for(const e of edges){const k=e.upstream_customer_id||'ROOT';if(!byParent.has(k))byParent.set(k,[]);byParent.get(k).push(e);}
      const walk=(parentId,seen=new Set())=>(byParent.get(parentId||'ROOT')||[]).filter(e=>!seen.has(e.downstream_customer_id)).map(e=>{const next=new Set(seen);next.add(e.downstream_customer_id);return {id:e.downstream_customer_id,label:e.downstream_name,edge:e,children:walk(e.downstream_customer_id,next)};});
      return json(res,200,{brand:{id:brand.id,name:brand.name},tree:walk(null),edges});
    }
    if(p==='/api/channel-network' && req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),brandId=String(b.brand_id||''),down=String(b.downstream_customer_id||''),up=b.upstream_customer_id?String(b.upstream_customer_id):null;
      if(!brandId||!down)return json(res,400,{error:'brand_and_downstream_required'});
      if(up&&up===down)return json(res,400,{error:'self_reference'});
      if(!db.prepare('SELECT 1 FROM brands WHERE id=?').get(brandId)||!db.prepare('SELECT 1 FROM customers WHERE id=? AND deleted_at IS NULL').get(down))return json(res,404,{error:'not_found'});
      if(up&&!db.prepare('SELECT 1 FROM customers WHERE id=? AND deleted_at IS NULL').get(up))return json(res,404,{error:'upstream_not_found'});
      if(up){
        const edges=db.prepare('SELECT upstream_customer_id,downstream_customer_id FROM channel_network_links WHERE brand_id=?').all(brandId);
        const children=new Map();for(const e of edges){if(!children.has(e.upstream_customer_id))children.set(e.upstream_customer_id,[]);children.get(e.upstream_customer_id).push(e.downstream_customer_id);}
        const stack=[down],seen=new Set();while(stack.length){const cur=stack.pop();if(cur===up)return json(res,409,{error:'channel_cycle'});if(seen.has(cur))continue;seen.add(cur);for(const x of (children.get(cur)||[]))stack.push(x);}
      }
      const id=randomUUID();db.prepare('INSERT INTO channel_network_links(id,brand_id,upstream_customer_id,downstream_customer_id,relationship_type,channel_level,territory,exclusive,start_date,end_date,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,brandId,up,down,b.relationship_type||'distributor',b.channel_level==null?null:Number(b.channel_level),b.territory||null,b.exclusive?1:0,b.start_date||null,b.end_date||null,b.status||'active',b.notes||null,now(),now());
      audit(user,'create','channel_network',id,req,{brand_id:brandId,upstream_customer_id:up,downstream_customer_id:down});return json(res,201,db.prepare('SELECT * FROM channel_network_links WHERE id=?').get(id));
    }
    {
      const cn=p.match(/^\/api\/channel-network\/([0-9a-f-]+)$/);
      if(cn&&req.method==='PATCH'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM channel_network_links WHERE id=?').get(cn[1]);if(!old)return json(res,404,{error:'not_found'});
        const b=await body(req);db.prepare('UPDATE channel_network_links SET relationship_type=?,channel_level=?,territory=?,exclusive=?,start_date=?,end_date=?,status=?,notes=?,updated_at=? WHERE id=?')
          .run(b.relationship_type??old.relationship_type,b.channel_level===undefined?old.channel_level:(b.channel_level==null?null:Number(b.channel_level)),b.territory===undefined?old.territory:(b.territory||null),b.exclusive===undefined?old.exclusive:(b.exclusive?1:0),b.start_date===undefined?old.start_date:(b.start_date||null),b.end_date===undefined?old.end_date:(b.end_date||null),b.status??old.status,b.notes===undefined?old.notes:(b.notes||null),now(),old.id);
        audit(user,'update','channel_network',old.id,req,b);return json(res,200,db.prepare('SELECT * FROM channel_network_links WHERE id=?').get(old.id));
      }
      if(cn&&req.method==='DELETE'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const old=db.prepare('SELECT * FROM channel_network_links WHERE id=?').get(cn[1]);if(!old)return json(res,404,{error:'not_found'});
        db.prepare('DELETE FROM channel_network_links WHERE id=?').run(old.id);audit(user,'delete','channel_network',old.id,req);return json(res,200,{ok:true});
      }
    }

    // ---- Customer ownership, tags and duplicate/collision protection ----
    if(p==='/api/users/lookup' && req.method==='GET'){
      return json(res,200,db.prepare(`SELECT u.id,u.username,u.display_name,u.role,u.department_id,u.data_scope,d.name department_name FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.enabled=1 ORDER BY u.display_name`).all().map(x=>({...x,data_scope:x.data_scope||defaultDataScope(x.role)})));
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
        db.prepare("UPDATE customers SET owner_id=?,pool_status='assigned',pool_entered_at=NULL,pool_reason=NULL,updated_at=? WHERE id=?").run(ownerId,now(),transfer[1]);
        audit(user,'transfer_owner','customers',transfer[1],req,{from:before.owner_id,to:ownerId});
        return json(res,200,{ok:true,owner});
      }
    }


    // ---- Customer collaborators + public pool ----
    {
      const collab=p.match(/^\/api\/customers\/([0-9a-f-]+)\/collaborators$/);
      if(collab&&req.method==='GET'){
        const cid=collab[1];if(scopedRole(user)&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
        return json(res,200,db.prepare(`SELECT cc.user_id,u.username,u.display_name,u.role,cc.added_by,cc.created_at
          FROM customer_collaborators cc JOIN users u ON u.id=cc.user_id WHERE cc.customer_id=? ORDER BY u.display_name`).all(cid));
      }
      if(collab&&req.method==='POST'){
        const cid=collab[1],c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(cid);if(!c)return json(res,404,{error:'not_found'});
        if(!['admin','manager'].includes(user.role)&&c.owner_id!==user.user_id)return json(res,403,{error:'forbidden'});
        const b=await body(req),uid=String(b.user_id||'');if(!uid||uid===c.owner_id)return json(res,400,{error:'invalid_collaborator'});
        const target=db.prepare("SELECT id FROM users WHERE id=? AND enabled=1").get(uid);if(!target)return json(res,400,{error:'invalid_user'});
        db.prepare('INSERT OR IGNORE INTO customer_collaborators(customer_id,user_id,added_by,created_at) VALUES(?,?,?,?)').run(cid,uid,user.user_id,now());
        audit(user,'add_collaborator','customers',cid,req,{user_id:uid});return json(res,201,{ok:true});
      }
      const collabDel=p.match(/^\/api\/customers\/([0-9a-f-]+)\/collaborators\/([0-9a-f-]+)$/);
      if(collabDel&&req.method==='DELETE'){
        const cid=collabDel[1],c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(cid);if(!c)return json(res,404,{error:'not_found'});
        if(!['admin','manager'].includes(user.role)&&c.owner_id!==user.user_id)return json(res,403,{error:'forbidden'});
        db.prepare('DELETE FROM customer_collaborators WHERE customer_id=? AND user_id=?').run(cid,collabDel[2]);
        audit(user,'remove_collaborator','customers',cid,req,{user_id:collabDel[2]});return json(res,200,{ok:true});
      }

      const release=p.match(/^\/api\/customers\/([0-9a-f-]+)\/release-to-pool$/);
      if(release&&req.method==='POST'){
        const cid=release[1],c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(cid);if(!c)return json(res,404,{error:'not_found'});
        if(!['admin','manager'].includes(user.role)&&c.owner_id!==user.user_id)return json(res,403,{error:'forbidden'});
        const b=await body(req),force=!!b.force;
        if(hasActiveCustomerBusiness(cid)&&!(force&&['admin','manager'].includes(user.role)))return json(res,409,{error:'active_business_exists'});
        const updated=moveCustomerToPool(cid,b.reason||'manual_release',user.user_id);audit(user,'release_to_pool','customers',cid,req,{reason:b.reason||'manual_release',force});return json(res,200,updated);
      }
    }

    if(p==='/api/public-pool'&&req.method==='GET'){
      const page=Math.max(1,Number(url.searchParams.get('page')||1)),size=Math.min(200,Math.max(1,Number(url.searchParams.get('size')||50))),offset=(page-1)*size;
      const q=String(url.searchParams.get('q')||'').trim(),args=[],filters=["c.deleted_at IS NULL","c.pool_status='public'","c.owner_id IS NULL"];
      if(q){filters.push('(c.name LIKE ? OR c.english_name LIKE ? OR c.country LIKE ? OR c.industry LIKE ?)');const like=`%${q}%`;args.push(like,like,like,like);}
      const where=filters.join(' AND '),total=db.prepare(`SELECT COUNT(*) c FROM customers c WHERE ${where}`).get(...args).c;
      const data=db.prepare(`SELECT c.*, (SELECT MAX(a.occurred_at) FROM activities a WHERE a.customer_id=c.id) last_activity
        FROM customers c WHERE ${where} ORDER BY c.pool_entered_at DESC LIMIT ? OFFSET ?`).all(...args,size,offset).map(r=>decodeRow(r,resourceMap.customers));
      return json(res,200,{data,total,page,size});
    }
    if(p==='/api/public-pool/rule'&&req.method==='GET')return json(res,200,getPublicPoolRule());
    if(p==='/api/public-pool/rule'&&req.method==='PATCH'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const old=getPublicPoolRule(),b=await body(req),next={...old,...b,inactive_days:Math.max(1,Number(b.inactive_days??old.inactive_days))};
      db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('public_pool_rule',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify(next),now());
      audit(user,'update','public_pool_rule',null,req,next);return json(res,200,next);
    }
    {
      const claim=p.match(/^\/api\/public-pool\/([0-9a-f-]+)\/claim$/);
      if(claim&&req.method==='POST'){
        if(!['admin','manager','sales'].includes(user.role))return json(res,403,{error:'forbidden'});
        const c=db.prepare("SELECT * FROM customers WHERE id=? AND deleted_at IS NULL AND pool_status='public' AND owner_id IS NULL").get(claim[1]);if(!c)return json(res,409,{error:'not_available'});
        const b=await body(req),targetOwner=['admin','manager'].includes(user.role)&&b.owner_id?String(b.owner_id):user.user_id;
        const owner=db.prepare("SELECT id,display_name,role FROM users WHERE id=? AND enabled=1").get(targetOwner);if(!owner)return json(res,400,{error:'invalid_owner'});
        const changed=db.prepare("UPDATE customers SET owner_id=?,pool_status='assigned',pool_entered_at=NULL,pool_reason=NULL,updated_at=? WHERE id=? AND owner_id IS NULL AND pool_status='public'").run(targetOwner,now(),c.id);
        if(!changed.changes)return json(res,409,{error:'already_claimed'});
        db.prepare('INSERT INTO public_pool_events(id,customer_id,action,from_owner_id,to_owner_id,reason,operated_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),c.id,'claim',null,targetOwner,'claim',user.user_id,now());
        audit(user,'claim_from_pool','customers',c.id,req,{owner_id:targetOwner});return json(res,200,{ok:true,owner});
      }
    }
    if(p==='/api/public-pool/run-recycle'&&req.method==='POST'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const rule=getPublicPoolRule();if(!rule.enabled)return json(res,200,{enabled:false,recycled:0});
      const cutoff=new Date(Date.now()-Number(rule.inactive_days||90)*86400000).toISOString(),statuses=Array.isArray(rule.eligible_statuses)&&rule.eligible_statuses.length?rule.eligible_statuses:['potential','contacted','following','dormant'],protect=new Set(Array.isArray(rule.protect_grades)?rule.protect_grades:[]);
      const placeholders=statuses.map(()=>'?').join(',');
      const candidates=db.prepare(`SELECT c.*,COALESCE(MAX(a.occurred_at),c.created_at) last_touch FROM customers c
        LEFT JOIN activities a ON a.customer_id=c.id
        WHERE c.deleted_at IS NULL AND c.owner_id IS NOT NULL AND COALESCE(c.pool_status,'assigned')!='public' AND c.status IN (${placeholders})
        GROUP BY c.id HAVING COALESCE(MAX(a.occurred_at),c.created_at)<?`).all(...statuses,cutoff);
      let recycled=0,skipped_active=0,skipped_protected=0;
      for(const c of candidates){
        if(protect.has(c.grade)){skipped_protected++;continue;}
        if(hasActiveCustomerBusiness(c.id)){skipped_active++;continue;}
        moveCustomerToPool(c.id,`inactive_${rule.inactive_days}_days`,user.user_id);recycled++;
      }
      audit(user,'run_recycle','public_pool',null,req,{recycled,skipped_active,skipped_protected,cutoff});
      return json(res,200,{enabled:true,recycled,skipped_active,skipped_protected,cutoff});
    }
    if(p==='/api/public-pool/events'&&req.method==='GET'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      return json(res,200,db.prepare(`SELECT e.*,c.name customer_name,fu.display_name from_owner_name,tu.display_name to_owner_name,ou.display_name operated_by_name
        FROM public_pool_events e JOIN customers c ON c.id=e.customer_id
        LEFT JOIN users fu ON fu.id=e.from_owner_id LEFT JOIN users tu ON tu.id=e.to_owner_id LEFT JOIN users ou ON ou.id=e.operated_by
        ORDER BY e.created_at DESC LIMIT 300`).all());
    }


    // ---- Customer organization hierarchy, merge and contact handover ----
    {
      const org=p.match(/^\/api\/customers\/([0-9a-f-]+)\/organization$/);
      if(org&&req.method==='GET'){
        const cid=org[1],c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(cid);if(!c)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'});
        const parent=c.parent_customer_id?db.prepare('SELECT id,name,english_name,country,organization_role FROM customers WHERE id=? AND deleted_at IS NULL').get(c.parent_customer_id):null;
        const children=db.prepare('SELECT id,name,english_name,country,organization_role,status,grade FROM customers WHERE parent_customer_id=? AND deleted_at IS NULL ORDER BY name').all(cid);
        return json(res,200,{customer:{id:c.id,name:c.name,organization_role:c.organization_role,parent_customer_id:c.parent_customer_id},parent,children});
      }
      if(org&&req.method==='PATCH'){
        const cid=org[1],c=db.prepare('SELECT * FROM customers WHERE id=? AND deleted_at IS NULL').get(cid);if(!c)return json(res,404,{error:'not_found'});
        if(!['admin','manager'].includes(user.role)&&c.owner_id!==user.user_id)return json(res,403,{error:'forbidden'});
        const b=await body(req),parentId=b.parent_customer_id?String(b.parent_customer_id):null;
        if(parentId===cid)return json(res,400,{error:'cannot_parent_self'});
        if(parentId&&!db.prepare('SELECT id FROM customers WHERE id=? AND deleted_at IS NULL').get(parentId))return json(res,400,{error:'invalid_parent'});
        let cursor=parentId,depth=0;
        while(cursor&&depth++<20){if(cursor===cid)return json(res,400,{error:'organization_cycle'});cursor=db.prepare('SELECT parent_customer_id FROM customers WHERE id=?').get(cursor)?.parent_customer_id||null;}
        db.prepare('UPDATE customers SET parent_customer_id=?,organization_role=?,updated_at=? WHERE id=?').run(parentId,b.organization_role||null,now(),cid);
        audit(user,'update_organization','customers',cid,req,{parent_customer_id:parentId,organization_role:b.organization_role||null});return json(res,200,{ok:true});
      }

      const merge=p.match(/^\/api\/customers\/([0-9a-f-]+)\/merge-into\/([0-9a-f-]+)$/);
      if(merge&&req.method==='POST'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        try{const result=mergeCustomers(merge[1],merge[2],user.user_id);audit(user,'merge','customers',merge[2],req,{source_id:merge[1]});return json(res,200,result);}
        catch(e){return json(res,400,{error:String(e?.message||e)});}
      }

      const handover=p.match(/^\/api\/contacts\/([0-9a-f-]+)\/depart$/);
      if(handover&&req.method==='POST'){
        const contact=db.prepare('SELECT * FROM contacts WHERE id=?').get(handover[1]);if(!contact)return json(res,404,{error:'not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,contact.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),successor=b.successor_contact_id?String(b.successor_contact_id):null;
        if(successor){
          const next=db.prepare('SELECT * FROM contacts WHERE id=? AND customer_id=? AND is_departed=0').get(successor,contact.customer_id);
          if(!next)return json(res,400,{error:'invalid_successor'});
        }
        db.prepare('UPDATE contacts SET is_departed=1,departed_at=?,successor_contact_id=?,notes=?,updated_at=? WHERE id=?')
          .run(b.departed_at||now(),successor,[contact.notes,b.note].filter(Boolean).join('\n'),now(),contact.id);
        const successorName=successor?db.prepare('SELECT name FROM contacts WHERE id=?').get(successor)?.name:null;
        db.prepare('INSERT INTO activities(id,customer_id,contact_id,type,subject,content,result,next_action,occurred_at,created_by,attachments,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(randomUUID(),contact.customer_id,contact.id,'system','联系人离职交接',`${contact.name} 已标记离职${successorName?`，后续联系人：${successorName}`:''}`,b.note||null,successorName?`后续联系 ${successorName}`:null,b.departed_at||now(),user.user_id,'[]',now());
        audit(user,'depart','contacts',contact.id,req,{successor_contact_id:successor});return json(res,200,db.prepare('SELECT * FROM contacts WHERE id=?').get(contact.id));
      }
    }

    // ---- Inquiry assignment / first-response SLA / opportunity loss closure ----
    if(p==='/api/inquiries/sla-dashboard' && req.method==='GET'){
      const rule=getRule('inquiry_response_sla'),hours=Number(rule?.config?.hours||4);
      const access=customerScopeClause(user,'c');
      const rows=db.prepare(`SELECT i.*,c.name customer_name,u.display_name owner_name
        FROM inquiries i JOIN customers c ON c.id=i.customer_id LEFT JOIN users u ON u.id=i.owner_id
        WHERE c.deleted_at IS NULL${access.sql} ORDER BY i.received_at DESC LIMIT 500`).all(...access.args).map(x=>inquirySlaInfo(decodeRow(x,resourceMap.inquiries),hours));
      const responded=rows.filter(x=>x.first_response_at),breached=rows.filter(x=>x.sla_status==='breached').length,overdue=rows.filter(x=>x.sla_status==='overdue').length;
      const avg=responded.length?Math.round(responded.reduce((a,x)=>a+Number(x.response_minutes||0),0)/responded.length):0;
      return json(res,200,{sla_hours:hours,summary:{total:rows.length,responded:responded.length,breached,overdue,avg_response_minutes:avg},rows});
    }
    {
      const respond=p.match(/^\/api\/workflows\/inquiries\/([0-9a-f-]+)\/respond$/);
      if(respond && req.method==='POST'){
        const inquiry=db.prepare('SELECT * FROM inquiries WHERE id=?').get(respond[1]);if(!inquiry)return json(res,404,{error:'inquiry_not_found'});
        if(scopedRole(user)&&inquiry.owner_id!==user.user_id&&!customerOwnedBy(user,inquiry.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),responseAt=b.response_at||now();
        db.prepare("UPDATE inquiries SET first_response_at=COALESCE(first_response_at,?),status=CASE WHEN status='new' THEN 'contacted' ELSE status END,updated_at=? WHERE id=?").run(responseAt,now(),inquiry.id);
        const row=db.prepare('SELECT * FROM inquiries WHERE id=?').get(inquiry.id),hours=Number(getRule('inquiry_response_sla')?.config?.hours||4);
        audit(user,'first_response','inquiries',inquiry.id,req,{response_at:responseAt});
        return json(res,200,inquirySlaInfo(decodeRow(row,resourceMap.inquiries),hours));
      }
      const stage=p.match(/^\/api\/workflows\/opportunities\/([0-9a-f-]+)\/stage$/);
      if(stage && req.method==='POST'){
        const op=db.prepare('SELECT * FROM opportunities WHERE id=?').get(stage[1]);if(!op)return json(res,404,{error:'opportunity_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,op.customer_id))return json(res,403,{error:'forbidden'});
        const b=await body(req),next=String(b.stage||''),allowed=['qualification','solution','quotation','sample','negotiation','won','lost'];
        if(!allowed.includes(next))return json(res,400,{error:'invalid_stage'});
        const lossReason=String(b.loss_reason||op.loss_reason||'').trim();
        if(next==='lost'&&!lossReason)return json(res,400,{error:'loss_reason_required'});
        const probability=next==='won'?100:next==='lost'?0:Number(b.probability??op.probability??0);
        db.prepare('UPDATE opportunities SET stage=?,probability=?,loss_reason=?,updated_at=? WHERE id=?').run(next,probability,next==='lost'?lossReason:null,now(),op.id);
        audit(user,'change_stage','opportunities',op.id,req,{from:op.stage,to:next,loss_reason:next==='lost'?lossReason:null});
        return json(res,200,db.prepare('SELECT * FROM opportunities WHERE id=?').get(op.id));
      }
    }

    // ---- Quotation conditional approval policy ----
    if(p==='/api/quotations/approval-policy' && req.method==='GET'){
      return json(res,200,getQuotationApprovalPolicy());
    }
    if(p==='/api/quotations/approval-policy' && req.method==='PUT'){
      if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
      const b=await body(req),policy={
        min_margin_rate:Math.max(0,Number(b.min_margin_rate??20)),
        max_discount_percent:Math.max(0,Number(b.max_discount_percent??10)),
        special_payment_keywords:Array.isArray(b.special_payment_keywords)?b.special_payment_keywords.map(String).filter(Boolean):['OA','D/P','D/A'],
        block_below_floor_price:b.block_below_floor_price!==false
      };
      db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('quotation_approval_policy',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify(policy),now());
      audit(user,'update','quotation_approval_policy','quotation_approval_policy',req,policy);return json(res,200,policy);
    }
    {
      const ev=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/evaluation$/);
      if(ev&&req.method==='GET'){
        const result=evaluateQuotationApproval(ev[1]);if(!result)return json(res,404,{error:'quotation_not_found'});
        if(scopedRole(user)&&!customerOwnedBy(user,result.quotation.customer_id))return json(res,403,{error:'forbidden'});
        const history=db.prepare('SELECT qa.*,u1.display_name submitted_by_name,u2.display_name decided_by_name FROM quotation_approvals qa LEFT JOIN users u1 ON u1.id=qa.submitted_by LEFT JOIN users u2 ON u2.id=qa.decided_by WHERE qa.quotation_id=? ORDER BY qa.submitted_at DESC').all(ev[1]).map(x=>({...x,reasons:parseJSON(x.reasons,[])}));
        return json(res,200,{...result,history});
      }
      const reject=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/reject$/);
      if(reject&&req.method==='POST'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(reject[1]);if(!q)return json(res,404,{error:'quotation_not_found'});
        const b=await body(req);db.prepare("UPDATE quotations SET status='rejected',updated_at=? WHERE id=?").run(now(),q.id);
        db.prepare("UPDATE quotation_approvals SET status='rejected',decided_by=?,comment=?,decided_at=? WHERE quotation_id=? AND status='pending'").run(user.user_id,b.comment||null,now(),q.id);
        audit(user,'reject','quotations',q.id,req,{comment:b.comment||null});return json(res,200,db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id));
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
        if(!q)return json(res,404,{error:'quotation_not_found'});
        if(q.status!=='draft'&&q.status!=='rejected')return json(res,409,{error:'quotation_not_draft'});
        if(scopedRole(user)&&!customerOwnedBy(user,q.customer_id))return json(res,403,{error:'forbidden'});
        const evaluation=evaluateQuotationApproval(q.id);
        if(evaluation.blocked)return json(res,409,{error:'below_floor_price',evaluation});
        if(evaluation.requires_approval){
          db.prepare("UPDATE quotations SET status='pending_approval',updated_at=? WHERE id=?").run(now(),q.id);
          db.prepare('INSERT INTO quotation_approvals(id,quotation_id,status,reasons,submitted_by,submitted_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),q.id,'pending',JSON.stringify(evaluation.reasons),user.user_id,now());
          audit(user,'submit_approval','quotations',q.id,req,{reasons:evaluation.reasons});
          return json(res,200,{quotation:db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id),evaluation,auto_approved:false});
        }
        db.prepare("UPDATE quotations SET status='approved',updated_at=? WHERE id=?").run(now(),q.id);
        audit(user,'auto_approve','quotations',q.id,req,{reason:'no_approval_rule_triggered'});
        return json(res,200,{quotation:db.prepare('SELECT * FROM quotations WHERE id=?').get(q.id),evaluation,auto_approved:true});
      }

      const qapprove=p.match(/^\/api\/workflows\/quotations\/([0-9a-f-]+)\/approve$/);
      if(qapprove && req.method==='POST'){
        if(!['admin','manager'].includes(user.role))return json(res,403,{error:'forbidden'});
        const q=db.prepare('SELECT * FROM quotations WHERE id=?').get(qapprove[1]);if(!q)return json(res,404,{error:'quotation_not_found'});
        if(q.status!=='pending_approval')return json(res,409,{error:'quotation_not_pending'});
        const b=await body(req);
        db.prepare("UPDATE quotations SET status='approved',updated_at=? WHERE id=?").run(now(),q.id);
        db.prepare("UPDATE quotation_approvals SET status='approved',decided_by=?,comment=?,decided_at=? WHERE quotation_id=? AND status='pending'").run(user.user_id,b.comment||null,now(),q.id);
        audit(user,'approve','quotations',q.id,req,{comment:b.comment||null});
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
        const filters=[]; const args=[]; if(customerId && tableCols(table).includes('customer_id')){filters.push('customer_id=?');args.push(customerId);} if(contactId&&tableCols(table).includes('contact_id')){filters.push('contact_id=?');args.push(contactId);} if(orderId&&tableCols(table).includes('order_id')){filters.push('order_id=?');args.push(orderId);} if(scopedRole(user)){
          const deptScope=userDataScope(user)==='department'&&user.department_id;
          const accessibleCustomerSql=deptScope
            ?"SELECT c.id FROM customers c LEFT JOIN users ou ON ou.id=c.owner_id WHERE c.deleted_at IS NULL AND (c.owner_id=? OR ou.department_id=? OR EXISTS(SELECT 1 FROM customer_collaborators cc WHERE cc.customer_id=c.id AND cc.user_id=?))"
            :"SELECT c.id FROM customers c WHERE c.deleted_at IS NULL AND (c.owner_id=? OR EXISTS(SELECT 1 FROM customer_collaborators cc WHERE cc.customer_id=c.id AND cc.user_id=?))";
          const scopeArgs=deptScope?[user.user_id,user.department_id,user.user_id]:[user.user_id,user.user_id];
          if(table==='customers'){filters.push(`id IN (${accessibleCustomerSql})`);args.push(...scopeArgs);}
          else if(tableCols(table).includes('customer_id')){filters.push(`customer_id IN (${accessibleCustomerSql})`);args.push(...scopeArgs);}
          else if(key==='channels'){filters.push(`contact_id IN (SELECT ct.id FROM contacts ct WHERE ct.customer_id IN (${accessibleCustomerSql}))`);args.push(...scopeArgs);}
          else if(key==='quotationItems'){filters.push(`quotation_id IN (SELECT q.id FROM quotations q WHERE q.customer_id IN (${accessibleCustomerSql}))`);args.push(...scopeArgs);}
          else if(key==='orderItems'){filters.push(`order_id IN (SELECT o.id FROM orders o WHERE o.customer_id IN (${accessibleCustomerSql}))`);args.push(...scopeArgs);}
          else if(key==='shipments'){filters.push(`order_id IN (SELECT o.id FROM orders o WHERE o.customer_id IN (${accessibleCustomerSql}))`);args.push(...scopeArgs);}
        } if(table==='customers'){filters.push('deleted_at IS NULL'); const exacts=['owner_id','country','status','grade','source','industry']; for(const k of exacts){const v=url.searchParams.get(k);if(v){filters.push(`${k}=?`);args.push(v);}} const customerType=url.searchParams.get('customer_type'); if(customerType){filters.push('customer_types LIKE ?');args.push(`%"${customerType}"%`);} if(tagId){filters.push('EXISTS (SELECT 1 FROM customer_tags ct WHERE ct.customer_id=customers.id AND ct.tag_id=?)');args.push(tagId);}}
        const where=filters.length?`WHERE ${filters.join(' AND ')}`:''; let total=db.prepare(`SELECT COUNT(*) c FROM ${table} ${where}`).get(...args).c; let data=db.prepare(`SELECT * FROM ${table} ${where} ORDER BY ${tableCols(table).includes('updated_at')?'updated_at':'rowid'} DESC LIMIT ? OFFSET ?`).all(...args,size,offset).map(r=>protectRow(key,decodeRow(r,cfg),user)); if(key==='customFields'){data=data.filter(r=>customFieldVisible(r,user.role));total=data.length;} return json(res,200,{data,total,page,size});
      }
      if(req.method==='GET' && id){ const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id); if(!row)return json(res,404,{error:'not_found'}); const cid=key==='customers'?row.id:resourceCustomerId(key,id,true); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); return json(res,200,protectRow(key,decodeRow(row,cfg),user)); }
      if(req.method==='POST' && !id){
        const b=await body(req), payload=sanitizePayload(cfg,b,true); if(table==='customers'){ const cf=applyCustomerCustomFieldRules(b.custom_fields||{},user.role,null,{}); payload.custom_fields=JSON.stringify(cf); if(!['admin','manager'].includes(user.role)) payload.owner_id=user.user_id; else if(!payload.owner_id) payload.owner_id=user.user_id; if(tableCols(table).includes('pool_status'))payload.pool_status='assigned'; } else if(table==='inquiries'){ if(!payload.owner_id) payload.owner_id=chooseInquiryOwner(payload.customer_id,user.user_id); const cid=resourceCustomerId(key,payload,false); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); } else { const cid=resourceCustomerId(key,payload,false); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); } const newId=randomUUID(), cols=['id',...Object.keys(payload)], vals=[newId,...Object.values(payload)]; if(tableCols(table).includes('created_at')){cols.push('created_at');vals.push(now());} if(tableCols(table).includes('updated_at')){cols.push('updated_at');vals.push(now());}
        if(table==='inquiries' && !payload.inquiry_no){cols.push('inquiry_no');vals.push(makeNo('INQ'));} if(table==='quotations'&&!payload.quote_no){cols.push('quote_no');vals.push(makeNo('QT'));} if(table==='contracts'&&!payload.contract_no){cols.push('contract_no');vals.push(makeNo('CT'));} if(table==='orders'&&!payload.order_no){cols.push('order_no');vals.push(makeNo('SO'));} if(table==='aftersales'){if(!payload.ticket_no){cols.push('ticket_no');vals.push(makeNo('AS'));} if(!payload.opened_at){const opened=now();cols.push('opened_at');vals.push(opened);if(tableCols(table).includes('sla_due_at')){cols.push('sla_due_at');vals.push(aftersalesSlaDue(payload.severity||'normal',opened));}}}
        if(table==='users'){
          const password=String(b.password||'');assertStrongPassword(password,payload.username||'');
          cols.push('password_hash');vals.push(hashPassword(password));
          cols.push('must_change_password');vals.push(1);
          if(!payload.data_scope){cols.push('data_scope');vals.push(defaultDataScope(payload.role||'sales'));}
        }
        db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...vals); audit(user,'create',key,newId,req,payload); return json(res,201,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(newId),cfg));
      }
      if(req.method==='PATCH' && id){ const cid=key==='customers'?id:resourceCustomerId(key,id,true); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); const b=await body(req), payload=sanitizePayload(cfg,b,false); if(table==='customers'&&b.custom_fields!==undefined){const oldRow=db.prepare('SELECT custom_fields FROM customers WHERE id=?').get(id);const merged=applyCustomerCustomFieldRules(b.custom_fields||{},user.role,id,parseJSON(oldRow?.custom_fields,{}));payload.custom_fields=JSON.stringify(merged);} if(table==='customers' && !['admin','manager'].includes(user.role)) delete payload.owner_id; if(table==='users'){
        if(b.password){
          const target=db.prepare('SELECT username FROM users WHERE id=?').get(id);assertStrongPassword(String(b.password),target?.username||'');
          payload.password_hash=hashPassword(String(b.password));payload.must_change_password=1;payload.password_changed_at=null;
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(id);
        }
        if(payload.data_scope&&!['self','department','all'].includes(payload.data_scope))return json(res,400,{error:'invalid_data_scope'});
      } if(tableCols(table).includes('updated_at')) payload.updated_at=now(); const entries=Object.entries(payload); if(!entries.length) return json(res,400,{error:'no_fields'}); const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); db.prepare(`UPDATE ${table} SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),id); audit(user,'update',key,id,req,payload); return json(res,200,decodeRow(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id),cfg)); }
      if(req.method==='DELETE' && id){ const cid=key==='customers'?id:resourceCustomerId(key,id,true); if(scopedRole(user)&&cid&&!customerOwnedBy(user,cid))return json(res,403,{error:'forbidden'}); const found=db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id); if(!found)return json(res,404,{error:'not_found'}); if(table==='customers') db.prepare('UPDATE customers SET deleted_at=?,updated_at=? WHERE id=?').run(now(),now(),id); else db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); audit(user,'delete',key,id,req); return json(res,200,{ok:true}); }
    }

    return json(res,404,{error:'not_found',path:p});
  } catch(e){ console.error(req.requestId,e); const known=['custom_field_validation_failed','weak_password']; const code=known.includes(e.message)?e.message:'request_failed'; return json(res,400,{error:code,message:e.message,details:e.details||undefined,request_id:req.requestId}); }
});
server.listen(PORT,HOST,()=>console.log(`TradeFlow API listening on http://${HOST}:${PORT}/api`));
