<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const rules=ref<any[]>([]),customRules=ref<any[]>([]),logs=ref<any[]>([]),tags=ref<any[]>([]),catalog=ref<any>({entities:{},actions:{}}),running=ref(false);
const dialog=ref(false),editing=ref<any>(null),preview=ref<any>(null),previewing=ref(false);
const form=reactive<any>({name:'',entity_type:'customers',enabled:0,conditions:[],actions:[]});
const entityCfg=computed(()=>catalog.value.entities?.[form.entity_type]||{fields:{},actions:[]});
const operatorLabels:any={eq:'等于',neq:'不等于',gte:'大于等于',lte:'小于等于',contains:'包含'};
const actionValues:any={
  set_customer_status:['potential','contacted','following','quoted','sample','negotiating','won','dormant','lost','blacklist'],
  set_customer_grade:['A','B','C','D'],
  set_opportunity_stage:['qualification','solution','quotation','sample','negotiation','won','lost'],
  set_order_status:['pending','confirmed','production','ready','partial_shipped','shipped','partial_delivered','completed','cancelled'],
  set_quotation_status:['draft','pending_approval','approved','sent','accepted','rejected','expired'],
  set_aftersales_status:['open','investigating','awaiting_customer','resolved','closed']
};

async function load(){
  const [r,l,c,cat,t]=await Promise.all([api.get('/automation/rules'),api.get('/automation/logs'),api.get('/automation/custom'),api.get('/automation/custom/catalog'),api.get('/tags',{params:{size:200}})]);
  rules.value=r.data;logs.value=l.data;customRules.value=c.data;catalog.value=cat.data;tags.value=t.data.data;
}
async function saveRule(r:any){await api.patch('/automation/rules',{key:r.key,enabled:!!r.enabled,config:r.config});ElMessage.success('系统规则已保存')}
async function runNow(){
  running.value=true;
  try{
    const {data}=await api.post('/automation/run',{});
    const custom=(data.custom_rules||[]).reduce((a:number,x:any)=>a+Number(x.actions_applied||0),0);
    ElMessage.success('自动化完成：新任务 '+data.created+'，状态/数据更新 '+data.updated+'，自定义动作 '+custom);
    await load();
  }finally{running.value=false}
}
function deep(v:any){return JSON.parse(JSON.stringify(v))}
function defaultCondition(){
  const fields=Object.keys(entityCfg.value.fields||{}),field=fields[0]||'',ops=entityCfg.value.fields?.[field]?.operators||['eq'];
  return {field,operator:ops[0]||'eq',value:''};
}
function defaultAction(){return {type:'create_task',title:'请跟进 {name}',description:'由自定义自动化规则创建',priority:'normal',due_days:0,value:'',tag_id:''}}
function resetForm(){
  const first=Object.keys(catalog.value.entities||{})[0]||'customers';
  Object.assign(form,{name:'',entity_type:first,enabled:0,conditions:[],actions:[]});
  form.conditions.push(defaultCondition());form.actions.push(defaultAction());preview.value=null;editing.value=null;
}
function newRule(){resetForm();dialog.value=true}
function editRule(r:any){
  editing.value=r;Object.assign(form,{name:r.name,entity_type:r.entity_type,enabled:r.enabled?1:0,conditions:deep(r.conditions||[]),actions:deep(r.actions||[])});
  preview.value=null;dialog.value=true;
}
function entityChanged(){form.conditions.splice(0);form.actions.splice(0);form.conditions.push(defaultCondition());form.actions.push(defaultAction());preview.value=null}
function addCondition(){form.conditions.push(defaultCondition());preview.value=null}
function addAction(){form.actions.push(defaultAction());preview.value=null}
function fieldChanged(c:any){
  const def=entityCfg.value.fields?.[c.field];c.operator=def?.operators?.[0]||'eq';c.value='';preview.value=null;
}
function fieldDef(c:any){return entityCfg.value.fields?.[c.field]||{kind:'string',operators:['eq']}}
function actionOptions(){return (entityCfg.value.actions||[]).map((x:string)=>({value:x,label:catalog.value.actions?.[x]?.label||x}))}
function actionChanged(a:any){Object.assign(a,defaultAction(),{type:a.type});preview.value=null}
function valueOptions(type:string){return actionValues[type]||[]}
function rulePayload(){return {name:form.name,entity_type:form.entity_type,enabled:!!form.enabled,conditions:deep(form.conditions),actions:deep(form.actions)}}
async function previewRule(){
  if(!form.name.trim())return ElMessage.warning('请先填写规则名称');
  previewing.value=true;
  try{preview.value=(await api.post('/automation/custom/preview',rulePayload())).data}
  catch(e:any){ElMessage.error(e.response?.data?.message||e.response?.data?.error||'规则预览失败')}
  finally{previewing.value=false}
}
async function saveCustom(){
  if(!form.name.trim())return ElMessage.warning('规则名称必填');
  try{
    if(editing.value)await api.patch('/automation/custom/'+editing.value.id,rulePayload());else await api.post('/automation/custom',rulePayload());
    dialog.value=false;await load();ElMessage.success('自定义自动化规则已保存');
  }catch(e:any){ElMessage.error(e.response?.data?.message||e.response?.data?.error||'保存失败')}
}
async function toggleCustom(r:any){await api.patch('/automation/custom/'+r.id,{enabled:!!r.enabled});await load()}
async function removeCustom(r:any){await ElMessageBox.confirm('确认删除规则“'+r.name+'”？','确认');await api.delete('/automation/custom/'+r.id);await load()}
function conditionSummary(r:any){return (r.conditions||[]).map((x:any)=>(catalog.value.entities?.[r.entity_type]?.fields?.[x.field]?.label||x.field)+' '+(operatorLabels[x.operator]||x.operator)+' '+x.value).join('；')}
function actionSummary(r:any){return (r.actions||[]).map((x:any)=>catalog.value.actions?.[x.type]?.label||x.type).join('、')}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">自动化与提醒</h2><span class="muted">固定系统规则 + 白名单自定义规则；服务运行时每 10 分钟扫描，也支持外部 Scheduler 和手动运行</span></div><div style="display:flex;gap:8px"><el-button @click="newRule">新建自定义规则</el-button><el-button type="primary" :loading="running" @click="runNow">立即运行全部规则</el-button></div></div>

<el-tabs>
<el-tab-pane label="系统规则">
<div class="card"><el-table :data="rules">
  <el-table-column prop="name" label="规则" min-width="180"/><el-table-column prop="key" label="Key" width="170"/>
  <el-table-column label="启用" width="90"><template #default="s"><el-switch v-model="s.row.enabled" :active-value="1" :inactive-value="0"/></template></el-table-column>
  <el-table-column label="阈值/配置" min-width="280"><template #default="s"><div style="display:flex;gap:8px;align-items:center">
    <template v-if="['quotation_expiry','brand_expiry','dormant_customer','contact_anniversary'].includes(s.row.key)"><span>天数</span><el-input-number v-model="s.row.config.days" :min="1" :max="365"/></template>
    <template v-else-if="s.row.key==='inquiry_response_sla'"><span>小时</span><el-input-number v-model="s.row.config.hours" :min="1" :max="168"/></template>
    <span>优先级</span><el-select v-model="s.row.config.priority" style="width:120px"><el-option v-for="x in ['low','normal','high','urgent']" :key="x" :label="x" :value="x"/></el-select>
  </div></template></el-table-column>
  <el-table-column label="操作" width="100"><template #default="s"><el-button link type="primary" @click="saveRule(s.row)">保存</el-button></template></el-table-column>
</el-table></div>
</el-tab-pane>

<el-tab-pane label="自定义规则">
<div class="card"><el-table :data="customRules">
  <el-table-column prop="name" label="规则名称" min-width="170"/><el-table-column label="业务对象" width="110"><template #default="s">{{catalog.entities?.[s.row.entity_type]?.label||s.row.entity_type}}</template></el-table-column>
  <el-table-column label="全部条件同时满足" min-width="300"><template #default="s"><span>{{conditionSummary(s.row)}}</span></template></el-table-column>
  <el-table-column label="动作" min-width="210"><template #default="s">{{actionSummary(s.row)}}</template></el-table-column>
  <el-table-column prop="last_run_at" label="最近运行" width="175"/><el-table-column label="启用" width="80"><template #default="s"><el-switch v-model="s.row.enabled" :active-value="1" :inactive-value="0" @change="toggleCustom(s.row)"/></template></el-table-column>
  <el-table-column label="操作" width="130" fixed="right"><template #default="s"><el-button link type="primary" @click="editRule(s.row)">编辑</el-button><el-button link type="danger" @click="removeCustom(s.row)">删除</el-button></template></el-table-column>
</el-table><el-empty v-if="!customRules.length" description="暂无自定义自动化规则"/></div>
</el-tab-pane>

<el-tab-pane label="执行日志">
<div class="card"><el-table :data="logs" max-height="560">
  <el-table-column prop="created_at" label="时间" width="190"/><el-table-column prop="rule_key" label="规则" width="190"/><el-table-column prop="message" label="动作" min-width="260"/><el-table-column prop="entity_type" label="对象" width="130"/><el-table-column prop="entity_id" label="对象ID" min-width="190"/>
</el-table></div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="dialog" :title="editing?'编辑自定义自动化规则':'新建自定义自动化规则'" width="940">
<el-alert type="info" :closable="false" title="规则只支持系统白名单条件和动作，不执行任意脚本或 SQL。所有条件采用 AND：必须全部满足才执行动作。" style="margin-bottom:14px"/>
<el-form label-position="top">
<div class="grid" style="grid-template-columns:2fr 1fr auto">
  <el-form-item label="规则名称"><el-input v-model="form.name" @input="preview=null"/></el-form-item>
  <el-form-item label="业务对象"><el-select v-model="form.entity_type" style="width:100%" @change="entityChanged"><el-option v-for="(v,k) in catalog.entities" :key="String(k)" :label="v.label" :value="String(k)"/></el-select></el-form-item>
  <el-form-item label="状态"><el-checkbox v-model="form.enabled" :true-value="1" :false-value="0">保存后立即启用</el-checkbox></el-form-item>
</div>

<div class="toolbar"><h3 class="section-title">条件（全部满足）</h3><el-button size="small" @click="addCondition">+ 条件</el-button></div>
<div v-for="(c,i) in form.conditions" :key="i" class="grid" style="grid-template-columns:1.4fr 1fr 1.4fr auto;margin-bottom:8px">
  <el-select v-model="c.field" @change="fieldChanged(c)"><el-option v-for="(v,k) in entityCfg.fields" :key="String(k)" :label="v.label" :value="String(k)"/></el-select>
  <el-select v-model="c.operator" @change="preview=null"><el-option v-for="op in fieldDef(c).operators" :key="op" :label="operatorLabels[op]||op" :value="op"/></el-select>
  <el-input-number v-if="fieldDef(c).kind==='number'" v-model="c.value" style="width:100%" @change="preview=null"/>
  <el-input v-else v-model="c.value" @input="preview=null"/>
  <el-button :disabled="form.conditions.length<=1" @click="form.conditions.splice(i,1);preview=null">删除</el-button>
</div>

<div class="toolbar" style="margin-top:18px"><h3 class="section-title">满足条件后执行</h3><el-button size="small" @click="addAction">+ 动作</el-button></div>
<div v-for="(a,i) in form.actions" :key="i" class="card" style="margin-bottom:10px">
  <div class="grid" style="grid-template-columns:1fr auto"><el-select v-model="a.type" @change="actionChanged(a)"><el-option v-for="x in actionOptions()" :key="x.value" :label="x.label" :value="x.value"/></el-select><el-button :disabled="form.actions.length<=1" @click="form.actions.splice(i,1);preview=null">删除动作</el-button></div>
  <template v-if="a.type==='create_task'"><div class="grid" style="grid-template-columns:2fr 1fr 1fr;margin-top:10px"><el-input v-model="a.title" placeholder="任务标题，可用 {name} / {id}" @input="preview=null"/><el-select v-model="a.priority" @change="preview=null"><el-option v-for="x in ['low','normal','high','urgent']" :key="x" :label="x" :value="x"/></el-select><el-input-number v-model="a.due_days" :min="0" :max="365" style="width:100%" @change="preview=null"/></div><el-input v-model="a.description" type="textarea" :rows="2" placeholder="任务说明，可用 {name} / {id}" style="margin-top:8px" @input="preview=null"/></template>
  <template v-else-if="a.type==='add_tag'"><el-select v-model="a.tag_id" filterable placeholder="选择标签" style="width:100%;margin-top:10px" @change="preview=null"><el-option v-for="t in tags" :key="t.id" :label="t.name" :value="t.id"/></el-select></template>
  <template v-else><el-select v-model="a.value" placeholder="选择目标值" style="width:100%;margin-top:10px" @change="preview=null"><el-option v-for="x in valueOptions(a.type)" :key="x" :label="x" :value="x"/></el-select></template>
</div>
</el-form>

<div v-if="preview" class="card" style="margin-top:14px"><div class="toolbar"><div><b>规则预览</b><div class="muted">扫描 {{preview.total_scanned}} 条，当前命中 {{preview.matched_count}} 条</div></div><el-tag :type="preview.matched_count?'warning':'success'">{{preview.matched_count}} 条命中</el-tag></div>
<el-table :data="preview.sample" size="small" max-height="250"><el-table-column prop="name" label="命中样例" min-width="220"/><el-table-column prop="status" label="当前状态"/><el-table-column prop="entity_id" label="对象ID" min-width="190"/></el-table></div>
<template #footer><el-button @click="dialog=false">取消</el-button><el-button :loading="previewing" @click="previewRule">预览命中</el-button><el-button type="primary" @click="saveCustom">保存规则</el-button></template>
</el-dialog>
</AppLayout></template>