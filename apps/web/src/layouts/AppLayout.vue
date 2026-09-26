<script setup lang="ts">
import {modules} from '../config/modules';
import {useAuth} from '../stores/auth';
const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const businessModules=modules.filter(m=>m.key!=='customFields');
</script>
<template><div class="app"><aside class="sidebar">
  <div class="brand">TF <span class="label">TradeFlow</span></div>
  <router-link class="nav" to="/"><span class="label">仪表盘</span></router-link>
  <router-link class="nav" to="/customers"><span class="label">客户360°</span></router-link>
  <div class="nav-group">业务模块</div>
  <router-link v-for="m in businessModules" :key="m.key" class="nav" :to="`/module/${m.key}`"><span class="label">{{m.title}}</span></router-link>
  <div class="nav-group">系统配置</div>
  <router-link class="nav" to="/settings/custom-fields"><span class="label">自定义字段</span></router-link>
  <router-link class="nav" to="/audit"><span class="label">审计日志</span></router-link>
</aside>
<main class="main"><header class="top"><b>外贸客户管理系统</b><div><span class="muted">{{auth.user?.display_name}} · {{auth.user?.role}}</span>　<el-button size="small" @click="auth.logout">退出</el-button></div></header><div class="content"><slot/></div></main>
</div></template>
