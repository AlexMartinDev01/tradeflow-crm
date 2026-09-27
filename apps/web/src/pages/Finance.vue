<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const payments=ref<any[]>([]),customers=ref<any[]>([]),selectedCustomer=ref(''),summary=ref<any>(null);
const loading=ref(false),summaryLoading=ref(false),savingReceipt=ref(false),savingCredit=ref(false);
const credit=reactive<any>({rating:'',credit_limit:0,currency:'USD',payment_days:0,insured_limit:0,notes:''}),receiptDialog=ref(false),selectedPayment=ref<any>(null),receipt=reactive<any>({paid_at:new Date().toISOString().slice(0,16),bank_ref:''});
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
const canFinance=computed(()=>['admin','manager','finance'].includes(auth.user?.role));
const visiblePayments=computed(()=>selectedCustomer.value?payments.value.filter(x=>x.customer_id===selectedCustomer.value):payments.value);
function statusType(v:string){return v==='paid'?'success':v==='overdue'?'danger':v==='partial'?'warning':'info'}

async function load(){
  loading.value=true;
  try{
    const [p,c]=await Promise.all([api.get('/payments',{params:{size:500}}),api.get('/customers',{params:{size:200}})]);
    payments.value=p.data.data;customers.value=c.data.data;
  }catch(e:any){ElMessage.error(e.response?.data?.message||'回款数据加载失败，请稍后重试')}
  finally{loading.value=false}
}
async function chooseCustomer(){
  if(!selectedCustomer.value){summary.value=null;return}
  summaryLoading.value=true;
  try{
    summary.value=(await api.get('/finance/summary',{params:{customer_id:selectedCustomer.value}})).data;
    Object.assign(credit,{rating:'',credit_limit:0,currency:'USD',payment_days:0,insured_limit:0,notes:'',...(summary.value.credit||{})});
  }catch(e:any){summary.value=null;ElMessage.error(e.response?.data?.message||'客户信用数据加载失败')}
  finally{summaryLoading.value=false}
}
function openReceipt(p:any){selectedPayment.value=p;Object.assign(receipt,{paid_at:new Date().toISOString().slice(0,16),bank_ref:p.bank_ref||''});receiptDialog.value=true}
async function markPaid(){
  if(!selectedPayment.value)return;
  savingReceipt.value=true;
  try{
    await api.post('/workflows/payments/'+selectedPayment.value.id+'/mark-paid',{paid_at:new Date(receipt.paid_at).toISOString(),bank_ref:receipt.bank_ref});
    receiptDialog.value=false;await load();await chooseCustomer();ElMessage.success('到账已登记');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'到账登记失败，请检查数据后重试')}
  finally{savingReceipt.value=false}
}
async function saveCredit(){
  if(!selectedCustomer.value)return ElMessage.warning('请先选择客户');
  savingCredit.value=true;
  try{await api.put('/customers/'+selectedCustomer.value+'/credit-profile',credit);await chooseCustomer();ElMessage.success('信用档案已保存')}
  catch(e:any){ElMessage.error(e.response?.data?.message||'信用档案保存失败')}
  finally{savingCredit.value=false}
}
onMounted(load);
</script>
<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">回款与信用</h2><span class="muted">应收、到账、逾期、授信额度和可用额度 · 共 {{visiblePayments.length}} 条回款记录</span></div><el-select class="toolbar-control" v-model="selectedCustomer" clearable filterable placeholder="选择客户查看信用" @change="chooseCustomer"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></div>

<div v-if="summary" class="grid stats" style="margin-bottom:16px">
<div class="stat"><span class="muted">已到账</span><b>{{Number(summary.paid||0).toLocaleString()}}</b></div>
<div class="stat"><span class="muted">未收款</span><b>{{Number(summary.outstanding||0).toLocaleString()}}</b></div>
<div class="stat"><span class="muted">其中逾期</span><b>{{Number(summary.overdue||0).toLocaleString()}}</b></div>
<div class="stat"><span class="muted">可用授信</span><b>{{summary.credit_available==null?'-':Number(summary.credit_available).toLocaleString()}}</b></div>
</div>

<div class="grid" style="grid-template-columns:2fr 1fr;align-items:start">
<div class="card table-card" v-loading="loading"><h3 class="section-title">应收 / 回款明细</h3><el-table :data="visiblePayments" empty-text="当前范围暂无回款记录">
<el-table-column label="客户" min-width="160"><template #default="s">{{customerMap[s.row.customer_id]||s.row.customer_id}}</template></el-table-column><el-table-column prop="type" label="类型"/><el-table-column label="金额"><template #default="s">{{s.row.currency}} {{Number(s.row.amount||0).toLocaleString()}}</template></el-table-column><el-table-column prop="due_at" label="应付日期"/><el-table-column prop="paid_at" label="到账日期"/><el-table-column prop="status" label="状态"><template #default="s"><el-tag :type="statusType(s.row.status)">{{s.row.status}}</el-tag></template></el-table-column><el-table-column prop="bank_ref" label="银行流水"/><el-table-column v-if="canFinance" label="操作" width="100" fixed="right"><template #default="s"><el-button v-if="s.row.status!=='paid'" link type="primary" @click="openReceipt(s.row)">登记到账</el-button></template></el-table-column>
</el-table></div>

<div class="card" v-loading="summaryLoading"><h3 class="section-title">客户信用档案</h3><template v-if="selectedCustomer"><el-form label-position="top">
<el-form-item label="信用评级"><el-select v-model="credit.rating" style="width:100%"><el-option v-for="x in ['A','B','C','D','Watch']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="授信额度"><el-input v-model.number="credit.credit_limit" type="number"/></el-form-item><el-form-item label="币种"><el-select v-model="credit.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="账期天数"><el-input v-model.number="credit.payment_days" type="number"/></el-form-item><el-form-item label="信用保险额度"><el-input v-model.number="credit.insured_limit" type="number"/></el-form-item><el-form-item label="备注"><el-input v-model="credit.notes" type="textarea"/></el-form-item>
<el-button v-if="canFinance" type="primary" :loading="savingCredit" @click="saveCredit">保存信用档案</el-button></el-form></template><el-empty v-else description="请选择客户查看授信与应收汇总"/>
</div>
</div>

<el-dialog v-model="receiptDialog" title="登记到账" width="480"><el-form label-position="top"><el-form-item label="到账时间"><el-input v-model="receipt.paid_at" type="datetime-local"/></el-form-item><el-form-item label="银行流水号"><el-input v-model="receipt.bank_ref"/></el-form-item></el-form><template #footer><el-button @click="receiptDialog=false">取消</el-button><el-button type="primary" :loading="savingReceipt" @click="markPaid">确认到账</el-button></template></el-dialog>
</AppLayout></template>