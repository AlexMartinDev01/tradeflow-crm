<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {useRouter} from 'vue-router';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),total=ref(0),loading=ref(false),q=ref(''),rule=reactive<any>({enabled:true,inactive_days:90,protect_grades:['A'],eligible_statuses:['potential','contacted','following','dormant']});
const owners=ref<any[]>([]),me=ref<any>(null),events=ref<any[]>([]),claimDialog=ref(false),selected=ref<any>(null),claimOwner=ref('');
const router=useRouter();
const isAdmin=computed(()=>['admin','manager'].includes(me.value?.role));
const canClaim=computed(()=>['admin','manager','sales'].includes(me.value?.role));

async function load(){
  loading.value=true;
  try{
    const [p,r,u,m]=await Promise.all([api.get('/public-pool',{params:{size:200,q:q.value||undefined}}),api.get('/public-pool/rule'),api.get('/users/lookup'),api.get('/auth/me')]);
    rows.value=p.data.data;total.value=p.data.total;Object.assign(rule,r.data);owners.value=u.data;me.value=m.data;
    if(isAdmin.value){try{events.value=(await api.get('/public-pool/events')).data}catch{events.value=[]}}
  }finally{loading.value=false}
}
function openClaim(r:any){selected.value=r;claimOwner.value=isAdmin.value?me.value.id:'';claimDialog.value=true}
async function claim(){
  if(!selected.value)return;
  const payload:any={};if(isAdmin.value&&claimOwner.value)payload.owner_id=claimOwner.value;
  await api.post(`/public-pool/${selected.value.id}/claim`,payload);claimDialog.value=false;await load();ElMessage.success('客户已从公海领取');
}
async function saveRule(){await api.patch('/public-pool/rule',{...rule});ElMessage.success('公海自动回收规则已保存')}
async function runRecycle(){
  const {data}=await api.post('/public-pool/run-recycle',{});
  ElMessage.success(`回收完成：进入公海 ${data.recycled||0}，活跃业务跳过 ${data.skipped_active||0}，保护等级跳过 ${data.skipped_protected||0}`);await load()
}
async function claimAndOpen(r:any){
  if(!canClaim.value)return;
  try{await api.post(`/public-pool/${r.id}/claim`,{});ElMessage.success('领取成功');router.push(`/customers/${r.id}`)}
  catch(e:any){ElMessage.error(e.response?.data?.error==='already_claimed'||e.response?.data?.error==='not_available'?'该客户已被其他人领取':'领取失败');await load()}
}
function daysInPool(v:any){if(!v)return '-';return Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/86400000))+' 天'}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">客户公海</h2><span class="muted">无负责人客户统一进入公海，销售领取后重新建立唯一归属 · 当前 {{total}} 个</span></div><div style="display:flex;gap:8px"><el-input v-model="q" clearable placeholder="搜索公海客户" style="width:230px" @keyup.enter="load"/><el-button @click="load">搜索</el-button><el-button v-if="isAdmin" type="primary" @click="runRecycle">立即执行自动回收</el-button></div></div>

<el-alert type="info" :closable="false" style="margin-bottom:16px" title="自动回收会跳过存在开放商机或未完成订单的客户，并可保护指定客户等级；领取采用数据库条件更新，避免两名销售同时抢到同一个客户。"/>

<div v-if="isAdmin" class="card" style="margin-bottom:16px">
<div class="toolbar"><div><h3 class="section-title">自动回收规则</h3><span class="muted">长期未跟进客户自动释放到公海</span></div><el-button type="primary" plain @click="saveRule">保存规则</el-button></div>
<div class="grid" style="grid-template-columns:140px 180px 1fr 1.4fr">
<el-form-item label="启用"><el-switch v-model="rule.enabled"/></el-form-item>
<el-form-item label="未跟进天数"><el-input-number v-model="rule.inactive_days" :min="1" :max="1000"/></el-form-item>
<el-form-item label="保护等级"><el-select v-model="rule.protect_grades" multiple style="width:100%"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="允许回收状态"><el-select v-model="rule.eligible_statuses" multiple style="width:100%"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','dormant']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
</div>
</div>

<div class="card"><el-table v-loading="loading" :data="rows">
<el-table-column prop="name" label="客户" min-width="220"><template #default="s"><b>{{s.row.name}}</b><div class="muted">{{s.row.english_name||''}}</div></template></el-table-column>
<el-table-column prop="country" label="国家" width="120"/><el-table-column prop="industry" label="行业" min-width="140"/><el-table-column prop="grade" label="等级" width="80"/><el-table-column prop="status" label="客户状态" width="120"/>
<el-table-column label="进入公海" width="190"><template #default="s">{{s.row.pool_entered_at||'-'}}<div class="muted">{{daysInPool(s.row.pool_entered_at)}}</div></template></el-table-column>
<el-table-column prop="pool_reason" label="原因" min-width="150"/><el-table-column prop="last_activity" label="最后跟进" width="190"/>
<el-table-column label="操作" width="170" fixed="right"><template #default="s"><el-button v-if="canClaim&&!isAdmin" link type="primary" @click="claimAndOpen(s.row)">领取并打开</el-button><el-button v-if="isAdmin" link type="primary" @click="openClaim(s.row)">分配/领取</el-button></template></el-table-column>
</el-table></div>

<div v-if="isAdmin" class="card" style="margin-top:16px"><h3 class="section-title">最近公海流转记录</h3><el-table :data="events" max-height="360">
<el-table-column prop="created_at" label="时间" width="190"/><el-table-column prop="customer_name" label="客户" min-width="180"/><el-table-column prop="action" label="动作" width="100"/><el-table-column prop="from_owner_name" label="原负责人"/><el-table-column prop="to_owner_name" label="新负责人"/><el-table-column prop="reason" label="原因"/><el-table-column prop="operated_by_name" label="操作人"/>
</el-table></div>

<el-dialog v-model="claimDialog" title="从公海分配客户" width="520"><template v-if="selected"><p>客户：<b>{{selected.name}}</b></p><el-form label-position="top"><el-form-item label="分配给"><el-select v-model="claimOwner" filterable style="width:100%"><el-option v-for="x in owners.filter((u:any)=>['admin','manager','sales'].includes(u.role))" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/></el-select></el-form-item></el-form></template><template #footer><el-button @click="claimDialog=false">取消</el-button><el-button type="primary" @click="claim">确认分配</el-button></template></el-dialog>
</AppLayout></template>