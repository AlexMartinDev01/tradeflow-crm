<script setup lang="ts">
import {ElMessage,ElMessageBox} from 'element-plus';
import {ref,reactive,onMounted,computed,nextTick} from 'vue';
import {useRouter} from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]),total=ref(0),dialog=ref(false),loading=ref(false),saveViewDialog=ref(false),bulkDialog=ref(false),bulkLoading=ref(false),router=useRouter(),customerNameInput=ref<any>(null);
const owners=ref<any[]>([]),tags=ref<any[]>([]),views=ref<any[]>([]),me=ref<any>(null),viewName=ref(''),selectedRows=ref<any[]>([]),bulkPreview=ref<any>(null);
const filters=reactive<any>({keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:''});
const form=reactive<any>({name:'',english_name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],status:'potential',grade:'B',source:'',language:'English',timezone:'',business_scope:'',tax_no:'',registration_no:'',owner_id:''});
const bulk=reactive<any>({scope:'selected',status:'',grade:'',source:'',industry:'',owner_id:'',add_tag_ids:[],remove_tag_ids:[]});

const countries=computed(()=>[...new Set(rows.value.map(x=>x.country).filter(Boolean))].sort());
const sources=computed(()=>[...new Set(rows.value.map(x=>x.source).filter(Boolean))].sort());
const industries=computed(()=>[...new Set(rows.value.map(x=>x.industry).filter(Boolean))].sort());
const ownerMap=computed(()=>Object.fromEntries(owners.value.map(x=>[x.id,x.display_name])));
const canBulk=computed(()=>['admin','manager','sales','followup'].includes(me.value?.role));
const canChangeOwner=computed(()=>['admin','manager'].includes(me.value?.role));

function focusCustomerDialog(){nextTick(()=>customerNameInput.value?.focus?.())}
function queryParams(){
  const p:any={size:200};
  for(const k of ['keyword','country','status','grade','owner_id','tag_id','source','industry','customer_type']) if(filters[k])p[k]=filters[k];
  return p;
}
function filterPayload(){const p:any={};for(const k of ['keyword','country','status','grade','owner_id','tag_id','source','industry','customer_type'])if(filters[k])p[k]=filters[k];return p}
async function load(){loading.value=true;try{const r=await api.get('/customers',{params:queryParams()});rows.value=r.data.data;total.value=r.data.total;selectedRows.value=[]}finally{loading.value=false}}
async function loadRefs(){
  me.value=(await api.get('/auth/me')).data;
  owners.value=(await api.get('/users/lookup')).data;
  tags.value=(await api.get('/tags',{params:{size:200}})).data.data;
  views.value=(await api.get('/views',{params:{entity_type:'customers'}})).data;
  if(!form.owner_id)form.owner_id=me.value.id;
}
async function save(){
  if(!form.name.trim())return ElMessage.warning('请输入客户名称');
  const dup=(await api.post('/customers/duplicate-check',form)).data.matches||[];
  if(dup.length){
    const top=dup.slice(0,3).map((x:any)=>`${x.name}｜负责人：${x.owner_name||'未分配'}｜${x.reasons.join('、')}`).join('\n');
    await ElMessageBox.confirm(`系统发现可能重复/撞单客户：\n\n${top}\n\n仍然继续创建吗？`,'客户查重提醒',{type:'warning',confirmButtonText:'仍然创建',cancelButtonText:'返回检查'});
  }
  await api.post('/customers',form);dialog.value=false;
  Object.assign(form,{name:'',english_name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],status:'potential',grade:'B',source:'',language:'English',timezone:'',business_scope:'',tax_no:'',registration_no:'',owner_id:me.value?.id||''});
  await load();ElMessage.success('客户已创建');
}
function clearFilters(){Object.assign(filters,{keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:''});load()}
function openCustomer(r:any){router.push(`/customers/${r.id}`)}
async function saveView(){
  if(!viewName.value.trim())return ElMessage.warning('请输入视图名称');
  const f:any={};for(const [k,v] of Object.entries(filters))if(v)f[k]=v;
  await api.post('/views',{name:viewName.value,entity_type:'customers',filters:f});viewName.value='';saveViewDialog.value=false;await loadRefs();ElMessage.success('筛选视图已保存');
}
async function applyView(v:any){Object.assign(filters,{keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:'',...(v.filters||{})});await load()}
async function deleteView(v:any){await ElMessageBox.confirm(`删除视图“${v.name}”？`,'确认');await api.delete(`/views/${v.id}`);await loadRefs()}
function selectionChanged(v:any[]){selectedRows.value=v}
function resetBulk(){
  Object.assign(bulk,{scope:selectedRows.value.length?'selected':'filtered',status:'',grade:'',source:'',industry:'',owner_id:'',add_tag_ids:[],remove_tag_ids:[]});
  bulkPreview.value=null;
}
function openBulk(){resetBulk();bulkDialog.value=true}
function bulkOperations(){
  const set:any={};
  for(const k of ['status','grade','source','industry'])if(bulk[k])set[k]=bulk[k];
  if(canChangeOwner.value&&bulk.owner_id)set.owner_id=bulk.owner_id;
  const ops:any={set,add_tag_ids:[...bulk.add_tag_ids],remove_tag_ids:[...bulk.remove_tag_ids]};
  if(!Object.keys(set).length&&!ops.add_tag_ids.length&&!ops.remove_tag_ids.length)return null;
  return ops;
}
async function previewBulk(){
  const operations=bulkOperations();if(!operations)return ElMessage.warning('请至少选择一项需要批量修改的内容');
  if(bulk.scope==='selected'&&!selectedRows.value.length)return ElMessage.warning('请先勾选客户');
  bulkLoading.value=true;
  try{
    const payload:any={operations};
    if(bulk.scope==='selected')payload.ids=selectedRows.value.map(x=>x.id);else payload.filters=filterPayload();
    bulkPreview.value=(await api.post('/customers/bulk/preview',payload)).data;
  }finally{bulkLoading.value=false}
}
async function applyBulk(){
  if(!bulkPreview.value?.preview_id)return;
  await ElMessageBox.confirm(`即将修改 ${bulkPreview.value.count} 个客户。系统会再次校验数据范围，确认继续？`,'确认批量修改',{type:'warning',confirmButtonText:'确认执行'});
  bulkLoading.value=true;
  try{
    const {data}=await api.post('/customers/bulk/apply',{preview_id:bulkPreview.value.preview_id});
    ElMessage.success(`已完成 ${data.count} 个客户的批量修改`);bulkDialog.value=false;bulkPreview.value=null;await load();
  }catch(e:any){
    const code=e.response?.data?.error;
    if(code==='bulk_preview_expired')ElMessage.error('预览已超过 10 分钟，请重新预览');
    else if(code==='bulk_permission_or_data_changed')ElMessage.error('数据或权限已发生变化，请重新预览');
    else throw e;
  }finally{bulkLoading.value=false}
}
onMounted(async()=>{await loadRefs();await load()});
</script>

<template><AppLayout>
<div class="toolbar">
  <div><h2 style="margin:0">客户360°</h2><span class="muted">高级筛选、查重、防撞单、批量治理 · 当前条件共 {{total}} 个客户</span></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <el-button @click="router.push('/data-quality')">数据质量</el-button>
    <el-button v-if="canBulk" @click="openBulk">批量操作<span v-if="selectedRows.length">（已选 {{selectedRows.length}}）</span></el-button>
    <el-button v-if="['admin','manager'].includes(me?.role)" @click="router.push('/recycle-bin/customers')">回收站</el-button>
    <el-button v-if="canBulk" type="primary" @click="dialog=true">新增客户</el-button>
  </div>
</div>

<div class="card" style="margin-bottom:16px">
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
    <el-tag v-for="v in views" :key="v.id" closable disable-transitions @click="applyView(v)" @close.stop="deleteView(v)" style="cursor:pointer">{{v.name}}</el-tag>
    <el-button link type="primary" @click="saveViewDialog=true">+ 保存当前筛选</el-button>
  </div>
  <div class="grid" style="grid-template-columns:2fr repeat(4,1fr)">
    <el-input v-model="filters.keyword" clearable placeholder="客户名 / 官网 / 税号 / 注册号 / 主营业务" @keyup.enter="load" @clear="load"/>
    <el-select v-model="filters.country" aria-label="按国家筛选客户" clearable filterable placeholder="国家" @change="load"><el-option v-for="x in countries" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.status" aria-label="按客户状态筛选" clearable placeholder="状态" @change="load"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist']" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.grade" aria-label="按客户等级筛选" clearable placeholder="等级" @change="load"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.customer_type" aria-label="按客户类型筛选" clearable placeholder="客户类型" @change="load"><el-option v-for="x in ['Importer','Distributor','Wholesaler','Retailer','Brand','Agent','Manufacturer','End User','E-commerce']" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.owner_id" aria-label="按负责人筛选客户" clearable filterable placeholder="负责人" @change="load"><el-option v-for="x in owners" :key="x.id" :label="x.display_name" :value="x.id"/></el-select>
    <el-select v-model="filters.tag_id" aria-label="按标签筛选客户" clearable filterable placeholder="标签" @change="load"><el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/></el-select>
    <el-select v-model="filters.source" aria-label="按客户来源筛选" clearable filterable allow-create placeholder="来源" @change="load"><el-option v-for="x in sources" :key="x" :label="x" :value="x"/></el-select>
    <el-select v-model="filters.industry" aria-label="按行业筛选客户" clearable filterable allow-create placeholder="行业" @change="load"><el-option v-for="x in industries" :key="x" :label="x" :value="x"/></el-select>
    <div style="display:flex;gap:8px"><el-button type="primary" plain @click="load">应用筛选</el-button><el-button @click="clearFilters">重置</el-button></div>
  </div>
</div>

<div class="card"><el-table v-loading="loading" :data="rows" @selection-change="selectionChanged" @row-dblclick="openCustomer">
  <el-table-column v-if="canBulk" type="selection" width="48"/>
  <el-table-column prop="name" label="客户名称" min-width="220"><template #default="s"><b>{{s.row.name}}</b><div class="muted" style="font-size:12px">{{s.row.english_name||''}}</div></template></el-table-column>
  <el-table-column prop="country" label="国家" width="120"/><el-table-column prop="industry" label="行业" min-width="140"/>
  <el-table-column label="属性" min-width="180"><template #default="s"><el-tag v-for="x in s.row.customer_types" :key="x" size="small" style="margin:2px 4px 2px 0">{{x}}</el-tag></template></el-table-column>
  <el-table-column prop="status" label="状态" width="115"><template #default="s"><el-tag :type="s.row.status==='won'?'success':s.row.status==='lost'?'danger':'info'">{{s.row.status}}</el-tag></template></el-table-column>
  <el-table-column prop="grade" label="等级" width="70"/><el-table-column prop="source" label="来源" width="120"/>
  <el-table-column label="负责人" width="120"><template #default="s">{{ownerMap[s.row.owner_id]||'未分配'}}</template></el-table-column>
  <el-table-column label="操作" width="100" fixed="right"><template #default="s"><el-button link type="primary" @click="openCustomer(s.row)">进入360°</el-button></template></el-table-column>
</el-table>
<el-alert v-if="total>rows.length" type="info" :closable="false" :title="`当前条件共 ${total} 个客户，列表展示前 ${rows.length} 条；“按当前筛选批量操作”会由后端作用于完整筛选结果（最多 5000 条），不是只处理当前页面。`" style="margin-top:12px"/>
</div>

<el-dialog v-model="bulkDialog" title="客户批量操作" width="780">
<el-alert type="warning" :closable="false" title="批量修改采用“预览快照 → 确认执行”两阶段。预览 10 分钟内有效，执行时后端会再次校验权限和客户范围。" style="margin-bottom:14px"/>
<el-form label-position="top">
  <el-form-item label="作用范围"><el-radio-group v-model="bulk.scope" @change="bulkPreview=null"><el-radio value="selected" :disabled="!selectedRows.length">已勾选客户（{{selectedRows.length}}）</el-radio><el-radio value="filtered">当前完整筛选结果（{{total}}）</el-radio></el-radio-group></el-form-item>
  <div class="grid" style="grid-template-columns:1fr 1fr">
    <el-form-item label="修改状态"><el-select v-model="bulk.status" aria-label="批量修改客户状态" clearable style="width:100%" @change="bulkPreview=null"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    <el-form-item label="修改等级"><el-select v-model="bulk.grade" aria-label="批量修改客户等级" clearable style="width:100%" @change="bulkPreview=null"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
    <el-form-item label="修改来源"><el-input v-model="bulk.source" clearable @input="bulkPreview=null"/></el-form-item>
    <el-form-item label="修改行业"><el-input v-model="bulk.industry" clearable @input="bulkPreview=null"/></el-form-item>
    <el-form-item v-if="canChangeOwner" label="转移负责人"><el-select v-model="bulk.owner_id" aria-label="批量转移客户负责人" clearable filterable style="width:100%" @change="bulkPreview=null"><el-option v-for="x in owners" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/></el-select></el-form-item>
  </div>
  <el-form-item label="批量添加标签"><el-select v-model="bulk.add_tag_ids" aria-label="批量添加客户标签" multiple filterable clearable style="width:100%" @change="bulkPreview=null"><el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item>
  <el-form-item label="批量移除标签"><el-select v-model="bulk.remove_tag_ids" aria-label="批量移除客户标签" multiple filterable clearable style="width:100%" @change="bulkPreview=null"><el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/></el-select></el-form-item>
</el-form>

<div v-if="bulkPreview" class="card" style="margin-top:12px">
  <div class="toolbar"><div><b>预览确认</b><div class="muted">将影响 {{bulkPreview.count}} 个客户 · 有效至 {{bulkPreview.expires_at}}</div></div><el-tag type="warning">尚未执行</el-tag></div>
  <el-table :data="bulkPreview.sample" size="small" max-height="260"><el-table-column prop="name" label="样例客户" min-width="180"/><el-table-column prop="country" label="国家"/><el-table-column prop="status" label="原状态"/><el-table-column prop="grade" label="原等级"/><el-table-column prop="owner_name" label="原负责人"/></el-table>
  <div v-if="bulkPreview.count>bulkPreview.sample.length" class="muted" style="margin-top:8px">仅展示前 {{bulkPreview.sample.length}} 条样例，实际执行以快照中的 {{bulkPreview.count}} 个客户 ID 为准。</div>
</div>
<template #footer><el-button @click="bulkDialog=false">取消</el-button><el-button :loading="bulkLoading" @click="previewBulk">重新预览</el-button><el-button type="primary" :disabled="!bulkPreview" :loading="bulkLoading" @click="applyBulk">确认执行</el-button></template>
</el-dialog>

<el-dialog v-model="saveViewDialog" title="保存筛选视图" width="480"><el-form label-position="top"><el-form-item label="视图名称"><el-input v-model="viewName" placeholder="例如：德国A类重点客户"/></el-form-item></el-form><template #footer><el-button @click="saveViewDialog=false">取消</el-button><el-button type="primary" @click="saveView">保存</el-button></template></el-dialog>

<el-dialog v-model="dialog" title="新增客户" width="820" @opened="focusCustomerDialog"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="客户名称"><el-input ref="customerNameInput" v-model="form.name"/></el-form-item><el-form-item label="英文名称"><el-input v-model="form.english_name"/></el-form-item>
  <el-form-item label="国家"><el-input v-model="form.country"/></el-form-item><el-form-item label="城市"><el-input v-model="form.city"/></el-form-item>
  <el-form-item label="官网"><el-input v-model="form.website"/></el-form-item><el-form-item label="行业"><el-input v-model="form.industry"/></el-form-item>
  <el-form-item label="税号 / VAT"><el-input v-model="form.tax_no"/></el-form-item><el-form-item label="注册号"><el-input v-model="form.registration_no"/></el-form-item>
  <el-form-item label="客户属性"><el-select v-model="form.customer_types" aria-label="客户属性" multiple allow-create filterable style="width:100%"><el-option v-for="x in ['Importer','Distributor','Wholesaler','Retailer','Brand','Agent','Manufacturer','End User','E-commerce']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="客户状态"><el-select v-model="form.status" aria-label="客户状态" style="width:100%"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="等级"><el-select v-model="form.grade" aria-label="客户等级" style="width:100%"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="负责人"><el-select v-model="form.owner_id" aria-label="客户负责人" filterable style="width:100%"><el-option v-for="x in owners" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/></el-select></el-form-item>
  <el-form-item label="来源"><el-input v-model="form.source"/></el-form-item><el-form-item label="语言"><el-input v-model="form.language"/></el-form-item>
</div><el-form-item label="主营业务"><el-input v-model="form.business_scope" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">查重并保存</el-button></template></el-dialog>
</AppLayout></template>