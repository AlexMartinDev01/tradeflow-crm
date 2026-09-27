<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {ArrowDown,Bell,Expand,Fold,Menu,Plus,Search,Setting,User} from '@element-plus/icons-vue';
import {modules} from '../config/modules';
import {useAuth} from '../stores/auth';

const auth=useAuth();
if(!auth.user)auth.me().catch(()=>{});
const route=useRoute();
const router=useRouter();
const mobileOpen=ref(false);
const collapsed=ref(localStorage.getItem('tf_sidebar_collapsed')==='1');
const globalSearch=ref('');
const searchRef=ref<any>(null);

const dedicated=['brands','inquiries','opportunities','quotations','samples','products','contracts','orders','payments','creditProfiles','shipments','aftersales','campaigns','users','customFields'];
const allowedByRole:any={
  admin:'*',manager:'*',
  sales:['brands','products','contracts','tasks','activities','documents'],
  followup:['tasks','activities','documents'],
  finance:['contracts','documents'],
  readonly:'*'
};
const role=computed(()=>auth.user?.role||'readonly');
const showSales=computed(()=>['admin','manager','sales','followup','readonly'].includes(role.value));
const showFinance=computed(()=>['admin','manager','finance','readonly'].includes(role.value));
const showExcel=computed(()=>['admin','manager'].includes(role.value));
const showAdmin=computed(()=>['admin','manager'].includes(role.value));
const canQuickCreate=computed(()=>['admin','manager','sales','followup'].includes(role.value));
const businessModules=computed(()=>{
  const policy=allowedByRole[role.value]??[];
  return modules.filter(m=>!dedicated.includes(m.key)&&(policy==='*'||policy.includes(m.key)));
});

type NavItem={label:string;to:string;icon:string;show?:boolean};
const navSections=computed(()=>{
  const sections:{title:string;items:NavItem[]}[]=[
    {title:'工作台',items:[
      {label:'经营概览',to:'/',icon:'⌂'},
      {label:'统计分析',to:'/analytics',icon:'▥'},
      {label:'自定义报表',to:'/reports',icon:'▤'},
      {label:'全局搜索',to:'/search',icon:'⌕'}
    ]},
    {title:'客户经营',items:[
      {label:'客户360°',to:'/customers',icon:'♙'},
      {label:'数据质量',to:'/data-quality',icon:'◇',show:['admin','manager','sales','followup','readonly'].includes(role.value)},
      {label:'极速建档',to:'/mobile/quick-create',icon:'□',show:canQuickCreate.value},
      {label:'客户回收站',to:'/recycle-bin/customers',icon:'↺',show:['admin','manager'].includes(role.value)},
      {label:'品牌渠道',to:'/brands-channels',icon:'▰'},
      {label:'客户公海',to:'/public-pool',icon:'○',show:['admin','manager','sales'].includes(role.value)},
      {label:'产品与价格',to:'/products-pricing',icon:'⬡'},
      {label:'客户营销',to:'/marketing',icon:'✦',show:showAdmin.value},
      {label:'Excel 导入导出',to:'/data/excel',icon:'▦',show:showExcel.value}
    ]},
    {title:'销售流程',items:[
      {label:'询盘管理',to:'/sales/inquiries',icon:'♟',show:showSales.value},
      {label:'商机管理',to:'/sales/opportunities',icon:'◎',show:showSales.value},
      {label:'报价管理',to:'/sales/quotations',icon:'▣',show:showSales.value},
      {label:'样品管理',to:'/sales/samples',icon:'◈',show:showSales.value},
      {label:'合同管理',to:'/contracts',icon:'▧'}
    ]},
    {title:'订单履约',items:[
      {label:'订单执行',to:'/orders',icon:'▱'},
      {label:'出运执行',to:'/shipments',icon:'♨'},
      {label:'报关管理',to:'/customs',icon:'⚙'},
      {label:'售后与投诉',to:'/aftersales',icon:'✓'},
      {label:'售后知识库',to:'/knowledge',icon:'▤'},
      {label:'回款与信用',to:'/finance',icon:'¥',show:showFinance.value}
    ]},
    {title:'系统配置',items:[
      {label:'账号安全',to:'/settings/security',icon:'♢'},
      {label:'组织与账号',to:'/settings/team',icon:'♚',show:role.value==='admin'},
      {label:'数据库备份',to:'/settings/backups',icon:'◫',show:role.value==='admin'},
      {label:'附件备份',to:'/settings/attachment-backup',icon:'▦',show:role.value==='admin'},
      {label:'运行监控',to:'/settings/ops',icon:'◉',show:['admin','manager'].includes(role.value)},
      {label:'数据隐私',to:'/settings/privacy',icon:'◌',show:role.value==='admin'},
      {label:'自定义字段',to:'/settings/custom-fields',icon:'⌘',show:showAdmin.value},
      {label:'自动化规则',to:'/automation',icon:'↯',show:showAdmin.value},
      {label:'系统集成',to:'/integrations',icon:'∞',show:showAdmin.value},
      {label:'审计日志',to:'/audit',icon:'≡',show:showAdmin.value}
    ]}
  ];
  const dynamic=businessModules.value.map(m=>({label:m.title,to:`/module/${m.key}`,icon:'•'}));
  if(dynamic.length)sections.splice(sections.length-1,0,{title:'其他业务',items:dynamic});
  return sections.map(s=>({...s,items:s.items.filter(i=>i.show!==false)})).filter(s=>s.items.length);
});

const allNavItems=computed(()=>navSections.value.flatMap(s=>s.items));
const currentTitle=computed(()=>{
  const exact=allNavItems.value.find(x=>x.to===route.path);
  if(exact)return exact.label;
  const nested=allNavItems.value.filter(x=>x.to!=='/'&&route.path.startsWith(x.to+'/')).sort((a,b)=>b.to.length-a.to.length)[0];
  return nested?.label||'TradeFlow';
});
const currentSection=computed(()=>navSections.value.find(s=>s.items.some(i=>i.to===route.path||i.to!=='/'&&route.path.startsWith(i.to+'/')))?.title||'工作台');
const userInitial=computed(()=>String(auth.user?.display_name||auth.user?.username||'U').trim().slice(0,1).toUpperCase());

function toggleCollapsed(){collapsed.value=!collapsed.value;localStorage.setItem('tf_sidebar_collapsed',collapsed.value?'1':'0')}
function go(to:string){mobileOpen.value=false;router.push(to)}
function submitGlobalSearch(){router.push('/search')}
function handleUserCommand(command:string){
  if(command==='security')router.push('/settings/security');
  if(command==='logout')auth.logout();
}
function shortcut(e:KeyboardEvent){
  if(e.key==='/'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName||'')){e.preventDefault();searchRef.value?.focus?.()}
}
onMounted(()=>window.addEventListener('keydown',shortcut));
onBeforeUnmount(()=>window.removeEventListener('keydown',shortcut));
</script>

<template>
<div class="app" :class="{'sidebar-is-collapsed':collapsed}">
  <div v-if="mobileOpen" class="mobile-overlay" @click="mobileOpen=false"></div>
  <aside class="sidebar" :class="{open:mobileOpen,collapsed}">
    <div class="brand">
      <div class="brand-mark">TF</div>
      <div class="brand-copy"><strong>TradeFlow</strong><span>外贸客户管理系统</span></div>
    </div>
    <nav class="sidebar-nav">
      <section v-for="section in navSections" :key="section.title" class="nav-section">
        <div class="nav-group">{{section.title}}</div>
        <router-link v-for="item in section.items" :key="item.to" class="nav" :to="item.to" :title="collapsed?item.label:''" @click="mobileOpen=false">
          <span class="nav-icon">{{item.icon}}</span><span class="nav-label">{{item.label}}</span>
        </router-link>
      </section>
    </nav>
    <div class="sidebar-footer">
      <button class="sidebar-collapse" type="button" @click="toggleCollapsed">
        <el-icon><Fold v-if="!collapsed"/><Expand v-else/></el-icon><span class="nav-label">{{collapsed?'展开导航':'收起导航'}}</span>
      </button>
    </div>
  </aside>

  <main class="main">
    <header class="top">
      <div class="top-left">
        <el-button class="mobile-menu-button" circle aria-label="打开导航" @click.stop="mobileOpen=!mobileOpen"><el-icon><Menu/></el-icon></el-button>
        <button class="desktop-menu-button" type="button" @click="toggleCollapsed"><el-icon><Menu/></el-icon></button>
        <div class="breadcrumb"><span>工作台</span><i>/</i><span v-if="currentSection!=='工作台'">{{currentSection}}</span><i v-if="currentSection!=='工作台'">/</i><b>{{currentTitle}}</b></div>
      </div>

      <div class="top-actions">
        <el-input ref="searchRef" v-model="globalSearch" class="global-search" placeholder="全局搜索客户、联系人、询盘、订单等..." clearable @keyup.enter="submitGlobalSearch">
          <template #prefix><el-icon><Search/></el-icon></template>
          <template #suffix><kbd>/</kbd></template>
        </el-input>
        <el-button v-if="canQuickCreate" type="primary" class="quick-create-button" @click="go('/mobile/quick-create')"><el-icon><Plus/></el-icon>快速建档</el-button>
        <button class="notification-button" type="button" aria-label="通知"><el-icon><Bell/></el-icon></button>
        <el-dropdown trigger="click" @command="handleUserCommand">
          <button class="user-trigger" type="button">
            <span class="user-avatar">{{userInitial}}</span>
            <span class="user-copy"><b>{{auth.user?.display_name||auth.user?.username||'用户'}}</b><small>{{auth.user?.role||'readonly'}}</small></span>
            <el-icon class="user-arrow"><ArrowDown/></el-icon>
          </button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="security"><el-icon><Setting/></el-icon>账号与安全</el-dropdown-item>
            <el-dropdown-item divided command="logout"><el-icon><User/></el-icon>退出登录</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown>
      </div>
    </header>
    <div class="content">
      <el-alert v-if="auth.user?.must_change_password" type="error" :closable="false" title="当前账号必须先修改初始/重置密码。" class="global-alert"/>
      <slot/>
    </div>
  </main>
</div>
</template>