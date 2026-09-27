<script setup lang="ts">
import {computed,ref} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {Search,Menu,Fold,Expand,Plus,User,Setting,ArrowDown} from '@element-plus/icons-vue';
import {modules} from '../config/modules';
import {useAuth} from '../stores/auth';

const auth=useAuth();
if(!auth.user)auth.me().catch(()=>{});

const route=useRoute();
const router=useRouter();
const mobileOpen=ref(false);
const collapsed=ref(localStorage.getItem('tf_sidebar_collapsed')==='1');

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
      {label:'经营概览',to:'/',icon:'概'},
      {label:'统计分析',to:'/analytics',icon:'析'},
      {label:'自定义报表',to:'/reports',icon:'报'},
      {label:'全局搜索',to:'/search',icon:'搜'}
    ]},
    {title:'客户经营',items:[
      {label:'客户 360°',to:'/customers',icon:'客'},
      {label:'数据质量',to:'/data-quality',icon:'质',show:['admin','manager','sales','followup','readonly'].includes(role.value)},
      {label:'极速建档',to:'/mobile/quick-create',icon:'建',show:canQuickCreate.value},
      {label:'客户回收站',to:'/recycle-bin/customers',icon:'回',show:['admin','manager'].includes(role.value)},
      {label:'品牌渠道',to:'/brands-channels',icon:'渠'},
      {label:'客户公海',to:'/public-pool',icon:'海',show:['admin','manager','sales'].includes(role.value)},
      {label:'产品与价格',to:'/products-pricing',icon:'品'},
      {label:'客户营销',to:'/marketing',icon:'营',show:showAdmin.value},
      {label:'Excel 导入导出',to:'/data/excel',icon:'表',show:showExcel.value}
    ]},
    {title:'销售流程',items:[
      {label:'询盘管理',to:'/sales/inquiries',icon:'询',show:showSales.value},
      {label:'商机管理',to:'/sales/opportunities',icon:'机',show:showSales.value},
      {label:'报价管理',to:'/sales/quotations',icon:'价',show:showSales.value},
      {label:'样品管理',to:'/sales/samples',icon:'样',show:showSales.value}
    ]},
    {title:'订单履约',items:[
      {label:'合同管理',to:'/contracts',icon:'合'},
      {label:'订单执行',to:'/orders',icon:'单'},
      {label:'出运执行',to:'/shipments',icon:'运'},
      {label:'报关管理',to:'/customs',icon:'关'},
      {label:'售后与投诉',to:'/aftersales',icon:'售'},
      {label:'售后知识库',to:'/knowledge',icon:'知'},
      {label:'回款与信用',to:'/finance',icon:'款',show:showFinance.value}
    ]},
    {title:'系统配置',items:[
      {label:'账号安全',to:'/settings/security',icon:'安'},
      {label:'组织与账号',to:'/settings/team',icon:'组',show:role.value==='admin'},
      {label:'数据库备份',to:'/settings/backups',icon:'备',show:role.value==='admin'},
      {label:'附件备份',to:'/settings/attachment-backup',icon:'附',show:role.value==='admin'},
      {label:'运行监控',to:'/settings/ops',icon:'监',show:['admin','manager'].includes(role.value)},
      {label:'数据隐私',to:'/settings/privacy',icon:'隐',show:role.value==='admin'},
      {label:'自定义字段',to:'/settings/custom-fields',icon:'字',show:showAdmin.value},
      {label:'自动化规则',to:'/automation',icon:'自',show:showAdmin.value},
      {label:'系统集成',to:'/integrations',icon:'集',show:showAdmin.value},
      {label:'审计日志',to:'/audit',icon:'审',show:showAdmin.value}
    ]}
  ];
  const dynamic=businessModules.value.map(m=>({label:m.title,to:`/module/${m.key}`,icon:'业'}));
  if(dynamic.length)sections.splice(sections.length-1,0,{title:'其他业务',items:dynamic});
  return sections.map(s=>({...s,items:s.items.filter(i=>i.show!==false)})).filter(s=>s.items.length);
});

const allNavItems=computed(()=>navSections.value.flatMap(s=>s.items));
const currentTitle=computed(()=>{
  const exact=allNavItems.value.find(x=>x.to===route.path);
  if(exact)return exact.label;
  const nested=allNavItems.value
    .filter(x=>x.to!=='/'&&route.path.startsWith(x.to+'/'))
    .sort((a,b)=>b.to.length-a.to.length)[0];
  return nested?.label||'TradeFlow';
});
const userInitial=computed(()=>String(auth.user?.display_name||auth.user?.username||'U').trim().slice(0,1).toUpperCase());

function toggleCollapsed(){
  collapsed.value=!collapsed.value;
  localStorage.setItem('tf_sidebar_collapsed',collapsed.value?'1':'0');
}
function go(to:string){
  mobileOpen.value=false;
  router.push(to);
}
function handleUserCommand(command:string){
  if(command==='security')router.push('/settings/security');
  if(command==='logout')auth.logout();
}
</script>

<template>
  <div class="app" :class="{'sidebar-is-collapsed':collapsed}">
    <div v-if="mobileOpen" class="mobile-overlay" @click="mobileOpen=false"></div>

    <aside class="sidebar" :class="{open:mobileOpen,collapsed}">
      <div class="brand">
        <div class="brand-mark">TF</div>
        <div class="brand-copy">
          <strong>TradeFlow</strong>
          <span>外贸业务工作台</span>
        </div>
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
            <span class="nav-icon">{{item.icon}}</span>
            <span class="nav-label">{{item.label}}</span>
          </router-link>
        </section>
      </nav>

      <div class="sidebar-footer">
        <button class="sidebar-collapse" type="button" @click="toggleCollapsed">
          <el-icon><Fold v-if="!collapsed"/><Expand v-else/></el-icon>
          <span class="nav-label">{{collapsed?'展开导航':'收起导航'}}</span>
        </button>
      </div>
    </aside>

    <main class="main">
      <header class="top">
        <div class="top-left">
          <el-button class="mobile-menu-button" circle aria-label="打开导航" @click.stop="mobileOpen=!mobileOpen">
            <el-icon><Menu/></el-icon>
          </el-button>
          <div class="page-heading">
            <span class="page-eyebrow">TradeFlow · 外贸客户管理系统</span>
            <strong>{{currentTitle}}</strong>
          </div>
        </div>

        <div class="top-actions">
          <el-button class="top-action secondary-action" @click="go('/search')">
            <el-icon><Search/></el-icon>
            <span>全局搜索</span>
            <kbd>/</kbd>
          </el-button>
          <el-button v-if="canQuickCreate" type="primary" class="top-action" @click="go('/mobile/quick-create')">
            <el-icon><Plus/></el-icon>
            <span>快速建档</span>
          </el-button>

          <el-dropdown trigger="click" @command="handleUserCommand">
            <button class="user-trigger" type="button">
              <span class="user-avatar">{{userInitial}}</span>
              <span class="user-copy">
                <b>{{auth.user?.display_name||auth.user?.username||'用户'}}</b>
                <small>{{auth.user?.role||'readonly'}}</small>
              </span>
              <el-icon class="user-arrow"><ArrowDown/></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="security">
                  <el-icon><Setting/></el-icon>账号与安全
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><User/></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div class="content">
        <el-alert
          v-if="auth.user?.must_change_password"
          type="error"
          :closable="false"
          title="当前账号必须先修改初始/重置密码。"
          class="global-alert"
        />
        <slot/>
      </div>
    </main>
  </div>
</template>
