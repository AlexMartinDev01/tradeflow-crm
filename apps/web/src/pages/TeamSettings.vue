<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const departments=ref<any[]>([]),users=ref<any[]>([]),deptDialog=ref(false),userDialog=ref(false),editingDept=ref<any>(null),editingUser=ref<any>(null);
const deptForm=reactive<any>({name:'',parent_id:'',manager_user_id:'',enabled:1});
const userForm=reactive<any>({username:'',display_name:'',role:'sales',password:'',department_id:'',data_scope:'self',enabled:1});
const roles=['admin','manager','sales','followup','finance','readonly'];
const scopes=[{value:'self',label:'仅本人客户 + 协同客户'},{value:'department',label:'本部门客户 + 协同客户'},{value:'all',label:'全公司数据'}];
const departmentMap=computed(()=>Object.fromEntries(departments.value.map((x:any)=>[x.id,x.name])));

async function load(){
  const [d,u]=await Promise.all([api.get('/departments'),api.get('/users',{params:{size:500}})]);
  departments.value=d.data;users.value=u.data.data;
}
function resetDept(){editingDept.value=null;Object.assign(deptForm,{name:'',parent_id:'',manager_user_id:'',enabled:1})}
function addDept(){resetDept();deptDialog.value=true}
function editDept(r:any){editingDept.value=r;Object.assign(deptForm,{name:r.name,parent_id:r.parent_id||'',manager_user_id:r.manager_user_id||'',enabled:r.enabled?1:0});deptDialog.value=true}
async function saveDept(){
  if(!deptForm.name.trim())return ElMessage.warning('部门名称必填');
  if(editingDept.value)await api.patch(`/departments/${editingDept.value.id}`,deptForm);else await api.post('/departments',deptForm);
  deptDialog.value=false;await load();ElMessage.success('部门已保存');
}
async function deleteDept(r:any){
  await ElMessageBox.confirm(`确认删除部门“${r.name}”？`,'确认');
  try{await api.delete(`/departments/${r.id}`);await load()}
  catch(e:any){if(e.response?.data?.error==='department_in_use')ElMessage.error(`部门仍有 ${e.response.data.members} 名用户或 ${e.response.data.children} 个子部门，不能删除。`);else throw e}
}
function resetUser(){editingUser.value=null;Object.assign(userForm,{username:'',display_name:'',role:'sales',password:'',department_id:'',data_scope:'self',enabled:1})}
function addUser(){resetUser();userDialog.value=true}
function editUser(r:any){editingUser.value=r;Object.assign(userForm,{username:r.username,display_name:r.display_name,role:r.role,password:'',department_id:r.department_id||'',data_scope:r.data_scope||(['admin','manager','finance','readonly'].includes(r.role)?'all':'self'),enabled:r.enabled?1:0});userDialog.value=true}
function roleChanged(){
  if(userForm.role==='sales'||userForm.role==='followup')userForm.data_scope='self';
  else if(userForm.role==='admin')userForm.data_scope='all';
}
async function saveUser(){
  if(!userForm.username.trim()||!userForm.display_name.trim())return ElMessage.warning('用户名和姓名必填');
  if(!editingUser.value&&userForm.password.length<10)return ElMessage.warning('新用户初始密码至少 10 位');
  const payload:any={username:userForm.username,display_name:userForm.display_name,role:userForm.role,department_id:userForm.department_id||null,data_scope:userForm.data_scope,enabled:userForm.enabled};
  if(userForm.password)payload.password=userForm.password;
  if(editingUser.value)await api.patch(`/users/${editingUser.value.id}`,payload);else await api.post('/users',payload);
  userDialog.value=false;await load();ElMessage.success('用户已保存');
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">组织与账号权限</h2><span class="muted">部门、角色与 self / department / all 数据范围</span></div></div>

<el-tabs>
<el-tab-pane label="用户与数据范围">
  <div class="toolbar"><span class="muted">{{users.length}} 个账号</span><el-button type="primary" @click="addUser">新增用户</el-button></div>
  <div class="card"><el-table :data="users">
    <el-table-column prop="username" label="用户名" width="150"/><el-table-column prop="display_name" label="姓名" width="140"/><el-table-column prop="role" label="角色" width="110"/>
    <el-table-column label="部门" width="150"><template #default="s">{{departmentMap[s.row.department_id]||'-'}}</template></el-table-column>
    <el-table-column label="数据范围" min-width="190"><template #default="s">{{scopes.find(x=>x.value===(s.row.data_scope||(['admin','manager','finance','readonly'].includes(s.row.role)?'all':'self')))?.label}}</template></el-table-column>
    <el-table-column label="启用" width="80"><template #default="s"><el-tag :type="s.row.enabled?'success':'info'">{{s.row.enabled?'是':'否'}}</el-tag></template></el-table-column>
    <el-table-column label="操作" width="90"><template #default="s"><el-button link type="primary" @click="editUser(s.row)">编辑</el-button></template></el-table-column>
  </el-table></div>
</el-tab-pane>

<el-tab-pane label="部门管理">
  <div class="toolbar"><span class="muted">{{departments.length}} 个部门</span><el-button type="primary" @click="addDept">新增部门</el-button></div>
  <div class="card"><el-table :data="departments">
    <el-table-column prop="name" label="部门" min-width="180"/><el-table-column prop="parent_name" label="上级部门" min-width="160"/><el-table-column prop="manager_name" label="部门负责人" min-width="160"/>
    <el-table-column prop="member_count" label="成员数" width="90"/><el-table-column label="启用" width="80"><template #default="s">{{s.row.enabled?'是':'否'}}</template></el-table-column>
    <el-table-column label="操作" width="130"><template #default="s"><el-button link type="primary" @click="editDept(s.row)">编辑</el-button><el-button link type="danger" @click="deleteDept(s.row)">删除</el-button></template></el-table-column>
  </el-table></div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="userDialog" :title="editingUser?'编辑用户':'新增用户'" width="680"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="用户名"><el-input v-model="userForm.username"/></el-form-item><el-form-item label="姓名"><el-input v-model="userForm.display_name"/></el-form-item>
  <el-form-item label="角色"><el-select v-model="userForm.role" style="width:100%" @change="roleChanged"><el-option v-for="x in roles" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="部门"><el-select v-model="userForm.department_id" clearable filterable style="width:100%"><el-option v-for="d in departments.filter(x=>x.enabled)" :key="d.id" :label="d.name" :value="d.id"/></el-select></el-form-item>
  <el-form-item label="数据范围"><el-select v-model="userForm.data_scope" style="width:100%"><el-option v-for="x in scopes" :key="x.value" :label="x.label" :value="x.value"/></el-select></el-form-item>
  <el-form-item :label="editingUser?'重置密码（留空不修改）':'初始密码'"><el-input v-model="userForm.password" type="password" show-password/></el-form-item>
</div><el-form-item><el-checkbox v-model="userForm.enabled" :true-value="1" :false-value="0">启用账号</el-checkbox></el-form-item></el-form>
<template #footer><el-button @click="userDialog=false">取消</el-button><el-button type="primary" @click="saveUser">保存</el-button></template></el-dialog>

<el-dialog v-model="deptDialog" :title="editingDept?'编辑部门':'新增部门'" width="620"><el-form label-position="top">
<el-form-item label="部门名称"><el-input v-model="deptForm.name"/></el-form-item>
<el-form-item label="上级部门"><el-select v-model="deptForm.parent_id" clearable filterable style="width:100%"><el-option v-for="d in departments.filter(x=>!editingDept||x.id!==editingDept.id)" :key="d.id" :label="d.name" :value="d.id"/></el-select></el-form-item>
<el-form-item label="部门负责人"><el-select v-model="deptForm.manager_user_id" clearable filterable style="width:100%"><el-option v-for="u in users" :key="u.id" :label="`${u.display_name} · ${u.role}`" :value="u.id"/></el-select></el-form-item>
<el-form-item><el-checkbox v-model="deptForm.enabled" :true-value="1" :false-value="0">启用部门</el-checkbox></el-form-item>
</el-form><template #footer><el-button @click="deptDialog=false">取消</el-button><el-button type="primary" @click="saveDept">保存</el-button></template></el-dialog>
</AppLayout></template>