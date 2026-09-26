<script setup lang="ts">
import {computed} from 'vue';
import {modules} from '../config/modules';
import {useAuth} from '../stores/auth';
const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const dedicated=['inquiries','opportunities','quotations','samples','orders','customFields'];
const allowedByRole:any={
  admin:'*',manager:'*',
  sales:['brands','products','contracts','orders','shipments','aftersales','tasks','activities','documents'],
  followup:['aftersales','tasks','activities','documents'],
  finance:['contracts','orders','payments','creditProfiles','shipments','documents'],
  readonly:'*'
};
const businessModules=computed(()=>{
  const role=auth.user?.role||'readonly',policy=allowedByRole[role]??[];
  return modules.filter(m=>!dedicated.includes(m.key)&&(policy==='*'||policy.includes(m.key)));
});
const showSales=computed(()=>['admin','manager','sales','followup','readonly'].includes(auth.user?.role));
const showExcel=computed(()=>['admin','manager'].includes(auth.user?.role));
const showCustomFields=computed(()=>['admin','manager'].includes(auth.user?.role));
</script>
<template><div class="app"><aside class="sidebar"><div class="brand">TF <span class="label">TradeFlow</span></div>
<router-link class="nav" to="/"><span class="label">仪表盘</span></router-link>
<router-link class="nav" to="/search"><span class="label">全局搜索</span></router-link>
<router-link class="nav" to="/customers"><span class="label">客户360°</span></router-link>
<router-link v-if="showExcel" class="nav" to="/data/excel"><span class="label">Excel 导入导出</span></router-link>
<template v-if="showSales"><div class="nav-group">销售流程</div>
<router-link class="nav" to="/sales/inquiries"><span class="label">询盘管理</span></router-link>
<router-link class="nav" to="/sales/opportunities"><span class="label">商机管理</span></router-link>
<router-link class="nav" to="/sales/quotations"><span class="label">报价管理</span></router-link>
<router-link class="nav" to="/sales/samples"><span class="label">样品管理</span></router-link></template>
<div class="nav-group">其他业务</div><router-link v-for="m in businessModules" :key="m.key" class="nav" :to="`/module/${m.key}`"><span class="label">{{m.title}}</span></router-link>
<div class="nav-group">系统配置</div><router-link v-if="showCustomFields" class="nav" to="/settings/custom-fields"><span class="label">自定义字段</span></router-link><router-link v-if="['admin','manager'].includes(auth.user?.role)" class="nav" to="/automation"><span class="label">自动化规则</span></router-link><router-link v-if="['admin','manager'].includes(auth.user?.role)" class="nav" to="/audit"><span class="label">审计日志</span></router-link>
</aside><main class="main"><header class="top"><b>外贸客户管理系统</b><div><span class="muted">{{auth.user?.display_name}} · {{auth.user?.role}}</span>　<el-button size="small" @click="auth.logout">退出</el-button></div></header><div class="content"><slot/></div></main></div></template>