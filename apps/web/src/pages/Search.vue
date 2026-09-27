<script setup lang="ts">
import {ref} from 'vue';
import {useRouter} from 'vue-router';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const q=ref(''),rows=ref<any[]>([]),loading=ref(false),searched=ref(false),error=ref(''),router=useRouter();
function openCustomer(r:any){router.push('/customers/'+r.id)}
function clearSearch(){q.value='';rows.value=[];searched.value=false;error.value=''}
async function search(){
  const term=q.value.trim();
  if(!term){clearSearch();return}
  loading.value=true;error.value='';
  try{
    rows.value=(await api.get('/search',{params:{q:term}})).data;
    searched.value=true;
  }catch(e:any){
    rows.value=[];searched.value=true;
    const requestId=e.response?.data?.request_id;
    error.value='搜索失败，请稍后重试'+(requestId?'（请求ID：'+requestId+'）':'');
    ElMessage.error(error.value);
  }finally{loading.value=false}
}
</script>
<template><AppLayout>
<div class="toolbar">
  <div><h2 style="margin:0">全局搜索</h2><span class="muted">客户、联系人、联系方式、标签、品牌、自定义字段统一检索，并显示命中原因</span></div>
  <el-tag v-if="searched" type="info">{{rows.length}} 个结果</el-tag>
</div>
<div class="card" style="margin-bottom:16px">
  <el-input v-model="q" size="large" clearable placeholder="输入客户名、联系人、邮箱、电话、品牌、标签、税号等" @keyup.enter="search" @clear="clearSearch">
    <template #append><el-button :loading="loading" @click="search">搜索</el-button></template>
  </el-input>
</div>
<el-alert v-if="error" type="error" :closable="false" :title="error" style="margin-bottom:16px"/>
<div class="card table-card">
  <el-table v-loading="loading" :data="rows" :empty-text="searched?'未找到匹配客户':'输入关键词开始搜索'" @row-dblclick="openCustomer">
    <el-table-column prop="name" label="客户" min-width="220"><template #default="s"><b>{{s.row.name}}</b><div class="muted">{{s.row.english_name||''}}</div></template></el-table-column>
    <el-table-column prop="country" label="国家" width="120"/><el-table-column prop="city" label="城市" width="120"/><el-table-column prop="industry" label="行业" min-width="140"/>
    <el-table-column prop="status" label="状态" width="110"/><el-table-column prop="grade" label="等级" width="80"/><el-table-column prop="owner_name" label="负责人" width="120"/>
    <el-table-column label="命中原因" min-width="280"><template #default="s"><div v-if="s.row.match_reasons?.length" style="display:flex;gap:5px;flex-wrap:wrap"><el-tag v-for="x in s.row.match_reasons" :key="x.type+'-'+x.value" size="small" effect="plain">{{x.label}}<span v-if="x.value">：{{x.value}}</span></el-tag></div><span v-else class="muted">匹配客户资料</span></template></el-table-column>
    <el-table-column label="操作" width="110" fixed="right"><template #default="s"><el-button link type="primary" @click="openCustomer(s.row)">打开客户</el-button></template></el-table-column>
  </el-table>
</div>
</AppLayout></template>