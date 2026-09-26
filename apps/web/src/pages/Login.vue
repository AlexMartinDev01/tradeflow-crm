<script setup lang="ts">
import {ElMessage} from 'element-plus';
import {reactive,ref} from 'vue';
import {useRouter} from 'vue-router';
import {useAuth} from '../stores/auth';

const form=reactive({username:'admin',password:'Admin@123456'}),code=ref(''),step=ref<'password'|'2fa'>('password');
const auth=useAuth(),router=useRouter();

function destination(user:any){return user?.must_change_password?'/settings/security':'/'}
async function submit(){
  try{
    const data=await auth.login(form.username,form.password);
    if(data.two_factor_required){step.value='2fa';code.value='';return}
    router.push(destination(data.user));
  }catch(e:any){
    if(e.response?.data?.error==='account_locked'){
      const until=e.response.data.locked_until?new Date(e.response.data.locked_until).toLocaleString():'稍后';
      ElMessage.error(`账号已临时锁定，请在 ${until} 后重试`);
    }else ElMessage.error(e.response?.data?.message||'登录失败');
  }
}
async function verify(){
  try{
    const data=await auth.verifyTwoFactor(code.value);
    router.push(destination(data.user));
  }catch(e:any){ElMessage.error(e.response?.data?.message||'动态验证码验证失败')}
}
function back(){auth.clearTwoFactor();step.value='password';code.value=''}
</script>

<template><div class="login-wrap"><div class="login-card">
  <h1>TradeFlow CRM</h1>
  <p class="muted">外贸客户、询盘、报价、订单、回款与出运一体化管理</p>
  <template v-if="step==='password'">
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="用户名"><el-input v-model="form.username" autocomplete="username"/></el-form-item>
      <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password autocomplete="current-password"/></el-form-item>
      <el-button type="primary" native-type="submit" :loading="auth.loading" style="width:100%">登录</el-button>
    </el-form>
  </template>
  <template v-else>
    <el-alert type="info" :closable="false" title="该账号已启用两步验证，请输入身份验证器中的 6 位动态验证码。" style="margin-bottom:16px"/>
    <el-form label-position="top" @submit.prevent="verify">
      <el-form-item label="动态验证码"><el-input v-model="code" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="000000"/></el-form-item>
      <el-button type="primary" native-type="submit" :loading="auth.loading" style="width:100%">验证并登录</el-button>
      <el-button style="width:100%;margin:10px 0 0" @click="back">返回密码登录</el-button>
    </el-form>
  </template>
</div></div></template>