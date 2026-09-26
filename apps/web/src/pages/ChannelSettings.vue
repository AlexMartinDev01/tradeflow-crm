<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),dialog=ref(false),editing=ref<any>(null);
const form=reactive<any>({channel_key:'',name:'',icon:'',link_mode:'copy',url_template:'',value_hint:'',copy_fallback:true,enabled:true,sort_order:0});
const modes=[
  {value:'copy',label:'只复制账号'},
  {value:'email',label:'打开默认邮件客户端'},
  {value:'phone',label:'拨号'},
  {value:'direct_url',label:'直接打开网页链接'},
  {value:'template',label:'自定义 URL / App Scheme 模板'}
];

async function load(){rows.value=(await api.get('/settings/channels',{params:{all:1}})).data}
function reset(){editing.value=null;Object.assign(form,{channel_key:'',name:'',icon:'',link_mode:'copy',url_template:'',value_hint:'',copy_fallback:true,enabled:true,sort_order:0})}
function add(){reset();dialog.value=true}
function edit(r:any){editing.value=r;Object.assign(form,{...r,copy_fallback:!!r.copy_fallback,enabled:!!r.enabled});dialog.value=true}
async function save(){
  if(!form.channel_key.trim()||!form.name.trim())return ElMessage.warning('渠道 Key 和名称必填');
  if(form.link_mode==='template'&&!form.url_template.trim())return ElMessage.warning('模板模式必须填写 URL 模板');
  try{
    if(editing.value)await api.patch(`/settings/channels/${editing.value.id}`,form);else await api.post('/settings/channels',form);
    dialog.value=false;await load();ElMessage.success('渠道配置已保存');
  }catch(e:any){if(e.response?.data?.error==='channel_key_exists')ElMessage.error('渠道 Key 已存在');else throw e}
}
async function toggle(r:any){await api.patch(`/settings/channels/${r.id}`,{enabled:!r.enabled});await load()}
async function remove(r:any){
  await ElMessageBox.confirm(`确认删除渠道“${r.name}”？如果已有联系人使用该渠道，系统会阻止删除并建议停用。`,'确认');
  try{await api.delete(`/settings/channels/${r.id}`);await load()}
  catch(e:any){if(e.response?.data?.error==='channel_in_use')ElMessage.error(`已有 ${e.response.data.usage_count} 条联系方式使用该渠道，请改为停用。`);else throw e}
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">联系方式渠道设计器</h2><span class="muted">配置渠道名称、唤起方式、URL 模板和复制回退</span></div><el-button type="primary" @click="add">新增渠道</el-button></div>
<div class="card"><el-table :data="rows">
  <el-table-column prop="name" label="渠道名称" min-width="150"/><el-table-column prop="channel_key" label="Key" width="140"/>
  <el-table-column label="唤起方式" width="180"><template #default="s">{{modes.find(x=>x.value===s.row.link_mode)?.label||s.row.link_mode}}</template></el-table-column>
  <el-table-column prop="url_template" label="URL / Scheme 模板" min-width="280"/><el-table-column prop="value_hint" label="输入提示" min-width="180"/>
  <el-table-column prop="sort_order" label="排序" width="80"/>
  <el-table-column label="启用" width="90"><template #default="s"><el-switch :model-value="!!s.row.enabled" @change="toggle(s.row)"/></template></el-table-column>
  <el-table-column label="操作" width="130"><template #default="s"><el-button link type="primary" @click="edit(s.row)">编辑</el-button><el-button link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" :title="editing?'编辑联系方式渠道':'新增联系方式渠道'" width="720"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="渠道 Key"><el-input v-model="form.channel_key" placeholder="例如 signal / distributor_portal"/></el-form-item>
  <el-form-item label="显示名称"><el-input v-model="form.name" placeholder="例如 Signal"/></el-form-item>
  <el-form-item label="唤起方式"><el-select v-model="form.link_mode" style="width:100%"><el-option v-for="m in modes" :key="m.value" :label="m.label" :value="m.value"/></el-select></el-form-item>
  <el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0"/></el-form-item>
</div>
<el-form-item v-if="form.link_mode==='template'" label="URL / App Scheme 模板">
  <el-input v-model="form.url_template" placeholder="例如 https://example.com/u/{encoded} 或 skype:{value}?chat"/>
</el-form-item>
<el-alert v-if="form.link_mode==='template'" type="info" :closable="false" title="可用占位符：{value} 原值、{encoded} URL编码、{digits} 纯数字、{phone} 电话字符、{username} 去掉@的用户名。危险协议 javascript/data/file 会被后端拒绝。" style="margin-bottom:12px"/>
<el-form-item label="输入提示"><el-input v-model="form.value_hint" placeholder="例如 国家码+手机号 / 用户名 / 完整URL"/></el-form-item>
<el-form-item><el-checkbox v-model="form.copy_fallback">无法直接唤起时允许复制账号</el-checkbox><el-checkbox v-model="form.enabled">启用渠道</el-checkbox></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
</AppLayout></template>