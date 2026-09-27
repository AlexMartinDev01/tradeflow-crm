<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAuth} from '../stores/auth';

const auth=useAuth();
if(!auth.user)auth.me().catch(()=>{});
const route=useRoute();
const router=useRouter();
const mobileOpen=ref(false);
const collapsed=ref(localStorage.getItem('tf_sidebar_collapsed')==='1');
const globalSearch=ref('');
const searchRef=ref<any>(null);

const role=computed(()=>auth.user?.role||'readonly');
const showSales=computed(()=>['admin','manager','sales','followup','readonly'].includes(role.value));
const showFinance=computed(()=>['admin','manager','finance','readonly'].includes(role.value));
const canQuickCreate=computed(()=>['admin','manager','sales','followup'].includes(role.value));

type NavItem={label:string;to:string;icon:string;show?:boolean};
const navSections=computed(()=>{
  const sections:{title:string;items:NavItem[]}[]=[
    {title:'工作台',items:[
      {label:'经营概览',to:'/',icon:'nav_dashboard'},
      {label:'统计分析',to:'/analytics',icon:'nav_analytics'},
      {label:'自定义报表',to:'/reports',icon:'nav_reports'},
      {label:'全局搜索',to:'/search',icon:'nav_search'}
    ]},
    {title:'客户经营',items:[
      {label:'客户360°',to:'/customers',icon:'nav_customers'},
      {label:'数据质量',to:'/data-quality',icon:'nav_quality'},
      {label:'极速建档',to:'/mobile/quick-create',icon:'nav_quick',show:canQuickCreate.value},
      {label:'品牌渠道',to:'/brands-channels',icon:'nav_brand'},
      {label:'产品与价格',to:'/products-pricing',icon:'nav_products'}
    ]},
    {title:'销售流程',items:[
      {label:'询盘管理',to:'/sales/inquiries',icon:'nav_inquiries',show:showSales.value},
      {label:'商机管理',to:'/sales/opportunities',icon:'nav_opportunities',show:showSales.value},
      {label:'报价管理',to:'/sales/quotations',icon:'nav_quotes',show:showSales.value},
      {label:'合同管理',to:'/contracts',icon:'nav_contracts'}
    ]},
    {title:'订单履约',items:[
      {label:'订单执行',to:'/orders',icon:'nav_orders'},
      {label:'出运执行',to:'/shipments',icon:'nav_shipments'},
      {label:'报关管理',to:'/customs',icon:'nav_customs'},
      {label:'售后与投诉',to:'/aftersales',icon:'nav_aftersales'}
    ]},
    {title:'其他业务',items:[
      {label:'回款与信用',to:'/finance',icon:'nav_finance',show:showFinance.value}
    ]},
    {title:'系统配置',items:[
      {label:'账号安全',to:'/settings/security',icon:'nav_security'}
    ]}
  ];
  return sections.map(s=>({...s,items:s.items.filter(i=>i.show!==false)})).filter(s=>s.items.length);
});

const allNavItems=computed(()=>navSections.value.flatMap(s=>s.items));
const currentTitle=computed(()=>{
  const exact=allNavItems.value.find(x=>x.to===route.path);
  if(exact)return exact.label;
  const nested=allNavItems.value.filter(x=>x.to!=='/'&&route.path.startsWith(x.to+'/')).sort((a,b)=>b.to.length-a.to.length)[0];
  return nested?.label||'经营概览';
});
const currentSection=computed(()=>navSections.value.find(s=>s.items.some(i=>i.to===route.path||(i.to!=='/'&&route.path.startsWith(i.to+'/'))))?.title||'工作台');

function toggleCollapsed(){collapsed.value=!collapsed.value;localStorage.setItem('tf_sidebar_collapsed',collapsed.value?'1':'0')}
function go(to:string){mobileOpen.value=false;router.push(to)}
function submitGlobalSearch(){router.push({path:'/search',query:globalSearch.value.trim()?{q:globalSearch.value.trim()}:undefined})}
function handleUserCommand(command:string){
  if(command==='security')router.push('/settings/security');
  if(command==='logout')auth.logout();
}
function shortcut(e:KeyboardEvent){
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
    e.preventDefault();searchRef.value?.focus?.();return;
  }
  if(e.key==='/'&&!['INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName||'')){
    e.preventDefault();searchRef.value?.focus?.();
  }
}
onMounted(()=>window.addEventListener('keydown',shortcut));
onBeforeUnmount(()=>window.removeEventListener('keydown',shortcut));
</script>

<template>
<div class="app" :class="{'sidebar-is-collapsed':collapsed}">
  <div v-if="mobileOpen" class="mobile-overlay" @click="mobileOpen=false"></div>

  <aside class="sidebar" :class="{open:mobileOpen,collapsed}">
    <div class="brand">
      <span class="ui-sprite brand-sprite" aria-label="TradeFlow 外贸客户管理系统"></span>
    </div>

    <nav class="sidebar-nav">
      <section v-for="section in navSections" :key="section.title" class="nav-section">
        <div class="nav-group">{{section.title}}</div>
        <router-link
          v-for="item in section.items"
          :key="item.to"
          class="nav"
          :to="item.to"
          :title="collapsed?item.label:''"
          @click="mobileOpen=false"
        >
          <span class="nav-icon"><span class="ui-sprite" :class="'sprite-'+item.icon"></span></span>
          <span class="nav-label">{{item.label}}</span>
        </router-link>
      </section>
    </nav>
  </aside>

  <main class="main">
    <header class="top">
      <div class="top-left">
        <button class="top-icon-button mobile-menu-button" type="button" aria-label="打开导航" @click.stop="mobileOpen=!mobileOpen">
          <span class="ui-sprite sprite-top_menu"></span>
        </button>
        <button class="top-icon-button desktop-menu-button" type="button" aria-label="展开或收起导航" @click="toggleCollapsed">
          <span class="ui-sprite sprite-top_menu"></span>
        </button>
        <div class="breadcrumb">
          <span>工作台</span><i>/</i>
          <span v-if="currentSection!=='工作台'">{{currentSection}}</span><i v-if="currentSection!=='工作台'">/</i>
          <b>{{currentTitle}}</b>
        </div>
      </div>

      <div class="top-actions">
        <el-input
          ref="searchRef"
          v-model="globalSearch"
          class="global-search"
          placeholder="全局搜索客户、联系人、询盘、订单等..."
          clearable
          @keyup.enter="submitGlobalSearch"
        >
          <template #prefix><span class="ui-sprite sprite-top_search_top"></span></template>
          <template #suffix><kbd>⌘K</kbd></template>
        </el-input>

        <el-button v-if="canQuickCreate" type="primary" class="quick-create-button" @click="go('/mobile/quick-create')">
          <span class="quick-plus">＋</span>快速建档
        </el-button>

        <button class="notification-button" type="button" aria-label="通知">
          <span class="ui-sprite sprite-top_bell"></span><em>3</em>
        </button>

        <el-dropdown trigger="click" @command="handleUserCommand">
          <button class="user-trigger" type="button">
            <span class="ui-sprite avatar-sprite"></span>
            <span class="user-copy">
              <b>{{auth.user?.display_name||auth.user?.username||'Linda Chen'}}</b>
              <small>外贸事业部</small>
            </span>
            <span class="user-chevron"></span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="security">账号与安全</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
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