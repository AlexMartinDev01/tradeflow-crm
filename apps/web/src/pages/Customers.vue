<script setup lang="ts">
import {ElMessage,ElMessageBox} from 'element-plus';
import {ref,reactive,onMounted,computed,nextTick} from 'vue';
import {useRouter} from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rows=ref<any[]>([]);
const total=ref(0);
const dialog=ref(false);
const loading=ref(false);
const saving=ref(false);
const saveViewDialog=ref(false);
const bulkDialog=ref(false);
const bulkLoading=ref(false);
const filtersOpen=ref(false);
const router=useRouter();
const customerNameInput=ref<any>(null);

const owners=ref<any[]>([]);
const tags=ref<any[]>([]);
const views=ref<any[]>([]);
const me=ref<any>(null);
const viewName=ref('');
const selectedRows=ref<any[]>([]);
const bulkPreview=ref<any>(null);

const filters=reactive<any>({keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:''});
const form=reactive<any>({name:'',english_name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],status:'potential',grade:'B',source:'',language:'English',timezone:'',business_scope:'',tax_no:'',registration_no:'',owner_id:''});
const bulk=reactive<any>({scope:'selected',status:'',grade:'',source:'',industry:'',owner_id:'',add_tag_ids:[],remove_tag_ids:[]});

const statusOptions=[
  {value:'potential',label:'潜在客户'},
  {value:'contacted',label:'已联系'},
  {value:'following',label:'跟进中'},
  {value:'quoted',label:'已报价'},
  {value:'sample',label:'样品阶段'},
  {value:'negotiating',label:'谈判中'},
  {value:'won',label:'已成交'},
  {value:'dormant',label:'暂停跟进'},
  {value:'lost',label:'已流失'},
  {value:'blacklist',label:'黑名单'}
];
const typeOptions=[
  {value:'Importer',label:'进口商'},
  {value:'Distributor',label:'分销商'},
  {value:'Wholesaler',label:'批发商'},
  {value:'Retailer',label:'零售商'},
  {value:'Brand',label:'品牌方'},
  {value:'Agent',label:'代理商'},
  {value:'Manufacturer',label:'制造商'},
  {value:'End User',label:'终端客户'},
  {value:'E-commerce',label:'电商客户'}
];

const countries=computed(()=>[...new Set(rows.value.map(x=>x.country).filter(Boolean))].sort());
const sources=computed(()=>[...new Set(rows.value.map(x=>x.source).filter(Boolean))].sort());
const industries=computed(()=>[...new Set(rows.value.map(x=>x.industry).filter(Boolean))].sort());
const ownerMap=computed(()=>Object.fromEntries(owners.value.map(x=>[x.id,x.display_name])));
const canBulk=computed(()=>['admin','manager','sales','followup'].includes(me.value?.role));
const canChangeOwner=computed(()=>['admin','manager'].includes(me.value?.role));
const activeFilterCount=computed(()=>Object.entries(filters).filter(([k,v])=>k!=='keyword'&&!!v).length);

function statusLabel(v:string){return statusOptions.find(x=>x.value===v)?.label||v||'-'}
function typeLabel(v:string){return typeOptions.find(x=>x.value===v)?.label||v}
function statusType(v:string){
  if(v==='won')return 'success';
  if(v==='lost'||v==='blacklist')return 'danger';
  if(v==='quoted'||v==='negotiating'||v==='sample')return 'warning';
  if(v==='contacted'||v==='following')return 'primary';
  return 'info';
}
function focusCustomerDialog(){nextTick(()=>customerNameInput.value?.focus?.())}
function queryParams(){
  const p:any={size:200};
  for(const k of ['keyword','country','status','grade','owner_id','tag_id','source','industry','customer_type'])if(filters[k])p[k]=filters[k];
  return p;
}
function filterPayload(){
  const p:any={};
  for(const k of ['keyword','country','status','grade','owner_id','tag_id','source','industry','customer_type'])if(filters[k])p[k]=filters[k];
  return p;
}
async function load(){
  loading.value=true;
  try{
    const r=await api.get('/customers',{params:queryParams()});
    rows.value=r.data.data;
    total.value=r.data.total;
    selectedRows.value=[];
  }catch(e:any){
    ElMessage.error(e.response?.data?.message||'客户数据加载失败，请稍后重试');
  }finally{loading.value=false}
}
async function loadRefs(){
  me.value=(await api.get('/auth/me')).data;
  owners.value=(await api.get('/users/lookup')).data;
  tags.value=(await api.get('/tags',{params:{size:200}})).data.data;
  views.value=(await api.get('/views',{params:{entity_type:'customers'}})).data;
  if(!form.owner_id)form.owner_id=me.value.id;
}
async function save(){
  if(!form.name.trim())return ElMessage.warning('请输入客户名称');
  saving.value=true;
  try{
    const dup=(await api.post('/customers/duplicate-check',form)).data.matches||[];
    if(dup.length){
      const top=dup.slice(0,3).map((x:any)=>`${x.name}｜负责人：${x.owner_name||'未分配'}｜${x.reasons.join('、')}`).join('\n');
      try{
        await ElMessageBox.confirm(`系统发现可能重复/撞单客户：\n\n${top}\n\n仍然继续创建吗？`,'客户查重提醒',{type:'warning',confirmButtonText:'仍然创建',cancelButtonText:'返回检查'});
      }catch{return}
    }
    await api.post('/customers',form);
    dialog.value=false;
    Object.assign(form,{name:'',english_name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],status:'potential',grade:'B',source:'',language:'English',timezone:'',business_scope:'',tax_no:'',registration_no:'',owner_id:me.value?.id||''});
    await load();
    ElMessage.success('客户已创建');
  }catch(e:any){
    ElMessage.error(e.response?.data?.message||'客户创建失败，请检查输入');
  }finally{saving.value=false}
}
function clearFilters(){
  Object.assign(filters,{keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:''});
  load();
}
function openCustomer(r:any){router.push(`/customers/${r.id}`)}
async function saveView(){
  if(!viewName.value.trim())return ElMessage.warning('请输入视图名称');
  const f:any={};
  for(const [k,v] of Object.entries(filters))if(v)f[k]=v;
  await api.post('/views',{name:viewName.value,entity_type:'customers',filters:f});
  viewName.value='';
  saveViewDialog.value=false;
  await loadRefs();
  ElMessage.success('筛选视图已保存');
}
async function applyView(v:any){
  Object.assign(filters,{keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:'',...(v.filters||{})});
  filtersOpen.value=true;
  await load();
}
async function deleteView(v:any){
  await ElMessageBox.confirm(`删除视图“${v.name}”？`,'确认');
  await api.delete(`/views/${v.id}`);
  await loadRefs();
}
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
  const operations=bulkOperations();
  if(!operations)return ElMessage.warning('请至少选择一项需要批量修改的内容');
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
    ElMessage.success(`已完成 ${data.count} 个客户的批量修改`);
    bulkDialog.value=false;
    bulkPreview.value=null;
    await load();
  }catch(e:any){
    const code=e.response?.data?.error;
    if(code==='bulk_preview_expired')ElMessage.error('预览已超过 10 分钟，请重新预览');
    else if(code==='bulk_permission_or_data_changed')ElMessage.error('数据或权限已发生变化，请重新预览');
    else throw e;
  }finally{bulkLoading.value=false}
}
onMounted(async()=>{await loadRefs();await load()});
</script>

<template>
  <AppLayout>
    <section class="customer-head">
      <div>
        <h1>客户 360°</h1>
        <p>统一管理客户档案、负责人、阶段、标签和跟进信息。当前条件共 <b>{{total}}</b> 个客户。</p>
      </div>
      <div class="customer-head-actions">
        <el-button @click="router.push('/data-quality')">数据质量</el-button>
        <el-button v-if="canBulk" @click="openBulk">
          批量操作<span v-if="selectedRows.length">（{{selectedRows.length}}）</span>
        </el-button>
        <el-button v-if="['admin','manager'].includes(me?.role)" @click="router.push('/recycle-bin/customers')">回收站</el-button>
        <el-button v-if="canBulk" type="primary" @click="dialog=true">新增客户</el-button>
      </div>
    </section>

    <div class="customer-search-card">
      <div class="customer-search-row">
        <el-input
          v-model="filters.keyword"
          class="customer-keyword"
          clearable
          placeholder="搜索客户名称、官网、税号、注册号或主营业务"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button type="primary" @click="load">搜索</el-button>
        <el-button :type="activeFilterCount?'primary':'default'" plain @click="filtersOpen=!filtersOpen">
          更多筛选<span v-if="activeFilterCount"> · {{activeFilterCount}}</span>
        </el-button>
        <el-button v-if="filters.keyword||activeFilterCount" @click="clearFilters">清空条件</el-button>
      </div>

      <div v-if="views.length" class="saved-views">
        <span class="saved-views-label">常用视图</span>
        <el-tag
          v-for="v in views"
          :key="v.id"
          closable
          disable-transitions
          class="saved-view-tag"
          @click="applyView(v)"
          @close.stop="deleteView(v)"
        >{{v.name}}</el-tag>
        <el-button link type="primary" @click="saveViewDialog=true">+ 保存当前筛选</el-button>
      </div>
      <div v-else class="saved-views">
        <span class="saved-views-label">常用视图</span>
        <span class="muted">还没有保存的筛选</span>
        <el-button link type="primary" @click="saveViewDialog=true">保存当前筛选</el-button>
      </div>

      <div v-show="filtersOpen" class="customer-filter-panel">
        <div class="customer-filter-grid">
          <el-select v-model="filters.country" aria-label="按国家筛选客户" clearable filterable placeholder="国家/地区" @change="load">
            <el-option v-for="x in countries" :key="x" :label="x" :value="x"/>
          </el-select>
          <el-select v-model="filters.status" aria-label="按客户状态筛选" clearable placeholder="客户状态" @change="load">
            <el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/>
          </el-select>
          <el-select v-model="filters.grade" aria-label="按客户等级筛选" clearable placeholder="客户等级" @change="load">
            <el-option v-for="x in ['A','B','C','D']" :key="x" :label="'等级 '+x" :value="x"/>
          </el-select>
          <el-select v-model="filters.customer_type" aria-label="按客户类型筛选" clearable placeholder="客户类型" @change="load">
            <el-option v-for="x in typeOptions" :key="x.value" :label="x.label" :value="x.value"/>
          </el-select>
          <el-select v-model="filters.owner_id" aria-label="按负责人筛选客户" clearable filterable placeholder="负责人" @change="load">
            <el-option v-for="x in owners" :key="x.id" :label="x.display_name" :value="x.id"/>
          </el-select>
          <el-select v-model="filters.tag_id" aria-label="按标签筛选客户" clearable filterable placeholder="客户标签" @change="load">
            <el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/>
          </el-select>
          <el-select v-model="filters.source" aria-label="按客户来源筛选" clearable filterable allow-create placeholder="客户来源" @change="load">
            <el-option v-for="x in sources" :key="x" :label="x" :value="x"/>
          </el-select>
          <el-select v-model="filters.industry" aria-label="按行业筛选客户" clearable filterable allow-create placeholder="所属行业" @change="load">
            <el-option v-for="x in industries" :key="x" :label="x" :value="x"/>
          </el-select>
        </div>
        <div class="filter-panel-footer">
          <span class="muted">选择筛选条件后会自动刷新列表</span>
          <div>
            <el-button @click="clearFilters">重置</el-button>
            <el-button type="primary" plain @click="saveViewDialog=true">保存为常用视图</el-button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedRows.length" class="selection-bar">
      <div><b>已选择 {{selectedRows.length}} 个客户</b><span>可进行批量修改、打标签或转移负责人</span></div>
      <el-button type="primary" @click="openBulk">批量操作</el-button>
    </div>

    <div class="card table-card customer-table-card">
      <el-table
        v-loading="loading"
        :data="rows"
        empty-text="当前条件暂无客户"
        @selection-change="selectionChanged"
        @row-dblclick="openCustomer"
      >
        <el-table-column v-if="canBulk" type="selection" width="48"/>
        <el-table-column prop="name" label="客户名称" min-width="220" fixed="left">
          <template #default="s">
            <button class="customer-name-link" type="button" @click.stop="openCustomer(s.row)">{{s.row.name}}</button>
            <div class="muted customer-subname">{{s.row.english_name||s.row.website||''}}</div>
          </template>
        </el-table-column>
        <el-table-column prop="country" label="国家/地区" width="120"/>
        <el-table-column prop="industry" label="行业" min-width="140" show-overflow-tooltip/>
        <el-table-column label="客户属性" min-width="180">
          <template #default="s">
            <el-tag v-for="x in s.row.customer_types" :key="x" size="small" class="type-tag">{{typeLabel(x)}}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120">
          <template #default="s"><el-tag :type="statusType(s.row.status)">{{statusLabel(s.row.status)}}</el-tag></template>
        </el-table-column>
        <el-table-column prop="grade" label="等级" width="78">
          <template #default="s"><span class="grade-pill" :class="'grade-'+String(s.row.grade||'').toLowerCase()">{{s.row.grade||'-'}}</span></template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="120" show-overflow-tooltip/>
        <el-table-column label="负责人" width="120">
          <template #default="s">{{ownerMap[s.row.owner_id]||'未分配'}}</template>
        </el-table-column>
        <el-table-column label="操作" width="92" fixed="right">
          <template #default="s"><el-button link type="primary" @click="openCustomer(s.row)">查看详情</el-button></template>
        </el-table-column>
      </el-table>

      <div class="table-footer-hint">
        <span>提示：点击客户名称或“查看详情”进入客户 360°；也支持双击整行。</span>
        <span>当前显示 {{rows.length}} / {{total}}</span>
      </div>

      <el-alert
        v-if="total>rows.length"
        type="info"
        :closable="false"
        :title="`当前条件共 ${total} 个客户，列表展示前 ${rows.length} 条；按当前筛选批量操作时，后端会作用于完整筛选结果（最多 5000 条）。`"
        class="customer-list-alert"
      />
    </div>

    <el-dialog v-model="bulkDialog" title="客户批量操作" width="780">
      <el-alert type="warning" :closable="false" title="批量修改采用“预览快照 → 确认执行”两阶段。预览 10 分钟内有效，执行时后端会再次校验权限和客户范围。" style="margin-bottom:14px"/>
      <el-form label-position="top">
        <el-form-item label="作用范围">
          <el-radio-group v-model="bulk.scope" @change="bulkPreview=null">
            <el-radio value="selected" :disabled="!selectedRows.length">已勾选客户（{{selectedRows.length}}）</el-radio>
            <el-radio value="filtered">当前完整筛选结果（{{total}}）</el-radio>
          </el-radio-group>
        </el-form-item>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          <el-form-item label="修改状态">
            <el-select v-model="bulk.status" aria-label="批量修改客户状态" clearable style="width:100%" @change="bulkPreview=null">
              <el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/>
            </el-select>
          </el-form-item>
          <el-form-item label="修改等级">
            <el-select v-model="bulk.grade" aria-label="批量修改客户等级" clearable style="width:100%" @change="bulkPreview=null">
              <el-option v-for="x in ['A','B','C','D']" :key="x" :label="'等级 '+x" :value="x"/>
            </el-select>
          </el-form-item>
          <el-form-item label="修改来源"><el-input v-model="bulk.source" clearable @input="bulkPreview=null"/></el-form-item>
          <el-form-item label="修改行业"><el-input v-model="bulk.industry" clearable @input="bulkPreview=null"/></el-form-item>
          <el-form-item v-if="canChangeOwner" label="转移负责人">
            <el-select v-model="bulk.owner_id" aria-label="批量转移客户负责人" clearable filterable style="width:100%" @change="bulkPreview=null">
              <el-option v-for="x in owners" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/>
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="批量添加标签">
          <el-select v-model="bulk.add_tag_ids" aria-label="批量添加客户标签" multiple filterable clearable style="width:100%" @change="bulkPreview=null">
            <el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/>
          </el-select>
        </el-form-item>
        <el-form-item label="批量移除标签">
          <el-select v-model="bulk.remove_tag_ids" aria-label="批量移除客户标签" multiple filterable clearable style="width:100%" @change="bulkPreview=null">
            <el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/>
          </el-select>
        </el-form-item>
      </el-form>

      <div v-if="bulkPreview" class="card" style="margin-top:12px">
        <div class="toolbar">
          <div><b>预览确认</b><div class="muted">将影响 {{bulkPreview.count}} 个客户 · 有效至 {{bulkPreview.expires_at}}</div></div>
          <el-tag type="warning">尚未执行</el-tag>
        </div>
        <el-table :data="bulkPreview.sample" size="small" max-height="260">
          <el-table-column prop="name" label="样例客户" min-width="180"/>
          <el-table-column prop="country" label="国家"/>
          <el-table-column prop="status" label="原状态"><template #default="s">{{statusLabel(s.row.status)}}</template></el-table-column>
          <el-table-column prop="grade" label="原等级"/>
          <el-table-column prop="owner_name" label="原负责人"/>
        </el-table>
        <div v-if="bulkPreview.count>bulkPreview.sample.length" class="muted" style="margin-top:8px">
          仅展示前 {{bulkPreview.sample.length}} 条样例，实际执行以快照中的 {{bulkPreview.count}} 个客户 ID 为准。
        </div>
      </div>
      <template #footer>
        <el-button @click="bulkDialog=false">取消</el-button>
        <el-button :loading="bulkLoading" @click="previewBulk">重新预览</el-button>
        <el-button type="primary" :disabled="!bulkPreview" :loading="bulkLoading" @click="applyBulk">确认执行</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="saveViewDialog" title="保存筛选视图" width="480">
      <el-form label-position="top">
        <el-form-item label="视图名称"><el-input v-model="viewName" placeholder="例如：德国 A 类重点客户" @keyup.enter="saveView"/></el-form-item>
      </el-form>
      <template #footer><el-button @click="saveViewDialog=false">取消</el-button><el-button type="primary" @click="saveView">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="dialog" title="新增客户" width="820" @opened="focusCustomerDialog">
      <el-form label-position="top">
        <div class="grid customer-create-grid">
          <el-form-item label="客户名称"><el-input ref="customerNameInput" v-model="form.name" placeholder="必填，例如：ABC Trading GmbH"/></el-form-item>
          <el-form-item label="英文名称"><el-input v-model="form.english_name"/></el-form-item>
          <el-form-item label="国家/地区"><el-input v-model="form.country"/></el-form-item>
          <el-form-item label="城市"><el-input v-model="form.city"/></el-form-item>
          <el-form-item label="官网"><el-input v-model="form.website" placeholder="https://"/></el-form-item>
          <el-form-item label="行业"><el-input v-model="form.industry"/></el-form-item>
          <el-form-item label="税号 / VAT"><el-input v-model="form.tax_no"/></el-form-item>
          <el-form-item label="注册号"><el-input v-model="form.registration_no"/></el-form-item>
          <el-form-item label="客户属性">
            <el-select v-model="form.customer_types" aria-label="客户属性" multiple style="width:100%">
              <el-option v-for="x in typeOptions" :key="x.value" :label="x.label" :value="x.value"/>
            </el-select>
          </el-form-item>
          <el-form-item label="客户状态">
            <el-select v-model="form.status" aria-label="客户状态" style="width:100%">
              <el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/>
            </el-select>
          </el-form-item>
          <el-form-item label="等级">
            <el-select v-model="form.grade" aria-label="客户等级" style="width:100%">
              <el-option v-for="x in ['A','B','C','D']" :key="x" :label="'等级 '+x" :value="x"/>
            </el-select>
          </el-form-item>
          <el-form-item label="负责人">
            <el-select v-model="form.owner_id" aria-label="客户负责人" filterable style="width:100%">
              <el-option v-for="x in owners" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/>
            </el-select>
          </el-form-item>
          <el-form-item label="来源"><el-input v-model="form.source"/></el-form-item>
          <el-form-item label="语言"><el-input v-model="form.language"/></el-form-item>
        </div>
        <el-form-item label="主营业务"><el-input v-model="form.business_scope" type="textarea" :rows="3"/></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog=false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">查重并保存</el-button>
      </template>
    </el-dialog>
  </AppLayout>
</template>

<style scoped>
.customer-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px}
.customer-head h1{margin:0;font-size:24px;color:#172033;letter-spacing:-.02em}
.customer-head p{margin:7px 0 0;color:#667085;font-size:13px}
.customer-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.customer-search-card{background:#fff;border:1px solid #e5eaf1;border-radius:14px;padding:16px 18px;margin-bottom:14px}
.customer-search-row{display:flex;align-items:center;gap:8px}
.customer-keyword{flex:1;min-width:260px}
.saved-views{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:13px;padding-top:13px;border-top:1px solid #eef1f5;font-size:12px}
.saved-views-label{font-weight:700;color:#667085;margin-right:2px}
.saved-view-tag{cursor:pointer}
.customer-filter-panel{margin-top:14px;padding:14px;background:#f8fafc;border:1px solid #edf0f4;border-radius:11px}
.customer-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.filter-panel-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px}
.selection-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:#eef5ff;border:1px solid #cfe0fb;border-radius:12px;padding:10px 14px;margin-bottom:12px}
.selection-bar>div{display:flex;align-items:center;gap:10px;color:#344054;font-size:13px}
.selection-bar span{color:#667085}
.customer-table-card{padding:0}
.customer-name-link{border:0;background:transparent;padding:0;color:#1d4ed8;font-weight:750;cursor:pointer;text-align:left}
.customer-name-link:hover{text-decoration:underline}
.customer-subname{font-size:12px;margin-top:3px;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.type-tag{margin:2px 4px 2px 0}
.grade-pill{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;font-size:12px;font-weight:800;background:#f2f4f7;color:#475467}
.grade-a{background:#ecfdf3;color:#027a48}
.grade-b{background:#eff6ff;color:#1d4ed8}
.grade-c{background:#fffaeb;color:#b54708}
.grade-d{background:#fef3f2;color:#b42318}
.table-footer-hint{display:flex;justify-content:space-between;gap:12px;padding:10px 16px;border-top:1px solid #edf0f4;color:#98a2b3;font-size:11px}
.customer-list-alert{margin:0 14px 14px}
.customer-create-grid{grid-template-columns:1fr 1fr}
@media(max-width:1050px){.customer-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){
  .customer-head{flex-direction:column}
  .customer-head-actions{width:100%;justify-content:flex-start}
  .customer-search-row{flex-wrap:wrap}
  .customer-keyword{min-width:100%;width:100%}
  .customer-filter-grid,.customer-create-grid{grid-template-columns:1fr}
  .filter-panel-footer,.selection-bar,.selection-bar>div{align-items:flex-start;flex-direction:column}
  .table-footer-hint{flex-direction:column}
}
</style>
