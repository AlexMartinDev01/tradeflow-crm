<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import AttachmentsPanel from '../components/AttachmentsPanel.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const rows=ref<any[]>([]),customers=ref<any[]>([]),detail=ref<any>(null),drawer=ref(false),dialog=ref(false),versionDialog=ref(false),loading=ref(false);
const form=reactive<any>({customer_id:'',amount:0,currency:'USD',effective_from:'',effective_to:'',terms:''});
const versionForm=reactive<any>({amount:0,currency:'USD',effective_from:'',effective_to:'',terms:''});
const customerMap=computed(()=>Object.fromEntries(customers.value.map((x:any)=>[x.id,x.name])));
const canEdit=computed(()=>['admin','manager','sales'].includes(auth.user?.role));
const statuses=['draft','pending_signature','signed','active','expired','terminated'];

async function load(){
  loading.value=true;
  try{
    const [c,cu]=await Promise.all([api.get('/contracts',{params:{size:300}}),api.get('/customers',{params:{size:300}})]);
    rows.value=c.data.data;customers.value=cu.data.data;
  }finally{loading.value=false}
}
async function createContract(){
  if(!form.customer_id)return ElMessage.warning('请选择客户');
  const {data}=await api.post('/workflows/contracts',form);
  dialog.value=false;Object.assign(form,{customer_id:'',amount:0,currency:'USD',effective_from:'',effective_to:'',terms:''});await load();await open(data);ElMessage.success('合同已创建')
}
async function open(r:any){detail.value=(await api.get(`/workflows/contracts/${r.id}/full`)).data;drawer.value=true}
async function refresh(){if(detail.value)detail.value=(await api.get(`/workflows/contracts/${detail.value.id}/full`)).data;await load()}
async function changeStatus(value:any){await api.post(`/workflows/contracts/${detail.value.id}/status`,{status:String(value)});await refresh();ElMessage.success('合同状态已更新')}
function openVersion(){
  Object.assign(versionForm,{amount:Number(detail.value.amount||0),currency:detail.value.currency||'USD',effective_from:detail.value.effective_from||'',effective_to:detail.value.effective_to||'',terms:detail.value.terms||''});
  versionDialog.value=true;
}
async function newVersion(){await api.post(`/workflows/contracts/${detail.value.id}/new-version`,versionForm);versionDialog.value=false;await refresh();ElMessage.success('合同新版本已生成')}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">合同管理</h2><span class="muted">合同主档、版本历史、签署状态、订单关联与附件</span></div><el-button v-if="canEdit" type="primary" @click="dialog=true">新建合同</el-button></div>

<div class="card"><el-table v-loading="loading" :data="rows" @row-dblclick="open">
  <el-table-column prop="contract_no" label="合同编号" width="180"/>
  <el-table-column label="客户" min-width="180"><template #default="s">{{customerMap[s.row.customer_id]||s.row.customer_id}}</template></el-table-column>
  <el-table-column label="版本" width="80"><template #default="s">V{{s.row.current_version||1}}</template></el-table-column>
  <el-table-column label="金额" width="150"><template #default="s">{{s.row.currency}} {{Number(s.row.amount||0).toLocaleString()}}</template></el-table-column>
  <el-table-column prop="effective_from" label="生效日" width="120"/><el-table-column prop="effective_to" label="到期日" width="120"/>
  <el-table-column prop="status" label="状态" width="130"/><el-table-column label="操作" width="90"><template #default="s"><el-button link type="primary" @click="open(s.row)">详情</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" title="新建合同" width="720"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="客户"><el-select v-model="form.customer_id" filterable style="width:100%"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
<el-form-item label="金额"><el-input v-model.number="form.amount" type="number"/></el-form-item>
<el-form-item label="币种"><el-select v-model="form.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="生效日期"><el-input v-model="form.effective_from" type="date"/></el-form-item><el-form-item label="到期日期"><el-input v-model="form.effective_to" type="date"/></el-form-item>
</div><el-form-item label="合同条款"><el-input v-model="form.terms" type="textarea" :rows="8"/></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="createContract">创建合同</el-button></template></el-dialog>

<el-drawer v-model="drawer" size="78%" title="合同工作台"><template v-if="detail">
<div class="toolbar"><div><h3 style="margin:0">{{detail.contract_no}} · V{{detail.current_version||1}}</h3><span class="muted">{{detail.customer_name}} · {{detail.currency}} {{Number(detail.amount||0).toLocaleString()}}</span></div><div style="display:flex;gap:8px"><el-button v-if="canEdit" @click="openVersion">生成新版本</el-button><el-select v-if="canEdit" :model-value="detail.status" style="width:170px" @change="changeStatus"><el-option v-for="x in statuses" :key="x" :label="x" :value="x"/></el-select><el-tag v-else>{{detail.status}}</el-tag></div></div>

<div class="grid" style="grid-template-columns:1.1fr 1fr;align-items:start">
<div class="card"><h3 class="section-title">当前合同</h3><el-descriptions :column="2" border>
<el-descriptions-item label="来源报价">{{detail.quote_no||'-'}}</el-descriptions-item><el-descriptions-item label="签署时间">{{detail.signed_at||'-'}}</el-descriptions-item>
<el-descriptions-item label="生效">{{detail.effective_from||'-'}}</el-descriptions-item><el-descriptions-item label="到期">{{detail.effective_to||'-'}}</el-descriptions-item>
<el-descriptions-item label="条款" :span="2">{{detail.terms||'-'}}</el-descriptions-item>
</el-descriptions></div>
<div class="card"><h3 class="section-title">关联订单</h3><el-table :data="detail.orders" empty-text="暂无关联订单"><el-table-column prop="order_no" label="订单号"/><el-table-column prop="status" label="状态"/><el-table-column label="金额"><template #default="s">{{s.row.currency}} {{Number(s.row.total||0).toLocaleString()}}</template></el-table-column></el-table></div>
</div>

<div class="card" style="margin-top:16px"><h3 class="section-title">合同版本历史</h3><el-table :data="detail.versions">
<el-table-column label="版本" width="80"><template #default="s">V{{s.row.version}}</template></el-table-column><el-table-column label="金额"><template #default="s">{{s.row.currency}} {{Number(s.row.amount||0).toLocaleString()}}</template></el-table-column>
<el-table-column prop="effective_from" label="生效日"/><el-table-column prop="effective_to" label="到期日"/><el-table-column prop="created_by_name" label="创建人"/><el-table-column prop="created_at" label="创建时间" width="190"/>
</el-table></div>
<div class="card" style="margin-top:16px"><AttachmentsPanel entity-type="contract" :entity-id="detail.id" title="合同附件"/></div>
</template></el-drawer>

<el-dialog v-model="versionDialog" title="生成合同新版本" width="720"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="金额"><el-input v-model.number="versionForm.amount" type="number"/></el-form-item><el-form-item label="币种"><el-select v-model="versionForm.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="生效日期"><el-input v-model="versionForm.effective_from" type="date"/></el-form-item><el-form-item label="到期日期"><el-input v-model="versionForm.effective_to" type="date"/></el-form-item></div>
<el-form-item label="合同条款"><el-input v-model="versionForm.terms" type="textarea" :rows="8"/></el-form-item>
</el-form><template #footer><el-button @click="versionDialog=false">取消</el-button><el-button type="primary" @click="newVersion">生成新版本</el-button></template></el-dialog>
</AppLayout></template>