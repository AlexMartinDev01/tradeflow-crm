import {test,expect} from '@playwright/test';
import {createHmac} from 'node:crypto';
import {loginApi,getJson,postJson} from './helpers.mjs';

test.describe.configure({mode:'serial',retries:0});

const APP_SECRET='tradeflow-e2e-secret-2026';
const trackingSig=(kind,recipientId,extra='')=>createHmac('sha256',APP_SECRET).update(`${kind}:${recipientId}:${extra}`).digest('base64url').slice(0,32);

test.describe('TradeFlow high-risk data safety workflows',()=>{
  test('real attachment upload, download, checksum, scope and delete permissions work',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const readonly=await loginApi(request,'demo.readonly');
    const sales=await loginApi(request,'demo.sales01');
    const suffix=Date.now().toString().slice(-8);

    const customer=await postJson(request,'/api/customers',{
      name:'Attachment Safety E2E '+suffix,
      customer_types:['Importer'],
      status:'potential',
      grade:'B',
      country:'Germany',
      source:'E2E Attachment'
    },manager.headers);

    const original='TradeFlow attachment verification '+suffix+'\n';
    const uploaded=await postJson(request,'/api/files/upload',{
      entity_type:'customer',
      entity_id:customer.id,
      category:'acceptance',
      file_name:'acceptance-note.txt',
      mime_type:'text/plain',
      content_base64:Buffer.from(original,'utf8').toString('base64'),
      notes:'Playwright high-risk data safety test'
    },manager.headers);

    expect(uploaded.id).toBeTruthy();
    expect(uploaded.size_bytes).toBe(Buffer.byteLength(original));
    expect(uploaded.checksum).toMatch(/^[a-f0-9]{64}$/);

    const listed=await getJson(request,`/api/files?entity_type=customer&entity_id=${customer.id}`,manager.headers);
    expect(listed.some(x=>x.id===uploaded.id&&x.stored===1)).toBe(true);

    const preview=await request.get('/api/documents/'+uploaded.id+'/preview',{headers:manager.headers});
    expect(preview.status()).toBe(200);
    expect(preview.headers()['content-type']).toContain('text/plain');
    expect(await preview.text()).toBe(original);

    const download=await request.get('/api/documents/'+uploaded.id+'/download',{headers:manager.headers});
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe(original);
    expect(download.headers()['content-disposition']).toContain('attachment');

    const crossScope=await request.get(`/api/files?entity_type=customer&entity_id=${customer.id}`,{headers:sales.headers});
    expect(crossScope.status()).toBe(403);

    const readonlyDelete=await request.delete('/api/files/'+uploaded.id,{headers:readonly.headers});
    expect(readonlyDelete.status()).toBe(403);

    const admin=await loginApi(request,'demo.admin');
    const integrity=await postJson(request,'/api/attachment-backup/verify',{full_checksum:true},admin.headers);
    expect(integrity.ok).toBe(true);

    const removed=await request.delete('/api/files/'+uploaded.id,{headers:manager.headers});
    expect(removed.status()).toBe(200);
    const after=await getJson(request,`/api/files?entity_type=customer&entity_id=${customer.id}`,manager.headers);
    expect(after.some(x=>x.id===uploaded.id)).toBe(false);
  });

  test('soft delete enters recycle bin and a normal deleted customer is restorable',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Recycle Restore E2E '+suffix,
      customer_types:['Distributor'],
      status:'potential',
      grade:'C',
      country:'France',
      source:'E2E Recycle'
    },manager.headers);

    const deleted=await request.delete('/api/customers/'+customer.id,{headers:manager.headers});
    expect(deleted.status()).toBe(200);

    const active=await request.get('/api/customers/'+customer.id,{headers:manager.headers});
    expect(active.status()).toBe(404);

    const recycle=await getJson(request,'/api/recycle-bin/customers?q='+encodeURIComponent('Recycle Restore E2E '+suffix),manager.headers);
    const recycled=recycle.find(x=>x.id===customer.id);
    expect(recycled).toBeTruthy();
    expect(recycled.deleted_reason).toBe('manual_delete');

    const impact=await getJson(request,`/api/recycle-bin/customers/${customer.id}/impact`,manager.headers);
    expect(impact.restorable).toBe(true);

    const restored=await postJson(request,`/api/recycle-bin/customers/${customer.id}/restore`,{},manager.headers);
    expect(restored.id).toBe(customer.id);
    expect(restored.deleted_at).toBeFalsy();

    const visible=await getJson(request,'/api/customers/'+customer.id,manager.headers);
    expect(visible.name).toContain('Recycle Restore E2E');
  });

  test('customer merge moves related contacts and merged source cannot be restored',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const target=await postJson(request,'/api/customers',{
      name:'Merge Target E2E '+suffix,customer_types:['Importer'],status:'following',grade:'A',country:'Italy',source:'E2E Merge'
    },manager.headers);
    const source=await postJson(request,'/api/customers',{
      name:'Merge Source E2E '+suffix,customer_types:['Importer'],status:'potential',grade:'B',country:'Italy',source:'E2E Merge'
    },manager.headers);
    const contact=await postJson(request,'/api/contacts',{
      customer_id:source.id,name:'Merged Contact '+suffix,title:'Buyer',department:'Procurement',role:'Decision Maker',is_primary:1,is_departed:0
    },manager.headers);

    const merged=await postJson(request,`/api/customers/${source.id}/merge-into/${target.id}`,{},manager.headers);
    expect(merged.source_id||source.id).toBeTruthy();

    const targetContacts=await getJson(request,`/api/contacts?customer_id=${target.id}&size=200`,manager.headers);
    expect(targetContacts.data.some(x=>x.id===contact.id)).toBe(true);

    const recycle=await getJson(request,'/api/recycle-bin/customers?q='+encodeURIComponent('Merge Source E2E '+suffix),manager.headers);
    const sourceRow=recycle.find(x=>x.id===source.id);
    expect(sourceRow).toBeTruthy();
    expect(sourceRow.merged_into_id).toBe(target.id);

    const restore=await request.post(`/api/recycle-bin/customers/${source.id}/restore`,{headers:manager.headers,data:{}});
    expect(restore.status()).toBe(409);
    expect((await restore.json()).error).toBe('merged_customer_not_restorable');
  });

  test('public-pool release and sales claim preserve exclusive ownership',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const sales=await loginApi(request,'demo.sales01');
    const suffix=Date.now().toString().slice(-8);
    const customer=await postJson(request,'/api/customers',{
      name:'Public Pool E2E '+suffix,customer_types:['Distributor'],status:'potential',grade:'C',country:'Spain',source:'E2E Pool'
    },manager.headers);

    const released=await postJson(request,`/api/customers/${customer.id}/release-to-pool`,{reason:'E2E release'},manager.headers);
    expect(released.pool_status).toBe('public');
    expect(released.owner_id).toBeFalsy();

    const pool=await getJson(request,'/api/public-pool?q='+encodeURIComponent('Public Pool E2E '+suffix),sales.headers);
    expect(pool.data.some(x=>x.id===customer.id)).toBe(true);

    const claimed=await postJson(request,`/api/public-pool/${customer.id}/claim`,{},sales.headers);
    expect(claimed.ok).toBe(true);
    expect(claimed.owner.id).toBe(sales.user.id);

    const owned=await getJson(request,'/api/customers/'+customer.id,sales.headers);
    expect(owned.owner_id).toBe(sales.user.id);

    const secondClaim=await request.post(`/api/public-pool/${customer.id}/claim`,{headers:manager.headers,data:{}});
    expect(secondClaim.status()).toBe(409);
  });

  test('customer export follows privacy export roles',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const readonly=await loginApi(request,'demo.readonly');
    const finance=await loginApi(request,'demo.finance');
    const sales=await loginApi(request,'demo.sales01');

    const exported=await getJson(request,'/api/customers/export-data?keyword=Nordstern',manager.headers);
    expect(exported.some(x=>x.name==='Nordstern Technik GmbH')).toBe(true);

    for(const session of [readonly,finance,sales]){
      const response=await request.get('/api/customers/export-data',{headers:session.headers});
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toBe('export_forbidden');
    }
  });

  test('signed marketing open click and one-click unsubscribe endpoints are functional and tamper-resistant',async({request})=>{
    const manager=await loginApi(request,'demo.manager');
    const suffix=Date.now().toString().slice(-8);
    const source='Tracking Safety '+suffix;

    // Use a dedicated fixture so unsubscribe verification never mutates the shared seed customers
    // that later browser tests rely on.
    const customer=await postJson(request,'/api/customers',{
      name:'Tracking Safety Customer '+suffix,
      english_name:'Tracking Safety Customer '+suffix,
      country:'Iceland',
      city:'Reykjavik',
      industry:'Industrial Automation',
      customer_types:['Importer'],
      status:'following',
      grade:'B',
      source,
      language:'English',
      timezone:'Atlantic/Reykjavik'
    },manager.headers);
    const contact=await postJson(request,'/api/contacts',{
      customer_id:customer.id,
      name:'Tracking Safety Buyer '+suffix,
      title:'Procurement Manager',
      department:'Procurement',
      role:'Decision Maker',
      is_primary:1,
      is_departed:0
    },manager.headers);
    await postJson(request,'/api/channels',{
      contact_id:contact.id,
      channel:'email',
      value:`tracking-${suffix}@example.com`,
      label:'E2E tracking email',
      is_primary:1
    },manager.headers);
    await postJson(request,'/api/marketing/consent',{
      customer_id:customer.id,
      contact_id:contact.id,
      channel:'email',
      status:'opt_in',
      source:'e2e-tracking-fixture'
    },manager.headers,[200]);

    const campaign=await postJson(request,'/api/campaigns',{
      name:'Tracking Safety Campaign '+suffix,
      type:'email',
      segment_rule:{source},
      subject:'Tracking safety verification',
      content:'Open https://example.com/tradeflow-e2e to verify click tracking.',
      status:'draft'
    },manager.headers);
    const prepared=await postJson(request,`/api/marketing/campaigns/${campaign.id}/prepare`,{},manager.headers,[200]);
    expect(prepared.prepared).toBe(1);
    expect(prepared.skipped).toBe(0);

    let recipients=await getJson(request,`/api/marketing/campaigns/${campaign.id}/recipients`,manager.headers);
    expect(recipients).toHaveLength(1);
    const recipient=recipients[0];
    expect(recipient.customer_id).toBe(customer.id);
    expect(recipient.status).toBe('prepared');

    const beforeOpen=Number(recipient.open_count||0),beforeClick=Number(recipient.click_count||0);
    const openSig=trackingSig('open',recipient.id);
    const open=await request.get(`/api/marketing/track/open/${recipient.id}?sig=${encodeURIComponent(openSig)}`);
    expect(open.status()).toBe(200);
    expect(open.headers()['content-type']).toContain('image/gif');

    recipients=await getJson(request,`/api/marketing/campaigns/${campaign.id}/recipients`,manager.headers);
    let refreshed=recipients.find(x=>x.id===recipient.id);
    expect(Number(refreshed.open_count||0)).toBe(beforeOpen+1);

    const destination='https://example.com/tradeflow-e2e';
    const clickSig=trackingSig('click',recipient.id,destination);
    const click=await request.get(`/api/marketing/track/click/${recipient.id}?u=${encodeURIComponent(destination)}&sig=${encodeURIComponent(clickSig)}`,{maxRedirects:0});
    expect(click.status()).toBe(302);
    expect(click.headers().location).toBe(destination);

    const tampered=await request.get(`/api/marketing/track/click/${recipient.id}?u=${encodeURIComponent('https://evil.example.com/')}&sig=${encodeURIComponent(clickSig)}`,{maxRedirects:0});
    expect(tampered.status()).toBe(400);

    recipients=await getJson(request,`/api/marketing/campaigns/${campaign.id}/recipients`,manager.headers);
    refreshed=recipients.find(x=>x.id===recipient.id);
    expect(Number(refreshed.click_count||0)).toBe(beforeClick+1);

    const beforeStats=await getJson(request,`/api/marketing/campaigns/${campaign.id}/stats`,manager.headers);
    const unsubSig=trackingSig('unsubscribe',recipient.id);
    const unsubscribe=await request.get(`/api/marketing/unsubscribe/${recipient.id}?sig=${encodeURIComponent(unsubSig)}`);
    expect(unsubscribe.status()).toBe(200);
    expect((await unsubscribe.text()).toLowerCase()).toContain('unsubscribed');

    const oneClick=await request.post(`/api/marketing/unsubscribe/${recipient.id}?sig=${encodeURIComponent(unsubSig)}`,{data:'List-Unsubscribe=One-Click',headers:{'content-type':'application/x-www-form-urlencoded'}});
    expect(oneClick.status()).toBe(204);

    recipients=await getJson(request,`/api/marketing/campaigns/${campaign.id}/recipients`,manager.headers);
    refreshed=recipients.find(x=>x.id===recipient.id);
    expect(refreshed.unsubscribed_at).toBeTruthy();

    const afterStats=await getJson(request,`/api/marketing/campaigns/${campaign.id}/stats`,manager.headers);
    expect(afterStats.unsubscribed).toBeGreaterThanOrEqual(beforeStats.unsubscribed+1);
  });

  test('database backups are admin-only, downloadable SQLite files, and deletable',async({request})=>{
    const admin=await loginApi(request,'demo.admin');
    const manager=await loginApi(request,'demo.manager');

    const managerList=await request.get('/api/backups',{headers:manager.headers});
    expect(managerList.status()).toBe(403);

    const backup=await postJson(request,'/api/backups/create',{},admin.headers,[201]);
    expect(backup.file).toBeTruthy();
    expect(Number(backup.size_bytes||0)).toBeGreaterThan(0);

    const list=await getJson(request,'/api/backups',admin.headers);
    expect(list.rows.some(x=>x.file===backup.file)).toBe(true);

    const downloaded=await request.get('/api/backups/'+encodeURIComponent(backup.file)+'/download',{headers:admin.headers});
    expect(downloaded.status()).toBe(200);
    const bytes=await downloaded.body();
    expect(bytes.subarray(0,16).toString('utf8')).toBe('SQLite format 3\u0000');

    const removed=await request.delete('/api/backups/'+encodeURIComponent(backup.file),{headers:admin.headers});
    expect(removed.status()).toBe(200);
    const missing=await request.get('/api/backups/'+encodeURIComponent(backup.file)+'/download',{headers:admin.headers});
    expect(missing.status()).toBe(404);
  });
});
