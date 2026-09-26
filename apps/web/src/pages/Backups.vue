<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),meta=ref<any>({}),loading=ref(false),creating=ref(false);
function sizeText(v:number){const n=Number(v||0);return n>=1024*1024?`${(n/1024/1024).toFixed(2)} MB`:`${(n/1024).toFixed(1)} KB`}
async function load(){loading.value=true;try{const {data}=await api.get('/backups');rows.value=data.rows||[];meta.value=data}finally{loading.value=false}}
async function createBackup(){creating.value=true;try{const {data}=await api.post('/backups/create',{});await load();ElMessage.success(`备份已创建：${data.file}`)}finally{creating.value=false}}
async function download(r:any){
  const {data}=await api.get(`/backups/${encodeURIComponent(r.file)}/download`,{responseType:'blob'});
  const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=r.file;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function remove(r:any){await ElMessageBox.confirm(`删除备份 ${r.file}？`,'确认');await api.delete(`/backups/${encodeURIComponent(r.file)}`);await load();ElMessage.success('备份已删除')}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">数据库备份</h2><span class="muted">SQLite 一致性快照、自动保留与离线恢复</span></div><el-button type="primary" :loading="creating" @click="createBackup">立即创建备份</el-button></div>

<el-alert type="success" :closable="false" title="数据库备份目录位于数据库持久化目录下；生产 Docker 默认 /data/backups，与 tradeflow-data 卷一起持久化。" style="margin-bottom:12px"/>
<el-alert type="warning" :closable="false" title="附件存放在独立 uploads 卷。数据库备份不包含附件二进制文件，生产环境还应对 tradeflow-uploads 卷做快照或对象存储备份。" style="margin-bottom:16px"/>

<div class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">现有备份</span><b>{{rows.length}}</b></div>
  <div class="stat"><span class="muted">自动保留</span><b>{{meta.retention_files||30}} 份</b></div>
  <div class="stat"><span class="muted">备份目录</span><b style="font-size:14px;word-break:break-all">{{meta.backup_dir||'-'}}</b></div>
</div>

<div class="card"><el-table v-loading="loading" :data="rows">
  <el-table-column prop="file" label="备份文件" min-width="320"/>
  <el-table-column label="类型" width="100"><template #default="s"><el-tag :type="s.row.kind==='auto'?'success':'info'">{{s.row.kind==='auto'?'自动':'手工'}}</el-tag></template></el-table-column>
  <el-table-column label="大小" width="120"><template #default="s">{{sizeText(s.row.size_bytes)}}</template></el-table-column>
  <el-table-column prop="created_at" label="创建时间" width="210"/>
  <el-table-column label="操作" width="150"><template #default="s"><el-button link type="primary" @click="download(s.row)">下载</el-button><el-button link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
</el-table></div>

<div class="card" style="margin-top:16px">
  <h3 class="section-title">离线恢复</h3>
  <p class="muted">为了避免在线覆盖 SQLite、WAL 与当前连接导致数据库损坏，恢复必须在服务停止后执行。恢复脚本会先把当前数据库复制为一个 pre-restore 备份，然后再替换数据库文件。</p>
  <pre style="white-space:pre-wrap;background:#f7f8fa;padding:14px;border-radius:8px"># 服务停止后，在项目/镜像环境执行：
DB_FILE=/data/tradeflow.db node scripts/restore-backup.mjs /data/backups/&lt;备份文件.sqlite&gt;

# Docker 场景也可使用同一镜像启动一次性恢复容器，
# 并挂载原 tradeflow-data:/data 卷。</pre>
</div>
</AppLayout></template>