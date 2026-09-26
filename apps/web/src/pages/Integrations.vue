<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const integrations=ref<any[]>([]),tokens=ref<any[]>([]),dialog=ref(false),tokenDialog=ref(false),deliveriesDialog=ref(false),deliveries=ref<any[]>([]),newToken=ref('');
const form=reactive<any>({name:'',type:'webhook',provider:'custom',base_url:'',enabled:0,secret_env:'',config:{events:['*'],host:'',port:587,secure:false,username:'',from_name:'',from_email:'',reply_to:'',public_base_url:'',tracking_enabled:true,reject_unauthorized:true}});
const tokenForm=reactive<any>({name:'',role:'readonly',expires_at:''});

async function load(){
  integrations.value=(await api.get('/integrations')).data;
  try{tokens.value=(await api.get('/api-tokens')).data}catch{tokens.value=[]}
}
async function save(){
  if(!form.name||!form.type)return ElMessage.warning('名称和类型必填');
  await api.post('/integrations',{...form,config:{...form.config}});dialog.value=false;Object.assign(form,{name:'',type:'webhook',provider:'custom',base_url:'',enabled:0,secret_env:'',config:{events:['*'],host:'',port:587,secure:false,username:'',from_name:'',from_email:'',reply_to:'',public_base_url:'',tracking_enabled:true,reject_unauthorized:true}});await load();ElMessage.success('集成配置已保存')
}
async function toggle(r:any){await api.patch(`/integrations/${r.id}`,{enabled:!!r.enabled});await load()}
async function test(r:any){
  try{
    if(r.type==='email_smtp'){
      const {value}=await ElMessageBox.prompt('请输入用于接收测试邮件的邮箱地址','SMTP 测试',{confirmButtonText:'发送测试邮件',cancelButtonText:'取消',inputPattern:/^[^\s@]+@[^\s@]+\.[^\s@]+$/,inputErrorMessage:'请输入有效邮箱'});
      const {data}=await api.post('/email/test',{to:value});ElMessage.success(`测试邮件已发送：${data.message_id||'SMTP accepted'}`);return;
    }
    const {data}=await api.post(`/integrations/${r.id}/test`,{});ElMessage.success(`测试成功：HTTP ${data.status}`);
  }catch(e:any){if(e==='cancel'||e==='close')return;ElMessage.error(e.response?.data?.message||e.response?.data?.error||'测试失败')}
}
async function remove(r:any){await ElMessageBox.confirm(`删除集成“${r.name}”？`,'确认');await api.delete(`/integrations/${r.id}`);await load()}
async function showDeliveries(r:any){deliveries.value=(await api.get(`/integrations/${r.id}/deliveries`)).data;deliveriesDialog.value=true}
async function createToken(){const {data}=await api.post('/api-tokens',{...tokenForm,expires_at:tokenForm.expires_at||null});newToken.value=data.token;tokenDialog.value=false;await load();ElMessage.warning('API Token 只显示这一次，请立即复制保存')}
async function revokeToken(t:any){await ElMessageBox.confirm(`撤销 API Token “${t.name}”？`,'确认');await api.delete(`/api-tokens/${t.id}`);await load()}
async function copyToken(){await navigator.clipboard.writeText(newToken.value);ElMessage.success('已复制')}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">系统集成</h2><span class="muted">Webhook、SMTP、OCR、附件备份和 Open API Token；密钥不明文存数据库</span></div></div>
<el-alert type="info" :closable="false" style="margin-bottom:16px" title="Gmail / Outlook / WhatsApp Business / ERP 等需要对应账号授权或 API 凭据。这里提供安全配置与调用基础，不会把未授权连接显示为已接通。"/>

<el-tabs>
<el-tab-pane label="集成配置">
<div class="toolbar"><span class="muted">Webhook 与 SMTP 可直接测试；其他 provider 按实际授权状态接入。</span><el-button type="primary" @click="dialog=true">新增集成</el-button></div>
<div class="card"><el-table :data="integrations">
  <el-table-column prop="name" label="名称" min-width="160"/><el-table-column prop="type" label="类型" width="110"/><el-table-column prop="provider" label="Provider" width="130"/><el-table-column prop="base_url" label="Endpoint / Base URL" min-width="260"/>
  <el-table-column prop="secret_env" label="密钥环境变量" min-width="170"/><el-table-column label="启用" width="80"><template #default="s"><el-switch v-model="s.row.enabled" :active-value="1" :inactive-value="0" @change="toggle(s.row)"/></template></el-table-column>
  <el-table-column label="操作" width="220"><template #default="s"><el-button v-if="['webhook','email_smtp'].includes(s.row.type)" link type="primary" @click="test(s.row)">测试</el-button><el-button link @click="showDeliveries(s.row)">日志</el-button><el-button link type="danger" @click="remove(s.row)">删除</el-button></template></el-table-column>
</el-table></div>
</el-tab-pane>

<el-tab-pane label="API Token">
<div class="toolbar"><span class="muted">用于外部系统调用 TradeFlow API。Token 仅创建时显示一次。</span><el-button type="primary" @click="tokenDialog=true">创建 Token</el-button></div>
<div class="card"><el-table :data="tokens"><el-table-column prop="name" label="名称"/><el-table-column prop="role" label="权限角色"/><el-table-column prop="expires_at" label="过期时间"/><el-table-column prop="last_used_at" label="最近使用"/><el-table-column prop="created_at" label="创建时间"/><el-table-column label="操作" width="90"><template #default="s"><el-button link type="danger" @click="revokeToken(s.row)">撤销</el-button></template></el-table-column></el-table></div>
<div v-if="newToken" class="card" style="margin-top:16px"><el-alert type="warning" :closable="false" title="这个 Token 只显示一次，请立即复制。"/><el-input v-model="newToken" readonly style="margin-top:12px"><template #append><el-button @click="copyToken">复制</el-button></template></el-input></div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="dialog" title="新增集成" width="700"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="名称"><el-input v-model="form.name"/></el-form-item><el-form-item label="类型"><el-select v-model="form.type" style="width:100%"><el-option label="Webhook" value="webhook"/><el-option label="SMTP 邮件" value="email_smtp"/><el-option label="REST API" value="api"/><el-option label="OAuth" value="oauth"/><el-option label="名片 OCR" value="ocr"/><el-option label="附件异地备份" value="storage_backup"/></el-select></el-form-item>
<el-form-item label="Provider"><el-select v-model="form.provider" allow-create filterable style="width:100%"><el-option v-for="x in ['custom','smtp','gmail','outlook','whatsapp_business','erp','ecommerce','customs_data','ocr_adapter','backup_gateway']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="Endpoint / Base URL"><el-input v-model="form.base_url"/></el-form-item>
<el-form-item :label="form.type==='email_smtp'?'SMTP 密码环境变量名':'密钥环境变量名'"><el-input v-model="form.secret_env" :placeholder="form.type==='email_smtp'?'例如 TRADEFLOW_SMTP_PASSWORD':'例如 TRADEFLOW_WEBHOOK_SECRET'"/></el-form-item><el-form-item v-if="form.type==='webhook'" label="Webhook 事件"><el-select v-model="form.config.events" multiple allow-create filterable style="width:100%"><el-option label="全部事件 *" value="*"/><el-option label="customer.create" value="customers.create"/><el-option label="order.change_status" value="orders.change_status"/><el-option label="payment.mark_paid" value="payments.mark_paid"/></el-select></el-form-item>
</div>
<div v-if="form.type==='email_smtp'" class="card" style="margin-bottom:14px">
  <h4 style="margin-top:0">SMTP 连接参数</h4>
  <div class="grid" style="grid-template-columns:1fr 140px">
    <el-form-item label="SMTP Host"><el-input v-model="form.config.host" placeholder="smtp.example.com"/></el-form-item>
    <el-form-item label="端口"><el-input-number v-model="form.config.port" :min="1" :max="65535"/></el-form-item>
  </div>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <el-form-item label="SMTP 用户名"><el-input v-model="form.config.username"/></el-form-item>
    <el-form-item label="发件邮箱"><el-input v-model="form.config.from_email" placeholder="sales@example.com"/></el-form-item>
    <el-form-item label="发件人名称"><el-input v-model="form.config.from_name" placeholder="Your Company"/></el-form-item>
    <el-form-item label="Reply-To"><el-input v-model="form.config.reply_to"/></el-form-item>
  </div>
  <el-form-item label="公网访问地址（邮件追踪 / 一键退订）"><el-input v-model="form.config.public_base_url" placeholder="https://crm.example.com"/></el-form-item>
  <el-form-item><el-checkbox v-model="form.config.secure">SSL/TLS 直连（常见 465）</el-checkbox><el-checkbox v-model="form.config.reject_unauthorized">校验 TLS 证书</el-checkbox><el-checkbox v-model="form.config.tracking_enabled">启用营销邮件打开/点击追踪与一键退订</el-checkbox></el-form-item>
  <el-alert type="warning" :closable="false" title="SMTP 密码不会保存到数据库，请放在环境变量中。营销追踪只有在公网访问地址能被邮件客户端访问时才会生效；Codespaces 休眠后追踪链接也会失效。" />
  <el-alert type="info" :closable="false" title="打开/点击统计可能受到 Gmail/Outlook 图片代理和安全扫描器影响，应视为互动信号，不应视为精确真人行为。" style="margin-top:8px"/>
</div>
<el-alert v-if="form.type==='ocr'" type="info" :closable="false" title="OCR Endpoint 需接受 JSON：{ mode: business_card, image_base64, mime_type }，并返回 JSON 字段 company_name/contact_name/title/email/phone/whatsapp/website/country/city/address；也可包在 data 或 result 下。" style="margin-bottom:12px"/>
<el-alert v-if="form.type==='storage_backup'" type="info" :closable="false" title="备份端默认以 PUT 请求接收原始文件；系统会附带 X-TradeFlow-Document-Id、X-TradeFlow-Storage-Path、X-TradeFlow-Checksum。可通过 config.method/path_mode/auth_header/auth_prefix 调整。" style="margin-bottom:12px"/><el-form-item><el-checkbox v-model="form.enabled" :true-value="1" :false-value="0">立即启用</el-checkbox></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>

<el-dialog v-model="tokenDialog" title="创建 API Token" width="540"><el-form label-position="top"><el-form-item label="名称"><el-input v-model="tokenForm.name"/></el-form-item><el-form-item label="权限角色"><el-select v-model="tokenForm.role" style="width:100%"><el-option label="只读" value="readonly"/><el-option label="财务" value="finance"/><el-option label="销售" value="sales"/><el-option label="经理" value="manager"/></el-select></el-form-item><el-form-item label="过期时间（可选）"><el-input v-model="tokenForm.expires_at" type="datetime-local"/></el-form-item></el-form><template #footer><el-button @click="tokenDialog=false">取消</el-button><el-button type="primary" @click="createToken">创建</el-button></template></el-dialog>

<el-dialog v-model="deliveriesDialog" title="集成投递日志" width="850"><el-table :data="deliveries" max-height="500"><el-table-column prop="created_at" label="时间" width="190"/><el-table-column prop="event" label="事件" min-width="150"/><el-table-column prop="status" label="状态" width="90"/><el-table-column prop="status_code" label="HTTP" width="80"/><el-table-column prop="response_excerpt" label="响应" show-overflow-tooltip/></el-table></el-dialog>
</AppLayout></template>