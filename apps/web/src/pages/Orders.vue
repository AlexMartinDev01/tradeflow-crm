<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import AttachmentsPanel from '../components/AttachmentsPanel.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const canEdit=computed(()=>['admin','manager','sales'].includes(auth.user?.role));
const canPlanPayments=computed(()=>['admin','manager','sales','finance'].includes(auth.user?.role));
const canGenerateDocs=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role));
const rows=ref<any[]>([]),customers=ref<any[]>([]),detail=ref<any>(null),drawer=ref(false),itemDialog=ref(false),paymentPlanDialog=ref(false),loading=ref(false),detailLoading=ref(false),actionBusy=ref('');
const paymentPlan=reactive<any>({deposit_percent:30,deposit_due:new Date().toISOString().slice(0,10),balance_due:''});
const item=reactive<any>({product_id:'',product_name:'',quantity:1,unit:'pcs',unit_price:0,amount:0,delivery_date:''});
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
const statuses=['pending','confirmed','production','ready','partial_shipped','shipped','partial_delivered','completed','cancelled'];
function statusType(v:string){return v==='completed'?'success':v==='cancelled'?'danger':v==='shipped'||v==='partial_delivered'?'primary':v==='production'||v==='ready'?'warning':'info'}
async function runBusy(key:string,fn:()=>Promise<any>){if(actionBusy.value)return;actionBusy.value=key;try{return await fn()}finally{actionBusy.value=''}}
async function load(){loading.value=true;try{const [or,cr]=await Promise.all([api.get('/orders',{params:{size:200}}),api.get('/customers',{params:{size:200}})]);rows.value=or.data.data;customers.value=cr.data.data}catch(e:any){ElMessage.error(e.response?.data?.message||'订单数据加载失败，请稍后重试')}finally{loading.value=false}}
async function open(r:any){drawer.value=true;detail.value=null;detailLoading.value=true;try{detail.value=(await api.get(`/workflows/orders/${r.id}/full`)).data}catch(e:any){drawer.value=false;ElMessage.error(e.response?.data?.message||'订单详情加载失败')}finally{detailLoading.value=false}}
async function refresh(){if(detail.value)detail.value=(await api.get(`/workflows/orders/${detail.value.id}/full`)).data;await load()}
async function saveHeader(){await runBusy('header',async()=>{try{const p={customer_po:detail.value.customer_po,incoterm:detail.value.incoterm,payment_terms:detail.value.payment_terms,requested_delivery:detail.value.requested_delivery,notes:detail.value.notes};await api.patch(`/orders/${detail.value.id}`,p);await refresh();ElMessage.success('订单信息已保存')}catch(e:any){ElMessage.error(e.response?.data?.message||'订单信息保存失败')}})}
async function changeStatus(v:string){await runBusy('status',async()=>{try{await api.post(`/workflows/orders/${detail.value.id}/status`,{status:v});await refresh();ElMessage.success('订单状态已更新')}catch(e:any){ElMessage.error(e.response?.data?.message||'订单状态更新失败')}})}
async function addItem(){if(!item.product_name.trim())return ElMessage.warning('请输入产品名称');item.amount=Number(item.quantity||0)*Number(item.unit_price||0);await api.post('/orderItems',{...item,order_id:detail.value.id});itemDialog.value=false;Object.assign(item,{product_id:'',product_name:'',quantity:1,unit:'pcs',unit_price:0,amount:0,delivery_date:''});await api.post(`/workflows/orders/${detail.value.id}/recalculate`,{});await refresh()}
async function removeItem(r:any){await ElMessageBox.confirm('确认删除该订单明细？','确认');await api.delete(`/orderItems/${r.id}`);await api.post(`/workflows/orders/${detail.value.id}/recalculate`,{});await refresh()}
async function createPaymentPlan(){await runBusy('payment',async()=>{try{await api.post(`/workflows/orders/${detail.value.id}/payment-plan`,paymentPlan);paymentPlanDialog.value=false;await refresh();ElMessage.success('定金/尾款计划已生成')}catch(e:any){ElMessage.error(e.response?.data?.error==='payment_plan_exists'?'该订单已经存在收款计划':(e.response?.data?.message||'生成失败'))}})}
async function generateDoc(type:string){await runBusy('doc-'+type,async()=>{try{await api.post(`/workflows/orders/${detail.value.id}/generate-document`,{type});await refresh();ElMessage.success(`${type} 已生成`)}catch(e:any){ElMessage.error(e.response?.data?.message||`${type} 生成失败`)}})}
async function previewDoc(d:any){const r=await api.get(`/documents/${d.id}/preview`,{responseType:'blob'});const u=URL.createObjectURL(r.data);window.open(u,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(u),60000)}
async function downloadDoc(d:any){const r=await api.get(`/documents/${d.id}/download`,{responseType:'blob'});const u=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=u;a.download=d.name||'document';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">订单执行</h2><span class="muted">订单头、产品、状态、回款、出运、单证和变更记录统一管理 · 共 {{rows.length}} 个订单</span></div></div>
<div class="card table-card"><el-table v-loading="loading" :data="rows" empty-text="当前范围暂无订单" @row-dblclick="open">
  <el-table-column prop="order_no" label="订单编号" width="180"/><el-table-column label="客户" min-width="180"><template #default="s">{{customerMap[s.row.customer_id]||s.row.customer_id}}</template></el-table-column>
  <el-table-column prop="customer_po" label="客户PO"/><el-table-column prop="status" label="状态" width="140"><template #default="s"><el-tag :type="statusType(s.row.status)">{{s.row.status}}</el-tag></template></el-table-column><el-table-column prop="incoterm" label="贸易条款" width="100"/>
  <el-table-column label="金额" width="150"><template #default="s">{{s.row.currency}} {{Number(s.row.total||0).toLocaleString()}}</template></el-table-column><el-table-column prop="requested_delivery" label="要求交期" width="130"/>
  <el-table-column label="操作" width="90" fixed="right"><template #default="s"><el-button link type="primary" @click="open(s.row)">详情</el-button></template></el-table-column>
</el-table></div>

<el-drawer v-model="drawer" size="82%" title="订单执行详情">
<div v-loading="detailLoading"><template v-if="detail">
<div class="toolbar"><div><h3 style="margin:0">{{detail.order_no}}</h3><span class="muted">{{detail.customer_name}} · {{detail.currency}} {{Number(detail.total||0).toLocaleString()}}</span></div><div style="display:flex;gap:8px"><el-button v-if="canPlanPayments" :disabled="!!actionBusy" @click="paymentPlanDialog=true">生成收款计划</el-button><el-select v-if="canEdit" v-model="detail.status" :loading="actionBusy==='status'" style="width:180px" @change="changeStatus"><el-option v-for="x in statuses" :key="x" :label="x" :value="x"/></el-select><el-tag v-if="!canEdit">{{detail.status}}</el-tag></div></div>

<div class="card" style="margin-bottom:16px"><div class="grid" style="grid-template-columns:repeat(4,1fr)">
<el-form-item label="客户PO"><el-input v-model="detail.customer_po"/></el-form-item><el-form-item label="Incoterm"><el-input v-model="detail.incoterm"/></el-form-item>
<el-form-item label="付款条件"><el-input v-model="detail.payment_terms"/></el-form-item><el-form-item label="要求交期"><el-input v-model="detail.requested_delivery" type="date"/></el-form-item>
</div><el-form-item label="备注"><el-input v-model="detail.notes" type="textarea"/></el-form-item><el-button v-if="canEdit" type="primary" plain :loading="actionBusy==='header'" :disabled="!!actionBusy&&actionBusy!=='header'" @click="saveHeader">保存订单头</el-button></div>

<el-tabs>
<el-tab-pane label="产品明细">
<div class="toolbar"><b>订单产品</b><el-button v-if="canEdit" type="primary" size="small" @click="itemDialog=true">添加产品</el-button></div>
<el-table :data="detail.items"><el-table-column prop="product_name" label="产品" min-width="180"/><el-table-column prop="quantity" label="数量"/><el-table-column prop="unit" label="单位"/><el-table-column prop="unit_price" label="单价"/><el-table-column prop="amount" label="金额"/><el-table-column prop="delivery_date" label="计划交期"/><el-table-column label="操作" width="80"><template #default="s"><el-button v-if="canEdit" link type="danger" @click="removeItem(s.row)">删除</el-button></template></el-table-column></el-table>
</el-tab-pane>
<el-tab-pane label="回款"><el-table :data="detail.payments"><el-table-column prop="type" label="类型"/><el-table-column prop="amount" label="金额"/><el-table-column prop="currency" label="币种"/><el-table-column prop="due_at" label="应付日期"/><el-table-column prop="paid_at" label="到账日期"/><el-table-column prop="status" label="状态"/></el-table></el-tab-pane>
<el-tab-pane label="出运"><el-table :data="detail.shipments"><el-table-column prop="booking_no" label="订舱号"/><el-table-column prop="carrier" label="船公司"/><el-table-column prop="container_no" label="柜号"/><el-table-column prop="bl_no" label="提单号"/><el-table-column prop="etd" label="ETD"/><el-table-column prop="eta" label="ETA"/><el-table-column prop="status" label="状态"/></el-table></el-tab-pane>
<el-tab-pane label="单证"><div class="toolbar"><b>订单单证</b><div v-if="canGenerateDocs" style="display:flex;gap:6px"><el-button size="small" :loading="actionBusy==='doc-PI'" :disabled="!!actionBusy" @click="generateDoc('PI')">生成 PI</el-button><el-button size="small" :loading="actionBusy==='doc-CI'" :disabled="!!actionBusy" @click="generateDoc('CI')">生成 CI</el-button><el-button size="small" :loading="actionBusy==='doc-PL'" :disabled="!!actionBusy" @click="generateDoc('PL')">生成 PL</el-button><el-button size="small" :loading="actionBusy==='doc-BL'" :disabled="!!actionBusy" @click="generateDoc('BL')">Draft BL</el-button><el-button size="small" :loading="actionBusy==='doc-CO'" :disabled="!!actionBusy" @click="generateDoc('CO')">Draft CO</el-button></div></div><el-table :data="detail.documents"><el-table-column prop="category" label="类别"/><el-table-column prop="name" label="名称" min-width="220"/><el-table-column prop="version" label="版本"/><el-table-column prop="created_at" label="时间"/><el-table-column label="操作" width="140"><template #default="s"><el-button link type="primary" @click="previewDoc(s.row)">预览</el-button><el-button link @click="downloadDoc(s.row)">下载</el-button></template></el-table-column></el-table><div style="margin-top:18px"><AttachmentsPanel entity-type="order" :entity-id="detail.id" title="订单附件"/></div></el-tab-pane>
<el-tab-pane label="变更记录"><el-table :data="detail.changes"><el-table-column prop="created_at" label="时间" width="190"/><el-table-column prop="field_name" label="字段"/><el-table-column prop="old_value" label="原值"/><el-table-column prop="new_value" label="新值"/><el-table-column prop="changed_by_name" label="操作人"/><el-table-column prop="note" label="备注"/></el-table></el-tab-pane>
</el-tabs>
</template></div>
</el-drawer>

<el-dialog v-model="itemDialog" title="添加订单产品" width="650"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="产品名称"><el-input v-model="item.product_name"/></el-form-item><el-form-item label="数量"><el-input v-model.number="item.quantity" type="number"/></el-form-item>
<el-form-item label="单位"><el-input v-model="item.unit"/></el-form-item><el-form-item label="单价"><el-input v-model.number="item.unit_price" type="number"/></el-form-item>
<el-form-item label="计划交期"><el-input v-model="item.delivery_date" type="date"/></el-form-item>
</div></el-form><template #footer><el-button @click="itemDialog=false">取消</el-button><el-button type="primary" @click="addItem">添加并重算</el-button></template></el-dialog>
<el-dialog v-model="paymentPlanDialog" title="生成定金/尾款计划" width="520"><el-form label-position="top"><el-form-item label="定金比例 %"><el-input-number v-model="paymentPlan.deposit_percent" :min="0" :max="100"/></el-form-item><el-form-item label="定金到期日"><el-input v-model="paymentPlan.deposit_due" type="date"/></el-form-item><el-form-item label="尾款到期日"><el-input v-model="paymentPlan.balance_due" type="date"/></el-form-item></el-form><template #footer><el-button @click="paymentPlanDialog=false">取消</el-button><el-button type="primary" :loading="actionBusy==='payment'" :disabled="!!actionBusy" @click="createPaymentPlan">生成计划</el-button></template></el-dialog>
</AppLayout></template>