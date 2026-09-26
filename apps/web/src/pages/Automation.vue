<script setup lang="ts">
import {ref,onMounted} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rules=ref<any[]>([]),logs=ref<any[]>([]),running=ref(false);
async function load(){rules.value=(await api.get('/automation/rules')).data;logs.value=(await api.get('/automation/logs')).data}
async function saveRule(r:any){await api.patch('/automation/rules',{key:r.key,enabled:!!r.enabled,config:r.config});ElMessage.success('规则已保存')}
async function runNow(){running.value=true;try{const {data}=await api.post('/automation/run',{});ElMessage.success(`自动化完成：新任务 ${data.created}，状态更新 ${data.updated}`);await load()}finally{running.value=false}}
onMounted(load);
</script>
<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">自动化与提醒</h2><span class="muted">服务运行期间每 10 分钟自动扫描一次，也可手动立即执行</span></div><el-button type="primary" :loading="running" @click="runNow">立即运行</el-button></div>
<div class="card" style="margin-bottom:16px"><el-table :data="rules">
  <el-table-column prop="name" label="规则" min-width="180"/><el-table-column prop="key" label="Key" width="170"/>
  <el-table-column label="启用" width="90"><template #default="s"><el-switch v-model="s.row.enabled" :active-value="1" :inactive-value="0"/></template></el-table-column>
  <el-table-column label="阈值/配置" min-width="260"><template #default="s"><div style="display:flex;gap:8px;align-items:center">
    <template v-if="['quotation_expiry','brand_expiry','dormant_customer','contact_anniversary'].includes(s.row.key)"><span>天数</span><el-input-number v-model="s.row.config.days" :min="1" :max="365"/></template><template v-else-if="s.row.key==='inquiry_response_sla'"><span>小时</span><el-input-number v-model="s.row.config.hours" :min="1" :max="168"/></template>
    <span>优先级</span><el-select v-model="s.row.config.priority" style="width:120px"><el-option v-for="x in ['low','normal','high','urgent']" :key="x" :label="x" :value="x"/></el-select>
  </div></template></el-table-column>
  <el-table-column label="操作" width="100"><template #default="s"><el-button link type="primary" @click="saveRule(s.row)">保存</el-button></template></el-table-column>
</el-table></div>
<div class="card"><h3 class="section-title">最近自动化日志</h3><el-table :data="logs" max-height="420">
  <el-table-column prop="created_at" label="时间" width="190"/><el-table-column prop="rule_key" label="规则" width="170"/><el-table-column prop="message" label="动作" min-width="220"/><el-table-column prop="entity_type" label="对象" width="130"/><el-table-column prop="entity_id" label="对象ID" min-width="200"/>
</el-table></div>
</AppLayout></template>