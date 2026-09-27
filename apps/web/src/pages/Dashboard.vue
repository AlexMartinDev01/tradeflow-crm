<script setup lang="ts">
import {computed,onMounted,ref} from 'vue';
import {useRouter} from 'vue-router';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import TradeHero from '../components/TradeHero.vue';
import {api} from '../api/client';

const router=useRouter();
const d=ref<any>({});
const loading=ref(false);

const stats=computed(()=>[
  {label:'客户',value:d.value.customers||0,hint:'客户资产总览',route:'/customers',icon:'kpi_customer',trend:'up'},
  {label:'询盘',value:d.value.inquiries||0,hint:'查看最新询盘',route:'/sales/inquiries',icon:'kpi_inquiry',trend:'up'},
  {label:'在跟商机',value:d.value.opportunities||0,hint:'推进销售机会',route:'/sales/opportunities',icon:'kpi_opportunity',trend:'up'},
  {label:'订单',value:d.value.orders||0,hint:'订单执行进度',route:'/orders',icon:'kpi_order',trend:'up'},
  {label:'联系人',value:d.value.contacts||0,hint:'客户联系人总量',route:'/customers',icon:'kpi_contact',trend:'up'},
  {label:'待办',value:d.value.openTasks||0,hint:'优先处理到期事项',route:'/module/tasks',icon:'kpi_task',trend:'warn'},
  {label:'报价',value:d.value.quotations||0,hint:'报价与版本管理',route:'/sales/quotations',icon:'kpi_quote',trend:'up'},
  {label:'逾期回款',value:d.value.overduePayments||0,hint:'关注资金风险',route:'/finance',icon:'kpi_overdue',trend:'warn'}
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

<template><AppLayout>
  <TradeHero variant="dashboard" title="经营工作台" subtitle="从线索到回款，打造高效、可持续增长的外贸业务闭环。" slogan="让中国好产品&#10;走向全球市场"/>

  <div class="kpi-grid" v-loading="loading">
    <button v-for="item in stats" :key="item.label" class="kpi-card dashboard-kpi" type="button" @click="go(item.route)">
      <span class="kpi-icon ui-sprite" :class="'sprite-'+item.icon"></span>
      <span class="kpi-copy">
        <span class="kpi-label">{{item.label}}</span>
        <span class="kpi-main"><b class="kpi-value">{{item.value}}</b><i class="kpi-direction" :class="item.trend">{{item.trend==='warn'?'↓':'↑'}}</i></span>
        <span class="kpi-hint">{{item.hint}}</span>
      </span>
      <span class="mini-bars" :class="item.trend" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    </button>
  </div>

  <section class="quick-entry-panel">
    <div class="quick-entry-title">快捷入口</div>
    <div class="quick-entry-grid">
      <button class="quick-entry" type="button" @click="go('/customers')"><span class="entry-icon ui-sprite sprite-quick_customer"></span><span><b>客户360°</b><small>查看客户全景画像与跟进记录</small></span><span class="entry-arrow">›</span></button>
      <button class="quick-entry" type="button" @click="go('/sales/opportunities')"><span class="entry-icon ui-sprite sprite-quick_opportunity"></span><span><b>销售商机</b><small>管理商机阶段，推动成交</small></span><span class="entry-arrow">›</span></button>
      <button class="quick-entry" type="button" @click="go('/orders')"><span class="entry-icon ui-sprite sprite-quick_order"></span><span><b>订单执行</b><small>跟踪订单进度，确保按期交付</small></span><span class="entry-arrow">›</span></button>
      <button class="quick-entry" type="button" @click="go('/shipments')"><span class="entry-icon ui-sprite sprite-quick_shipment"></span><span><b>出运执行</b><small>管理出运计划与物流动态</small></span><span class="entry-arrow">›</span></button>
    </div>
  </section>

  <div class="grid dashboard-grid">
    <section class="card dashboard-panel">
      <div class="panel-head"><div><h3>最近跟进</h3><small>最新客户沟通与业务动作</small></div><el-button link type="primary" @click="go('/customers')">查看更多 ›</el-button></div>
      <el-table :data="d.recentActivities||[]" empty-text="暂无最近跟进">
        <el-table-column prop="occurred_at" label="时间" width="145"/>
        <el-table-column prop="customer_name" label="客户 / 相关项" min-width="145"/>
        <el-table-column prop="content" label="跟进内容" min-width="260" show-overflow-tooltip/>
        <el-table-column prop="type" label="方式" width="90"/>
      </el-table>
    </section>
    <section class="card dashboard-panel">
      <div class="panel-head"><div><h3>待办任务</h3><small>优先处理临近截止事项</small></div><el-button link type="primary" @click="go('/module/tasks')">查看更多 ›</el-button></div>
      <el-table :data="d.dueTasks||[]" empty-text="暂无待办任务">
        <el-table-column prop="title" label="任务内容" min-width="180"/>
        <el-table-column prop="customer_name" label="相关客户 / 业务" min-width="135"/>
        <el-table-column prop="due_at" label="截止时间" width="155"/>
      </el-table>
    </section>
  </div>
</AppLayout></template>

<style scoped>
.dashboard-kpi{border:1px solid #e4ebf4;text-align:left;cursor:pointer;font:inherit}
.dashboard-kpi:hover{border-color:#bfd4f6;box-shadow:0 5px 16px rgba(20,85,180,.07);transform:translateY(-1px)}
.dashboard-kpi .kpi-copy{display:flex;flex-direction:column}
.kpi-direction{font-style:normal;font-size:10px;font-weight:800;color:#23b26d;margin-left:2px}
.kpi-direction.warn{color:#ff5a63}
.mini-bars{position:absolute;right:12px;bottom:14px;height:26px;width:37px;display:flex;align-items:flex-end;gap:2px}
.mini-bars i{display:block;width:5px;border-radius:1px;background:#ff9b45}
.mini-bars i:nth-child(1){height:7px}.mini-bars i:nth-child(2){height:11px}.mini-bars i:nth-child(3){height:16px}.mini-bars i:nth-child(4){height:21px}.mini-bars i:nth-child(5){height:25px}
.mini-bars.warn i{background:#ff6670}.mini-bars.warn i:nth-child(2){height:22px}.mini-bars.warn i:nth-child(3){height:17px}.mini-bars.warn i:nth-child(4){height:12px}.mini-bars.warn i:nth-child(5){height:7px}
</style>