<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';
import {useRouter} from 'vue-router';
import {ElMessage} from 'element-plus';
import {Search,Plus,ArrowRight} from '@element-plus/icons-vue';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const router=useRouter();
const auth=useAuth();
if(!auth.user)auth.me().catch(()=>{});

const d=ref<any>({});
const loading=ref(false);
const canQuickCreate=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role||''));

const stats=computed(()=>[
  {label:'客户',value:d.value.customers||0,hint:'客户资产总览',route:'/customers',icon:'客'},
  {label:'询盘',value:d.value.inquiries||0,hint:'查看最新询盘',route:'/sales/inquiries',icon:'询'},
  {label:'在跟商机',value:d.value.opportunities||0,hint:'推进销售机会',route:'/sales/opportunities',icon:'机'},
  {label:'订单',value:d.value.orders||0,hint:'订单执行进度',route:'/orders',icon:'单'},
  {label:'联系人',value:d.value.contacts||0,hint:'进入客户档案',route:'/customers',icon:'联'},
  {label:'待办',value:d.value.openTasks||0,hint:'查看待处理事项',route:'/module/tasks',icon:'办'},
  {label:'报价',value:d.value.quotations||0,hint:'报价与版本管理',route:'/sales/quotations',icon:'价'},
  {label:'逾期回款',value:d.value.overduePayments||0,hint:'关注资金风险',route:'/finance',icon:'款'}
]);

async function load(){
  loading.value=true;
  try{d.value=(await api.get('/dashboard')).data}
  catch(e:any){ElMessage.error(e.response?.data?.message||'经营概览加载失败')}
  finally{loading.value=false}
}
function go(path:string){router.push(path)}
onMounted(load);
</script>

<template>
  <AppLayout>
    <section class="dashboard-hero">
      <div>
        <h1>经营工作台</h1>
        <p>把客户、销售、订单、出运和回款集中在一个入口，优先处理真正需要推进的事项。</p>
      </div>
      <div class="hero-actions">
        <el-button @click="go('/search')"><el-icon><Search/></el-icon>全局搜索</el-button>
        <el-button v-if="canQuickCreate" type="primary" @click="go('/mobile/quick-create')"><el-icon><Plus/></el-icon>快速建档</el-button>
      </div>
    </section>

    <div class="grid stats" v-loading="loading">
      <button v-for="item in stats" :key="item.label" class="stat stat-button" type="button" @click="go(item.route)">
        <div class="stat-top">
          <span class="stat-label">{{item.label}}</span>
          <span class="stat-icon">{{item.icon}}</span>
        </div>
        <div class="stat-value">{{item.value}}</div>
        <div class="stat-hint">{{item.hint}}</div>
        <span class="stat-arrow">→</span>
      </button>
    </div>

    <div class="quick-links">
      <button class="quick-link" type="button" @click="go('/customers')"><b>客户 360°</b><span>查询客户、联系人和跟进记录</span></button>
      <button class="quick-link" type="button" @click="go('/sales/opportunities')"><b>销售商机</b><span>集中推进当前商机与下一步动作</span></button>
      <button class="quick-link" type="button" @click="go('/orders')"><b>订单执行</b><span>跟踪订单、产品、交期与单据</span></button>
      <button class="quick-link" type="button" @click="go('/shipments')"><b>出运执行</b><span>管理订舱、货柜、ETD 与 ETA</span></button>
    </div>

    <div class="grid dashboard-main-grid">
      <div class="card dashboard-card">
        <div class="section-head">
          <div>
            <h3 class="section-title">最近跟进</h3>
            <span class="muted">最新客户沟通与业务动作</span>
          </div>
          <el-button link type="primary" @click="go('/customers')">查看客户 <el-icon><ArrowRight/></el-icon></el-button>
        </div>
        <el-table v-if="(d.recentActivities||[]).length" :data="d.recentActivities||[]" empty-text="暂无最近跟进">
          <el-table-column prop="customer_name" label="客户" min-width="130"/>
          <el-table-column prop="type" label="方式" width="90"/>
          <el-table-column prop="content" label="跟进内容" min-width="220" show-overflow-tooltip/>
          <el-table-column prop="occurred_at" label="时间" width="170"/>
        </el-table>
        <el-empty v-else :image-size="72" description="暂无最近跟进"/>
      </div>

      <div class="card dashboard-card">
        <div class="section-head">
          <div>
            <h3 class="section-title">待办任务</h3>
            <span class="muted">优先处理临近截止事项</span>
          </div>
          <el-button link type="primary" @click="go('/module/tasks')">全部待办 <el-icon><ArrowRight/></el-icon></el-button>
        </div>
        <el-table v-if="(d.dueTasks||[]).length" :data="d.dueTasks||[]" empty-text="暂无待办任务">
          <el-table-column prop="title" label="任务" min-width="150"/>
          <el-table-column prop="customer_name" label="客户" min-width="120"/>
          <el-table-column prop="due_at" label="截止" width="165"/>
        </el-table>
        <el-empty v-else :image-size="72" description="暂无待办任务"/>
      </div>
    </div>
  </AppLayout>
</template>
