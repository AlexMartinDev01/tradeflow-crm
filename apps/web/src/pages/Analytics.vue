<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
import * as echarts from 'echarts';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const data=ref<any>({summary:{},new_customers:[],order_revenue:[],funnel:[],source:[],salespeople:[],customer_value:[],brands:[]});
const months=ref(12),loading=ref(false);
const revenueEl=ref<HTMLElement|null>(null),funnelEl=ref<HTMLElement|null>(null),sourceEl=ref<HTMLElement|null>(null),customerEl=ref<HTMLElement|null>(null),brandEl=ref<HTMLElement|null>(null);
let charts:echarts.ECharts[]=[];

function dispose(){for(const c of charts)c.dispose();charts=[]}
function init(el:HTMLElement|null){if(!el)return null;const c=echarts.init(el);charts.push(c);return c}
function money(v:any){return Number(v||0).toLocaleString(undefined,{maximumFractionDigits:2})}

async function load(){
  loading.value=true;
  try{data.value=(await api.get('/analytics/overview',{params:{months:months.value}})).data;await nextTick();render()}
  finally{loading.value=false}
}
function render(){
  dispose();
  const monthSet=new Set<string>();for(const x of data.value.new_customers||[])monthSet.add(x.month);for(const x of data.value.order_revenue||[])monthSet.add(x.month);
  const ms=[...monthSet].sort();
  const nc=Object.fromEntries((data.value.new_customers||[]).map((x:any)=>[x.month,Number(x.value||0)]));
  const or=Object.fromEntries((data.value.order_revenue||[]).map((x:any)=>[x.month,Number(x.revenue||0)]));
  init(revenueEl.value)?.setOption({tooltip:{trigger:'axis'},legend:{data:['新增客户','订单收入']},xAxis:{type:'category',data:ms},yAxis:[{type:'value',name:'客户数'},{type:'value',name:'收入'}],series:[{name:'新增客户',type:'bar',data:ms.map(m=>nc[m]||0)},{name:'订单收入',type:'line',yAxisIndex:1,smooth:true,data:ms.map(m=>or[m]||0)}]});
  init(funnelEl.value)?.setOption({tooltip:{trigger:'item'},series:[{type:'funnel',sort:'descending',data:(data.value.funnel||[]).map((x:any)=>({name:x.stage,value:Number(x.count||0)}))}]});
  init(sourceEl.value)?.setOption({tooltip:{trigger:'axis'},xAxis:{type:'category',data:(data.value.source||[]).map((x:any)=>x.source),axisLabel:{rotate:30}},yAxis:{type:'value'},series:[{type:'bar',name:'收入',data:(data.value.source||[]).map((x:any)=>Number(x.revenue||0))}]});
  init(customerEl.value)?.setOption({tooltip:{trigger:'axis'},grid:{left:140},xAxis:{type:'value'},yAxis:{type:'category',data:(data.value.customer_value||[]).slice(0,10).map((x:any)=>x.name).reverse()},series:[{type:'bar',name:'销售额',data:(data.value.customer_value||[]).slice(0,10).map((x:any)=>Number(x.revenue||0)).reverse()}]});
  init(brandEl.value)?.setOption({tooltip:{trigger:'item'},series:[{type:'pie',radius:['38%','68%'],data:(data.value.brands||[]).map((x:any)=>({name:x.name,value:Number(x.customers||0)}))}]});
}
function resize(){for(const c of charts)c.resize()}
onMounted(()=>{load();window.addEventListener('resize',resize)});
onBeforeUnmount(()=>{window.removeEventListener('resize',resize);dispose()});
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">统计分析中心</h2><span class="muted">客户、销售漏斗、收入、预测、复购、来源、品牌与业务员绩效</span></div><el-select v-model="months" style="width:150px" @change="load"><el-option :value="6" label="最近6个月"/><el-option :value="12" label="最近12个月"/><el-option :value="24" label="最近24个月"/></el-select></div>

<div v-loading="loading" class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">客户总数</span><b>{{data.summary.total_customers||0}}</b></div>
  <div class="stat"><span class="muted">订单收入</span><b>{{money(data.summary.total_revenue)}}</b></div>
  <div class="stat"><span class="muted">开放商机</span><b>{{data.summary.open_opportunities||0}}</b></div>
  <div class="stat"><span class="muted">Pipeline</span><b>{{money(data.summary.pipeline)}}</b></div>
  <div class="stat"><span class="muted">加权预测</span><b>{{money(data.summary.weighted_forecast)}}</b></div>
  <div class="stat"><span class="muted">复购率</span><b>{{Number(data.summary.repurchase_rate||0).toFixed(1)}}%</b></div>
</div>

<div class="grid" style="grid-template-columns:1.4fr 1fr;align-items:start">
  <div class="card"><h3 class="section-title">客户增长 & 订单收入趋势</h3><div ref="revenueEl" style="height:340px"></div></div>
  <div class="card"><h3 class="section-title">销售漏斗</h3><div ref="funnelEl" style="height:340px"></div></div>
</div>

<div class="grid" style="grid-template-columns:1fr 1fr 1fr;align-items:start;margin-top:16px">
  <div class="card"><h3 class="section-title">来源收入</h3><div ref="sourceEl" style="height:320px"></div></div>
  <div class="card"><h3 class="section-title">客户销售额 Top 10</h3><div ref="customerEl" style="height:320px"></div></div>
  <div class="card"><h3 class="section-title">品牌关联客户分布</h3><div ref="brandEl" style="height:320px"></div></div>
</div>

<div class="grid" style="grid-template-columns:1.2fr 1fr;align-items:start;margin-top:16px">
<div class="card"><h3 class="section-title">业务员经营数据</h3><el-table :data="data.salespeople">
  <el-table-column prop="display_name" label="人员" min-width="130"/><el-table-column prop="role" label="角色" width="100"/>
  <el-table-column prop="customers" label="客户数" width="90"/><el-table-column prop="activities" label="跟进数" width="90"/><el-table-column prop="orders" label="订单数" width="90"/>
  <el-table-column label="收入"><template #default="s">{{money(s.row.revenue)}}</template></el-table-column>
</el-table></div>
<div class="card"><h3 class="section-title">客户价值排行</h3><el-table :data="data.customer_value" max-height="420">
  <el-table-column prop="name" label="客户" min-width="150"/><el-table-column prop="order_count" label="订单" width="70"/>
  <el-table-column label="销售额"><template #default="s">{{money(s.row.revenue)}}</template></el-table-column>
  <el-table-column label="估算毛利"><template #default="s">{{money(s.row.estimated_gross_profit)}}</template></el-table-column>
</el-table></div>
</div>
</AppLayout></template>