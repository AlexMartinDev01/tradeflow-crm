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
const filtersOpen=ref(true);
const router=useRouter();
const customerNameInput=ref<any>(null);

const owners=ref<any[]>([]);
const tags=ref<any[]>([]);
const views=ref<any[]>([]);
const me=ref<any>(null);
const viewName=ref('');
const selectedRows=ref<any[]>([]);
const currentPage=ref(1),pageSize=ref(10);
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
const pagedRows=computed(()=>rows.value.slice((currentPage.value-1)*pageSize.value,currentPage.value*pageSize.value));
const presetCounts=computed(()=>({
  germany:rows.value.filter(x=>/德国|germany/i.test(String(x.country||''))).length,
  high:rows.value.filter(x=>x.grade==='A').length,
  new:rows.value.filter(x=>{const t=new Date(x.created_at||0).getTime();return Number.isFinite(t)&&Date.now()-t<=7*86400000}).length,
  follow:rows.value.filter(x=>['following','contacted','quoted','sample','negotiating'].includes(x.status)).length
}));

function applyPreset(kind:string){
  Object.assign(filters,{keyword:'',country:'',status:'',grade:'',owner_id:'',tag_id:'',source:'',industry:'',customer_type:''});
  if(kind==='germany')filters.country=rows.value.find(x=>/德国|germany/i.test(String(x.country||'')))?.country||'Germany';
  if(kind==='high')filters.grade='A';
  if(kind==='follow')filters.status='following';
  currentPage.value=1;
  if(kind==='new'){
    rows.value=[...rows.value].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    return;
  }
  load();
}
function countryFlag(country:string){
  const s=String(country||'').toLowerCase();
  const map:any={germany:'🇩🇪','德国':'🇩🇪',canada:'🇨🇦','加拿大':'🇨🇦',australia:'🇦🇺','澳大利亚':'🇦🇺',brazil:'🇧🇷','巴西':'🇧🇷',uk:'🇬🇧','英国':'🇬🇧','united kingdom':'🇬🇧',usa:'🇺🇸','美国':'🇺🇸','united states':'🇺🇸',japan:'🇯🇵','日本':'🇯🇵',france:'🇫🇷','法国':'🇫🇷',spain:'🇪🇸','西班牙':'🇪🇸',china:'🇨🇳','中国':'🇨🇳'};
  return map[s]||'🌐';
}
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
    currentPage.value=1;
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
        <h1>客户360°</h1>
        <p>统一管理客户档案、标签、负责人和跟进记录，沉淀客户资源，提升转化效率。</p>
      </div>
      <div class="customer-head-actions">
        <el-button @click="router.push('/data-quality')"><span class="mini-action-icon ui-sprite sprite-nav_quality"></span>数据质量</el-button>
        <el-button v-if="canBulk" @click="openBulk">批量操作⌄</el-button>
        <el-button v-if="['admin','manager'].includes(me?.role)" @click="router.push('/recycle-bin/customers')">回收站</el-button>
        <el-button v-if="canBulk" type="primary" @click="dialog=true">＋ 新增客户</el-button>
      </div>
    </section>

    <section class="customer-viewbar">
      <b>常用视图</b>
      <button class="view-tab active" type="button" @click="clearFilters">全部客户 <span>（{{total.toLocaleString()}}）</span></button>
      <button class="view-tab" type="button" @click="applyPreset('germany')">★　德国重点客户 <span>（{{presetCounts.germany}}）</span></button>
      <button class="view-tab" type="button" @click="applyPreset('high')">▥　高潜力客户 <span>（{{presetCounts.high}}）</span></button>
      <button class="view-tab" type="button" @click="applyPreset('new')">◷　本周新建 <span>（{{presetCounts.new}}）</span></button>
      <button class="view-tab" type="button" @click="applyPreset('follow')">◷　待跟进 <span>（{{presetCounts.follow}}）</span></button>
      <span class="viewbar-spacer"></span>
      <el-button link type="primary" @click="saveViewDialog=true">＋ 新建视图</el-button>
      <span class="view-divider"></span>
      <el-button link>⚙ 管理视图</el-button>
    </section>

    <section class="customer-filter-card">
      <div v-show="filtersOpen" class="customer-filter-grid">
        <label class="filter-field"><span>国家/地区</span><el-select v-model="filters.country" clearable filterable placeholder="请选择国家/地区"><el-option v-for="x in countries" :key="x" :label="x" :value="x"/></el-select></label>
        <label class="filter-field"><span>客户状态</span><el-select v-model="filters.status" clearable placeholder="请选择客户状态"><el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></label>
        <label class="filter-field"><span>客户等级</span><el-select v-model="filters.grade" clearable placeholder="请选择客户等级"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="'等级 '+x" :value="x"/></el-select></label>
        <label class="filter-field"><span>客户类型</span><el-select v-model="filters.customer_type" clearable placeholder="请选择客户类型"><el-option v-for="x in typeOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></label>
        <label class="filter-field"><span>负责人</span><el-select v-model="filters.owner_id" clearable filterable placeholder="请选择负责人"><el-option v-for="x in owners" :key="x.id" :label="x.display_name" :value="x.id"/></el-select></label>
        <label class="filter-field"><span>客户标签</span><el-select v-model="filters.tag_id" clearable filterable placeholder="请选择客户标签"><el-option v-for="x in tags" :key="x.id" :label="x.name" :value="x.id"/></el-select></label>
        <label class="filter-field"><span>客户来源</span><el-select v-model="filters.source" clearable filterable allow-create placeholder="请选择客户来源"><el-option v-for="x in sources" :key="x" :label="x" :value="x"/></el-select></label>
        <label class="filter-field"><span>所属行业</span><el-select v-model="filters.industry" clearable filterable allow-create placeholder="请选择所属行业"><el-option v-for="x in industries" :key="x" :label="x" :value="x"/></el-select></label>
      </div>
      <div class="customer-filter-footer">
        <el-input v-model="filters.keyword" class="customer-hidden-search" clearable placeholder="客户名称 / 官网 / 税号" @keyup.enter="load"/>
        <span class="filter-spacer"></span>
        <el-button @click="clearFilters">重置</el-button>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button link type="primary" @click="filtersOpen=!filtersOpen">{{filtersOpen?'收起⌃':'展开⌄'}}</el-button>
      </div>
    </section>

    <section class="customer-table-wrap">
      <div class="customer-bulkbar">
        <span class="selected-count">☑　已选择 <b>{{selectedRows.length}}</b> 项</span>
        <el-button :disabled="!selectedRows.length" @click="openBulk">批量分配</el-button>
        <el-button :disabled="!selectedRows.length" @click="openBulk">批量打标签</el-button>
        <el-button :disabled="!selectedRows.length" @click="openBulk">批量更新状态</el-button>
        <el-button :disabled="!selectedRows.length" @click="openBulk">更多操作⌄</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="pagedRows"
        empty-text="当前条件暂无客户"
        @selection-change="selectionChanged"
        @row-dblclick="openCustomer"
      >
        <el-table-column v-if="canBulk" type="selection" width="48"/>
        <el-table-column prop="name" label="客户名称" min-width="190">
          <template #default="s"><button class="customer-name-link" type="button" @click.stop="openCustomer(s.row)">{{s.row.name}}</button></template>
        </el-table-column>
        <el-table-column label="国家/地区" width="120"><template #default="s"><span class="country-cell"><i>{{countryFlag(s.row.country)}}</i>{{s.row.country||'-'}}</span></template></el-table-column>
        <el-table-column prop="industry" label="行业" min-width="115" show-overflow-tooltip/>
        <el-table-column label="客户属性" min-width="125"><template #default="s"><el-tag v-for="x in (s.row.customer_types||[]).slice(0,1)" :key="x" size="small" class="type-tag">{{typeLabel(x)}}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="112"><template #default="s"><el-tag :type="statusType(s.row.status)" size="small">●　{{statusLabel(s.row.status)}}</el-tag></template></el-table-column>
        <el-table-column prop="grade" label="等级" width="76"><template #default="s"><span class="grade-pill" :class="'grade-'+String(s.row.grade||'').toLowerCase()">{{s.row.grade||'-'}}</span></template></el-table-column>
        <el-table-column prop="source" label="来源" width="110"><template #default="s"><span class="source-pill">{{s.row.source||'-'}}</span></template></el-table-column>
        <el-table-column label="负责人" width="130"><template #default="s"><span class="owner-cell"><span class="ui-sprite avatar-sprite owner-avatar"></span>{{ownerMap[s.row.owner_id]||'未分配'}}</span></template></el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="120"><template #default="s">{{String(s.row.created_at||'').slice(0,10)||'-'}}</template></el-table-column>
        <el-table-column label="操作" width="70" fixed="right"><template #default="s"><button class="more-button" type="button" aria-label="查看详情" @click.stop="openCustomer(s.row)">•••</button></template></el-table-column>
      </el-table>

      <div class="customer-pagination">
        <span>共 {{total.toLocaleString()}} 条客户数据</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10,20,50]"
          :total="rows.length"
          layout="sizes, prev, pager, next"
          small
        />
      </div>
    </section>

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
.customer-head{height:100px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:15px 3px 8px;margin:0}
.customer-head h1{margin:0;font-size:29px;line-height:1.25;color:#0e213e;letter-spacing:-.025em}
.customer-head p{margin:8px 0 0;color:#667891;font-size:13px}
.customer-head-actions{display:flex;gap:10px;align-items:center;padding-top:1px}.customer-head-actions .el-button{height:40px;padding:0 17px;border-radius:7px}.customer-head-actions .el-button--primary{padding:0 20px}.mini-action-icon{width:26px;height:26px;transform:scale(.72);margin:-4px 3px -4px -5px}
.customer-viewbar{height:60px;background:#fff;border:1px solid #e4ebf4;border-radius:9px;display:flex;align-items:center;gap:8px;padding:9px 16px;margin-bottom:12px;white-space:nowrap;overflow:hidden}.customer-viewbar>b{font-size:13px;margin-right:4px}.view-tab{height:36px;border:0;border-radius:7px;background:#f4f7fb;color:#41516b;padding:0 15px;font-size:12px;cursor:pointer}.view-tab.active{background:#eaf3ff;color:#0667ed;font-weight:700}.view-tab span{color:#657895}.viewbar-spacer{flex:1}.view-divider{height:18px;width:1px;background:#dfe6ef}
.customer-filter-card{background:#fff;border:1px solid #e4ebf4;border-radius:9px;padding:13px 16px 10px;margin-bottom:12px}.customer-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 22px}.filter-field{display:flex;flex-direction:column;gap:5px;min-width:0}.filter-field>span{font-size:11px;color:#40516a;font-weight:650}.filter-field .el-select{width:100%}.filter-field :deep(.el-select__wrapper){height:34px;min-height:34px;background:#fff}.customer-filter-footer{height:42px;display:flex;align-items:end;gap:9px;padding-top:7px}.filter-spacer{flex:1}.customer-hidden-search{width:240px;opacity:.88}.customer-filter-footer .el-button{min-width:78px;height:34px}.customer-filter-footer .el-button.is-link{min-width:auto}
.customer-table-wrap{background:#fff;border:1px solid #e4ebf4;border-radius:9px;overflow:hidden}.customer-bulkbar{height:48px;display:flex;align-items:center;gap:8px;padding:6px 16px;border-bottom:1px solid #edf1f6}.selected-count{font-size:11px;color:#53647d;margin-right:9px}.selected-count b{color:#086cff}.customer-bulkbar .el-button{height:32px;padding:0 14px}.customer-name-link{border:0;background:transparent;color:#006df4;font-size:12px;font-weight:700;padding:0;cursor:pointer}.country-cell{display:flex;align-items:center;gap:7px}.country-cell i{font-style:normal;font-size:17px}.type-tag{border:0}.grade-pill{display:inline-grid;place-items:center;min-width:28px;height:25px;padding:0 7px;border-radius:6px;font-size:11px}.grade-a{background:#ffe8ea;color:#f04455}.grade-b{background:#eaf3ff;color:#1268f4}.grade-c{background:#e9f9ef;color:#19a66f}.grade-d{background:#f1f3f6;color:#667085}.source-pill{display:inline-block;padding:3px 8px;border-radius:5px;background:#edf5ff;color:#1470e8;font-size:10px}.owner-cell{display:flex;align-items:center;gap:5px;white-space:nowrap}.owner-avatar{transform:scale(.43);transform-origin:center;margin:-13px -12px}.more-button{border:0;background:transparent;color:#2467b0;letter-spacing:2px;cursor:pointer}
.customer-pagination{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;color:#7b8ca4;font-size:11px;border-top:1px solid #edf1f6}
.customer-create-grid{grid-template-columns:1fr 1fr}
@media(max-width:1100px){.customer-filter-grid{grid-template-columns:repeat(2,1fr)}.customer-viewbar{overflow:auto}.customer-head{height:auto;padding-bottom:14px}}
@media(max-width:760px){.customer-head{flex-direction:column}.customer-head-actions{flex-wrap:wrap}.customer-filter-grid,.customer-create-grid{grid-template-columns:1fr}.customer-hidden-search{display:none}.customer-bulkbar{overflow:auto}.customer-pagination{align-items:flex-start;height:auto;padding:10px;gap:10px;flex-direction:column}}
</style>