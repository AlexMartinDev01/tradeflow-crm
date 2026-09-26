<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const rows=ref<any[]>([]),q=ref(''),loading=ref(false),drawer=ref(false),selected=ref<any>(null),detail=ref<any>(null),confirmName=ref('');
const labels:any={
  contacts:'联系人',activities:'跟进记录',tasks:'任务',inquiries:'询盘',opportunities:'商机',quotations:'报价',
  samples:'样品',contracts:'合同',orders:'订单',payments:'回款',shipments:'出运批次',customs_declarations:'报关单',
  aftersales:'售后工单',marketing_recipients:'营销名单记录',documents:'附件/单证'
};

async function load(){
  loading.value=true;
  try{rows.value=(await api.get('/recycle-bin/customers',{params:{q:q.value||undefined}})).data}
  finally{loading.value=false}
}
async function inspect(r:any){
  selected.value=r;detail.value=(await api.get(`/recycle-bin/customers/${r.id}/impact`)).data;confirmName.value='';drawer.value=true;
}
async function restore(){
  if(!selected.value)return;
  await ElMessageBox.confirm(`确认恢复客户“${selected.value.name}”？恢复后会重新出现在客户列表中。`,'恢复客户',{type:'warning'});
  try{
    await api.post(`/recycle-bin/customers/${selected.value.id}/restore`,{});
    drawer.value=false;await load();ElMessage.success('客户已恢复');
  }catch(e:any){
    if(e.response?.data?.error==='merged_customer_not_restorable')ElMessage.error('该记录来自客户合并，业务数据已迁移到目标客户，不能直接恢复。');
    else throw e;
  }
}
async function purge(){
  if(!selected.value)return;
  if(confirmName.value.trim()!==String(selected.value.name||'').trim())return ElMessage.warning('请输入完整客户名称以确认永久删除');
  await ElMessageBox.confirm('永久删除不可恢复，并会清理该客户关联的业务记录和附件。确认继续？','最终确认',{type:'error',confirmButtonText:'永久删除',cancelButtonText:'取消'});
  await api.post(`/recycle-bin/customers/${selected.value.id}/purge`,{confirm_name:confirmName.value});
  drawer.value=false;await load();ElMessage.success('客户及关联数据已永久清理');
}
function reasonText(r:any){return r.deleted_reason==='merged'?'客户合并':r.deleted_reason==='manual_delete'?'手工删除':r.deleted_reason||'历史软删除'}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">客户回收站</h2><span class="muted">软删除客户恢复、合并记录识别与管理员永久清理</span></div><div style="display:flex;gap:8px"><el-input v-model="q" clearable placeholder="客户名称 / 国家" style="width:260px" @keyup.enter="load"/><el-button @click="load">搜索</el-button></div></div>
<el-alert type="info" :closable="false" title="客户合并产生的记录不能直接恢复，因为其联系人、订单、商机等已迁移到目标客户。" style="margin-bottom:16px"/>

<div class="card"><el-table v-loading="loading" :data="rows">
  <el-table-column prop="name" label="客户" min-width="220"><template #default="s"><b>{{s.row.name}}</b><div class="muted" style="font-size:12px">{{s.row.english_name||''}}</div></template></el-table-column>
  <el-table-column prop="country" label="国家" width="120"/><el-table-column prop="owner_name" label="原负责人" width="130"/>
  <el-table-column label="删除类型" width="120"><template #default="s"><el-tag :type="s.row.deleted_reason==='merged'?'warning':'info'">{{reasonText(s.row)}}</el-tag></template></el-table-column>
  <el-table-column prop="deleted_at" label="删除时间" width="190"/>
  <el-table-column label="合并去向" min-width="170"><template #default="s">{{s.row.merged_into_name||'-'}}</template></el-table-column>
  <el-table-column label="操作" width="100"><template #default="s"><el-button link type="primary" @click="inspect(s.row)">查看</el-button></template></el-table-column>
</el-table></div>

<el-drawer v-model="drawer" size="720px" title="删除影响与恢复"><template v-if="selected&&detail">
  <div class="toolbar"><div><h3 style="margin:0">{{selected.name}}</h3><span class="muted">{{reasonText(selected)}} · {{selected.deleted_at}}</span></div><el-tag :type="detail.restorable?'success':'warning'">{{detail.restorable?'可恢复':'不可普通恢复'}}</el-tag></div>

  <el-alert v-if="selected.deleted_reason==='merged'||selected.merged_into_id" type="warning" :closable="false" :title="`该记录已合并至：${selected.merged_into_name||selected.merged_into_id||'其他客户'}。恢复会造成业务关系重复，因此已禁止。`" style="margin-bottom:14px"/>

  <div class="card" style="margin-bottom:16px"><h3 class="section-title">关联数据影响</h3><div class="grid stats">
    <div v-for="(value,key) in detail.impact" :key="String(key)" class="stat"><span class="muted">{{labels[key]||key}}</span><b>{{value}}</b></div>
  </div></div>

  <div style="display:flex;gap:8px;margin-bottom:20px">
    <el-button v-if="detail.restorable" type="primary" @click="restore">恢复客户</el-button>
  </div>

  <div v-if="auth.user?.role==='admin'" class="card" style="border:1px solid #f4b4b4">
    <h3 class="section-title" style="color:#b42318">危险操作：永久删除</h3>
    <p class="muted">此操作不可恢复。系统会事务清理客户关联的询盘、商机、报价、合同、订单、回款、出运、报关、售后、营销记录及相关附件元数据。</p>
    <el-form label-position="top"><el-form-item :label="`请输入客户完整名称：${selected.name}`"><el-input v-model="confirmName"/></el-form-item></el-form>
    <el-button type="danger" :disabled="confirmName.trim()!==String(selected.name||'').trim()" @click="purge">永久删除客户及关联数据</el-button>
  </div>
</template></el-drawer>
</AppLayout></template>