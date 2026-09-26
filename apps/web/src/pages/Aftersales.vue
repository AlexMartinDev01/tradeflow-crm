<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {useRouter} from 'vue-router';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import AttachmentsPanel from '../components/AttachmentsPanel.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const canEdit=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role));
const rows=ref<any[]>([]),customers=ref<any[]>([]),orders=ref<any[]>([]),summary=ref<any>({}),detail=ref<any>(null),drawer=ref(false),dialog=ref(false),ratingDialog=ref(false),knowledgeDialog=ref(false),knowledgeRecommendations=ref<any[]>([]),router=useRouter();
const filters=reactive({status:'',severity:'',category:''});
const form=reactive<any>({customer_id:'',order_id:'',category:'quality',severity:'normal',subject:'',description:'',responsible_team:'Quality',solution:'',status:'open'});
const rating=reactive<any>({satisfaction:5,note:''});
const knowledgeForm=reactive<any>({title:'',summary:'',tags:[],status:'draft'});
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
const filteredOrders=computed(()=>orders.value.filter(x=>!form.customer_id||x.customer_id===form.customer_id));
const categories=computed(()=>[...new Set(rows.value.map(x=>x.category).filter(Boolean))].sort());
const visibleRows=computed(()=>rows.value.filter(x=>(!filters.status||x.status===filters.status)&&(!filters.severity||x.severity===filters.severity)&&(!filters.category||x.category===filters.category)));
const statuses=['open','investigating','awaiting_customer','resolved','closed'];
const severities=['low','normal','high','critical'];

function slaStatus(r:any){
  if(['resolved','closed'].includes(r.status))return 'completed';
  return r.sla_due_at&&r.sla_due_at<new Date().toISOString()?'overdue':'within_sla';
}
function slaType(r:any){const s=slaStatus(r);return s==='overdue'?'danger':s==='completed'?'success':'info'}
async function load(){
  const [a,c,o,s]=await Promise.all([
    api.get('/aftersales',{params:{size:300}}),api.get('/customers',{params:{size:300}}),api.get('/orders',{params:{size:300}}),api.get('/aftersales/summary')
  ]);
  rows.value=a.data.data;customers.value=c.data.data;orders.value=o.data.data;summary.value=s.data;
}
async function save(){
  if(!form.customer_id||!form.subject.trim()||!form.description.trim())return ElMessage.warning('客户、主题和问题描述必填');
  await api.post('/aftersales',form);dialog.value=false;
  Object.assign(form,{customer_id:'',order_id:'',category:'quality',severity:'normal',subject:'',description:'',responsible_team:'Quality',solution:'',status:'open'});
  await load();ElMessage.success('售后工单已创建');
}
async function loadKnowledgeRecommendations(){
  if(!detail.value?.id){knowledgeRecommendations.value=[];return}
  try{knowledgeRecommendations.value=(await api.get('/knowledge/recommend',{params:{ticket_id:detail.value.id}})).data}catch{knowledgeRecommendations.value=[]}
}
async function open(r:any){detail.value=(await api.get(`/workflows/aftersales/${r.id}/full`)).data;drawer.value=true;await loadKnowledgeRecommendations()}
async function saveDetail(){await api.patch(`/aftersales/${detail.value.id}`,{category:detail.value.category,severity:detail.value.severity,responsible_team:detail.value.responsible_team,solution:detail.value.solution});await open(detail.value);await load();ElMessage.success('工单信息已保存')}
async function changeStatus(v:string){await api.post(`/workflows/aftersales/${detail.value.id}/status`,{status:v,solution:detail.value.solution});await open(detail.value);await load();ElMessage.success('工单状态已更新')}
function openRating(){Object.assign(rating,{satisfaction:detail.value.satisfaction||5,note:detail.value.satisfaction_note||''});ratingDialog.value=true}
async function saveRating(){await api.post(`/workflows/aftersales/${detail.value.id}/satisfaction`,rating);ratingDialog.value=false;await open(detail.value);ElMessage.success('满意度已记录')}
function openKnowledgeCreate(){
  if(!detail.value?.solution?.trim())return ElMessage.warning('请先填写并保存解决方案');
  Object.assign(knowledgeForm,{title:detail.value.subject||'售后解决方案',summary:'来源工单 '+detail.value.ticket_no+' · '+(detail.value.category||'未分类'),tags:[detail.value.category,detail.value.severity,detail.value.responsible_team].filter(Boolean),status:'draft'});
  knowledgeDialog.value=true;
}
async function saveKnowledgeFromTicket(){
  try{
    const {data}=await api.post('/knowledge/from-ticket/'+detail.value.id,knowledgeForm);
    knowledgeDialog.value=false;ElMessage.success(knowledgeForm.status==='published'?'已发布到售后知识库':'已保存为知识草稿');
    await loadKnowledgeRecommendations();
    return data;
  }catch(e:any){
    const code=e.response?.data?.error;
    if(code==='knowledge_already_exists')ElMessage.warning('该工单已经沉淀过知识，可前往知识库编辑');
    else if(code==='ticket_not_resolved')ElMessage.warning('只有已解决或已关闭工单才能沉淀知识');
    else if(code==='ticket_solution_required')ElMessage.warning('请先填写解决方案');
    else ElMessage.error(e.response?.data?.message||code||'沉淀知识失败');
  }
}
async function applyKnowledge(article:any){
  await api.post('/knowledge/'+article.id+'/apply',{ticket_id:detail.value.id});
  ElMessage.success('历史方案已应用到当前工单，请结合实际情况确认后再保存/结案');
  await open(detail.value);
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">售后与投诉</h2><span class="muted">工单、SLA、解决方案、满意度与知识复用闭环</span></div><div style="display:flex;gap:8px"><el-button @click="router.push('/knowledge')">售后知识库</el-button><el-button v-if="canEdit" type="primary" @click="dialog=true">新建售后工单</el-button></div></div>

<div class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">全部工单</span><b>{{summary.total||0}}</b></div>
  <div class="stat"><span class="muted">处理中</span><b>{{summary.open||0}}</b></div>
  <div class="stat"><span class="muted">SLA逾期</span><b>{{summary.overdue||0}}</b></div>
  <div class="stat"><span class="muted">Critical</span><b>{{summary.critical||0}}</b></div>
</div>

<div class="card" style="margin-bottom:16px"><div class="grid" style="grid-template-columns:1fr 1fr 1fr auto">
  <el-select v-model="filters.status" clearable placeholder="状态"><el-option v-for="x in statuses" :key="x" :label="x" :value="x"/></el-select>
  <el-select v-model="filters.severity" clearable placeholder="严重度"><el-option v-for="x in severities" :key="x" :label="x" :value="x"/></el-select>
  <el-select v-model="filters.category" clearable placeholder="分类"><el-option v-for="x in categories" :key="x" :label="x" :value="x"/></el-select>
  <el-button @click="Object.assign(filters,{status:'',severity:'',category:''})">重置</el-button>
</div></div>

<div class="card"><el-table :data="visibleRows" @row-dblclick="open">
  <el-table-column prop="ticket_no" label="工单号" width="180"/>
  <el-table-column label="客户" min-width="180"><template #default="s">{{customerMap[s.row.customer_id]||s.row.customer_id}}</template></el-table-column>
  <el-table-column prop="category" label="分类" width="120"/><el-table-column prop="subject" label="主题" min-width="220"/>
  <el-table-column prop="severity" label="严重度" width="100"><template #default="s"><el-tag :type="s.row.severity==='critical'?'danger':s.row.severity==='high'?'warning':'info'">{{s.row.severity}}</el-tag></template></el-table-column>
  <el-table-column prop="responsible_team" label="责任部门" width="120"/>
  <el-table-column label="SLA" width="120"><template #default="s"><el-tag :type="slaType(s.row)">{{slaStatus(s.row)}}</el-tag></template></el-table-column>
  <el-table-column prop="status" label="状态" width="130"/>
  <el-table-column label="操作" width="90"><template #default="s"><el-button link type="primary" @click="open(s.row)">详情</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" title="新建售后工单" width="760"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="客户"><el-select v-model="form.customer_id" filterable style="width:100%" @change="form.order_id=''"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
  <el-form-item label="关联订单"><el-select v-model="form.order_id" clearable filterable style="width:100%"><el-option v-for="o in filteredOrders" :key="o.id" :label="o.order_no" :value="o.id"/></el-select></el-form-item>
  <el-form-item label="问题分类"><el-select v-model="form.category" allow-create filterable style="width:100%"><el-option v-for="x in ['quality','quantity','packaging','delivery','logistics','documents','service']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="严重度"><el-select v-model="form.severity" style="width:100%"><el-option v-for="x in severities" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="责任部门"><el-select v-model="form.responsible_team" allow-create filterable style="width:100%"><el-option v-for="x in ['Quality','Production','Sales','Logistics','Finance','Documentation']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
</div>
<el-form-item label="主题"><el-input v-model="form.subject"/></el-form-item><el-form-item label="问题描述"><el-input v-model="form.description" type="textarea" :rows="5"/></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">创建工单</el-button></template></el-dialog>

<el-drawer v-model="drawer" size="76%" title="售后工单详情"><template v-if="detail">
<div class="toolbar"><div><h3 style="margin:0">{{detail.ticket_no}} · {{detail.subject}}</h3><span class="muted">{{detail.customer_name}} · SLA {{detail.sla_due_at||'-'}}</span></div><div style="display:flex;gap:8px"><el-tag :type="detail.sla_status==='overdue'?'danger':detail.sla_status==='completed'?'success':'info'">{{detail.sla_status}}</el-tag><el-select v-if="canEdit" v-model="detail.status" style="width:170px" @change="changeStatus"><el-option v-for="x in statuses" :key="x" :label="x" :value="x"/></el-select><el-tag v-else>{{detail.status}}</el-tag></div></div>

<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
<div class="card"><h3 class="section-title">问题与处理</h3><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="分类"><el-input v-model="detail.category"/></el-form-item><el-form-item label="严重度"><el-select v-model="detail.severity" style="width:100%"><el-option v-for="x in severities" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="责任部门"><el-input v-model="detail.responsible_team"/></el-form-item><el-form-item label="关联订单"><el-input :model-value="detail.order_no||'-'" disabled/></el-form-item></div>
<el-form-item label="问题描述"><el-input :model-value="detail.description" type="textarea" :rows="4" disabled/></el-form-item><el-form-item label="解决方案"><el-input v-model="detail.solution" type="textarea" :rows="5"/></el-form-item>
<el-button v-if="canEdit" type="primary" plain @click="saveDetail">保存处理信息</el-button><el-button v-if="canEdit&&['resolved','closed'].includes(detail.status)" @click="openRating">记录满意度</el-button><el-button v-if="canEdit&&['resolved','closed'].includes(detail.status)&&detail.solution" type="success" plain @click="openKnowledgeCreate">沉淀为知识</el-button>
</el-form></div>
<div class="card"><h3 class="section-title">服务结果</h3><el-descriptions :column="1" border><el-descriptions-item label="打开时间">{{detail.opened_at}}</el-descriptions-item><el-descriptions-item label="SLA截止">{{detail.sla_due_at||'-'}}</el-descriptions-item><el-descriptions-item label="解决时间">{{detail.resolved_at||'-'}}</el-descriptions-item><el-descriptions-item label="关闭时间">{{detail.closed_at||'-'}}</el-descriptions-item><el-descriptions-item label="满意度">{{detail.satisfaction?detail.satisfaction+'/5':'-'}}</el-descriptions-item><el-descriptions-item label="满意度备注">{{detail.satisfaction_note||'-'}}</el-descriptions-item></el-descriptions></div>
</div>

<div class="card" style="margin-top:16px">
  <div class="toolbar"><div><h3 class="section-title">推荐历史解决方案</h3><span class="muted">根据当前工单分类与主题，从已发布知识中匹配</span></div><el-button size="small" @click="loadKnowledgeRecommendations">重新匹配</el-button></div>
  <el-empty v-if="!knowledgeRecommendations.length" description="暂无可复用的历史方案"/>
  <el-table v-else :data="knowledgeRecommendations" size="small">
    <el-table-column prop="title" label="知识标题" min-width="220"/><el-table-column prop="category" label="分类" width="110"/>
    <el-table-column label="相关度" width="90"><template #default="s">{{Number(s.row.relevance||0).toFixed(1)}}</template></el-table-column>
    <el-table-column prop="use_count" label="已使用" width="80"/><el-table-column prop="summary" label="摘要" min-width="260" show-overflow-tooltip/>
    <el-table-column label="操作" width="110"><template #default="s"><el-button v-if="canEdit" link type="primary" @click="applyKnowledge(s.row)">应用方案</el-button></template></el-table-column>
  </el-table>
  <el-alert type="info" :closable="false" title="知识方案用于复用历史经验；应用后仍应结合当前客户、订单和证据核对，不会自动关闭工单。" style="margin-top:10px"/>
</div>

<div class="card" style="margin-top:16px"><AttachmentsPanel entity-type="aftersales" :entity-id="detail.id" title="售后证据与附件"/></div>
</template></el-drawer>

<el-dialog v-model="ratingDialog" title="记录客户满意度" width="520"><el-form label-position="top"><el-form-item label="满意度（1-5）"><el-rate v-model="rating.satisfaction"/></el-form-item><el-form-item label="客户反馈"><el-input v-model="rating.note" type="textarea" :rows="4"/></el-form-item></el-form><template #footer><el-button @click="ratingDialog=false">取消</el-button><el-button type="primary" @click="saveRating">保存</el-button></template></el-dialog>
<el-dialog v-model="knowledgeDialog" title="将已解决工单沉淀为知识" width="680">
  <el-alert type="info" :closable="false" title="系统默认只带入工单分类、主题和已确认解决方案，不会自动复制客户投诉原文，避免把客户敏感信息带入共享知识库。" style="margin-bottom:12px"/>
  <el-form label-position="top">
    <el-form-item label="知识标题"><el-input v-model="knowledgeForm.title"/></el-form-item>
    <el-form-item label="摘要"><el-input v-model="knowledgeForm.summary" type="textarea" :rows="2"/></el-form-item>
    <el-form-item label="标签"><el-select v-model="knowledgeForm.tags" multiple filterable allow-create default-first-option style="width:100%"/></el-form-item>
    <el-form-item label="保存状态"><el-radio-group v-model="knowledgeForm.status"><el-radio value="draft">草稿</el-radio><el-radio value="published">直接发布</el-radio></el-radio-group></el-form-item>
  </el-form>
  <template #footer><el-button @click="knowledgeDialog=false">取消</el-button><el-button type="primary" @click="saveKnowledgeFromTicket">确认沉淀</el-button></template>
</el-dialog>
</AppLayout></template>