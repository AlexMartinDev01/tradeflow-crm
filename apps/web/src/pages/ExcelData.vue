<script setup lang="ts">
import {ref,reactive,computed} from 'vue';
import {ElMessage} from 'element-plus';
import * as XLSX from 'xlsx';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

type Field={key:string;label:string};
const systemFields:Field[]=[
{key:'name',label:'客户名称 *'},{key:'english_name',label:'英文名称'},{key:'local_name',label:'当地名称'},{key:'country',label:'国家/地区'},{key:'region',label:'州/省'},{key:'city',label:'城市'},{key:'address',label:'详细地址'},{key:'postal_code',label:'邮编'},{key:'website',label:'官网'},{key:'industry',label:'行业'},{key:'customer_types',label:'客户类型'},{key:'status',label:'状态'},{key:'grade',label:'等级'},{key:'source',label:'来源'},{key:'timezone',label:'时区'},{key:'language',label:'语言'},{key:'tax_no',label:'税号/VAT'},{key:'registration_no',label:'注册号'},{key:'annual_sales',label:'年销售额'},{key:'employee_count',label:'员工数'},{key:'business_scope',label:'主营业务'},{key:'service_regions',label:'服务区域'},{key:'notes',label:'备注'}
];
const aliases:any={
'客户名称':'name','公司名称':'name','客户名':'name','name':'name','company':'name',
'英文名称':'english_name','english name':'english_name','国家':'country','国家/地区':'country','country':'country',
'城市':'city','city':'city','官网':'website','网站':'website','website':'website','行业':'industry','industry':'industry',
'客户类型':'customer_types','类型':'customer_types','状态':'status','客户状态':'status','等级':'grade','客户等级':'grade',
'来源':'source','客户来源':'source','时区':'timezone','语言':'language','税号':'tax_no','vat':'tax_no','vat number':'tax_no',
'注册号':'registration_no','registration no':'registration_no','主营业务':'business_scope','备注':'notes'
};

const headers=ref<string[]>([]),rawRows=ref<any[][]>([]),mapping=reactive<Record<string,string>>({});
const preview=ref<any[]>([]),summary=ref<any>(null),loading=ref(false),fileName=ref('');
const exportFields=ref<string[]>(['name','english_name','country','city','website','industry','customer_types','status','grade','source','tax_no','owner_name']);
const exportFieldOptions=[...systemFields,{key:'owner_name',label:'负责人'}];

function autoMap(){
  for(const h of headers.value){
    const k=String(h||'').trim();const low=k.toLowerCase();
    mapping[k]=aliases[k]||aliases[low]||systemFields.find(x=>x.key===k)?.key||'';
  }
}
async function onFile(e:Event){
  const input=e.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
  fileName.value=file.name;const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];
  const matrix:any[][]=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});if(!matrix.length)return ElMessage.warning('Excel没有数据');
  headers.value=matrix[0].map((x:any)=>String(x).trim());rawRows.value=matrix.slice(1).filter(r=>r.some((x:any)=>String(x).trim()!=='')).slice(0,2000);Object.keys(mapping).forEach(k=>delete mapping[k]);autoMap();preview.value=[];summary.value=null;
}
function mappedRows(){
  return rawRows.value.map(r=>{const out:any={};headers.value.forEach((h,i)=>{const k=mapping[h];if(k)out[k]=r[i]});return out});
}
async function runPreview(){
  if(!headers.value.length)return ElMessage.warning('请先选择Excel文件');
  if(!Object.values(mapping).includes('name'))return ElMessage.warning('必须映射“客户名称”');
  loading.value=true;try{const {data}=await api.post('/customers/import/preview',{rows:mappedRows()});preview.value=data.rows.map((x:any)=>({...x,action:x.status==='duplicate'?'skip':x.status==='ready'?'create':'skip',duplicate_id:x.matches?.[0]?.id||''}));summary.value=data}catch(e:any){ElMessage.error(e.response?.data?.message||'预检失败')}finally{loading.value=false}
}
async function commit(){
  const items=preview.value.filter(x=>x.status!=='invalid').map(x=>({row:x.row,action:x.action,duplicate_id:x.duplicate_id}));
  if(!items.length)return ElMessage.warning('没有可导入的数据');
  loading.value=true;try{const {data}=await api.post('/customers/import/commit',{items});ElMessage.success(`导入完成：新增 ${data.created}，更新 ${data.updated}，跳过 ${data.skipped}`);await runPreview()}finally{loading.value=false}
}
async function exportExcel(){
  const {data}=await api.get('/customers/export-data');
  const labels=Object.fromEntries(exportFieldOptions.map(x=>[x.key,x.label.replace(' *','')]));
  const rows=data.map((r:any)=>{const out:any={};for(const k of exportFields.value){let v=r[k];if(Array.isArray(v))v=v.join('; ');out[labels[k]||k]=v??''}return out});
  const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'客户数据');XLSX.writeFile(wb,`客户数据_${new Date().toISOString().slice(0,10)}.xlsx`);
}
const hasPreview=computed(()=>preview.value.length>0);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">Excel 导入 / 导出</h2><span class="muted">字段映射 → 预检 → 重复识别 → 决策 → 正式导入</span></div></div>

<div class="grid" style="grid-template-columns:1.2fr 1fr;align-items:start">
<div class="card">
  <h3 class="section-title">1. 导入客户</h3>
  <input type="file" accept=".xlsx,.xls,.csv" @change="onFile"/>
  <div v-if="fileName" class="muted" style="margin:10px 0">已选择：{{fileName}}，{{rawRows.length}} 行</div>
  <template v-if="headers.length">
    <h4>字段映射</h4>
    <el-table :data="headers.map(h=>({header:h}))" max-height="360">
      <el-table-column prop="header" label="Excel列" min-width="180"/>
      <el-table-column label="映射到系统字段" min-width="220"><template #default="s"><el-select v-model="mapping[s.row.header]" clearable filterable style="width:100%"><el-option v-for="f in systemFields" :key="f.key" :label="f.label" :value="f.key"/></el-select></template></el-table-column>
    </el-table>
    <div style="margin-top:12px"><el-button @click="autoMap">重新自动匹配</el-button><el-button type="primary" :loading="loading" @click="runPreview">预检数据</el-button></div>
  </template>
</div>

<div class="card">
  <h3 class="section-title">导出客户</h3>
  <p class="muted">选择需要导出的字段，系统会生成标准 .xlsx 文件。</p>
  <el-select v-model="exportFields" multiple filterable style="width:100%" placeholder="选择导出字段"><el-option v-for="f in exportFieldOptions" :key="f.key" :label="f.label" :value="f.key"/></el-select>
  <el-button type="primary" style="margin-top:14px" @click="exportExcel">导出 Excel</el-button>
</div>
</div>

<div v-if="hasPreview" class="card" style="margin-top:16px">
  <div class="toolbar"><div><h3 class="section-title">2. 导入预检</h3><span class="muted">共 {{summary?.total}} 行 · 可新增 {{summary?.ready}} · 疑似重复 {{summary?.duplicates}} · 无效 {{summary?.invalid}}</span></div><el-button type="primary" :loading="loading" @click="commit">执行正式导入</el-button></div>
  <el-table :data="preview" max-height="520">
    <el-table-column label="行" width="60"><template #default="s">{{s.row.index+2}}</template></el-table-column>
    <el-table-column label="客户名称" min-width="180"><template #default="s">{{s.row.row.name||'-'}}</template></el-table-column>
    <el-table-column label="国家" width="110"><template #default="s">{{s.row.row.country||'-'}}</template></el-table-column>
    <el-table-column label="预检" width="110"><template #default="s"><el-tag :type="s.row.status==='ready'?'success':s.row.status==='duplicate'?'warning':'danger'">{{s.row.status==='ready'?'可新增':s.row.status==='duplicate'?'疑似重复':'无效'}}</el-tag></template></el-table-column>
    <el-table-column label="问题/重复信息" min-width="280"><template #default="s"><span v-if="s.row.errors?.length">{{s.row.errors.join('、')}}</span><span v-else-if="s.row.matches?.length">可能重复：{{s.row.matches[0].name}}（{{s.row.matches[0].reasons.join('、')}}，负责人 {{s.row.matches[0].owner_name||'未分配'}}）</span><span v-else class="muted">-</span></template></el-table-column>
    <el-table-column label="处理方式" width="160"><template #default="s"><el-select v-model="s.row.action" :disabled="s.row.status==='invalid'" size="small"><el-option label="新增" value="create"/><el-option v-if="s.row.status==='duplicate'" label="更新重复客户" value="update"/><el-option label="跳过" value="skip"/></el-select></template></el-table-column>
  </el-table>
</div>
</AppLayout></template>