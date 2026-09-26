<script setup lang="ts">
import {ElMessage} from 'element-plus';
import {ref,reactive,onMounted,computed} from 'vue';
import {useRouter} from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),total=ref(0),dialog=ref(false),loading=ref(false),router=useRouter();
const filters=reactive({keyword:'',country:'',status:'',grade:''});
const form=reactive<any>({name:'',english_name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],status:'potential',grade:'B',source:'',language:'English',timezone:'',business_scope:''});

const countries=computed(()=>[...new Set(rows.value.map(x=>x.country).filter(Boolean))].sort());
const visibleRows=computed(()=>rows.value.filter(r=>(!filters.country||r.country===filters.country)&&(!filters.status||r.status===filters.status)&&(!filters.grade||r.grade===filters.grade)));

async function load(){
  loading.value=true;
  try{
    if(filters.keyword.trim()){
      rows.value=(await api.get('/search',{params:{q:filters.keyword.trim()}})).data;
      total.value=rows.value.length;
    }else{
      const r=await api.get('/customers',{params:{size:200}}); rows.value=r.data.data; total.value=r.data.total;
    }
  }finally{loading.value=false}
}
async function save(){
  if(!form.name.trim())return ElMessage.warning('请输入客户名称');
  await api.post('/customers',form);dialog.value=false;
  Object.assign(form,{name:'',english_name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],status:'potential',grade:'B',source:'',language:'English',timezone:'',business_scope:''});
  await load();ElMessage.success('客户已创建');
}
function clearFilters(){Object.assign(filters,{keyword:'',country:'',status:'',grade:''});load()}
function openCustomer(r:any){router.push(`/customers/${r.id}`)}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">客户360°</h2><span class="muted">客户资产工作台 · 共 {{total}} 个客户</span></div><el-button type="primary" @click="dialog=true">新增客户</el-button></div>

<div class="card" style="margin-bottom:16px">
  <div class="grid" style="grid-template-columns:2fr 1fr 1fr 1fr auto">
    <el-input v-model="filters.keyword" clearable placeholder="搜索客户名 / 英文名 / 官网 / 税号" @keyup.enter="load"><template #append><el-button @click="load">搜索</el-button></template></el-input>
    <el-select v-model="filters.country" clearable placeholder="国家"><el-option v-for="x in countries" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.status" clearable placeholder="状态"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist']" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.grade" clearable placeholder="等级"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select>
    <el-button @click="clearFilters">重置</el-button>
  </div>
</div>

<div class="card">
  <el-table v-loading="loading" :data="visibleRows" @row-dblclick="openCustomer">
    <el-table-column prop="name" label="客户名称" min-width="220"><template #default="s"><b>{{s.row.name}}</b><div class="muted" style="font-size:12px">{{s.row.english_name||''}}</div></template></el-table-column>
    <el-table-column prop="country" label="国家" width="120"/><el-table-column prop="industry" label="行业" min-width="140"/>
    <el-table-column label="属性" min-width="180"><template #default="s"><el-tag v-for="x in s.row.customer_types" :key="x" size="small" style="margin:2px 4px 2px 0">{{x}}</el-tag></template></el-table-column>
    <el-table-column prop="status" label="状态" width="115"><template #default="s"><el-tag :type="s.row.status==='won'?'success':s.row.status==='lost'?'danger':'info'">{{s.row.status}}</el-tag></template></el-table-column>
    <el-table-column prop="grade" label="等级" width="70"/><el-table-column prop="source" label="来源" width="110"/>
    <el-table-column label="操作" width="100" fixed="right"><template #default="s"><el-button link type="primary" @click="router.push(`/customers/${s.row.id}`)">进入360°</el-button></template></el-table-column>
  </el-table>
</div>

<el-dialog v-model="dialog" title="新增客户" width="760"><el-form label-position="top">
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <el-form-item label="客户名称"><el-input v-model="form.name"/></el-form-item><el-form-item label="英文名称"><el-input v-model="form.english_name"/></el-form-item>
    <el-form-item label="国家"><el-input v-model="form.country"/></el-form-item><el-form-item label="城市"><el-input v-model="form.city"/></el-form-item>
    <el-form-item label="官网"><el-input v-model="form.website"/></el-form-item><el-form-item label="行业"><el-input v-model="form.industry"/></el-form-item>
    <el-form-item label="客户属性"><el-select v-model="form.customer_types" multiple allow-create filterable style="width:100%"><el-option v-for="x in ['Importer','Distributor','Wholesaler','Retailer','Brand','Agent','Manufacturer','End User','E-commerce']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    <el-form-item label="客户状态"><el-select v-model="form.status" style="width:100%"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    <el-form-item label="等级"><el-select v-model="form.grade" style="width:100%"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    <el-form-item label="来源"><el-input v-model="form.source"/></el-form-item><el-form-item label="语言"><el-input v-model="form.language"/></el-form-item><el-form-item label="时区"><el-input v-model="form.timezone"/></el-form-item>
  </div>
  <el-form-item label="主营业务"><el-input v-model="form.business_scope" type="textarea"/></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
</AppLayout></template>
