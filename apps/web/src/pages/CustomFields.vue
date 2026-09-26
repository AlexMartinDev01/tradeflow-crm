<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),dialog=ref(false),editing=ref<any>(null);
const form=reactive<any>({entity_type:'customer',field_key:'',label:'',data_type:'text',options:[],group_name:'业务属性',required:0,unique_value:0,searchable:1,visible_roles:[],sort_order:0,enabled:1});
const types=[['text','文本'],['number','数字'],['amount','金额'],['date','日期'],['select','单选'],['multi_select','多选'],['boolean','是/否'],['url','网址'],['email','邮箱'],['phone','电话']];
async function load(){rows.value=(await api.get('/customFields',{params:{size:200}})).data.data.sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0))}
function reset(){editing.value=null;Object.assign(form,{entity_type:'customer',field_key:'',label:'',data_type:'text',options:[],group_name:'业务属性',required:0,unique_value:0,searchable:1,visible_roles:[],sort_order:0,enabled:1})}
function add(){reset();dialog.value=true}
function edit(r:any){editing.value=r;Object.assign(form,JSON.parse(JSON.stringify(r)));dialog.value=true}
async function save(){
  if(!form.field_key.trim()||!form.label.trim())return ElMessage.warning('字段Key和显示名称不能为空');
  const payload={...form};delete payload.id;delete payload.created_at;
  if(editing.value)await api.patch(`/customFields/${editing.value.id}`,payload);else await api.post('/customFields',payload);
  dialog.value=false;await load();ElMessage.success('字段配置已保存');
}
async function remove(r:any){await ElMessageBox.confirm(`确认删除字段“${r.label}”？已有客户中的历史值不会自动删除。`,'确认');await api.delete(`/customFields/${r.id}`);await load()}
async function toggle(r:any){await api.patch(`/customFields/${r.id}`,{enabled:r.enabled?0:1});await load()}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">自定义字段设计器</h2><span class="muted">管理员可动态扩展客户属性，无需修改程序或数据库结构</span></div><el-button type="primary" @click="add">新增字段</el-button></div>
<div class="card">
  <el-table :data="rows">
    <el-table-column prop="group_name" label="分组" width="130"/><el-table-column prop="label" label="显示名称" min-width="150"/>
    <el-table-column prop="field_key" label="字段Key" min-width="150"/><el-table-column prop="entity_type" label="实体" width="100"/>
    <el-table-column label="类型" width="110"><template #default="s">{{types.find(x=>x[0]===s.row.data_type)?.[1]||s.row.data_type}}</template></el-table-column>
    <el-table-column label="选项" min-width="220"><template #default="s"><el-tag v-for="o in (s.row.options||[])" :key="o" size="small" style="margin:2px">{{o}}</el-tag><span v-if="!s.row.options?.length" class="muted">-</span></template></el-table-column>
    <el-table-column label="规则" min-width="170"><template #default="s"><el-tag v-if="s.row.required" type="danger" size="small">必填</el-tag> <el-tag v-if="s.row.unique_value" type="warning" size="small">唯一</el-tag> <el-tag v-if="s.row.searchable" size="small">可搜索</el-tag></template></el-table-column>
    <el-table-column label="状态" width="90"><template #default="s"><el-switch :model-value="!!s.row.enabled" @change="toggle(s.row)"/></template></el-table-column>
    <el-table-column label="操作" width="120"><template #default="s"><el-button link type="primary" @click="edit(s.row)">编辑</el-button><el-button link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
  </el-table>
</div>

<el-dialog v-model="dialog" :title="editing?'编辑自定义字段':'新增自定义字段'" width="720">
  <el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
    <el-form-item label="实体"><el-select v-model="form.entity_type" style="width:100%"><el-option label="客户" value="customer"/><el-option label="联系人" value="contact"/></el-select></el-form-item>
    <el-form-item label="字段分组"><el-input v-model="form.group_name" placeholder="例如 业务属性 / 财务 / 合规"/></el-form-item>
    <el-form-item label="字段Key"><el-input v-model="form.field_key" placeholder="例如 annual_purchase"/></el-form-item>
    <el-form-item label="显示名称"><el-input v-model="form.label" placeholder="例如 年采购规模"/></el-form-item>
    <el-form-item label="字段类型"><el-select v-model="form.data_type" style="width:100%"><el-option v-for="t in types" :key="t[0]" :label="t[1]" :value="t[0]"/></el-select></el-form-item>
    <el-form-item label="排序"><el-input v-model.number="form.sort_order" type="number"/></el-form-item>
  </div>
  <el-form-item v-if="['select','multi_select'].includes(form.data_type)" label="可选项"><el-select v-model="form.options" multiple allow-create filterable style="width:100%" placeholder="输入选项后回车，例如 Importer"/></el-form-item>
  <el-form-item label="字段规则"><el-checkbox v-model="form.required" :true-value="1" :false-value="0">必填</el-checkbox><el-checkbox v-model="form.unique_value" :true-value="1" :false-value="0">唯一值</el-checkbox><el-checkbox v-model="form.searchable" :true-value="1" :false-value="0">参与搜索</el-checkbox><el-checkbox v-model="form.enabled" :true-value="1" :false-value="0">启用</el-checkbox></el-form-item>
  <el-form-item label="可见角色（留空表示全部）"><el-select v-model="form.visible_roles" multiple style="width:100%"><el-option v-for="x in ['admin','manager','sales','followup','finance','readonly']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  </el-form>
  <template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
</el-dialog>
</AppLayout></template>
