<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {useRoute} from 'vue-router';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import AttachmentsPanel from '../components/AttachmentsPanel.vue';
import {api} from '../api/client';

const route=useRoute(),id=String(route.params.id);
const customer=ref<any>({}),insights=ref<any>(null),contacts=ref<any[]>([]),activities=ref<any[]>([]),timeline=ref<any[]>([]),tasks=ref<any[]>([]),brands=ref<any[]>([]),brandLinks=ref<any[]>([]),fieldDefs=ref<any[]>([]),tags=ref<any[]>([]),owners=ref<any[]>([]),collaborators=ref<any[]>([]),organization=ref<any>({parent:null,children:[]}),customerOptions=ref<any[]>([]),me=ref<any>(null);
const cDialog=ref(false),aDialog=ref(false),channelDialog=ref(false),editDialog=ref(false),brandDialog=ref(false),taskDialog=ref(false),fieldDialog=ref(false),tagDialog=ref(false),transferDialog=ref(false),collabDialog=ref(false),orgDialog=ref(false),mergeDialog=ref(false),departDialog=ref(false);
const selectedContact=ref<any>(null),departingContact=ref<any>(null),newTag=reactive<any>({name:'',category:''}),transfer=reactive<any>({owner_id:''}),collabForm=reactive<any>({user_id:''}),orgForm=reactive<any>({parent_customer_id:'',organization_role:''}),mergeForm=reactive<any>({target_id:''}),departForm=reactive<any>({successor_contact_id:'',departed_at:new Date().toISOString().slice(0,16),note:''});
const contact=reactive<any>({name:'',title:'',department:'',role:'',language:'English',timezone:'',birthday:'',anniversary:'',is_primary:0});
const activity=reactive<any>({type:'whatsapp',subject:'',content:'',result:'',next_action:'',occurred_at:new Date().toISOString().slice(0,16)});
const channel=reactive<any>({channel:'email',value:'',label:'',is_primary:0,preferred_time:''});
const editForm=reactive<any>({});
const brandForm=reactive<any>({brand_id:'',relation_type:'Distributor',authorized_regions:[],exclusive:0,start_date:'',end_date:'',notes:''});
const taskForm=reactive<any>({title:'',description:'',due_at:'',priority:'normal',status:'todo'});
const customValues=reactive<any>({});

const activeFields=computed(()=>fieldDefs.value.filter((x:any)=>x.entity_type==='customer'&&x.enabled!==0).sort((a:any,b:any)=>(a.sort_order||0)-(b.sort_order||0)));
const brandName=(brandId:string)=>brands.value.find((b:any)=>b.id===brandId)?.name||brandId;
const ownerName=computed(()=>owners.value.find((x:any)=>x.id===customer.value.owner_id)?.display_name||'未分配');
const canTransfer=computed(()=>['admin','manager'].includes(me.value?.role));
const canManageTeam=computed(()=>['admin','manager'].includes(me.value?.role)||customer.value.owner_id===me.value?.id);
const availableCollaborators=computed(()=>owners.value.filter((x:any)=>x.id!==customer.value.owner_id&&!collaborators.value.some((c:any)=>c.user_id===x.id)));
const activeContacts=computed(()=>contacts.value.filter((x:any)=>!x.is_departed));
const mergeTargets=computed(()=>customerOptions.value.filter((x:any)=>x.id!==id));

function resetContact(){Object.assign(contact,{name:'',title:'',department:'',role:'',language:'English',timezone:'',birthday:'',anniversary:'',is_primary:0})}
function resetTask(){Object.assign(taskForm,{title:'',description:'',due_at:'',priority:'normal',status:'todo'})}
async function load(){
  me.value=(await api.get('/auth/me')).data;
  owners.value=(await api.get('/users/lookup')).data;
  customer.value=(await api.get(`/customers/${id}`)).data;
  insights.value=(await api.get(`/customers/${id}/insights`)).data;
  Object.assign(editForm,JSON.parse(JSON.stringify(customer.value)));
  Object.keys(customValues).forEach(k=>delete customValues[k]);Object.assign(customValues,customer.value.custom_fields||{});
  const cs=(await api.get('/contacts',{params:{customer_id:id,size:100}})).data.data;
  contacts.value=await Promise.all(cs.map(async(c:any)=>({...c,channels:(await api.get('/channels',{params:{contact_id:c.id,size:100}})).data.data})));
  activities.value=(await api.get('/activities',{params:{customer_id:id,size:100}})).data.data;
  timeline.value=(await api.get(`/customers/${id}/timeline`)).data;
  tasks.value=(await api.get('/tasks',{params:{customer_id:id,size:100}})).data.data;
  brands.value=(await api.get('/brands',{params:{size:200}})).data.data;
  brandLinks.value=(await api.get('/customerBrands',{params:{customer_id:id,size:200}})).data.data;
  fieldDefs.value=(await api.get('/customFields',{params:{size:200}})).data.data;
  tags.value=(await api.get(`/customers/${id}/tags`)).data;
  collaborators.value=(await api.get(`/customers/${id}/collaborators`)).data;
  organization.value=(await api.get(`/customers/${id}/organization`)).data;
  customerOptions.value=(await api.get('/customers',{params:{size:200}})).data.data;
  Object.assign(orgForm,{parent_customer_id:customer.value.parent_customer_id||'',organization_role:customer.value.organization_role||''});
  transfer.owner_id=customer.value.owner_id||'';
}
async function saveCustomer(){const payload={...editForm};delete payload.id;delete payload.created_at;delete payload.updated_at;delete payload.deleted_at;await api.patch(`/customers/${id}`,payload);editDialog.value=false;await load();ElMessage.success('客户资料已更新')}
async function saveCustomFields(){await api.patch(`/customers/${id}`,{custom_fields:{...customValues}});fieldDialog.value=false;await load();ElMessage.success('自定义属性已保存')}
async function addContact(){if(!contact.name.trim())return ElMessage.warning('请输入联系人姓名');await api.post('/contacts',{...contact,customer_id:id});cDialog.value=false;resetContact();await load();ElMessage.success('联系人已添加')}
async function removeContact(c:any){await ElMessageBox.confirm(`确认删除联系人“${c.name}”及其联系方式？`,'确认');await api.delete(`/contacts/${c.id}`);await load()}
async function addActivity(){if(!activity.content.trim())return ElMessage.warning('请输入沟通内容');await api.post('/activities',{...activity,customer_id:id,occurred_at:new Date(activity.occurred_at).toISOString()});aDialog.value=false;await load();ElMessage.success('跟进已记录')}
function prepareChannel(c:any){selectedContact.value=c;Object.assign(channel,{channel:'email',value:'',label:'',is_primary:0,preferred_time:''});channelDialog.value=true}
async function addChannel(){if(!channel.value.trim())return ElMessage.warning('请输入账号、号码或链接');await api.post('/channels',{...channel,contact_id:selectedContact.value.id});channelDialog.value=false;await load()}
async function removeChannel(ch:any){await ElMessageBox.confirm(`确认删除 ${ch.channel}：${ch.value}？`,'确认');await api.delete(`/channels/${ch.id}`);await load()}
async function openChannel(ch:any){const {data}=await api.post('/tools/link',{channel:ch.channel,value:ch.value});if(data.target)window.open(data.target,'_blank','noopener,noreferrer');else{await navigator.clipboard.writeText(ch.value);ElMessage.success('账号已复制')}}
function openSite(){if(customer.value.website)window.open(/^https?:/.test(customer.value.website)?customer.value.website:`https://${customer.value.website}`,'_blank','noopener,noreferrer')}
async function addBrand(){if(!brandForm.brand_id)return ElMessage.warning('请选择品牌');await api.post('/customerBrands',{...brandForm,customer_id:id});brandDialog.value=false;await load()}
async function removeBrand(link:any){await ElMessageBox.confirm(`确认解除与“${brandName(link.brand_id)}”的关系？`,'确认');await api.delete(`/customerBrands/${link.id}`);await load()}
async function addTask(){if(!taskForm.title.trim())return ElMessage.warning('请输入任务标题');await api.post('/tasks',{...taskForm,customer_id:id,due_at:taskForm.due_at?new Date(taskForm.due_at).toISOString():null});taskDialog.value=false;resetTask();await load()}
async function completeTask(t:any){await api.patch(`/tasks/${t.id}`,{status:t.status==='done'?'todo':'done'});await load()}
async function addTag(){if(!newTag.name.trim())return ElMessage.warning('请输入标签名称');await api.post(`/customers/${id}/tags`,newTag);Object.assign(newTag,{name:'',category:''});tagDialog.value=false;await load();ElMessage.success('标签已添加')}
async function removeTag(t:any){await api.delete(`/customers/${id}/tags/${t.id}`);await load()}
async function transferOwner(){if(!transfer.owner_id)return ElMessage.warning('请选择负责人');await api.post(`/customers/${id}/transfer`,transfer);transferDialog.value=false;await load();ElMessage.success('客户负责人已转移')}
async function addCollaborator(){if(!collabForm.user_id)return ElMessage.warning('请选择协同人');await api.post(`/customers/${id}/collaborators`,collabForm);collabForm.user_id='';collabDialog.value=false;await load();ElMessage.success('协同人已添加')}
async function removeCollaborator(c:any){await ElMessageBox.confirm(`移除协同人“${c.display_name}”？`,'确认');await api.delete(`/customers/${id}/collaborators/${c.user_id}`);await load()}
async function releaseToPool(){
  const {value}=await ElMessageBox.prompt('请输入释放到公海的原因','释放客户到公海',{confirmButtonText:'确认释放',cancelButtonText:'取消',inputValue:'长期未有效推进'});
  try{await api.post(`/customers/${id}/release-to-pool`,{reason:value});ElMessage.success('客户已进入公海');location.hash='#/public-pool'}
  catch(e:any){if(e.response?.data?.error==='active_business_exists')ElMessage.error('该客户存在开放商机或未完成订单，禁止直接释放；如确需强制释放请由管理员处理');else throw e}
}
async function saveOrganization(){await api.patch(`/customers/${id}/organization`,{parent_customer_id:orgForm.parent_customer_id||null,organization_role:orgForm.organization_role||null});orgDialog.value=false;await load();ElMessage.success('组织关系已更新')}
async function mergeCustomer(){
  if(!mergeForm.target_id)return ElMessage.warning('请选择保留客户');
  const target=customerOptions.value.find((x:any)=>x.id===mergeForm.target_id);
  await ElMessageBox.confirm(`确认将当前客户“${customer.value.name}”完整合并到“${target?.name||mergeForm.target_id}”？当前客户将被软删除，联系人、询盘、报价、订单、回款等业务记录会迁移到保留客户。`,'客户合并',{type:'warning',confirmButtonText:'确认合并',cancelButtonText:'取消'});
  await api.post(`/customers/${id}/merge-into/${mergeForm.target_id}`,{});ElMessage.success('客户合并完成');location.hash=`#/customers/${mergeForm.target_id}`
}
function openDepart(contactRow:any){departingContact.value=contactRow;Object.assign(departForm,{successor_contact_id:'',departed_at:new Date().toISOString().slice(0,16),note:''});departDialog.value=true}
async function departContact(){
  if(!departingContact.value)return;
  await api.post(`/contacts/${departingContact.value.id}/depart`,{successor_contact_id:departForm.successor_contact_id||null,departed_at:new Date(departForm.departed_at).toISOString(),note:departForm.note});departDialog.value=false;await load();ElMessage.success('联系人已完成离职交接')
}
function fieldInputType(def:any){return ['number','amount'].includes(def.data_type)?'number':['date'].includes(def.data_type)?'date':'text'}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">{{customer.name}}</h2><span class="muted">{{customer.english_name||'-'}} · {{customer.country||'-'}} {{customer.city||''}}</span></div><div style="display:flex;gap:8px"><el-button @click="openSite" :disabled="!customer.website">打开官网</el-button><el-button @click="editDialog=true">编辑客户</el-button><el-button v-if="canManageTeam" type="danger" plain @click="releaseToPool">释放到公海</el-button><el-button type="primary" @click="aDialog=true">新增跟进</el-button></div></div>

<div v-if="insights" class="grid stats" style="margin-bottom:16px">
  <div class="stat"><span class="muted">资料完整度</span><b>{{insights.completeness.score}}%</b><small class="muted">缺失：{{insights.completeness.missing.slice(0,3).join('、')||'无'}}</small></div>
  <div class="stat"><span class="muted">客户潜力评分</span><b>{{insights.potential.score}} / 100</b><small class="muted">规则评分，不是AI预测</small></div>
  <div class="stat"><span class="muted">累计订单</span><b>{{insights.value.order_count}}</b><small class="muted">最近订单：{{insights.value.last_order_at?String(insights.value.last_order_at).slice(0,10):'-'}}</small></div>
  <div class="stat"><span class="muted">最近跟进</span><b>{{insights.engagement.days_since_activity==null?'-':insights.engagement.days_since_activity+' 天前'}}</b><small class="muted">开放商机：{{insights.engagement.open_opportunities}}</small></div>
</div>

<div v-if="insights?.value?.lifetime_value_by_currency?.length" class="card" style="margin-bottom:16px">
  <div class="toolbar"><div><h3 class="section-title">客户价值 / LTV</h3><span class="muted">按币种分别统计，避免跨币种直接相加</span></div></div>
  <el-table :data="insights.value.lifetime_value_by_currency">
    <el-table-column prop="currency" label="币种" width="100"/>
    <el-table-column prop="order_count" label="订单数" width="100"/>
    <el-table-column label="累计销售额"><template #default="s">{{Number(s.row.revenue||0).toLocaleString()}}</template></el-table-column>
    <el-table-column label="平均订单额"><template #default="s">{{Number(s.row.avg_order_value||0).toLocaleString()}}</template></el-table-column>
    <el-table-column prop="last_order_at" label="最近订单"/>
  </el-table>
</div>

<div class="grid" style="grid-template-columns:1fr 1.25fr">
<div class="card">
  <div class="toolbar"><h3 class="section-title">客户画像</h3><el-button link type="primary" @click="fieldDialog=true">编辑自定义属性</el-button></div>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="类型">{{(customer.customer_types||[]).join(' / ')||'-'}}</el-descriptions-item><el-descriptions-item label="状态">{{customer.status||'-'}}</el-descriptions-item>
    <el-descriptions-item label="等级">{{customer.grade||'-'}}</el-descriptions-item><el-descriptions-item label="来源">{{customer.source||'-'}}</el-descriptions-item>
    <el-descriptions-item label="行业">{{customer.industry||'-'}}</el-descriptions-item><el-descriptions-item label="语言">{{customer.language||'-'}}</el-descriptions-item>
    <el-descriptions-item label="负责人"><b>{{ownerName}}</b> <el-button v-if="canTransfer" link type="primary" @click="transferDialog=true">转移</el-button></el-descriptions-item>
    <el-descriptions-item label="协同人" :span="2"><span v-if="!collaborators.length" class="muted">暂无</span><el-tag v-for="c in collaborators" :key="c.user_id" :closable="canManageTeam" @close="removeCollaborator(c)" style="margin:2px 6px 2px 0">{{c.display_name}} · {{c.role}}</el-tag><el-button v-if="canManageTeam" link type="primary" @click="collabDialog=true">+ 添加协同人</el-button></el-descriptions-item>
    <el-descriptions-item label="税号">{{customer.tax_no||'-'}}</el-descriptions-item>
    <el-descriptions-item label="主营业务" :span="2">{{customer.business_scope||'-'}}</el-descriptions-item>
  </el-descriptions>
  <div style="margin-top:16px"><div class="toolbar"><h4 style="margin:0">客户标签</h4><el-button link type="primary" @click="tagDialog=true">+ 添加标签</el-button></div>
    <div><el-tag v-for="t in tags" :key="t.id" closable @close="removeTag(t)" style="margin:0 6px 6px 0">{{t.name}}</el-tag><span v-if="!tags.length" class="muted">暂无标签</span></div>
  </div>
  <div v-if="activeFields.length" style="margin-top:16px"><h4>自定义属性</h4><el-descriptions :column="2" border><el-descriptions-item v-for="f in activeFields" :key="f.id" :label="f.label">{{customer.custom_fields?.[f.field_key]??'-'}}</el-descriptions-item></el-descriptions></div>
</div>

<div class="card">
  <div class="toolbar"><h3 class="section-title">联系人与多渠道联系方式</h3><el-button size="small" type="primary" plain @click="cDialog=true">添加联系人</el-button></div>
  <div v-for="c in contacts" :key="c.id" style="padding:12px 0;border-bottom:1px solid #edf1f6">
    <div style="display:flex;justify-content:space-between"><div><b>{{c.name}}</b> <el-tag v-if="c.is_primary" size="small" type="success">主要</el-tag> <el-tag v-if="c.is_departed" size="small" type="info">已离职</el-tag> <span class="muted">{{c.title||''}} {{c.role?'· '+c.role:''}}</span><span v-if="c.birthday" class="muted"> · 生日 {{c.birthday}}</span><span v-if="c.anniversary" class="muted"> · 纪念日 {{c.anniversary}}</span></div><div><el-button v-if="!c.is_departed" link type="primary" @click="prepareChannel(c)">+ 联系方式</el-button><el-button v-if="!c.is_departed" link type="warning" @click="openDepart(c)">离职交接</el-button><el-button link type="danger" @click="removeContact(c)">删除</el-button></div></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><el-button v-for="ch in c.channels" :key="ch.id" size="small" @click="openChannel(ch)" @contextmenu.prevent="removeChannel(ch)">{{ch.channel}}：{{ch.value}}</el-button><span v-if="!c.channels?.length" class="muted">暂无联系方式</span></div>
  </div>
  <el-empty v-if="!contacts.length" description="暂无联系人"/>
</div>
</div>

<div class="card" style="margin-top:16px">
  <div class="toolbar"><div><h3 class="section-title">集团 / 组织关系</h3><span class="muted">总部、母公司、子公司、分支机构</span></div><div><el-button v-if="canManageTeam" size="small" @click="orgDialog=true">编辑组织关系</el-button><el-button v-if="canTransfer" size="small" type="danger" plain @click="mergeDialog=true">合并重复客户</el-button></div></div>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="当前组织角色">{{customer.organization_role||'-'}}</el-descriptions-item>
    <el-descriptions-item label="上级 / 母公司"><template v-if="organization.parent"><el-link type="primary" :href="`#/customers/${organization.parent.id}`">{{organization.parent.name}}</el-link></template><span v-else>-</span></el-descriptions-item>
  </el-descriptions>
  <div style="margin-top:12px"><b>下属公司 / 分支：</b><span v-if="!organization.children?.length" class="muted"> 暂无</span><el-tag v-for="x in (organization.children||[])" :key="x.id" style="margin:4px 6px"><a :href="`#/customers/${x.id}`" style="color:inherit;text-decoration:none">{{x.name}} · {{x.organization_role||'子级'}}</a></el-tag></div>
</div>

<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:16px">
<div class="card"><div class="toolbar"><h3 class="section-title">品牌与渠道关系</h3><el-button size="small" type="primary" plain @click="brandDialog=true">绑定品牌</el-button></div><el-table :data="brandLinks" empty-text="暂无品牌关系"><el-table-column label="品牌"><template #default="s">{{brandName(s.row.brand_id)}}</template></el-table-column><el-table-column prop="relation_type" label="关系"/><el-table-column label="授权区域"><template #default="s">{{(s.row.authorized_regions||[]).join(' / ')||'-'}}</template></el-table-column><el-table-column label="独家" width="70"><template #default="s">{{s.row.exclusive?'是':'否'}}</template></el-table-column><el-table-column label="操作" width="80"><template #default="s"><el-button link type="danger" @click="removeBrand(s.row)">解绑</el-button></template></el-table-column></el-table></div>
<div class="card"><div class="toolbar"><h3 class="section-title">客户任务</h3><el-button size="small" type="primary" plain @click="taskDialog=true">新增任务</el-button></div><el-table :data="tasks" empty-text="暂无任务"><el-table-column label="完成" width="65"><template #default="s"><el-checkbox :model-value="s.row.status==='done'" @change="completeTask(s.row)"/></template></el-table-column><el-table-column prop="title" label="任务"/><el-table-column prop="priority" label="优先级" width="85"/><el-table-column prop="due_at" label="截止时间" width="180"/></el-table></div>
</div>

<div class="card" style="margin-top:16px"><AttachmentsPanel entity-type="customer" :entity-id="id" title="客户附件"/></div>

<div class="card" style="margin-top:16px"><div class="toolbar"><div><h3 class="section-title">客户360°业务时间线</h3><span class="muted">客户创建、跟进、询盘、报价、订单、回款、出运、售后统一展示</span></div><el-button size="small" @click="aDialog=true">记录沟通</el-button></div><el-timeline><el-timeline-item v-for="x in timeline" :key="x.type+'-'+x.entity_id+'-'+x.time" :timestamp="x.time" placement="top"><div style="display:flex;gap:8px;align-items:center"><el-tag size="small">{{x.type}}</el-tag><b>{{x.title}}</b><el-tag v-if="x.status" size="small" type="info">{{x.status}}</el-tag></div><div v-if="x.summary" style="margin:5px 0">{{x.summary}}</div></el-timeline-item></el-timeline><el-empty v-if="!timeline.length" description="暂无业务事件"/></div>

<el-dialog v-model="tagDialog" title="添加客户标签" width="480"><el-form label-position="top"><el-form-item label="标签名称"><el-input v-model="newTag.name" placeholder="例如：重点客户 / 德国市场 / 高潜"/></el-form-item><el-form-item label="标签分类"><el-input v-model="newTag.category" placeholder="例如：客户价值 / 市场 / 产品偏好"/></el-form-item></el-form><template #footer><el-button @click="tagDialog=false">取消</el-button><el-button type="primary" @click="addTag">添加</el-button></template></el-dialog>
<el-dialog v-model="transferDialog" title="转移客户负责人" width="480"><el-form label-position="top"><el-form-item label="新负责人"><el-select v-model="transfer.owner_id" filterable style="width:100%"><el-option v-for="x in owners" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/></el-select></el-form-item></el-form><template #footer><el-button @click="transferDialog=false">取消</el-button><el-button type="primary" @click="transferOwner">确认转移</el-button></template></el-dialog>
<el-dialog v-model="collabDialog" title="添加客户协同人" width="480"><el-form label-position="top"><el-form-item label="协同用户"><el-select v-model="collabForm.user_id" filterable style="width:100%"><el-option v-for="x in availableCollaborators" :key="x.id" :label="`${x.display_name} · ${x.role}`" :value="x.id"/></el-select></el-form-item><el-alert type="info" :closable="false" title="协同人可参与该客户的业务操作，但客户唯一负责人不会改变。"/></el-form><template #footer><el-button @click="collabDialog=false">取消</el-button><el-button type="primary" @click="addCollaborator">添加</el-button></template></el-dialog>
<el-dialog v-model="orgDialog" title="编辑客户组织关系" width="580"><el-form label-position="top"><el-form-item label="组织角色"><el-select v-model="orgForm.organization_role" clearable allow-create filterable style="width:100%"><el-option v-for="x in ['Headquarters','Parent Company','Subsidiary','Branch','Regional Office','Affiliate']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="上级 / 母公司"><el-select v-model="orgForm.parent_customer_id" clearable filterable style="width:100%"><el-option v-for="x in mergeTargets" :key="x.id" :label="`${x.name} · ${x.country||''}`" :value="x.id"/></el-select></el-form-item></el-form><template #footer><el-button @click="orgDialog=false">取消</el-button><el-button type="primary" @click="saveOrganization">保存</el-button></template></el-dialog>
<el-dialog v-model="mergeDialog" title="合并重复客户" width="600"><el-alert type="warning" :closable="false" title="此操作会把当前客户的业务数据迁移到保留客户，并软删除当前客户。请确认两条记录确实属于同一个真实客户。"/><el-form label-position="top" style="margin-top:14px"><el-form-item label="保留客户"><el-select v-model="mergeForm.target_id" filterable style="width:100%"><el-option v-for="x in mergeTargets" :key="x.id" :label="`${x.name} · ${x.country||''} · ${x.website||''}`" :value="x.id"/></el-select></el-form-item></el-form><template #footer><el-button @click="mergeDialog=false">取消</el-button><el-button type="danger" @click="mergeCustomer">确认合并</el-button></template></el-dialog>
<el-dialog v-model="departDialog" title="联系人离职交接" width="620"><template v-if="departingContact"><p>离职联系人：<b>{{departingContact.name}}</b></p><el-form label-position="top"><el-form-item label="继任联系人（可选）"><el-select v-model="departForm.successor_contact_id" clearable filterable style="width:100%"><el-option v-for="x in activeContacts.filter((x:any)=>x.id!==departingContact.id)" :key="x.id" :label="`${x.name} · ${x.title||''}`" :value="x.id"/></el-select></el-form-item><el-form-item label="离职时间"><el-input v-model="departForm.departed_at" type="datetime-local"/></el-form-item><el-form-item label="交接备注"><el-input v-model="departForm.note" type="textarea" :rows="4"/></el-form-item></el-form></template><template #footer><el-button @click="departDialog=false">取消</el-button><el-button type="primary" @click="departContact">完成交接</el-button></template></el-dialog>

<el-dialog v-model="editDialog" title="编辑客户资料" width="760"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="客户名称"><el-input v-model="editForm.name"/></el-form-item><el-form-item label="英文名称"><el-input v-model="editForm.english_name"/></el-form-item><el-form-item label="国家"><el-input v-model="editForm.country"/></el-form-item><el-form-item label="城市"><el-input v-model="editForm.city"/></el-form-item><el-form-item label="官网"><el-input v-model="editForm.website"/></el-form-item><el-form-item label="行业"><el-input v-model="editForm.industry"/></el-form-item><el-form-item label="税号"><el-input v-model="editForm.tax_no"/></el-form-item><el-form-item label="注册号"><el-input v-model="editForm.registration_no"/></el-form-item><el-form-item label="客户属性"><el-select v-model="editForm.customer_types" multiple allow-create filterable style="width:100%"><el-option v-for="x in ['Importer','Distributor','Wholesaler','Retailer','Brand','Agent','Manufacturer','End User','E-commerce']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="状态"><el-select v-model="editForm.status" style="width:100%"><el-option v-for="x in ['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="等级"><el-select v-model="editForm.grade" style="width:100%"><el-option v-for="x in ['A','B','C','D']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="来源"><el-input v-model="editForm.source"/></el-form-item></div><el-form-item label="主营业务"><el-input v-model="editForm.business_scope" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="editDialog=false">取消</el-button><el-button type="primary" @click="saveCustomer">保存</el-button></template></el-dialog>

<el-dialog v-model="fieldDialog" title="客户自定义属性" width="650"><el-form label-position="top"><el-form-item v-for="f in activeFields" :key="f.id" :label="f.label"><el-select v-if="['select','multi_select'].includes(f.data_type)" v-model="customValues[f.field_key]" :multiple="f.data_type==='multi_select'" style="width:100%"><el-option v-for="o in (f.options||[])" :key="o" :label="o" :value="o"/></el-select><el-switch v-else-if="f.data_type==='boolean'" v-model="customValues[f.field_key]"/><el-input v-else v-model="customValues[f.field_key]" :type="fieldInputType(f)"/></el-form-item></el-form><template #footer><el-button @click="fieldDialog=false">取消</el-button><el-button type="primary" @click="saveCustomFields">保存</el-button></template></el-dialog>

<el-dialog v-model="cDialog" title="添加联系人"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="姓名"><el-input v-model="contact.name"/></el-form-item><el-form-item label="职位"><el-input v-model="contact.title"/></el-form-item><el-form-item label="部门"><el-input v-model="contact.department"/></el-form-item><el-form-item label="角色"><el-input v-model="contact.role"/></el-form-item><el-form-item label="语言"><el-input v-model="contact.language"/></el-form-item><el-form-item label="时区"><el-input v-model="contact.timezone"/></el-form-item><el-form-item label="生日"><el-input v-model="contact.birthday" type="date"/></el-form-item><el-form-item label="客户纪念日"><el-input v-model="contact.anniversary" type="date"/></el-form-item></div><el-form-item><el-checkbox v-model="contact.is_primary" :true-value="1" :false-value="0">设为主要联系人</el-checkbox></el-form-item></el-form><template #footer><el-button @click="cDialog=false">取消</el-button><el-button type="primary" @click="addContact">保存</el-button></template></el-dialog>

<el-dialog v-model="channelDialog" title="添加联系方式"><el-form label-position="top"><el-form-item label="渠道"><el-select v-model="channel.channel" style="width:100%"><el-option v-for="x in ['email','phone','whatsapp','wechat','line','vk','telegram','viber','kakaotalk','zalo','linkedin','facebook','messenger','instagram','x','skype','teams','zoom','website','store']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="账号 / 号码 / 链接"><el-input v-model="channel.value"/></el-form-item><el-form-item label="备注"><el-input v-model="channel.label"/></el-form-item><el-form-item label="最佳联系时间"><el-input v-model="channel.preferred_time"/></el-form-item><el-form-item><el-checkbox v-model="channel.is_primary" :true-value="1" :false-value="0">设为首选联系方式</el-checkbox></el-form-item></el-form><template #footer><el-button @click="channelDialog=false">取消</el-button><el-button type="primary" @click="addChannel">保存</el-button></template></el-dialog>

<el-dialog v-model="brandDialog" title="绑定品牌"><el-form label-position="top"><el-form-item label="品牌"><el-select v-model="brandForm.brand_id" filterable style="width:100%"><el-option v-for="b in brands" :key="b.id" :label="b.name" :value="b.id"/></el-select></el-form-item><el-form-item label="关系类型"><el-select v-model="brandForm.relation_type" style="width:100%"><el-option v-for="x in ['Own Brand','Agent','Distributor','Importer','Retailer','Competitor','Target','Historical']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="授权区域"><el-select v-model="brandForm.authorized_regions" multiple allow-create filterable style="width:100%"/></el-form-item><el-form-item><el-checkbox v-model="brandForm.exclusive" :true-value="1" :false-value="0">独家合作</el-checkbox></el-form-item></el-form><template #footer><el-button @click="brandDialog=false">取消</el-button><el-button type="primary" @click="addBrand">保存</el-button></template></el-dialog>

<el-dialog v-model="taskDialog" title="新增客户任务"><el-form label-position="top"><el-form-item label="任务标题"><el-input v-model="taskForm.title"/></el-form-item><el-form-item label="说明"><el-input v-model="taskForm.description" type="textarea"/></el-form-item><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="截止时间"><el-input v-model="taskForm.due_at" type="datetime-local"/></el-form-item><el-form-item label="优先级"><el-select v-model="taskForm.priority" style="width:100%"><el-option v-for="x in ['low','normal','high','urgent']" :key="x" :label="x" :value="x"/></el-select></el-form-item></div></el-form><template #footer><el-button @click="taskDialog=false">取消</el-button><el-button type="primary" @click="addTask">保存</el-button></template></el-dialog>

<el-dialog v-model="aDialog" title="新增跟进"><el-form label-position="top"><el-form-item label="方式"><el-select v-model="activity.type" style="width:100%"><el-option v-for="x in ['email','phone','whatsapp','wechat','line','telegram','meeting','visit','exhibition']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="主题"><el-input v-model="activity.subject"/></el-form-item><el-form-item label="沟通内容"><el-input v-model="activity.content" type="textarea"/></el-form-item><el-form-item label="结果"><el-input v-model="activity.result"/></el-form-item><el-form-item label="下一步"><el-input v-model="activity.next_action"/></el-form-item><el-form-item label="时间"><el-input v-model="activity.occurred_at" type="datetime-local"/></el-form-item></el-form><template #footer><el-button @click="aDialog=false">取消</el-button><el-button type="primary" @click="addActivity">保存</el-button></template></el-dialog>
</AppLayout></template>