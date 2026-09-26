<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const canWrite=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role));
const canConvert=computed(()=>['admin','manager','sales'].includes(auth.user?.role));
const rows=ref<any[]>([]),customers=ref<any[]>([]),contacts=ref<any[]>([]),summary=ref<any>({}),slaHours=ref(4);
const dialog=ref(false),convertDialog=ref(false),selected=ref<any>(null),loading=ref(false);
const form=reactive<any>({customer_id:'',contact_id:'',source:'Website',status:'new',products:[],quantity:'',target_price:'',incoterm:'FOB',destination_port:'',requested_delivery:'',received_at:new Date().toISOString().slice(0,16),notes:''});
const conv=reactive<any>({name:'',expected_amount:0,currency:'USD',expected_close_date:'',probability:20,competitor:'',notes:''});
const customerMap=computed(()=>Object.fromEntries(customers.value.map((x:any)=>[x.id,x.name])));
const filteredContacts=computed(()=>contacts.value.filter((x:any)=>x.customer_id===form.customer_id));

async function load(){
  loading.value=true;
  try{
    const [dash,c,ct]=await Promise.all([
      api.get('/inquiries/sla-dashboard'),
      api.get('/customers',{params:{size:200}}),
      api.get('/contacts',{params:{size:500}})
    ]);
    rows.value=dash.data.rows;summary.value=dash.data.summary;slaHours.value=dash.data.sla_hours;
    customers.value=c.data.data;contacts.value=ct.data.data;
  }finally{loading.value=false}
}
async function save(){
  if(!form.customer_id)return ElMessage.warning('请选择客户');
  await api.post('/inquiries',{...form,received_at:new Date(form.received_at).toISOString()});
  dialog.value=false;await load();ElMessage.success('询盘已创建并自动分配负责人');
}
function openConvert(r:any){
  selected.value=r;
  Object.assign(conv,{name:`${customerMap.value[r.customer_id]||''} - ${r.inquiry_no}`,expected_amount:0,currency:'USD',expected_close_date:'',probability:20,competitor:'',notes:r.notes||''});
  convertDialog.value=true;
}
async function convert(){
  await api.post(`/workflows/inquiries/${selected.value.id}/to-opportunity`,conv);
  convertDialog.value=false;await load();ElMessage.success('已转为商机');
}
async function markResponded(r:any){
  const {data}=await api.post(`/workflows/inquiries/${r.id}/respond`,{response_at:new Date().toISOString()});
  await load();
  ElMessage.success(data.sla_status==='within_sla'?'已记录首次响应，SLA达标':'已记录首次响应');
}
function slaType(r:any){return r.sla_status==='within_sla'?'success':r.sla_status==='breached'||r.sla_status==='overdue'?'danger':'warning'}
function slaText(r:any){
  if(r.sla_status==='within_sla')return `达标 · ${r.response_minutes}分钟`;
  if(r.sla_status==='breached')return `超时 · ${r.response_minutes}分钟`;
  if(r.sla_status==='overdue')return '已超时未响应';
  return '等待响应';
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">询盘管理</h2><span class="muted">自动分配负责人 · 首次响应 SLA {{slaHours}} 小时 · 询盘转商机</span></div><el-button v-if="canWrite" type="primary" @click="dialog=true">新增询盘</el-button></div>

<div class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">询盘总数</span><b>{{summary.total||0}}</b></div>
  <div class="stat"><span class="muted">已响应</span><b>{{summary.responded||0}}</b></div>
  <div class="stat"><span class="muted">当前超时未响应</span><b>{{summary.overdue||0}}</b></div>
  <div class="stat"><span class="muted">平均首次响应</span><b>{{summary.avg_response_minutes||0}} 分钟</b></div>
</div>

<div class="card"><el-table v-loading="loading" :data="rows">
  <el-table-column prop="inquiry_no" label="询盘编号" width="180"/>
  <el-table-column prop="customer_name" label="客户" min-width="170"/>
  <el-table-column prop="owner_name" label="负责人" width="120"/>
  <el-table-column label="产品" min-width="160"><template #default="s">{{(s.row.products||[]).join('、')||'-'}}</template></el-table-column>
  <el-table-column prop="target_price" label="目标价" width="110"/><el-table-column prop="incoterm" label="条款" width="85"/><el-table-column prop="destination_port" label="目的港" width="120"/>
  <el-table-column label="首次响应 SLA" width="160"><template #default="s"><el-tag :type="slaType(s.row)">{{slaText(s.row)}}</el-tag></template></el-table-column>
  <el-table-column prop="status" label="状态" width="105"><template #default="s"><el-tag :type="s.row.status==='converted'?'success':'info'">{{s.row.status}}</el-tag></template></el-table-column>
  <el-table-column label="操作" width="190" fixed="right"><template #default="s">
    <el-button v-if="canWrite&&!s.row.first_response_at&&s.row.status!=='converted'" link type="success" @click="markResponded(s.row)">记录响应</el-button>
    <el-button v-if="canConvert&&s.row.status!=='converted'" link type="primary" @click="openConvert(s.row)">转商机</el-button>
  </template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" title="新增询盘" width="760"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="客户"><el-select v-model="form.customer_id" filterable style="width:100%" @change="form.contact_id=''"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
<el-form-item label="联系人"><el-select v-model="form.contact_id" clearable style="width:100%"><el-option v-for="c in filteredContacts" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
<el-form-item label="来源"><el-input v-model="form.source"/></el-form-item><el-form-item label="收到时间"><el-input v-model="form.received_at" type="datetime-local"/></el-form-item>
<el-form-item label="产品"><el-select v-model="form.products" multiple allow-create filterable style="width:100%" placeholder="输入产品后回车"/></el-form-item><el-form-item label="数量"><el-input v-model="form.quantity"/></el-form-item>
<el-form-item label="目标价"><el-input v-model="form.target_price"/></el-form-item><el-form-item label="Incoterm"><el-select v-model="form.incoterm" style="width:100%"><el-option v-for="x in ['EXW','FOB','CFR','CIF','DAP','DDP']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="目的港"><el-input v-model="form.destination_port"/></el-form-item><el-form-item label="期望交期"><el-input v-model="form.requested_delivery" type="date"/></el-form-item>
</div><el-form-item label="备注"><el-input v-model="form.notes" type="textarea"/></el-form-item></el-form>
<template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存询盘</el-button></template></el-dialog>

<el-dialog v-model="convertDialog" title="询盘转商机" width="620"><el-form label-position="top">
<el-form-item label="商机名称"><el-input v-model="conv.name"/></el-form-item><div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="预计金额"><el-input v-model.number="conv.expected_amount" type="number"/></el-form-item>
<el-form-item label="币种"><el-select v-model="conv.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="预计成交日"><el-input v-model="conv.expected_close_date" type="date"/></el-form-item>
<el-form-item label="成交概率 %"><el-input v-model.number="conv.probability" type="number"/></el-form-item></div>
<el-form-item label="竞争对手"><el-input v-model="conv.competitor"/></el-form-item><el-form-item label="备注"><el-input v-model="conv.notes" type="textarea"/></el-form-item>
</el-form><template #footer><el-button @click="convertDialog=false">取消</el-button><el-button type="primary" @click="convert">确认转商机</el-button></template></el-dialog>
</AppLayout></template>