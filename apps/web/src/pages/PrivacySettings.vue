<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const loading=ref(false),channels=ref<any[]>([]);
const roles=['admin','manager','sales','followup','finance','readonly'];
const customerFieldOptions=[
  {value:'tax_no',label:'税号 / VAT'},
  {value:'registration_no',label:'注册号'},
  {value:'address',label:'详细地址'},
  {value:'postal_code',label:'邮编'}
];
const form=reactive<any>({customer_fields:['tax_no','registration_no'],channel_types:[],full_roles:['admin','manager','finance'],owner_roles:['sales','followup'],export_roles:['admin','manager']});

async function load(){
  loading.value=true;
  try{
    const [p,c]=await Promise.all([api.get('/settings/privacy-policy'),api.get('/settings/channels')]);
    Object.assign(form,p.data);channels.value=c.data;
  }finally{loading.value=false}
}
async function save(){await api.put('/settings/privacy-policy',form);ElMessage.success('数据隐私策略已保存');await load()}
function preview(kind:string,value:string){
  if(kind==='email'){const [l,d='']=value.split('@');return `${l.slice(0,2)}***@${d}`}
  if(['phone','whatsapp','wechat','line','telegram','viber','kakaotalk','zalo'].includes(kind))return `***${value.replace(/\s/g,'').slice(-4)}`;
  return value.length<=4?'*'.repeat(value.length):`${value.slice(0,2)}***${value.slice(-2)}`;
}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">数据隐私与导出权限</h2><span class="muted">后端脱敏、角色可见范围与客户导出控制</span></div><el-button type="primary" :loading="loading" @click="save">保存策略</el-button></div>
<el-alert type="info" :closable="false" title="脱敏在 API 后端执行，不只是前端隐藏；Excel 导出也使用同一套数据范围与脱敏策略。" style="margin-bottom:16px"/>

<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
  <div class="card">
    <h3 class="section-title">敏感字段</h3>
    <el-form label-position="top">
      <el-form-item label="客户主档字段">
        <el-select v-model="form.customer_fields" multiple style="width:100%"><el-option v-for="x in customerFieldOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select>
      </el-form-item>
      <el-form-item label="敏感联系方式渠道">
        <el-select v-model="form.channel_types" multiple filterable style="width:100%"><el-option v-for="x in channels" :key="x.channel_key" :label="x.name" :value="x.channel_key"/></el-select>
      </el-form-item>
    </el-form>

    <h4>脱敏示例</h4>
    <el-descriptions :column="1" border>
      <el-descriptions-item label="邮箱">{{preview('email','anna.schmidt@example.com')}}</el-descriptions-item>
      <el-descriptions-item label="电话">{{preview('phone','+49 170 1234567')}}</el-descriptions-item>
      <el-descriptions-item label="税号">{{preview('tax_no','DE123456789')}}</el-descriptions-item>
    </el-descriptions>
  </div>

  <div class="card">
    <h3 class="section-title">角色权限</h3>
    <el-form label-position="top">
      <el-form-item label="始终可查看完整敏感数据的角色">
        <el-select v-model="form.full_roles" multiple style="width:100%"><el-option v-for="x in roles" :key="x" :label="x" :value="x"/></el-select>
      </el-form-item>
      <el-form-item label="仅在有客户数据权限时可查看完整值的角色">
        <el-select v-model="form.owner_roles" multiple style="width:100%"><el-option v-for="x in roles" :key="x" :label="x" :value="x"/></el-select>
      </el-form-item>
      <el-form-item label="允许导出客户 Excel 的角色">
        <el-select v-model="form.export_roles" multiple style="width:100%"><el-option v-for="x in roles" :key="x" :label="x" :value="x"/></el-select>
      </el-form-item>
    </el-form>
    <el-alert type="warning" :closable="false" title="导出权限只是第一层控制；实际导出仍会继续应用 self / department / all 数据范围，不能越权导出其他部门客户。" />
  </div>
</div>
</AppLayout></template>