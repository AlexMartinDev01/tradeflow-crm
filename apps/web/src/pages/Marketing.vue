<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const campaigns=ref<any[]>([]),segments=ref<any[]>([]),templates=ref<any[]>([]),customers=ref<any[]>([]),tags=ref<any[]>([]),owners=ref<any[]>([]);
const campaignDialog=ref(false),segmentDialog=ref(false),templateDialog=ref(false),recipientsDialog=ref(false),statsDialog=ref(false);
const recipients=ref<any[]>([]),stats=ref<any>({}),previewRows=ref<any[]>([]),previewDialog=ref(false),selectedCampaign=ref<any>(null),emailStatus=ref<any>({configured:false}),sendingCampaign=ref(''),sendingRecipient=ref('');
const loading=ref(false),campaignSaving=ref(false),segmentSaving=ref(false),templateSaving=ref(false),preparingCampaign=ref(''),recipientsLoading=ref(false),statsLoading=ref(false),previewLoading=ref(false),consentBusy=ref(''),deleteBusy=ref('');

const campaign=reactive<any>({name:'',type:'email',segment_id:'',segment_rule:{},subject:'',template_id:'',scheduled_at:'',content:'',status:'draft'});
const segment=reactive<any>({name:'',is_shared:0,rules:{country:'',status:'',grade:'',source:'',industry:'',customer_type:'',tag_id:'',owner_id:''}});
const templateForm=reactive<any>({name:'',subject:'',body:'Hello {{contact_name}},\n\nWe would like to share an update from {{company_name}}.\n\nBest regards'});
const countries=computed(()=>[...new Set(customers.value.map(x=>x.country).filter(Boolean))].sort());
const sources=computed(()=>[...new Set(customers.value.map(x=>x.source).filter(Boolean))].sort());
const industries=computed(()=>[...new Set(customers.value.map(x=>x.industry).filter(Boolean))].sort());

async function load(){
  loading.value=true;
  try{
    const [c,s,t,cu,tg,ow]=await Promise.all([
      api.get('/campaigns',{params:{size:200}}),api.get('/marketing/segments'),api.get('/marketing/templates'),
      api.get('/customers',{params:{size:300}}),api.get('/tags',{params:{size:200}}),api.get('/users/lookup')
    ]);
    campaigns.value=c.data.data;segments.value=s.data;templates.value=t.data;customers.value=cu.data.data;tags.value=tg.data.data;owners.value=ow.data;
    try{emailStatus.value=(await api.get('/email/status')).data}catch{emailStatus.value={configured:false}}
  }catch(e:any){ElMessage.error(e.response?.data?.message||'营销数据加载失败，请稍后重试')}
  finally{loading.value=false}
}
async function saveCampaign(){
  if(!campaign.name.trim())return ElMessage.warning('请输入活动名称');
  if(campaignSaving.value)return;campaignSaving.value=true;
  try{
    const payload={...campaign,segment_rule:{...campaign.segment_rule},scheduled_at:campaign.scheduled_at?new Date(campaign.scheduled_at).toISOString():null};
    await api.post('/campaigns',payload);campaignDialog.value=false;
    Object.assign(campaign,{name:'',type:'email',segment_id:'',segment_rule:{},subject:'',template_id:'',scheduled_at:'',content:'',status:'draft'});
    await load();ElMessage.success('营销活动已创建');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'营销活动创建失败')}
  finally{campaignSaving.value=false}
}
async function prepareCampaign(c:any){
  if(preparingCampaign.value)return;preparingCampaign.value=c.id;
  try{const {data}=await api.post(`/marketing/campaigns/${c.id}/prepare`,{});await load();ElMessage.success(`名单已生成：可触达 ${data.prepared}，跳过 ${data.skipped}`)}
  catch(e:any){ElMessage.error(e.response?.data?.message||'营销名单准备失败')}
  finally{preparingCampaign.value=''}
}
async function openRecipients(c:any){
  selectedCampaign.value=c;recipientsDialog.value=true;recipientsLoading.value=true;
  try{recipients.value=(await api.get(`/marketing/campaigns/${c.id}/recipients`)).data}
  catch(e:any){recipients.value=[];ElMessage.error(e.response?.data?.message||'收件人列表加载失败')}
  finally{recipientsLoading.value=false}
}
async function markSent(r:any){
  if(sendingRecipient.value)return;sendingRecipient.value=r.id;
  try{await api.post(`/marketing/recipients/${r.id}/mark-sent`,{});ElMessage.success('已记录外部发送');await openRecipients(selectedCampaign.value);await load()}
  catch(e:any){ElMessage.error(e.response?.data?.message||'外部发送标记失败')}
  finally{sendingRecipient.value=''}
}
async function sendRecipient(r:any){
  sendingRecipient.value=r.id;
  try{await api.post(`/marketing/recipients/${r.id}/send`,{});ElMessage.success('邮件已通过 SMTP 发送');await openRecipients(selectedCampaign.value);await load()}
  catch(e:any){ElMessage.error(e.response?.data?.message||e.response?.data?.error||'发送失败');await openRecipients(selectedCampaign.value)}
  finally{sendingRecipient.value=''}
}
async function sendCampaign(c:any){
  if(!emailStatus.value.configured)return ElMessage.warning('请先在“系统集成”配置并启用 SMTP');
  await ElMessageBox.confirm('本次最多发送 20 封 prepared/failed 邮件。发送前系统会再次检查退订状态。确认继续？','实际发送邮件',{type:'warning',confirmButtonText:'发送下一批 20 封'});
  sendingCampaign.value=c.id;
  try{
    const {data}=await api.post(`/marketing/campaigns/${c.id}/send`,{limit:20});await load();
    ElMessage[data.failed?'warning':'success'](`本批：成功 ${data.sent}，失败 ${data.failed}，跳过 ${data.skipped}，剩余 ${data.remaining}`);
  }catch(e:any){ElMessage.error(e.response?.data?.message||e.response?.data?.error||'营销邮件批量发送失败')}
  finally{sendingCampaign.value=''}
}
async function optOut(r:any){
  await ElMessageBox.confirm(`确认将 ${r.customer_name} 标记为邮件退订？`,'确认');
  if(consentBusy.value)return;consentBusy.value=r.id;
  try{
    await api.post('/marketing/consent',{customer_id:r.customer_id,contact_id:r.contact_id,channel:'email',status:'opt_out',source:'campaign'});
    ElMessage.success('已记录退订');await openRecipients(selectedCampaign.value);
  }catch(e:any){ElMessage.error(e.response?.data?.message||'退订记录失败')}
  finally{consentBusy.value=''}
}
async function openStats(c:any){
  selectedCampaign.value=c;statsDialog.value=true;statsLoading.value=true;
  try{stats.value=(await api.get(`/marketing/campaigns/${c.id}/stats`)).data}
  catch(e:any){stats.value={};ElMessage.error(e.response?.data?.message||'营销统计加载失败')}
  finally{statsLoading.value=false}
}

async function saveSegment(){
  if(!segment.name.trim())return ElMessage.warning('请输入分群名称');
  if(segmentSaving.value)return;segmentSaving.value=true;
  try{
    await api.post('/marketing/segments',{name:segment.name,is_shared:!!segment.is_shared,rules:{...segment.rules}});
    segmentDialog.value=false;Object.assign(segment,{name:'',is_shared:0,rules:{country:'',status:'',grade:'',source:'',industry:'',customer_type:'',tag_id:'',owner_id:''}});
    await load();ElMessage.success('客户分群已保存');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'客户分群保存失败')}
  finally{segmentSaving.value=false}
}
async function previewSegment(s:any){
  if(previewLoading.value)return;previewLoading.value=true;
  try{const rules=s.id?s.rules:segment.rules;const {data}=await api.post('/marketing/segments/preview',{rules,limit:500});previewRows.value=data.data;previewDialog.value=true}
  catch(e:any){ElMessage.error(e.response?.data?.message||'分群预览失败')}
  finally{previewLoading.value=false}
}
async function deleteSegment(s:any){
  await ElMessageBox.confirm(`删除分群“${s.name}”？`,'确认');if(deleteBusy.value)return;deleteBusy.value='segment-'+s.id;
  try{await api.delete(`/marketing/segments/${s.id}`);await load();ElMessage.success('分群已删除')}
  catch(e:any){ElMessage.error(e.response?.data?.message||'分群删除失败')}
  finally{deleteBusy.value=''}
}

async function saveTemplate(){
  if(!templateForm.name||!templateForm.subject||!templateForm.body)return ElMessage.warning('模板名称、主题、正文必填');
  if(templateSaving.value)return;templateSaving.value=true;
  try{
    await api.post('/marketing/templates',templateForm);templateDialog.value=false;
    Object.assign(templateForm,{name:'',subject:'',body:'Hello {{contact_name}},\n\n'});
    await load();ElMessage.success('邮件模板已保存');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'邮件模板保存失败')}
  finally{templateSaving.value=false}
}
async function deleteTemplate(t:any){
  await ElMessageBox.confirm(`删除模板“${t.name}”？`,'确认');if(deleteBusy.value)return;deleteBusy.value='template-'+t.id;
  try{await api.delete(`/marketing/templates/${t.id}`);await load();ElMessage.success('模板已删除')}
  catch(e:any){ElMessage.error(e.response?.data?.message||'模板删除失败')}
  finally{deleteBusy.value=''}
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">客户营销</h2><span class="muted">动态分群、模板、SMTP 实际发送、打开/点击追踪、一键退订和活动转化</span></div></div>
<el-alert v-if="emailStatus.configured" type="success" :closable="false" :title="`SMTP 已启用：${emailStatus.integration?.name||'SMTP'} · ${emailStatus.config?.from_email||''}`" style="margin-bottom:14px"/>
<el-alert v-if="emailStatus.configured&&!emailStatus.config?.tracking_ready" type="warning" :closable="false" title="SMTP 已可发送，但邮件追踪/一键退订尚未就绪：请在“系统集成 → SMTP”填写可公网访问的 Public Base URL。" style="margin-bottom:12px"/>
<el-alert v-else-if="emailStatus.configured&&emailStatus.config?.tracking_ready" type="info" :closable="false" :title="`互动追踪已启用：${emailStatus.config.public_base_url}。打开/点击可能受邮箱代理或安全扫描器影响。`" style="margin-bottom:12px"/>
<el-alert v-else type="warning" :closable="false" title="尚未启用 SMTP。可以先准备名单和模板，也可以在外部发送后手工标记；系统不会伪装成已实际发送。" style="margin-bottom:14px"/>
<el-tabs>
<el-tab-pane label="营销活动">
  <div class="toolbar"><span class="muted">先准备名单；真实 SMTP 发送需手工确认，每批最多 20 封，发送前再次检查退订。</span><el-button type="primary" @click="campaignDialog=true">新建活动</el-button></div>
  <div class="card"><el-table v-loading="loading" :data="campaigns">
    <el-table-column prop="name" label="活动" min-width="180"/><el-table-column prop="type" label="类型" width="90"/><el-table-column prop="subject" label="主题" min-width="180"/><el-table-column prop="status" label="状态" width="110"/><el-table-column prop="scheduled_at" label="计划时间" width="190"/>
    <el-table-column label="操作" width="350"><template #default="s"><el-button link type="primary" :loading="preparingCampaign===s.row.id" :disabled="!!preparingCampaign&&preparingCampaign!==s.row.id" @click="prepareCampaign(s.row)">准备名单</el-button><el-button v-if="emailStatus.configured&&['prepared','sending','partial_failed'].includes(s.row.status)" link type="success" :loading="sendingCampaign===s.row.id" @click="sendCampaign(s.row)">发送下一批</el-button><el-button link @click="openRecipients(s.row)">收件人</el-button><el-button link @click="openStats(s.row)">转化统计</el-button></template></el-table-column>
  </el-table></div>
</el-tab-pane>

<el-tab-pane label="客户分群">
  <div class="toolbar"><span class="muted">按国家、状态、等级、来源、行业、类型、标签和负责人动态筛选。</span><el-button type="primary" @click="segmentDialog=true">新建分群</el-button></div>
  <div class="card"><el-table v-loading="loading" :data="segments"><el-table-column prop="name" label="分群" min-width="180"/><el-table-column label="规则" min-width="360"><template #default="s"><span v-for="(v,k) in s.row.rules" :key="String(k)"><el-tag v-if="v" size="small" style="margin:2px">{{k}}={{v}}</el-tag></span></template></el-table-column><el-table-column label="共享" width="80"><template #default="s">{{s.row.is_shared?'是':'否'}}</template></el-table-column><el-table-column label="操作" width="150"><template #default="s"><el-button link :loading="previewLoading" @click="previewSegment(s.row)">预览</el-button><el-button link type="danger" :loading="deleteBusy==='segment-'+s.row.id" :disabled="!!deleteBusy&&deleteBusy!==('segment-'+s.row.id)" @click="deleteSegment(s.row)">删除</el-button></template></el-table-column></el-table></div>
</el-tab-pane>

<el-tab-pane label="邮件模板">
  <div class="toolbar"><span class="muted" v-pre>支持变量：{{customer_name}}、{{contact_name}}、{{country}}、{{company_name}}。</span><el-button type="primary" @click="templateDialog=true">新建模板</el-button></div>
  <div class="card"><el-table v-loading="loading" :data="templates"><el-table-column prop="name" label="模板" min-width="160"/><el-table-column prop="subject" label="主题" min-width="240"/><el-table-column prop="body" label="正文" show-overflow-tooltip/><el-table-column label="操作" width="80"><template #default="s"><el-button link type="danger" :loading="deleteBusy==='template-'+s.row.id" :disabled="!!deleteBusy&&deleteBusy!==('template-'+s.row.id)" @click="deleteTemplate(s.row)">删除</el-button></template></el-table-column></el-table></div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="campaignDialog" title="新建营销活动" width="760"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="活动名称"><el-input v-model="campaign.name"/></el-form-item><el-form-item label="类型"><el-select v-model="campaign.type" style="width:100%"><el-option label="Email" value="email"/><el-option label="展会邀约" value="exhibition"/><el-option label="节日营销" value="holiday"/></el-select></el-form-item>
<el-form-item label="分群"><el-select v-model="campaign.segment_id" data-testid="campaign-segment" clearable style="width:100%"><el-option v-for="s in segments" :key="s.id" :label="s.name" :value="s.id"/></el-select></el-form-item><el-form-item label="模板"><el-select v-model="campaign.template_id" data-testid="campaign-template" clearable style="width:100%"><el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id"/></el-select></el-form-item>
<el-form-item label="邮件主题"><el-input v-model="campaign.subject"/></el-form-item><el-form-item label="计划时间"><el-input v-model="campaign.scheduled_at" type="datetime-local"/></el-form-item></div>
<el-form-item label="正文（留空则使用模板正文）"><el-input v-model="campaign.content" type="textarea" :rows="6"/></el-form-item>
</el-form><template #footer><el-button :disabled="campaignSaving" @click="campaignDialog=false">取消</el-button><el-button type="primary" :loading="campaignSaving" @click="saveCampaign">保存活动</el-button></template></el-dialog>

<el-dialog v-model="segmentDialog" title="新建动态客户分群" width="760"><el-form label-position="top">
<el-form-item label="分群名称"><el-input v-model="segment.name"/></el-form-item><div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="国家"><el-select v-model="segment.rules.country" data-testid="segment-country" clearable filterable style="width:100%"><el-option v-for="x in countries" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="状态"><el-select v-model="segment.rules.status" clearable style="width:100%"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="等级"><el-select v-model="segment.rules.grade" data-testid="segment-grade" clearable style="width:100%"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="来源"><el-select v-model="segment.rules.source" data-testid="segment-source" clearable filterable style="width:100%"><el-option v-for="x in sources" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="行业"><el-select v-model="segment.rules.industry" clearable filterable style="width:100%"><el-option v-for="x in industries" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="客户类型"><el-select v-model="segment.rules.customer_type" clearable style="width:100%"><el-option v-for="x in ['Importer','Distributor','Wholesaler','Retailer','Brand','Agent','Manufacturer','End User','E-commerce']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="标签"><el-select v-model="segment.rules.tag_id" clearable filterable style="width:100%"><el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item>
<el-form-item label="负责人"><el-select v-model="segment.rules.owner_id" clearable filterable style="width:100%"><el-option v-for="x in owners" :key="x.id" :label="x.display_name" :value="x.id"/></el-select></el-form-item>
</div><el-form-item><el-checkbox v-model="segment.is_shared" :true-value="1" :false-value="0">共享给团队</el-checkbox></el-form-item>
<el-button :loading="previewLoading" @click="previewSegment(segment)">先预览匹配客户</el-button>
</el-form><template #footer><el-button :disabled="segmentSaving" @click="segmentDialog=false">取消</el-button><el-button type="primary" :loading="segmentSaving" @click="saveSegment">保存分群</el-button></template></el-dialog>

<el-dialog v-model="templateDialog" title="新建邮件模板" width="700"><el-form label-position="top"><el-form-item label="模板名称"><el-input v-model="templateForm.name"/></el-form-item><el-form-item label="主题"><el-input v-model="templateForm.subject"/></el-form-item><el-form-item label="正文"><el-input v-model="templateForm.body" type="textarea" :rows="10"/></el-form-item></el-form><template #footer><el-button :disabled="templateSaving" @click="templateDialog=false">取消</el-button><el-button type="primary" :loading="templateSaving" @click="saveTemplate">保存模板</el-button></template></el-dialog>

<el-dialog v-model="previewDialog" title="分群预览" width="820" v-loading="previewLoading"><el-table :data="previewRows" max-height="520"><el-table-column prop="name" label="客户" min-width="180"/><el-table-column prop="country" label="国家"/><el-table-column prop="contact_name" label="联系人"/><el-table-column prop="email" label="邮箱" min-width="200"/><el-table-column prop="consent" label="营销许可"/></el-table></el-dialog>

<el-dialog v-model="recipientsDialog" title="营销收件人" width="94%" v-loading="recipientsLoading"><el-table :data="recipients" max-height="560">
<el-table-column prop="customer_name" label="客户" min-width="150"/><el-table-column prop="contact_name" label="联系人" width="120"/><el-table-column prop="address" label="邮箱" min-width="190"/><el-table-column prop="status" label="状态" width="100"/>
<el-table-column prop="attempt_count" label="尝试" width="70"/><el-table-column label="打开" width="90"><template #default="s"><span v-if="s.row.open_count">{{s.row.open_count}} 次</span><span v-else>-</span></template></el-table-column><el-table-column label="点击" width="90"><template #default="s"><span v-if="s.row.click_count">{{s.row.click_count}} 次</span><span v-else>-</span></template></el-table-column><el-table-column label="退订" width="90"><template #default="s"><el-tag v-if="s.row.unsubscribed_at" type="warning">已退订</el-tag><span v-else>-</span></template></el-table-column><el-table-column prop="first_opened_at" label="首次打开" width="170"/><el-table-column prop="first_clicked_at" label="首次点击" width="170"/><el-table-column prop="provider_message_id" label="Message-ID" min-width="190" show-overflow-tooltip/><el-table-column prop="send_error" label="发送错误" min-width="180" show-overflow-tooltip/><el-table-column prop="reason" label="跳过原因" width="120"/>
<el-table-column label="操作" width="210" fixed="right"><template #default="s"><el-button v-if="emailStatus.configured&&['prepared','failed'].includes(s.row.status)" link type="success" :loading="sendingRecipient===s.row.id" @click="sendRecipient(s.row)">{{s.row.status==='failed'?'重试':'实际发送'}}</el-button><el-button v-else-if="!emailStatus.configured&&s.row.status==='prepared'" link :loading="sendingRecipient===s.row.id" :disabled="!!sendingRecipient&&sendingRecipient!==s.row.id" @click="markSent(s.row)">标记外部已发送</el-button><el-button link type="danger" :loading="consentBusy===s.row.id" :disabled="!!consentBusy&&consentBusy!==s.row.id" @click="optOut(s.row)">退订</el-button></template></el-table-column>
</el-table></el-dialog>

<el-dialog v-model="statsDialog" title="营销活动统计" width="760" v-loading="statsLoading">
<el-descriptions :column="3" border>
  <el-descriptions-item label="总名单">{{stats.total||0}}</el-descriptions-item><el-descriptions-item label="已发送">{{stats.sent||0}}</el-descriptions-item><el-descriptions-item label="发送失败">{{stats.failed||0}}</el-descriptions-item>
  <el-descriptions-item label="有打开信号">{{stats.opened||0}}</el-descriptions-item><el-descriptions-item label="打开率">{{Number(stats.open_rate||0).toFixed(1)}}%</el-descriptions-item><el-descriptions-item label="总打开事件">{{stats.total_opens||0}}</el-descriptions-item>
  <el-descriptions-item label="有点击信号">{{stats.clicked||0}}</el-descriptions-item><el-descriptions-item label="点击率">{{Number(stats.click_rate||0).toFixed(1)}}%</el-descriptions-item><el-descriptions-item label="点击/打开率">{{Number(stats.click_to_open_rate||0).toFixed(1)}}%</el-descriptions-item>
  <el-descriptions-item label="退订">{{stats.unsubscribed||0}}</el-descriptions-item><el-descriptions-item label="退订率">{{Number(stats.unsubscribe_rate||0).toFixed(2)}}%</el-descriptions-item><el-descriptions-item label="跳过">{{stats.skipped||0}}</el-descriptions-item>
  <el-descriptions-item label="转化客户">{{stats.converted||0}}</el-descriptions-item><el-descriptions-item label="转化率">{{Number(stats.conversion_rate||0).toFixed(1)}}%</el-descriptions-item><el-descriptions-item label="归因订单收入">{{Number(stats.revenue||0).toLocaleString()}}</el-descriptions-item>
</el-descriptions>
<el-alert type="info" :closable="false" title="打开/点击属于互动信号：邮箱图片代理、安全扫描器、隐私保护功能可能产生自动请求，因此不能当作精确的真人阅读证明。" style="margin-top:14px"/>
</el-dialog>
</AppLayout></template>