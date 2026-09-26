<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const rows=ref<any[]>([]),dialog=ref(false),result=ref<any>(null);
const form=reactive<any>({base_currency:'USD',quote_currency:'CNY',rate:7,rate_date:new Date().toISOString().slice(0,10),source:'manual',notes:''});
const calc=reactive<any>({amount:1000,from:'USD',to:'CNY',date:new Date().toISOString().slice(0,10)});
const canManage=computed(()=>['admin','manager','finance'].includes(auth.user?.role));
const currencies=['USD','EUR','GBP','CNY','JPY','CAD','AUD','SGD','HKD','KRW'];
async function load(){rows.value=(await api.get('/settings/exchange-rates')).data}
async function save(){
  if(form.base_currency===form.quote_currency)return ElMessage.warning('基准币种和目标币种不能相同');
  if(Number(form.rate)<=0)return ElMessage.warning('汇率必须大于0');
  await api.post('/settings/exchange-rates',form);dialog.value=false;await load();ElMessage.success('汇率已保存')
}
async function remove(r:any){await ElMessageBox.confirm(`删除 ${r.rate_date} 的 ${r.base_currency}/${r.quote_currency} 汇率？`,'确认');await api.delete(`/settings/exchange-rates/${r.id}`);await load()}
async function convert(){
  try{result.value=(await api.get('/fx/convert',{params:calc})).data}
  catch(e:any){if(e.response?.data?.error==='rate_not_found')ElMessage.error('没有找到该日期可用的直接、反向或 USD 交叉汇率');else throw e}
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">汇率与币种换算</h2><span class="muted">可审计汇率表 · 按生效日期取最近汇率 · 支持直接、反向和 USD 交叉换算</span></div><el-button v-if="canManage" type="primary" @click="dialog=true">录入汇率</el-button></div>
<el-alert type="info" :closable="false" title="当前汇率由企业人工维护/导入，不宣称为实时市场汇率。报价时会记录并展示实际使用的数据源和日期。" style="margin-bottom:16px"/>

<div class="card" style="margin-bottom:16px"><h3 class="section-title">换算测试</h3><div class="grid" style="grid-template-columns:1fr 150px 150px 160px auto">
  <el-input v-model.number="calc.amount" type="number" placeholder="金额"/>
  <el-select v-model="calc.from" filterable allow-create><el-option v-for="x in currencies" :key="x" :label="x" :value="x"/></el-select>
  <el-select v-model="calc.to" filterable allow-create><el-option v-for="x in currencies" :key="x" :label="x" :value="x"/></el-select>
  <el-input v-model="calc.date" type="date"/><el-button type="primary" plain @click="convert">换算</el-button>
</div>
<el-descriptions v-if="result" :column="4" border style="margin-top:14px"><el-descriptions-item label="结果"><b>{{result.to}} {{Number(result.converted).toLocaleString()}}</b></el-descriptions-item><el-descriptions-item label="汇率">{{Number(result.rate).toFixed(6)}}</el-descriptions-item><el-descriptions-item label="路径">{{(result.path||[]).join(' → ')}}</el-descriptions-item><el-descriptions-item label="数据源">{{result.source}} · {{result.rate_date}}</el-descriptions-item></el-descriptions>
</div>

<div class="card"><el-table :data="rows">
  <el-table-column prop="rate_date" label="生效日期" width="120"/><el-table-column label="币种对" width="130"><template #default="s">{{s.row.base_currency}} / {{s.row.quote_currency}}</template></el-table-column>
  <el-table-column prop="rate" label="汇率"/><el-table-column prop="source" label="来源"/><el-table-column prop="notes" label="备注" min-width="180"/><el-table-column prop="created_by_name" label="录入人" width="120"/>
  <el-table-column v-if="canManage" label="操作" width="80"><template #default="s"><el-button link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" title="录入汇率" width="600"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="基准币种"><el-select v-model="form.base_currency" filterable allow-create style="width:100%"><el-option v-for="x in currencies" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="目标币种"><el-select v-model="form.quote_currency" filterable allow-create style="width:100%"><el-option v-for="x in currencies" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="汇率"><el-input v-model.number="form.rate" type="number"/></el-form-item><el-form-item label="生效日期"><el-input v-model="form.rate_date" type="date"/></el-form-item>
  <el-form-item label="来源"><el-input v-model="form.source" placeholder="manual / bank / provider name"/></el-form-item>
</div><el-form-item label="备注"><el-input v-model="form.notes" type="textarea"/></el-form-item></el-form>
<template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
</AppLayout></template>