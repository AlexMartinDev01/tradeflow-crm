<script setup lang="ts">
import {ref,reactive,computed,onMounted,onBeforeUnmount,nextTick} from 'vue';
import * as echarts from 'echarts';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const catalog=ref<any>({}),saved=ref<any[]>([]),owners=ref<any[]>([]),result=ref<any>(null),loading=ref(false),saveDialog=ref(false),loadedId=ref('');
const chartEl=ref<HTMLElement|null>(null);let chart:echarts.ECharts|null=null;
const form=reactive<any>({entity_type:'orders',dimension:'month',metric:'count',chart_type:'bar',filters:{date_from:'',date_to:'',country:'',status:'',currency:'',owner_id:'',source:'',industry:'',incoterm:'',type:'',category:'',severity:'',carrier:'',destination:''}});
const saveForm=reactive<any>({name:'',is_shared:false});
const currencies=['USD','EUR','GBP','CNY','JPY','CAD','AUD','SGD','HKD','KRW'];
const canShare=computed(()=>['admin','manager'].includes(auth.user?.role));
const entityCfg=computed(()=>catalog.value[form.entity_type]||{dimensions:{},metrics:{},filters:[]});
const dimensionOptions=computed(()=>Object.entries(entityCfg.value.dimensions||{}).map(([value,label])=>({value,label})));
const metricOptions=computed(()=>Object.entries(entityCfg.value.metrics||{}).map(([value,label])=>({value,label})));
const filterKeys=computed(()=>entityCfg.value.filters||[]);
const moneyNeedsCurrency=computed(()=>{const money:any={orders:['total','avg_total'],opportunities:['expected','weighted'],quotations:['total'],payments:['amount']};return (money[form.entity_type]||[]).includes(form.metric)&&form.dimension!=='currency'&&!form.filters.currency;});

function dispose(){if(chart){chart.dispose();chart=null}}
function cleanFilters(){const x:any={};for(const [k,v] of Object.entries(form.filters))if(v!==''&&v!==null&&v!==undefined)x[k]=v;return x}
function currentSpec(){return {entity_type:form.entity_type,dimension:form.dimension,metric:form.metric,chart_type:form.chart_type,filters:cleanFilters()}}
function savedMeta(r:any){return (catalog.value[r.entity_type]?.label||r.entity_type)+' · '+r.created_by_name}
function onEntityChange(){
  const cfg=catalog.value[form.entity_type];if(!cfg)return;
  form.dimension=Object.keys(cfg.dimensions||{})[0]||'';form.metric=Object.keys(cfg.metrics||{})[0]||'';
  for(const k of Object.keys(form.filters))form.filters[k]='';
  result.value=null;loadedId.value='';dispose();
}
function render(){
  dispose();if(!chartEl.value||!result.value||form.chart_type==='table')return;
  chart=echarts.init(chartEl.value);
  const names=(result.value.rows||[]).map((x:any)=>x.dimension_value),values=(result.value.rows||[]).map((x:any)=>Number(x.metric_value||0));
  if(form.chart_type==='pie')chart.setOption({tooltip:{trigger:'item'},legend:{type:'scroll',bottom:0},series:[{name:result.value.metric_label,type:'pie',radius:['35%','68%'],data:names.map((name:string,i:number)=>({name,value:values[i]}))}]});
  else chart.setOption({tooltip:{trigger:'axis'},grid:{left:70,right:30,bottom:80,top:35},xAxis:{type:'category',data:names,axisLabel:{rotate:names.length>8?35:0}},yAxis:{type:'value'},series:[{name:result.value.metric_label,type:form.chart_type,data:values,smooth:form.chart_type==='line'}]});
}
async function load(){
  const [c,s,u]=await Promise.all([api.get('/reports/catalog'),api.get('/reports'),api.get('/users/lookup')]);
  catalog.value=c.data;saved.value=s.data;owners.value=u.data;
  if(!catalog.value[form.entity_type])form.entity_type=Object.keys(catalog.value)[0]||'';
  const cfg=catalog.value[form.entity_type];if(cfg){if(!cfg.dimensions?.[form.dimension])form.dimension=Object.keys(cfg.dimensions||{})[0]||'';if(!cfg.metrics?.[form.metric])form.metric=Object.keys(cfg.metrics||{})[0]||'';}
}
async function run(){
  if(moneyNeedsCurrency.value)return ElMessage.warning('金额类指标不能把不同币种直接相加。请选择币种筛选，或使用“币种”维度。');
  loading.value=true;
  try{result.value=(await api.post('/reports/run',currentSpec())).data;await nextTick();render()}
  catch(e:any){if(e.response?.data?.error==='currency_filter_required')ElMessage.error('该金额指标必须指定币种，或按币种维度统计');else ElMessage.error(e.response?.data?.message||e.response?.data?.error||'报表运行失败')}
  finally{loading.value=false}
}
function openSave(){saveForm.name=result.value?(result.value.entity_label+'-'+result.value.dimension_label+'-'+result.value.metric_label):'';saveForm.is_shared=false;saveDialog.value=true}
async function saveNew(){if(!saveForm.name.trim())return ElMessage.warning('请输入报表名称');await api.post('/reports',Object.assign({name:saveForm.name,is_shared:!!saveForm.is_shared},currentSpec()));saveDialog.value=false;await load();ElMessage.success('报表定义已保存')}
async function applySaved(r:any){
  form.entity_type=r.entity_type;form.dimension=r.dimension;form.metric=r.metric;form.chart_type=r.chart_type||'bar';
  for(const k of Object.keys(form.filters))form.filters[k]='';Object.assign(form.filters,r.filters||{});
  loadedId.value=r.id;await run();
}
async function updateSaved(){
  if(!loadedId.value)return;const r=saved.value.find((x:any)=>x.id===loadedId.value);if(!r)return;
  await api.patch('/reports/'+loadedId.value,Object.assign({name:r.name,is_shared:!!r.is_shared},currentSpec()));await load();ElMessage.success('已更新保存的报表');
}
async function removeSaved(r:any){await ElMessageBox.confirm('确认删除报表“'+r.name+'”？','确认');await api.delete('/reports/'+r.id);if(loadedId.value===r.id)loadedId.value='';await load()}
async function exportCsv(){
  if(moneyNeedsCurrency.value)return ElMessage.warning('请先指定币种或改为币种维度');
  const response=await api.post('/reports/export',currentSpec(),{responseType:'blob'}),blob=new Blob([response.data],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='tradeflow_report_'+form.entity_type+'_'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function resize(){chart?.resize()}
onMounted(async()=>{await load();window.addEventListener('resize',resize)});
onBeforeUnmount(()=>{window.removeEventListener('resize',resize);dispose()});
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">自定义报表设计器</h2><span class="muted">白名单维度与指标 · 自动继承数据权限 · 保存/共享 · CSV导出</span></div><div style="display:flex;gap:8px"><el-button @click="openSave">保存为报表</el-button><el-button v-if="loadedId" @click="updateSaved">更新当前报表</el-button><el-button @click="exportCsv">导出 CSV</el-button><el-button type="primary" :loading="loading" @click="run">运行报表</el-button></div></div>

<div class="grid" style="grid-template-columns:300px 1fr;align-items:start">
<div class="card">
  <h3 class="section-title">已保存报表</h3><el-empty v-if="!saved.length" description="暂无保存的报表"/>
  <div v-for="r in saved" :key="r.id" style="padding:10px 0;border-bottom:1px solid #eee">
    <div style="display:flex;justify-content:space-between;gap:8px"><div><b>{{r.name}}</b><div class="muted" style="font-size:12px">{{savedMeta(r)}} <el-tag v-if="r.is_shared" size="small">共享</el-tag></div></div><div><el-button link type="primary" @click="applySaved(r)">打开</el-button><el-button link type="danger" @click="removeSaved(r)">删除</el-button></div></div>
  </div>
</div>

<div>
<div class="card" style="margin-bottom:16px">
  <div class="grid" style="grid-template-columns:repeat(4,1fr)">
    <el-form-item label="业务实体"><el-select v-model="form.entity_type" style="width:100%" @change="onEntityChange"><el-option v-for="(v,k) in catalog" :key="String(k)" :label="v.label" :value="String(k)"/></el-select></el-form-item>
    <el-form-item label="维度"><el-select v-model="form.dimension" style="width:100%" @change="result=null"><el-option v-for="x in dimensionOptions" :key="x.value" :label="String(x.label)" :value="x.value"/></el-select></el-form-item>
    <el-form-item label="指标"><el-select v-model="form.metric" style="width:100%" @change="result=null"><el-option v-for="x in metricOptions" :key="x.value" :label="String(x.label)" :value="x.value"/></el-select></el-form-item>
    <el-form-item label="展示方式"><el-select v-model="form.chart_type" style="width:100%" @change="result&&$nextTick(render)"><el-option label="柱状图" value="bar"/><el-option label="折线图" value="line"/><el-option label="饼图" value="pie"/><el-option label="仅表格" value="table"/></el-select></el-form-item>
  </div>
  <el-divider content-position="left">筛选条件</el-divider>
  <div class="grid" style="grid-template-columns:repeat(4,1fr)">
    <el-form-item label="开始日期"><el-input v-model="form.filters.date_from" type="date"/></el-form-item><el-form-item label="结束日期"><el-input v-model="form.filters.date_to" type="date"/></el-form-item>
    <el-form-item v-if="filterKeys.includes('country')" label="国家"><el-input v-model="form.filters.country"/></el-form-item>
    <el-form-item v-if="filterKeys.includes('status')" label="状态 / 阶段"><el-input v-model="form.filters.status"/></el-form-item>
    <el-form-item v-if="filterKeys.includes('currency')" label="币种"><el-select v-model="form.filters.currency" clearable filterable allow-create style="width:100%"><el-option v-for="x in currencies" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    <el-form-item v-if="filterKeys.includes('owner_id')" label="负责人"><el-select v-model="form.filters.owner_id" clearable filterable style="width:100%"><el-option v-for="x in owners" :key="x.id" :label="x.display_name" :value="x.id"/></el-select></el-form-item>
    <el-form-item v-if="filterKeys.includes('source')" label="来源"><el-input v-model="form.filters.source"/></el-form-item><el-form-item v-if="filterKeys.includes('industry')" label="行业"><el-input v-model="form.filters.industry"/></el-form-item>
    <el-form-item v-if="filterKeys.includes('incoterm')" label="Incoterm"><el-input v-model="form.filters.incoterm"/></el-form-item><el-form-item v-if="filterKeys.includes('type')" label="类型"><el-input v-model="form.filters.type"/></el-form-item>
    <el-form-item v-if="filterKeys.includes('category')" label="分类"><el-input v-model="form.filters.category"/></el-form-item><el-form-item v-if="filterKeys.includes('severity')" label="严重度"><el-input v-model="form.filters.severity"/></el-form-item>
    <el-form-item v-if="filterKeys.includes('carrier')" label="承运人/船公司"><el-input v-model="form.filters.carrier"/></el-form-item><el-form-item v-if="filterKeys.includes('destination')" label="目的港"><el-input v-model="form.filters.destination"/></el-form-item>
  </div>
  <el-alert v-if="moneyNeedsCurrency" type="warning" :closable="false" title="当前是金额类指标。为了避免 USD/EUR/CNY 等不同币种被错误相加，请指定币种筛选，或把维度切换为“币种”。"/>
</div>

<div v-if="result" class="card">
  <div class="toolbar"><div><h3 class="section-title">{{result.entity_label}}：{{result.dimension_label}} × {{result.metric_label}}</h3><span class="muted">共 {{result.rows.length}} 个分组</span></div><b>合计：{{Number(result.total||0).toLocaleString(undefined,{maximumFractionDigits:2})}}</b></div>
  <div v-show="form.chart_type!=='table'" ref="chartEl" style="height:390px"></div>
  <el-table :data="result.rows" style="margin-top:12px"><el-table-column prop="dimension_value" :label="result.dimension_label" min-width="200"/><el-table-column :label="result.metric_label"><template #default="s">{{Number(s.row.metric_value||0).toLocaleString(undefined,{maximumFractionDigits:4})}}</template></el-table-column></el-table>
</div>
<el-empty v-else description="选择维度和指标后运行报表"/>
</div>
</div>

<el-dialog v-model="saveDialog" title="保存报表定义" width="520"><el-form label-position="top"><el-form-item label="报表名称"><el-input v-model="saveForm.name"/></el-form-item><el-form-item v-if="canShare"><el-checkbox v-model="saveForm.is_shared">共享给其他用户</el-checkbox></el-form-item></el-form><template #footer><el-button @click="saveDialog=false">取消</el-button><el-button type="primary" @click="saveNew">保存</el-button></template></el-dialog>
</AppLayout></template>