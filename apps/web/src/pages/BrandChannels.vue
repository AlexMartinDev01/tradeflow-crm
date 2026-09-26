<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const brands=ref<any[]>([]),customers=ref<any[]>([]),edges=ref<any[]>([]),tree=ref<any[]>([]),selectedBrand=ref(''),brandDialog=ref(false),edgeDialog=ref(false),editingBrand=ref<any>(null),editingEdge=ref<any>(null);
const canManage=computed(()=>['admin','manager'].includes(auth.user?.role));
const brandForm=reactive<any>({name:'',website:'',country:'',group_name:'',main_products:'',positioning:''});
const edgeForm=reactive<any>({upstream_customer_id:'',downstream_customer_id:'',relationship_type:'distributor',channel_level:1,territory:'',exclusive:0,start_date:'',end_date:'',status:'active',notes:''});
const customerMap=computed(()=>Object.fromEntries(customers.value.map((x:any)=>[x.id,x.name])));

async function load(){
  const [b,c]=await Promise.all([api.get('/brands',{params:{size:300}}),api.get('/customers',{params:{size:500}})]);
  brands.value=b.data.data;customers.value=c.data.data;
  if(!selectedBrand.value&&brands.value.length)selectedBrand.value=brands.value[0].id;
  await loadNetwork();
}
async function loadNetwork(){
  if(!selectedBrand.value){edges.value=[];tree.value=[];return}
  const [e,t]=await Promise.all([api.get('/channel-network',{params:{brand_id:selectedBrand.value}}),api.get('/channel-network/tree',{params:{brand_id:selectedBrand.value}})]);
  edges.value=e.data;tree.value=t.data.tree||[];
}
function resetBrand(){editingBrand.value=null;Object.assign(brandForm,{name:'',website:'',country:'',group_name:'',main_products:'',positioning:''})}
function addBrand(){resetBrand();brandDialog.value=true}
function editBrand(r:any){editingBrand.value=r;Object.assign(brandForm,{...r});brandDialog.value=true}
async function saveBrand(){
  if(!brandForm.name.trim())return ElMessage.warning('品牌名称必填');
  if(editingBrand.value)await api.patch(`/brands/${editingBrand.value.id}`,brandForm);else await api.post('/brands',brandForm);
  brandDialog.value=false;await load();ElMessage.success('品牌已保存');
}
function resetEdge(){editingEdge.value=null;Object.assign(edgeForm,{upstream_customer_id:'',downstream_customer_id:'',relationship_type:'distributor',channel_level:1,territory:'',exclusive:0,start_date:'',end_date:'',status:'active',notes:''})}
function addEdge(){if(!selectedBrand.value)return ElMessage.warning('请先选择品牌');resetEdge();edgeDialog.value=true}
function editEdge(r:any){editingEdge.value=r;Object.assign(edgeForm,{...r,upstream_customer_id:r.upstream_customer_id||''});edgeDialog.value=true}
async function saveEdge(){
  if(!edgeForm.downstream_customer_id)return ElMessage.warning('请选择下游客户');
  try{
    if(editingEdge.value){
      await api.patch(`/channel-network/${editingEdge.value.id}`,edgeForm);
    }else{
      await api.post('/channel-network',{...edgeForm,brand_id:selectedBrand.value,upstream_customer_id:edgeForm.upstream_customer_id||null});
    }
    edgeDialog.value=false;await loadNetwork();ElMessage.success('渠道关系已保存');
  }catch(e:any){
    if(e.response?.data?.error==='channel_cycle')ElMessage.error('该关系会形成渠道循环，系统已阻止保存');else throw e;
  }
}
async function removeEdge(r:any){await ElMessageBox.confirm(`确认删除 ${r.upstream_name||'品牌直属'} → ${r.downstream_name} 的渠道关系？`,'确认');await api.delete(`/channel-network/${r.id}`);await loadNetwork()}
function treeLabel(data:any){const e=data.edge;return `${data.label} · L${e.channel_level||'-'} · ${e.relationship_type}${e.territory?' · '+e.territory:''}${e.exclusive?' · 独家':''}`}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">品牌与渠道网络</h2><span class="muted">品牌主数据 + 进口商 / 经销商 / 零售商多级分销网络</span></div></div>

<el-tabs>
<el-tab-pane label="品牌主数据">
  <div class="toolbar"><span class="muted">{{brands.length}} 个品牌</span><el-button v-if="canManage" type="primary" @click="addBrand">新增品牌</el-button></div>
  <div class="card"><el-table :data="brands">
    <el-table-column prop="name" label="品牌" min-width="170"/><el-table-column prop="country" label="国家" width="120"/><el-table-column prop="group_name" label="所属集团" min-width="150"/>
    <el-table-column prop="main_products" label="主营产品" min-width="180"/><el-table-column prop="positioning" label="市场定位" min-width="180"/><el-table-column prop="website" label="官网" min-width="180"/>
    <el-table-column v-if="canManage" label="操作" width="90"><template #default="s"><el-button link type="primary" @click="editBrand(s.row)">编辑</el-button></template></el-table-column>
  </el-table></div>
</el-tab-pane>

<el-tab-pane label="渠道网络">
  <div class="card" style="margin-bottom:16px"><div class="toolbar">
    <el-select v-model="selectedBrand" filterable placeholder="选择品牌" style="width:280px" @change="loadNetwork"><el-option v-for="b in brands" :key="b.id" :label="b.name" :value="b.id"/></el-select>
    <el-button v-if="canManage" type="primary" @click="addEdge">新增渠道关系</el-button>
  </div></div>

  <div class="grid" style="grid-template-columns:1fr 1.6fr;align-items:start">
    <div class="card"><h3 class="section-title">渠道树</h3>
      <el-tree v-if="tree.length" :data="tree" node-key="id" default-expand-all :expand-on-click-node="false">
        <template #default="{data}"><span>{{treeLabel(data)}}</span></template>
      </el-tree>
      <el-empty v-else description="当前品牌暂无渠道网络"/>
    </div>

    <div class="card"><h3 class="section-title">渠道关系明细</h3><el-table :data="edges">
      <el-table-column label="上游" min-width="150"><template #default="s">{{s.row.upstream_name||'品牌直属'}}</template></el-table-column>
      <el-table-column prop="downstream_name" label="下游客户" min-width="160"/><el-table-column prop="relationship_type" label="关系" width="120"/><el-table-column prop="channel_level" label="层级" width="70"/>
      <el-table-column prop="territory" label="区域" min-width="120"/><el-table-column label="独家" width="70"><template #default="s">{{s.row.exclusive?'是':'否'}}</template></el-table-column>
      <el-table-column prop="end_date" label="到期" width="110"/><el-table-column prop="status" label="状态" width="90"/>
      <el-table-column v-if="canManage" label="操作" width="120"><template #default="s"><el-button link @click="editEdge(s.row)">编辑</el-button><el-button link type="danger" @click="removeEdge(s.row)">删除</el-button></template></el-table-column>
    </el-table></div>
  </div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="brandDialog" :title="editingBrand?'编辑品牌':'新增品牌'" width="680"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="品牌名称"><el-input v-model="brandForm.name"/></el-form-item><el-form-item label="国家"><el-input v-model="brandForm.country"/></el-form-item>
<el-form-item label="所属集团"><el-input v-model="brandForm.group_name"/></el-form-item><el-form-item label="官网"><el-input v-model="brandForm.website"/></el-form-item>
<el-form-item label="主营产品"><el-input v-model="brandForm.main_products"/></el-form-item><el-form-item label="市场定位"><el-input v-model="brandForm.positioning"/></el-form-item>
</div></el-form><template #footer><el-button @click="brandDialog=false">取消</el-button><el-button type="primary" @click="saveBrand">保存</el-button></template></el-dialog>

<el-dialog v-model="edgeDialog" :title="editingEdge?'编辑渠道关系':'新增渠道关系'" width="720"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="上游客户（留空=品牌直属）"><el-select v-model="edgeForm.upstream_customer_id" clearable filterable style="width:100%"><el-option v-for="c in customers.filter(x=>x.id!==edgeForm.downstream_customer_id)" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
<el-form-item label="下游客户"><el-select v-model="edgeForm.downstream_customer_id" :disabled="!!editingEdge" filterable style="width:100%"><el-option v-for="c in customers.filter(x=>x.id!==edgeForm.upstream_customer_id)" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
<el-form-item label="渠道关系"><el-select v-model="edgeForm.relationship_type" allow-create filterable style="width:100%"><el-option v-for="x in ['importer','agent','distributor','sub_distributor','wholesaler','retailer','ecommerce']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
<el-form-item label="渠道层级"><el-input-number v-model="edgeForm.channel_level" :min="1" :max="20"/></el-form-item>
<el-form-item label="授权/销售区域"><el-input v-model="edgeForm.territory"/></el-form-item><el-form-item label="状态"><el-select v-model="edgeForm.status" style="width:100%"><el-option label="active" value="active"/><el-option label="inactive" value="inactive"/><el-option label="expired" value="expired"/></el-select></el-form-item>
<el-form-item label="开始日期"><el-input v-model="edgeForm.start_date" type="date"/></el-form-item><el-form-item label="结束日期"><el-input v-model="edgeForm.end_date" type="date"/></el-form-item>
</div><el-form-item><el-checkbox v-model="edgeForm.exclusive" :true-value="1" :false-value="0">独家渠道</el-checkbox></el-form-item><el-form-item label="备注"><el-input v-model="edgeForm.notes" type="textarea"/></el-form-item>
</el-form><template #footer><el-button @click="edgeDialog=false">取消</el-button><el-button type="primary" @click="saveEdge">保存</el-button></template></el-dialog>
</AppLayout></template>