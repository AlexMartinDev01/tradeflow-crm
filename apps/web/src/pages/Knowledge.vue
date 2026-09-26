<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const rows=ref<any[]>([]),loading=ref(false),dialog=ref(false),editing=ref<any>(null);
const filters=reactive<any>({q:'',category:'',status:'published'});
const form=reactive<any>({title:'',category:'',summary:'',content:'',tags:[],status:'draft'});
const canManage=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role));
const canDelete=computed(()=>['admin','manager'].includes(auth.user?.role));
const categories=computed(()=>[...new Set(rows.value.map(x=>x.category).filter(Boolean))].sort());

async function load(){
  loading.value=true;
  try{
    const params:any={};
    if(filters.q)params.q=filters.q;if(filters.category)params.category=filters.category;
    params.status=canManage.value?filters.status:'published';
    rows.value=(await api.get('/knowledge',{params})).data;
  }finally{loading.value=false}
}
function resetForm(){Object.assign(form,{title:'',category:'',summary:'',content:'',tags:[],status:'draft'});editing.value=null}
function create(){resetForm();dialog.value=true}
function edit(r:any){editing.value=r;Object.assign(form,{title:r.title,category:r.category||'',summary:r.summary||'',content:r.content||'',tags:[...(r.tags||[])],status:r.status||'draft'});dialog.value=true}
async function save(){
  if(!form.title.trim()||!form.content.trim())return ElMessage.warning('标题和知识正文必填');
  if(editing.value)await api.patch('/knowledge/'+editing.value.id,form);else await api.post('/knowledge',form);
  dialog.value=false;await load();ElMessage.success(editing.value?'知识文章已更新':'知识文章已创建');
}
async function remove(r:any){await ElMessageBox.confirm('确认删除知识“'+r.title+'”？','确认删除',{type:'warning'});await api.delete('/knowledge/'+r.id);await load();ElMessage.success('已删除')}
async function publishToggle(r:any){
  const next=r.status==='published'?'draft':'published';
  await api.patch('/knowledge/'+r.id,{status:next});await load();ElMessage.success(next==='published'?'已发布':'已转为草稿');
}
function resetFilters(){Object.assign(filters,{q:'',category:'',status:'published'});load()}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar">
  <div><h2 style="margin:0">售后知识库</h2><span class="muted">沉淀已确认解决方案，供同类售后工单快速检索与复用</span></div>
  <el-button v-if="canManage" type="primary" @click="create">新建知识</el-button>
</div>

<div class="card" style="margin-bottom:16px">
  <div class="grid" style="grid-template-columns:2fr 1fr 1fr auto">
    <el-input v-model="filters.q" clearable placeholder="搜索标题 / 摘要 / 正文 / 标签" @keyup.enter="load" @clear="load"/>
    <el-select v-model="filters.category" clearable filterable placeholder="分类" @change="load"><el-option v-for="x in categories" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-if="canManage" v-model="filters.status" @change="load"><el-option label="已发布" value="published"/><el-option label="草稿" value="draft"/><el-option label="已归档" value="archived"/><el-option label="全部" value="all"/></el-select>
    <div><el-button type="primary" plain @click="load">搜索</el-button><el-button @click="resetFilters">重置</el-button></div>
  </div>
</div>

<div class="card">
<el-table v-loading="loading" :data="rows">
  <el-table-column prop="title" label="知识标题" min-width="230"><template #default="s"><b>{{s.row.title}}</b><div class="muted" style="font-size:12px">{{s.row.summary||''}}</div></template></el-table-column>
  <el-table-column prop="category" label="分类" width="120"/>
  <el-table-column label="标签" min-width="190"><template #default="s"><el-tag v-for="t in s.row.tags" :key="t" size="small" style="margin:2px 4px 2px 0">{{t}}</el-tag></template></el-table-column>
  <el-table-column prop="status" label="状态" width="100"><template #default="s"><el-tag :type="s.row.status==='published'?'success':s.row.status==='archived'?'info':'warning'">{{s.row.status}}</el-tag></template></el-table-column>
  <el-table-column prop="use_count" label="复用次数" width="90"/>
  <el-table-column prop="source_ticket_no" label="来源工单" width="170"/>
  <el-table-column prop="created_by_name" label="创建人" width="110"/>
  <el-table-column prop="updated_at" label="更新时间" width="175"/>
  <el-table-column label="操作" width="190" fixed="right"><template #default="s">
    <el-button v-if="canManage" link type="primary" @click="edit(s.row)">编辑</el-button>
    <el-button v-if="canManage" link :type="s.row.status==='published'?'warning':'success'" @click="publishToggle(s.row)">{{s.row.status==='published'?'转草稿':'发布'}}</el-button>
    <el-button v-if="canDelete" link type="danger" @click="remove(s.row)">删除</el-button>
  </template></el-table-column>
</el-table>
<el-empty v-if="!loading&&!rows.length" description="暂无知识文章"/>
</div>

<el-dialog v-model="dialog" :title="editing?'编辑知识':'新建知识'" width="760">
  <el-form label-position="top">
    <div class="grid" style="grid-template-columns:2fr 1fr">
      <el-form-item label="标题"><el-input v-model="form.title"/></el-form-item>
      <el-form-item label="分类"><el-select v-model="form.category" allow-create filterable style="width:100%"><el-option v-for="x in ['quality','quantity','packaging','delivery','logistics','documents','service']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    </div>
    <el-form-item label="摘要"><el-input v-model="form.summary" type="textarea" :rows="2"/></el-form-item>
    <el-form-item label="知识正文 / 已验证解决方案"><el-input v-model="form.content" type="textarea" :rows="10"/></el-form-item>
    <el-form-item label="标签"><el-select v-model="form.tags" multiple filterable allow-create default-first-option style="width:100%"/></el-form-item>
    <el-form-item label="状态"><el-radio-group v-model="form.status"><el-radio value="draft">草稿</el-radio><el-radio value="published">发布</el-radio><el-radio value="archived">归档</el-radio></el-radio-group></el-form-item>
  </el-form>
  <el-alert type="info" :closable="false" title="知识库应保存可复用的处理方法，不建议写入客户姓名、电话、邮箱、订单敏感信息等非必要数据。"/>
  <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
</el-dialog>
</AppLayout></template>