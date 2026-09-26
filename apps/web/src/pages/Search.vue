<script setup lang="ts">
import {ref} from 'vue';
import {useRouter} from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const q=ref(''),rows=ref<any[]>([]),loading=ref(false),router=useRouter();
async function search(){
  if(!q.value.trim()){rows.value=[];return}
  loading.value=true;try{rows.value=(await api.get('/search',{params:{q:q.value.trim()}})).data}finally{loading.value=false}
}
</script>
<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">全局搜索</h2><span class="muted">客户、联系人、联系方式、标签、品牌、自定义字段统一检索</span></div></div>
<div class="card" style="margin-bottom:16px"><el-input v-model="q" size="large" clearable placeholder="输入客户名、联系人、邮箱、电话、品牌、标签、税号等" @keyup.enter="search"><template #append><el-button @click="search">搜索</el-button></template></el-input></div>
<div class="card">
  <el-table v-loading="loading" :data="rows" empty-text="输入关键词开始搜索" @row-dblclick="r=>router.push('/customers/'+r.id)">
    <el-table-column prop="name" label="客户" min-width="220"><template #default="s"><b>{{s.row.name}}</b><div class="muted">{{s.row.english_name||''}}</div></template></el-table-column>
    <el-table-column prop="country" label="国家" width="120"/><el-table-column prop="city" label="城市" width="120"/><el-table-column prop="industry" label="行业" min-width="140"/>
    <el-table-column prop="status" label="状态" width="110"/><el-table-column prop="grade" label="等级" width="80"/><el-table-column prop="owner_name" label="负责人" width="120"/>
    <el-table-column label="操作" width="110"><template #default="s"><el-button link type="primary" @click="router.push('/customers/'+s.row.id)">打开客户</el-button></template></el-table-column>
  </el-table>
</div>
</AppLayout></template>