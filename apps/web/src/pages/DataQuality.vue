<script setup lang="ts">
import {ref,onMounted,computed} from 'vue';
import {useRouter} from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const router=useRouter(),loading=ref(false),rows=ref<any[]>([]),summary=ref<any>({issues:{}}),issue=ref('');
const labels:any={
  missing_country:'国家缺失',missing_industry:'行业缺失',missing_source:'来源缺失',missing_grade:'等级缺失',
  no_contact:'无有效联系人',no_contact_method:'无联系方式',invalid_website:'官网格式异常',invalid_email:'邮箱格式异常',
  stale_90:'90天未有效跟进',duplicate_risk:'疑似重复'
};
const types:any={duplicate_risk:'danger',no_contact:'danger',no_contact_method:'warning',invalid_email:'warning',invalid_website:'warning',stale_90:'info'};
const issueEntries=computed(()=>Object.entries(summary.value.issues||{}).sort((a:any,b:any)=>Number(b[1])-Number(a[1])));
function scoreType(v:number){return v>=90?'success':v>=70?'warning':'danger'}
async function load(){loading.value=true;try{const {data}=await api.get('/customers/data-quality',{params:issue.value?{issue:issue.value}:{}});rows.value=data.data;summary.value=data.summary}finally{loading.value=false}}
async function chooseIssue(v:string){issue.value=issue.value===v?'':v;await load()}
function openCustomer(r:any){router.push(`/customers/${r.id}`)}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">客户数据质量中心</h2><span class="muted">按当前账号 self / department / all 数据范围检查，不展示越权客户</span></div><el-button @click="load">重新扫描</el-button></div>

<div class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">可见客户</span><b>{{summary.total_customers||0}}</b></div>
  <div class="stat"><span class="muted">存在数据问题</span><b>{{summary.customers_with_issues||0}}</b></div>
  <div class="stat"><span class="muted">平均质量分</span><b>{{Number(summary.average_score??100).toFixed(1)}}</b></div>
  <div class="stat"><span class="muted">当前问题筛选</span><b style="font-size:18px">{{issue?labels[issue]:'全部问题'}}</b></div>
</div>

<div class="card" style="margin-bottom:16px">
  <div class="toolbar"><div><h3 class="section-title">问题分布</h3><span class="muted">点击标签可筛选，再次点击取消筛选</span></div></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <el-tag v-for="x in issueEntries" :key="x[0]" :type="issue===x[0]?'danger':'info'" effect="plain" style="cursor:pointer" @click="chooseIssue(String(x[0]))">{{labels[String(x[0])]||x[0]}} · {{x[1]}}</el-tag>
  </div>
</div>

<div class="card"><el-table v-loading="loading" :data="rows" @row-dblclick="openCustomer">
  <el-table-column prop="name" label="客户" min-width="200"><template #default="s"><b>{{s.row.name}}</b><div class="muted">{{s.row.english_name||''}}</div></template></el-table-column>
  <el-table-column prop="owner_name" label="负责人" width="120"/><el-table-column prop="country" label="国家" width="110"/><el-table-column prop="status" label="状态" width="110"/>
  <el-table-column label="质量分" width="95"><template #default="s"><el-tag :type="scoreType(Number(s.row.quality_score||0))">{{s.row.quality_score}}</el-tag></template></el-table-column>
  <el-table-column label="问题" min-width="360"><template #default="s"><el-tag v-for="x in s.row.issues" :key="x" :type="types[x]||'info'" size="small" style="margin:2px 4px 2px 0">{{labels[x]||x}}</el-tag><div v-if="s.row.duplicate_reasons?.length" class="muted" style="font-size:12px;margin-top:3px">{{s.row.duplicate_reasons.join('、')}}</div></template></el-table-column>
  <el-table-column label="联系人/方式" width="115"><template #default="s">{{s.row.active_contact_count}} / {{s.row.active_channel_count}}</template></el-table-column>
  <el-table-column label="最近跟进" width="145"><template #default="s"><span v-if="s.row.last_activity_at">{{String(s.row.last_activity_at).slice(0,10)}}<div class="muted">{{s.row.days_since_activity}} 天前</div></span><span v-else>从未跟进</span></template></el-table-column>
  <el-table-column label="操作" width="90" fixed="right"><template #default="s"><el-button link type="primary" @click="openCustomer(s.row)">去完善</el-button></template></el-table-column>
</el-table>
<el-empty v-if="!loading&&!rows.length" description="当前范围没有发现数据质量问题"/>
</div>
</AppLayout></template>