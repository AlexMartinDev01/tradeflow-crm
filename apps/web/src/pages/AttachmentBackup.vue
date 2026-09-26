<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const status=ref<any>(null),loading=ref(false),verifying=ref(false),snapshotting=ref(false),syncing=ref(false);
function bytes(v:any){const n=Number(v||0);if(!n)return '0 B';if(n>=1024**3)return (n/1024**3).toFixed(2)+' GB';if(n>=1024**2)return (n/1024**2).toFixed(2)+' MB';if(n>=1024)return (n/1024).toFixed(1)+' KB';return n+' B'}
async function load(){loading.value=true;try{status.value=(await api.get('/attachment-backup/status')).data}finally{loading.value=false}}
async function verify(full=false){
  verifying.value=true;
  try{
    const {data}=await api.post('/attachment-backup/verify',{full_checksum:full});
    ElMessage.success(full?'完整 SHA-256 校验通过':'快速附件检查通过');
    status.value.integrity=data;await load();
  }catch(e:any){
    if(e.response?.data?.details){status.value.integrity=e.response.data.details;ElMessage.error(`发现 ${e.response.data.details.issues?.length||0} 个附件异常`)}
    else ElMessage.error(e.response?.data?.message||'附件检查失败');
  }finally{verifying.value=false}
}
async function snapshot(){
  snapshotting.value=true;
  try{const {data}=await api.post('/attachment-backup/snapshot',{});await load();ElMessage.success(`附件快照已创建：${data.name}`)}
  catch(e:any){if(e.response?.data?.error==='attachment_integrity_failed')ElMessage.error('附件完整性检查未通过，已阻止创建不完整快照');else ElMessage.error(e.response?.data?.message||'快照创建失败')}
  finally{snapshotting.value=false}
}
async function sync(){
  if(!status.value?.offsite?.configured)return ElMessage.warning('请先在“系统集成”中新增并启用 storage_backup 集成');
  syncing.value=true;
  try{
    const {data}=await api.post('/attachment-backup/sync',{limit:20});await load();
    if(data.failed)ElMessage.warning(`本批同步完成：成功 ${data.synced}，失败 ${data.failed}，跳过 ${data.skipped}`);
    else ElMessage.success(`本批同步成功：上传 ${data.synced}，已同步跳过 ${data.skipped}`);
  }finally{syncing.value=false}
}
async function removeSnapshot(r:any){await ElMessageBox.confirm(`删除附件快照 ${r.name}？`,'确认');await api.delete(`/attachment-backup/snapshots/${encodeURIComponent(r.name)}`);await load()}
async function downloadManifest(){
  const {data}=await api.get('/attachment-backup/manifest'),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`tradeflow-attachments-manifest-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">附件完整性与备份</h2><span class="muted">文件校验、本地恢复快照与可插拔异地备份</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><el-button @click="downloadManifest">导出清单</el-button><el-button :loading="verifying" @click="verify(false)">快速检查</el-button><el-button :loading="verifying" @click="verify(true)">SHA-256 全量校验</el-button></div></div>

<template v-if="status">
<div class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">附件文件</span><b>{{status.documents||0}}</b></div>
  <div class="stat"><span class="muted">附件总量</span><b>{{bytes(status.total_bytes)}}</b></div>
  <div class="stat"><span class="muted">本地快照</span><b>{{status.snapshots?.length||0}}</b></div>
  <div class="stat"><span class="muted">异地已同步</span><b>{{status.offsite?.synced_documents||0}}</b><small class="muted">{{status.offsite?.configured?'已配置':'未配置'}}</small></div>
</div>

<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start;margin-bottom:16px">
  <div class="card">
    <div class="toolbar"><div><h3 class="section-title">附件完整性</h3><span class="muted">数据库记录 ↔ 实际文件 ↔ checksum</span></div><el-tag :type="status.integrity?.ok?'success':status.integrity?'danger':'info'">{{status.integrity?status.integrity.ok?'正常':'存在异常':'尚未检查'}}</el-tag></div>
    <el-descriptions v-if="status.integrity" :column="2" border>
      <el-descriptions-item label="检查文件">{{status.integrity.checked}}</el-descriptions-item><el-descriptions-item label="检查时间">{{status.integrity.checked_at||status.integrity.updated_at}}</el-descriptions-item>
      <el-descriptions-item label="文件缺失">{{status.integrity.missing||0}}</el-descriptions-item><el-descriptions-item label="大小不符">{{status.integrity.size_mismatch||0}}</el-descriptions-item>
      <el-descriptions-item label="Checksum 不符">{{status.integrity.checksum_mismatch||0}}</el-descriptions-item><el-descriptions-item label="全量 SHA-256">{{status.integrity.full_checksum?'是':'否'}}</el-descriptions-item>
    </el-descriptions>
    <el-table v-if="status.integrity?.issues?.length" :data="status.integrity.issues" style="margin-top:12px" max-height="260"><el-table-column prop="type" label="异常" width="150"/><el-table-column prop="name" label="文件"/><el-table-column prop="storage_path" label="存储路径"/></el-table>
  </div>

  <div class="card">
    <div class="toolbar"><div><h3 class="section-title">异地备份</h3><span class="muted">通过 storage_backup 集成增量同步</span></div><el-tag :type="status.offsite?.configured?'success':'warning'">{{status.offsite?.configured?'已配置':'未配置'}}</el-tag></div>
    <template v-if="status.offsite?.configured">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="集成">{{status.offsite.integration?.name}}</el-descriptions-item>
        <el-descriptions-item label="Endpoint">{{status.offsite.integration?.base_url}}</el-descriptions-item>
        <el-descriptions-item label="已同步">{{status.offsite.synced_documents}} / {{status.documents}}</el-descriptions-item>
        <el-descriptions-item label="最近同步">{{status.offsite.last_run?.updated_at||'尚未执行'}}</el-descriptions-item>
      </el-descriptions>
      <el-button type="primary" :loading="syncing" style="margin-top:14px" @click="sync">同步下一批 20 个文件</el-button>
    </template>
    <template v-else>
      <el-alert type="warning" :closable="false" title="当前没有启用 storage_backup 集成。本地快照不是异地备份，不能抵御整台主机/磁盘损坏。" />
      <p class="muted">在“系统集成”中新建类型为“附件异地备份”的集成，Endpoint 可指向你自己的备份网关、对象存储代理或内部文件服务。</p>
    </template>
  </div>
</div>

<div class="card">
  <div class="toolbar"><div><h3 class="section-title">本地恢复快照</h3><span class="muted">快照存入 /data/attachment-snapshots，与 uploads 使用不同 Docker 卷；默认保留最近 5 份。</span></div><el-button type="primary" plain :loading="snapshotting" @click="snapshot">创建附件快照</el-button></div>
  <el-alert type="info" :closable="false" title="创建快照前会强制执行完整 SHA-256 校验；存在文件缺失或篡改时会阻止快照。" style="margin-bottom:12px"/>
  <el-table v-loading="loading" :data="status.snapshots||[]" empty-text="暂无附件快照">
    <el-table-column prop="name" label="快照" min-width="260"/><el-table-column prop="created_at" label="创建时间" width="200"/><el-table-column prop="files" label="文件数" width="100"/><el-table-column label="大小" width="120"><template #default="s">{{bytes(s.row.total_bytes)}}</template></el-table-column>
    <el-table-column label="操作" width="90"><template #default="s"><el-button link type="danger" @click="removeSnapshot(s.row)">删除</el-button></template></el-table-column>
  </el-table>
</div>
</template>
</AppLayout></template>