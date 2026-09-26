<script setup lang="ts">
import {computed} from 'vue';
import {modules} from '../config/modules';
import {useAuth} from '../stores/auth';
const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const dedicated=['brands','inquiries','opportunities','quotations','samples','products','contracts','orders','payments','creditProfiles','shipments','aftersales','campaigns','users','customFields'];
const allowedByRole:any={
  admin:'*',manager:'*',
  sales:['brands','products','contracts','tasks','activities','documents'],
  followup:['tasks','activities','documents'],
  finance:['contracts','documents'],
  readonly:'*'
};
const businessModules=computed(()=>{
  const role=auth.user?.role||'readonly',policy=allowedByRole[role]??[];
  return modules.filter(m=>!dedicated.includes(m.key)&&(policy==='*'||policy.includes(m.key)));
});
const role=computed(()=>auth.user?.role||'readonly');
const showSales=computed(()=>['admin','manager','sales','followup','readonly'].includes(role.value));
const showFinance=computed(()=>['admin','manager','finance','readonly'].includes(role.value));
const showExcel=computed(()=>['admin','manager'].includes(role.value));
const showAdmin=computed(()=>['admin','manager'].includes(role.value));
</script>
<template><div class="app"><aside class="sidebar">
  <div class="brand">TF <span class="label">TradeFlow</span></div>
  <router-link class="nav" to="/"><span class="label">仪表盘</span></router-link>
  <router-link class="nav" to="/analytics"><span class="label">统计分析</span></router-link>
  <router-link class="nav" to="/search"><span class="label">全局搜索</span></router-link>
  <router-link class="nav" to="/customers"><span class="label">客户360°</span></router-link><router-link v-if="['admin','manager','sales','followup'].includes(role)" class="nav" to="/mobile/quick-create"><span class="label">极速建档</span></router-link><router-link v-if="['admin','manager'].includes(role)" class="nav" to="/recycle-bin/customers"><span class="label">客户回收站</span></router-link><router-link class="nav" to="/brands-channels"><span class="label">品牌渠道</span></router-link><router-link v-if="['admin','manager','sales'].includes(role)" class="nav" to="/public-pool"><span class="label">客户公海</span></router-link><router-link class="nav" to="/products-pricing"><span class="label">产品与价格</span></router-link><router-link v-if="showAdmin" class="nav" to="/marketing"><span class="label">客户营销</span></router-link>
  <router-link v-if="showExcel" class="nav" to="/data/excel"><span class="label">Excel 导入导出</span></router-link>

  <template v-if="showSales">
    <div class="nav-group">销售流程</div>
    <router-link class="nav" to="/sales/inquiries"><span class="label">询盘管理</span></router-link>
    <router-link class="nav" to="/sales/opportunities"><span class="label">商机管理</span></router-link>
    <router-link class="nav" to="/sales/quotations"><span class="label">报价管理</span></router-link>
    <router-link class="nav" to="/sales/samples"><span class="label">样品管理</span></router-link>
  </template>

  <div class="nav-group">订单履约</div><router-link class="nav" to="/contracts"><span class="label">合同管理</span></router-link>
  <router-link class="nav" to="/orders"><span class="label">订单执行</span></router-link>
  <router-link class="nav" to="/shipments"><span class="label">出运执行</span></router-link><router-link class="nav" to="/customs"><span class="label">报关管理</span></router-link>
  <router-link class="nav" to="/aftersales"><span class="label">售后与投诉</span></router-link>
  <router-link v-if="showFinance" class="nav" to="/finance"><span class="label">回款与信用</span></router-link>

  <div v-if="businessModules.length" class="nav-group">其他业务</div>
  <router-link v-for="m in businessModules" :key="m.key" class="nav" :to="`/module/${m.key}`"><span class="label">{{m.title}}</span></router-link>

  <div class="nav-group">系统配置</div><router-link class="nav" to="/settings/security"><span class="label">账号安全</span></router-link><router-link v-if="auth.user?.role==='admin'" class="nav" to="/settings/team"><span class="label">组织与账号</span></router-link><router-link v-if="auth.user?.role==='admin'" class="nav" to="/settings/backups"><span class="label">数据库备份</span></router-link><router-link v-if="auth.user?.role==='admin'" class="nav" to="/settings/privacy"><span class="label">数据隐私</span></router-link>
  <router-link v-if="showAdmin" class="nav" to="/settings/custom-fields"><span class="label">自定义字段</span></router-link>
  <router-link v-if="showAdmin" class="nav" to="/automation"><span class="label">自动化规则</span></router-link>
  <router-link v-if="showAdmin" class="nav" to="/integrations"><span class="label">系统集成</span></router-link><router-link v-if="showAdmin" class="nav" to="/audit"><span class="label">审计日志</span></router-link>
</aside>
<main class="main"><header class="top"><b>外贸客户管理系统</b><div><span class="muted">{{auth.user?.display_name}} · {{auth.user?.role}}</span>　<el-button size="small" @click="auth.logout">退出</el-button></div></header><div class="content"><el-alert v-if="auth.user?.must_change_password" type="error" :closable="false" title="当前账号必须先修改初始/重置密码。" style="margin-bottom:14px"/><slot/></div></main>
</div></template>