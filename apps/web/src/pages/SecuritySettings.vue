<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const status=ref<any>(null),setup=ref<any>(null),loading=ref(false);
const passwordForm=reactive({current_password:'',new_password:'',confirm_password:''});
const setupForm=reactive({current_password:'',code:''});
const disableForm=reactive({current_password:'',code:''});

async function load(){status.value=(await api.get('/auth/security-status')).data}
function validateNewPassword(){
  const p=passwordForm.new_password;
  if(p.length<10||!/[a-z]/.test(p)||!/[A-Z]/.test(p)||!/\d/.test(p)||!/[^A-Za-z0-9]/.test(p))return '新密码必须至少 10 位，并同时包含大小写字母、数字和特殊字符';
  if(p!==passwordForm.confirm_password)return '两次输入的新密码不一致';
  return '';
}
async function changePassword(){
  const err=validateNewPassword();if(err)return ElMessage.warning(err);
  loading.value=true;
  try{
    await api.post('/auth/change-password',{current_password:passwordForm.current_password,new_password:passwordForm.new_password});
    Object.assign(passwordForm,{current_password:'',new_password:'',confirm_password:''});
    await auth.me();await load();ElMessage.success('密码已修改，其他登录会话已失效');
  }catch(e:any){
    if(e.response?.data?.error==='weak_password')ElMessage.error((e.response.data.details||[]).join('；'));
    else ElMessage.error(e.response?.data?.message||'修改密码失败');
  }finally{loading.value=false}
}
async function beginTwoFactor(){
  if(!setupForm.current_password)return ElMessage.warning('请输入当前密码');
  try{
    setup.value=(await api.post('/auth/2fa/setup',{current_password:setupForm.current_password})).data;
    ElMessage.success('2FA 密钥已生成，请先加入身份验证器，再输入动态验证码确认');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'无法生成 2FA 密钥')}
}
async function enableTwoFactor(){
  if(!setup.value)return ElMessage.warning('请先生成 2FA 密钥');
  try{
    await api.post('/auth/2fa/enable',{current_password:setupForm.current_password,code:setupForm.code});
    setup.value=null;Object.assign(setupForm,{current_password:'',code:''});await auth.me();await load();ElMessage.success('两步验证已启用');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'验证码错误')}
}
async function disableTwoFactor(){
  await ElMessageBox.confirm('关闭两步验证后，账号只依赖密码登录。确认关闭？','安全确认',{type:'warning'});
  try{
    await api.post('/auth/2fa/disable',{current_password:disableForm.current_password,code:disableForm.code});
    Object.assign(disableForm,{current_password:'',code:''});await auth.me();await load();ElMessage.success('两步验证已关闭');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'关闭失败')}
}
async function copyText(text:string){await navigator.clipboard.writeText(text);ElMessage.success('已复制')}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">账号安全</h2><span class="muted">密码、登录锁定与 TOTP 两步验证</span></div></div>

<el-alert v-if="auth.user?.must_change_password" type="error" :closable="false" title="当前账号使用的是初始或管理员重置密码。完成密码修改前，系统会阻止进入其他业务页面。" style="margin-bottom:16px"/>

<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
  <div class="card">
    <h3 class="section-title">修改密码</h3>
    <el-alert type="info" :closable="false" title="至少 10 位，同时包含大写字母、小写字母、数字和特殊字符；不能包含用户名或使用系统默认弱密码。" style="margin-bottom:14px"/>
    <el-form label-position="top">
      <el-form-item label="当前密码"><el-input v-model="passwordForm.current_password" type="password" show-password autocomplete="current-password"/></el-form-item>
      <el-form-item label="新密码"><el-input v-model="passwordForm.new_password" type="password" show-password autocomplete="new-password"/></el-form-item>
      <el-form-item v-if="passwordForm.new_password" label="确认新密码"><el-input v-model="passwordForm.confirm_password" type="password" show-password autocomplete="new-password"/></el-form-item>
      <el-button type="primary" :loading="loading" @click="changePassword">修改密码</el-button>
    </el-form>
  </div>

  <div class="card">
    <div class="toolbar"><div><h3 class="section-title">两步验证（TOTP）</h3><span class="muted">兼容常见身份验证器</span></div><el-tag :type="status?.two_factor_enabled?'success':'info'">{{status?.two_factor_enabled?'已启用':'未启用'}}</el-tag></div>

    <template v-if="!status?.two_factor_enabled">
      <el-form label-position="top">
        <el-form-item label="当前密码"><el-input v-model="setupForm.current_password" type="password" show-password/></el-form-item>
        <el-button @click="beginTwoFactor">1. 生成 2FA 密钥</el-button>
      </el-form>
      <div v-if="setup" style="margin-top:16px">
        <el-alert type="warning" :closable="false" title="密钥只用于本次配置，请勿发送给他人。服务器中以 APP_SECRET 派生密钥进行加密保存。" style="margin-bottom:12px"/>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="手工密钥"><code style="word-break:break-all">{{setup.secret}}</code>　<el-button size="small" @click="copyText(setup.secret)">复制</el-button></el-descriptions-item>
          <el-descriptions-item label="otpauth URI"><code style="word-break:break-all">{{setup.otpauth_uri}}</code>　<el-button size="small" @click="copyText(setup.otpauth_uri)">复制</el-button></el-descriptions-item>
        </el-descriptions>
        <el-form label-position="top" style="margin-top:14px"><el-form-item label="身份验证器中的 6 位动态验证码"><el-input v-model="setupForm.code" maxlength="6" inputmode="numeric"/></el-form-item><el-button type="primary" @click="enableTwoFactor">2. 验证并启用</el-button></el-form>
      </div>
    </template>

    <template v-else>
      <el-alert type="success" :closable="false" title="登录时将在密码验证后要求输入 6 位动态验证码。" style="margin-bottom:14px"/>
      <el-form label-position="top">
        <el-form-item label="当前密码"><el-input v-model="disableForm.current_password" type="password" show-password/></el-form-item>
        <el-form-item label="当前动态验证码"><el-input v-model="disableForm.code" maxlength="6" inputmode="numeric"/></el-form-item>
        <el-button type="danger" plain @click="disableTwoFactor">关闭两步验证</el-button>
      </el-form>
    </template>
  </div>
</div>

<div class="card" style="margin-top:16px" v-if="status">
  <h3 class="section-title">当前安全状态</h3>
  <el-descriptions :column="3" border>
    <el-descriptions-item label="用户名">{{status.username}}</el-descriptions-item>
    <el-descriptions-item label="密码最近修改">{{status.password_changed_at||'尚未记录'}}</el-descriptions-item>
    <el-descriptions-item label="强制改密">{{status.must_change_password?'是':'否'}}</el-descriptions-item>
    <el-descriptions-item label="两步验证">{{status.two_factor_enabled?'已启用':'未启用'}}</el-descriptions-item>
    <el-descriptions-item label="失败计数">{{status.failed_login_count||0}}</el-descriptions-item>
    <el-descriptions-item label="锁定至">{{status.locked_until||'-'}}</el-descriptions-item>
  </el-descriptions>
</div>
</AppLayout></template>