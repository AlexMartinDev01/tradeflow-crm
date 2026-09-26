<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const integrations=ref<any[]>([]),tokens=ref<any[]>([]),dialog=ref(false),tokenDialog=ref(false),deliveriesDialog=ref(false),deliveries=ref<any[]>([]),newToken=ref('');
const form=reactive<any>({name:'',type:'webhook',provider:'custom',base_url:'',enabled:0,secret_env:'',config:{events:['*']}});
const tokenForm=reactive<any>({name:'',role:'readonly',expires_at:''});

async function load(){
  integrations.value=(await api.get('/integrations')).data;
  try{tokens.value=(await api.get('/api-tokens')).data}catch{tokens.value=[]}
}
async function save(){
  if(!form.name||!form.type)return ElMessage.warning('名称和类型必填');
  await api.post('/integrations',{...form,config:{...form.config}});dialog.value=false;Object.assign(form,{name:'',type:'webhook',provider:'custom',base_url:'',enabled:0,secret_env:'',config:{events:['*']}});await load();ElMessage.success('集成配置已保存')
}
async function toggle(r:any){await api.patch(`/integrations/${r.id}`,{enabled:!!r.enabled});await load()}
async function test(r:any){try{const {data}=await api.post(`/integrations/${r.id}/test`,{});ElMessage.success(`测试成功：HTTP ${data.status}`)}catch(e:any){ElMessage.error(e.response?.data?.error||'测试失败')}}
async function remove(r:any){await ElMessageBox.confirm(`删除集成“${r.name}”？`,'确认');await api.delete(`/integrations/${r.id}`);await load()}
async function showDeliveries(r:any){deliveries.value=(await api.get(`/integrations/${r.id}/deliveries`)).data;deliveriesDialog.value=true}
async function createToken(){const {data}=await api.post('/api-tokens',{...tokenForm,expires_at:tokenForm.expires_at||null});newToken.value=data.token;tokenDialog.value=false;await load();ElMessage.warning('API Token 只显示这一次，请立即复制保存')}
async function revokeToken(t:any){await ElMessageBox.confirm(`撤销 API Token “${t.name}”？`,'确认');await api.delete(`/api-tokens/${t.id}`);await load()}
async function copyToken(){await navigator.clipboard.writeText(newToken.value);ElMessage.success('已复制')}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">系统集成</h2><span class="muted">Webhook、第三方配置和 Open API Token；密钥不明文存数据库</span></div></div>
<el-alert type="info" :closable="false" style="margin-bottom:16px" title="Gmail / Outlook / WhatsApp Business / ERP 等需要对应账号授权或 API 凭据。这里提供安全配置与调用基础，不会把未授权连接显示为已接通。"/>

<el-tabs>
<el-tab-pane label="集成配置">
<div class="toolbar"><span class="muted">Webhook 可立即测试；其他 provider 作为后续 OAuth/API 接入配置。</span><el-button type="primary" @click="dialog=true">新增集成</el-button></div>
<div class="card"><el-table :data="integrations">
  <el-table-column prop="name" label="名称" min-width="160"/><el-table-column prop="type" label="类型" width="110"/><el-table-column prop="provider" label="Provider" width="130"/><el-table-column prop="base_url" label="Endpoint / Base URL" min-width="260"/>
  <el-table-column prop="secret_env" label="密钥环境变量" min-width="170"/><el-table-column label="启用" width="80"><template #default="s"><el-switch v-model="s.row.enabled" :active-value="1" :inactive-value="0" @change="toggle(s.row)"/></template></el-table-column>
  <el-table-column label="操作" width="220"><template #default="s"><el-button v-if="s.row.type==='webhook'" link type="primary" @click="test(s.row)">测试</el-button><el-button link @click="showDeliveries(s.row)">日志</el-button><el-button link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
</el-table></div>
</el-tab-pane>

<el-tab-pane label="API Token">
<div class="toolbar"><span class="muted">用于外部系统调用 TradeFlow API。Token 仅创建时显示一次。</span><el-button type="primary" @click="tokenDialog=true">创建 Token</el-button></div>
<div class="card"><el-table :data="tokens"><el-table-column prop="name" label="名称"/><el-table-column prop="role" label="权限角色"/><el-table-column prop="expires_at" label="过期时间"/><el-table-column prop="last_used_at" label="最近使用"/><el-table-column prop="created_at" label="创建时间"/><el-table-column label="操作" width="90"><template #default="s"><el-button link type="danger" @click="revokeToken(s.row)">撤销</el-button></template></el-table-column></el-table></div>
<div v-if="newToken" class="card" style="margin-top:16px"><el-alert type="warning" :closable="false" title="这个 Token 只显示一次，请立即复制。"/><el-input v-model="newToken" readonly style="margin-top:12px"><template #append><el-button @click="copyToken">复制</el-button></template></el-input></div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="dialog" title="新增集成" width="700"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="名称"><el-input v-model="form.name"/></el-form-item><el-form-item label="类型"><el-select v-model="form.type" style="width:100%"><el-option label="Webhook" value="webhook"/><el-option label="REST API" value="api"/><el-option label="OAuth" value="oauth"/><el-option label="名片 OCR" value="ocr"/></el-select></el-form-item>
<el-form-item label="Provider"><el-select v-model="form.provider" allow-create filterable style="width:100%"><el-option v-for="x in ['custom','gmail','outlook','whatsapp_business','erp','ecommerce','customs_data','ocr_adapter']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="Endpoint / Base URL"><el-input v-model="form.base_url"/></el-form-item>
<el-form-item label="密钥环境变量名"><el-input v-model="form.secret_env" placeholder="例如 TRADEFLOW_WEBHOOK_SECRET"/></el-form-item><el-form-item v-if="form.type==='webhook'" label="Webhook 事件"><el-select v-model="form.config.events" multiple allow-create filterable style="width:100%"><el-option label="全部事件 *" value="*"/><el-option label="customer.create" value="customers.create"/><el-option label="order.change_status" value="orders.change_status"/><el-option label="payment.mark_paid" value="payments.mark_paid"/></el-select></el-form-item>
</div><el-alert v-if="form.type==='ocr'" type="info" :closable="false" title="OCR Endpoint 需接受 JSON：{ mode: business_card, image_base64, mime_type }，并返回 JSON 字段 company_name/contact_name/title/email/phone/whatsapp/website/country/city/address；也可包在 data 或 result 下。" style="margin-bottom:12px"/><el-form-item><el-checkbox v-model="form.enabled" :true-value="1" :false-value="0">立即启用</el-checkbox></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>

<el-dialog v-model="tokenDialog" title="创建 API Token" width="540"><el-form label-position="top"><el-form-item label="名称"><el-input v-model="tokenForm.name"/></el-form-item><el-form-item label="权限角色"><el-select v-model="tokenForm.role" style="width:100%"><el-option label="只读" value="readonly"/><el-option label="财务" value="finance"/><el-option label="销售" value="sales"/><el-option label="经理" value="manager"/></el-select></el-form-item><el-form-item label="过期时间（可选）"><el-input v-model="tokenForm.expires_at" type="datetime-local"/></el-form-item></el-form><template #footer><el-button @click="tokenDialog=false">取消</el-button><el-button type="primary" @click="createToken">创建</el-button></template></el-dialog>

<el-dialog v-model="deliveriesDialog" title="Webhook 投递日志" width="850"><el-table :data="deliveries" max-height="500"><el-table-column prop="created_at" label="时间" width="190"/><el-table-column prop="event" label="事件" min-width="150"/><el-table-column prop="status" label="状态" width="90"/><el-table-column prop="status_code" label="HTTP" width="80"/><el-table-column prop="response_excerpt" label="响应" show-overflow-tooltip/></el-table></el-dialog>
</AppLayout></template>