<script setup lang="ts">
import {ref,reactive,onMounted,onUnmounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const status=ref<any>(null),alerts=ref<any[]>([]),loading=ref(false),checking=ref(false),policyDialog=ref(false),includeResolved=ref(false);
const policy=reactive<any>({readiness_min_free_mb:128,disk_warn_free_mb:1024,backup_max_age_hours:36,integration_failures_warn:5,http_5xx_rate_warn_percent:5});
let timer:any=null;
const canAdmin=computed(()=>auth.user?.role==='admin');

function bytes(v:any){const n=Number(v||0);if(!n)return '0 B';if(n>=1024**3)return (n/1024**3).toFixed(2)+' GB';if(n>=1024**2)return (n/1024**2).toFixed(2)+' MB';if(n>=1024)return (n/1024).toFixed(1)+' KB';return n+' B'}
function duration(sec:any){const s=Number(sec||0);if(s<60)return s+' 秒';if(s<3600)return Math.floor(s/60)+' 分钟';if(s<86400)return (s/3600).toFixed(1)+' 小时';return (s/86400).toFixed(1)+' 天'}
function alertType(v:string){return v==='critical'?'danger':v==='warning'?'warning':'info'}
async function load(silent=false){
  if(!silent)loading.value=true;
  try{
    const [st,al,po]=await Promise.all([api.get('/ops/status'),api.get('/ops/alerts',{params:{include_resolved:includeResolved.value?1:0}}),api.get('/ops/policy')]);
    status.value=st.data;alerts.value=al.data;Object.assign(policy,po.data);
  }finally{if(!silent)loading.value=false}
}
async function acknowledge(r:any){await api.post(`/ops/alerts/${r.id}/acknowledge`,{});await load(true);ElMessage.success('告警已确认')}
async function resolve(r:any){await api.post(`/ops/alerts/${r.id}/resolve`,{});await load(true);ElMessage.success('告警已标记解决；若条件仍存在，下一轮监控会重新打开')}
async function checkDb(){
  checking.value=true;
  try{const {data}=await api.post('/ops/check-database',{});ElMessage.success(data.ok?'SQLite quick_check：正常':`数据库检查异常：${data.quick_check}`);await load(true)}
  catch(e:any){ElMessage.error(e.response?.data?.message||'数据库检查失败')}
  finally{checking.value=false}
}
async function savePolicy(){await api.put('/ops/policy',policy);policyDialog.value=false;await load(true);ElMessage.success('监控阈值已保存')}
onMounted(async()=>{await load();timer=setInterval(()=>load(true).catch(()=>{}),30000)});
onUnmounted(()=>{if(timer)clearInterval(timer)});
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">运行监控</h2><span class="muted">数据库、磁盘、备份、自动化、外部集成与 HTTP 健康状态</span></div><div style="display:flex;gap:8px"><el-button @click="load()">刷新</el-button><el-button v-if="canAdmin" :loading="checking" @click="checkDb">数据库完整性检查</el-button><el-button v-if="canAdmin" type="primary" plain @click="policyDialog=true">告警阈值</el-button></div></div>

<template v-if="status">
<div class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">服务运行时间</span><b>{{duration(status.service?.uptime_seconds)}}</b><small class="muted">{{status.service?.node}}</small></div>
  <div class="stat"><span class="muted">数据库</span><b>{{status.database?.ok?'正常':'异常'}}</b><small class="muted">{{bytes(status.database?.file_bytes)}}</small></div>
  <div class="stat"><span class="muted">磁盘剩余</span><b>{{bytes(status.disk?.free_bytes)}}</b><small class="muted">{{status.disk?.free_percent??'-'}}% 可用</small></div>
  <div class="stat"><span class="muted">未解决告警</span><b>{{status.alerts?.open||0}}</b><small class="muted">自动每 5 分钟评估</small></div>
</div>

<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start;margin-bottom:16px">
  <div class="card">
    <h3 class="section-title">基础设施</h3>
    <el-descriptions :column="2" border>
      <el-descriptions-item label="DB 查询">{{status.database?.query_ok?'正常':'失败'}}</el-descriptions-item>
      <el-descriptions-item label="DB 大小">{{bytes(status.database?.file_bytes)}}</el-descriptions-item>
      <el-descriptions-item label="磁盘总量">{{bytes(status.disk?.total_bytes)}}</el-descriptions-item>
      <el-descriptions-item label="磁盘剩余">{{bytes(status.disk?.free_bytes)}}</el-descriptions-item>
      <el-descriptions-item label="已跟踪附件">{{bytes(status.uploads?.tracked_bytes)}}</el-descriptions-item>
      <el-descriptions-item label="内存 RSS">{{bytes(status.memory?.rss_bytes)}}</el-descriptions-item>
    </el-descriptions>
  </div>
  <div class="card">
    <h3 class="section-title">运行任务</h3>
    <el-descriptions :column="1" border>
      <el-descriptions-item label="最近数据库备份"><span v-if="status.backup?.latest">{{status.backup.latest.created_at}} · {{status.backup.age_hours}} 小时前</span><span v-else style="color:#b42318">尚无备份</span></el-descriptions-item>
      <el-descriptions-item label="备份数量">{{status.backup?.count||0}}</el-descriptions-item>
      <el-descriptions-item label="最近自动化扫描">{{status.automation?.last_run?.updated_at||'尚未记录'}}</el-descriptions-item>
      <el-descriptions-item label="24h 集成失败">{{status.integrations?.failures_24h||0}}</el-descriptions-item>
      <el-descriptions-item label="当前锁定账号">{{status.security?.locked_users||0}}</el-descriptions-item>
    </el-descriptions>
  </div>
</div>

<div class="card" style="margin-bottom:16px">
  <h3 class="section-title">HTTP 请求指标（当前进程）</h3>
  <div class="grid stats">
    <div class="stat"><span class="muted">请求总量</span><b>{{status.requests?.total||0}}</b></div>
    <div class="stat"><span class="muted">平均响应</span><b>{{status.requests?.avg_latency_ms||0}} ms</b></div>
    <div class="stat"><span class="muted">4xx</span><b>{{status.requests?.responses_4xx||0}}</b></div>
    <div class="stat"><span class="muted">5xx / 错误率</span><b>{{status.requests?.responses_5xx||0}}</b><small class="muted">{{status.requests?.http_5xx_rate_percent||0}}%</small></div>
  </div>
</div>
</template>

<div class="card">
  <div class="toolbar"><div><h3 class="section-title">系统告警</h3><span class="muted">条件恢复后会自动解决；手工解决但条件未消失时会重新打开。</span></div><el-checkbox v-model="includeResolved" @change="load(true)">显示已解决</el-checkbox></div>
  <el-table v-loading="loading" :data="alerts" empty-text="当前没有系统告警">
    <el-table-column label="级别" width="90"><template #default="s"><el-tag :type="alertType(s.row.severity)">{{s.row.severity}}</el-tag></template></el-table-column>
    <el-table-column prop="title" label="告警" min-width="180"/><el-table-column prop="message" label="说明" min-width="280"/>
    <el-table-column prop="status" label="状态" width="110"/><el-table-column prop="first_seen_at" label="首次出现" width="185"/><el-table-column prop="last_seen_at" label="最近出现" width="185"/>
    <el-table-column label="操作" width="150"><template #default="s"><el-button v-if="!s.row.resolved_at&&s.row.status!=='acknowledged'" link @click="acknowledge(s.row)">确认</el-button><el-button v-if="!s.row.resolved_at" link type="success" @click="resolve(s.row)">解决</el-button></template></el-table-column>
  </el-table>
</div>

<el-dialog v-model="policyDialog" title="运行监控阈值" width="650"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="Readiness 最低磁盘余量 MB"><el-input-number v-model="policy.readiness_min_free_mb" :min="32"/></el-form-item>
  <el-form-item label="磁盘告警阈值 MB"><el-input-number v-model="policy.disk_warn_free_mb" :min="64"/></el-form-item>
  <el-form-item label="备份最大年龄 小时"><el-input-number v-model="policy.backup_max_age_hours" :min="1"/></el-form-item>
  <el-form-item label="24h 集成失败告警次数"><el-input-number v-model="policy.integration_failures_warn" :min="1"/></el-form-item>
  <el-form-item label="HTTP 5xx 告警率 %"><el-input-number v-model="policy.http_5xx_rate_warn_percent" :min="0.1" :max="100" :step="0.5"/></el-form-item>
</div></el-form><template #footer><el-button @click="policyDialog=false">取消</el-button><el-button type="primary" @click="savePolicy">保存</el-button></template></el-dialog>
</AppLayout></template>