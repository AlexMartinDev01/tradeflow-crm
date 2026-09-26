<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),customers=ref<any[]>([]),dialog=ref(false),quoteDialog=ref(false),lossDialog=ref(false),selected=ref<any>(null),pendingStage=ref('');
const form=reactive<any>({customer_id:'',name:'',stage:'qualification',expected_amount:0,currency:'USD',expected_close_date:'',probability:20,competitor:'',notes:''});
const qform=reactive<any>({currency:'USD',incoterm:'FOB',payment_terms:'30% T/T deposit, 70% before shipment',moq:'',packaging:'',lead_time:'',valid_until:'',notes:''});
const lossForm=reactive<any>({loss_reason:''});
const customerMap=computed(()=>Object.fromEntries(customers.value.map((x:any)=>[x.id,x.name])));
const stages=['qualification','solution','quotation','sample','negotiation','won','lost'];

async function load(){rows.value=(await api.get('/opportunities',{params:{size:200}})).data.data;customers.value=(await api.get('/customers',{params:{size:200}})).data.data}
async function save(){
  if(!form.customer_id||!form.name)return ElMessage.warning('客户和商机名称必填');
  await api.post('/opportunities',form);dialog.value=false;await load();ElMessage.success('商机已创建')
}
function stageChanged(r:any,value:any){requestStage(r,String(value))}
async function requestStage(r:any,value:string){
  if(value==='lost'){
    selected.value=r;pendingStage.value=value;lossForm.loss_reason=r.loss_reason||'';lossDialog.value=true;return;
  }
  await api.post(`/workflows/opportunities/${r.id}/stage`,{stage:value,probability:r.probability});await load();ElMessage.success('阶段已更新')
}
async function saveLost(){
  if(!lossForm.loss_reason.trim())return ElMessage.warning('输单原因必填');
  await api.post(`/workflows/opportunities/${selected.value.id}/stage`,{stage:'lost',loss_reason:lossForm.loss_reason});
  lossDialog.value=false;await load();ElMessage.success('商机已关闭并记录输单原因')
}
function openQuote(r:any){
  selected.value=r;Object.assign(qform,{currency:r.currency||'USD',incoterm:'FOB',payment_terms:'30% T/T deposit, 70% before shipment',moq:'',packaging:'',lead_time:'',valid_until:'',notes:r.notes||''});quoteDialog.value=true
}
async function createQuote(){
  const {data}=await api.post(`/workflows/opportunities/${selected.value.id}/to-quotation`,qform);
  quoteDialog.value=false;await api.post(`/workflows/opportunities/${selected.value.id}/stage`,{stage:'quotation',probability:selected.value.probability});await load();ElMessage.success(`报价 ${data.quote_no} 已创建`)
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">商机管理</h2><span class="muted">阶段、金额、概率、竞争对手与输单原因闭环</span></div><el-button type="primary" @click="dialog=true">新增商机</el-button></div>
<div class="card"><el-table :data="rows">
<el-table-column label="客户" min-width="180"><template #default="s">{{customerMap[s.row.customer_id]||s.row.customer_id}}</template></el-table-column>
<el-table-column prop="name" label="商机" min-width="220"/>
<el-table-column label="阶段" width="150"><template #default="s"><el-select :model-value="s.row.stage" size="small" @change="stageChanged(s.row,$event)"><el-option v-for="x in stages" :key="x" :label="x" :value="x"/></el-select></template></el-table-column>
<el-table-column label="预计金额" width="150"><template #default="s">{{s.row.currency}} {{Number(s.row.expected_amount||0).toLocaleString()}}</template></el-table-column>
<el-table-column prop="probability" label="概率%" width="80"/><el-table-column prop="expected_close_date" label="预计成交日" width="130"/><el-table-column prop="competitor" label="竞争对手"/>
<el-table-column prop="loss_reason" label="输单原因" min-width="180"><template #default="s">{{s.row.stage==='lost'?(s.row.loss_reason||'-'):'-'}}</template></el-table-column>
<el-table-column label="操作" width="120"><template #default="s"><el-button v-if="!['won','lost'].includes(s.row.stage)" link type="primary" @click="openQuote(s.row)">生成报价</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" title="新增商机" width="700"><el-form label-position="top"><el-form-item label="客户"><el-select v-model="form.customer_id" filterable style="width:100%"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item><el-form-item label="商机名称"><el-input v-model="form.name"/></el-form-item><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="阶段"><el-select v-model="form.stage" style="width:100%"><el-option v-for="x in stages.filter(x=>x!=='lost')" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="概率 %"><el-input v-model.number="form.probability" type="number"/></el-form-item><el-form-item label="预计金额"><el-input v-model.number="form.expected_amount" type="number"/></el-form-item><el-form-item label="币种"><el-select v-model="form.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="预计成交日"><el-input v-model="form.expected_close_date" type="date"/></el-form-item><el-form-item label="竞争对手"><el-input v-model="form.competitor"/></el-form-item></div><el-form-item label="备注"><el-input v-model="form.notes" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>

<el-dialog v-model="lossDialog" title="关闭商机 / 输单原因" width="560"><el-alert type="warning" :closable="false" title="输单原因会进入后续销售分析，请尽量填写真实原因。"/><el-form label-position="top" style="margin-top:14px"><el-form-item label="输单原因"><el-select v-model="lossForm.loss_reason" allow-create filterable style="width:100%"><el-option v-for="x in ['价格原因','交期原因','产品/规格不匹配','认证要求','付款条件','竞争对手中标','客户项目取消','客户失联','预算不足','其他']" :key="x" :label="x" :value="x"/></el-select></el-form-item></el-form><template #footer><el-button @click="lossDialog=false">取消</el-button><el-button type="danger" @click="saveLost">确认输单</el-button></template></el-dialog>

<el-dialog v-model="quoteDialog" title="生成初版报价" width="680"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="币种"><el-select v-model="qform.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="Incoterm"><el-select v-model="qform.incoterm" style="width:100%"><el-option v-for="x in ['EXW','FOB','CFR','CIF','DAP','DDP']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="付款条件"><el-input v-model="qform.payment_terms"/></el-form-item><el-form-item label="MOQ"><el-input v-model="qform.moq"/></el-form-item><el-form-item label="包装"><el-input v-model="qform.packaging"/></el-form-item><el-form-item label="交期"><el-input v-model="qform.lead_time"/></el-form-item><el-form-item label="有效期"><el-input v-model="qform.valid_until" type="date"/></el-form-item></div><el-form-item label="备注"><el-input v-model="qform.notes" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="quoteDialog=false">取消</el-button><el-button type="primary" @click="createQuote">创建报价</el-button></template></el-dialog>
</AppLayout></template>