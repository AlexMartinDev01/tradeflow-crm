<script setup lang="ts">
import {ref,watch,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import {api} from '../api/client';

const props=defineProps<{entityType:string;entityId:string;title?:string}>();
const rows=ref<any[]>([]),loading=ref(false),uploading=ref(false),dialog=ref(false);
const file=ref<File|null>(null),category=ref('attachment'),notes=ref('');
const categories=['attachment','contract','authorization','certificate','invoice','packing','customs','quality','photo','other'];

function formatSize(v:any){const n=Number(v||0);if(!n)return '-';if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';return (n/1024/1024).toFixed(1)+' MB'}
async function load(){
  if(!props.entityId)return;
  loading.value=true;try{rows.value=(await api.get('/files',{params:{entity_type:props.entityType,entity_id:props.entityId}})).data}finally{loading.value=false}
}
function chooseFile(e:Event){
  const input=e.target as HTMLInputElement;const f=input.files?.[0]||null;
  if(f&&f.size>15*1024*1024){ElMessage.error('单个文件不能超过 15MB');input.value='';file.value=null;return}
  file.value=f;
}
function toDataUrl(f:File){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsDataURL(f)})}
async function upload(){
  if(!file.value)return ElMessage.warning('请选择文件');
  uploading.value=true;
  try{
    const data=await toDataUrl(file.value);
    await api.post('/files/upload',{entity_type:props.entityType,entity_id:props.entityId,file_name:file.value.name,mime_type:file.value.type||'application/octet-stream',content_base64:data,category:category.value,notes:notes.value});
    dialog.value=false;file.value=null;notes.value='';category.value='attachment';await load();ElMessage.success('附件上传成功');
  }catch(e:any){
    const code=e.response?.data?.error;
    ElMessage.error(code==='blocked_file_type'?'该文件类型出于安全原因禁止上传':code==='file_too_large'?'文件超过 15MB':'上传失败');
  }finally{uploading.value=false}
}
async function preview(r:any){
  try{
    const res=await api.get(`/documents/${r.id}/preview`,{responseType:'blob'});
    const blob=new Blob([res.data],{type:r.mime_type||'application/octet-stream'}),url=URL.createObjectURL(blob);
    window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e:any){if(e.response?.status===415)ElMessage.warning('该格式不支持浏览器直接预览，请下载后打开');else ElMessage.error('预览失败')}
}
async function download(r:any){
  const res=await api.get(`/documents/${r.id}/download`,{responseType:'blob'});
  const blob=new Blob([res.data],{type:r.mime_type||'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=r.original_name||r.name||'document';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function remove(r:any){
  await ElMessageBox.confirm(`确认删除“${r.original_name||r.name}”？此操作会同时删除实际文件。`,'删除附件',{type:'warning'});
  await api.delete(`/files/${r.id}`);await load();ElMessage.success('附件已删除');
}
watch(()=>props.entityId,load);
onMounted(load);
defineExpose({reload:load});
</script>

<template>
<div>
  <div class="toolbar"><div><b>{{title||'附件与文档'}}</b><span class="muted" style="margin-left:8px">{{rows.length}} 个文件</span></div><el-button size="small" type="primary" plain @click="dialog=true">上传附件</el-button></div>
  <el-table v-loading="loading" :data="rows" empty-text="暂无附件">
    <el-table-column prop="category" label="分类" width="110"><template #default="s"><el-tag size="small">{{s.row.category||'attachment'}}</el-tag></template></el-table-column>
    <el-table-column label="文件名" min-width="240"><template #default="s"><b>{{s.row.original_name||s.row.name}}</b><div v-if="s.row.notes" class="muted" style="font-size:12px">{{s.row.notes}}</div></template></el-table-column>
    <el-table-column prop="version" label="版本" width="80"/>
    <el-table-column label="大小" width="100"><template #default="s">{{formatSize(s.row.size_bytes)}}</template></el-table-column>
    <el-table-column prop="mime_type" label="类型" min-width="150"/>
    <el-table-column prop="created_at" label="上传/生成时间" width="190"/>
    <el-table-column label="操作" width="180"><template #default="s"><el-button link type="primary" @click="preview(s.row)">预览</el-button><el-button link @click="download(s.row)">下载</el-button><el-button v-if="s.row.stored" link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
  </el-table>

  <el-dialog v-model="dialog" title="上传附件" width="560">
    <el-form label-position="top">
      <el-form-item label="选择文件"><input type="file" @change="chooseFile"/><div class="muted" style="margin-top:6px">最大 15MB；支持 PDF、图片、Word、Excel、文本等常见业务文件。</div></el-form-item>
      <el-form-item label="分类"><el-select v-model="category" filterable allow-create style="width:100%"><el-option v-for="x in categories" :key="x" :label="x" :value="x"/></el-select></el-form-item>
      <el-form-item label="备注"><el-input v-model="notes" type="textarea" placeholder="例如：客户盖章版、2026年度授权书、最终质检报告"/></el-form-item>
    </el-form>
    <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" :loading="uploading" @click="upload">上传</el-button></template>
  </el-dialog>
</div>
</template>