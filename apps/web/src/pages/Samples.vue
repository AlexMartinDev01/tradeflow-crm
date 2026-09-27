<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';import {ElMessage} from 'element-plus';import AppLayout from '../layouts/AppLayout.vue';import {api} from '../api/client';import {useAuth} from '../stores/auth';
const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});const canEdit=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role));
const rows=ref<any[]>([]),customers=ref<any[]>([]),opps=ref<any[]>([]),dialog=ref(false),feedbackDialog=ref(false),selected=ref<any>(null),loading=ref(false),creating=ref(false),feedbackSaving=ref(false),actionBusy=ref('');
const form=reactive<any>({customer_id:'',opportunity_id:'',product:'',quantity:'1',fee:0,currency:'USD',courier:'',tracking_no:'',status:'requested'});
const feedback=ref('');
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
async function runBusy(key:string,fn:()=>Promise<any>){if(actionBusy.value)return;actionBusy.value=key;try{return await fn()}finally{actionBusy.value=''}}
async function load(){
  loading.value=true;
  try{
    const [samples,customerRows,opportunities]=await Promise.all([
      api.get('/samples',{params:{size:200}}),
      api.get('/customers',{params:{size:200}}),
      api.get('/opportunities',{params:{size:200}})
    ]);
    rows.value=samples.data.data;customers.value=customerRows.data.data;opps.value=opportunities.data.data;
  }catch(e:any){ElMessage.error(e.response?.data?.message||'样品数据加载失败，请稍后重试')}
  finally{loading.value=false}
}
async function save(){
  if(!form.customer_id||!form.product.trim())return ElMessage.warning('客户和产品必填');
  if(creating.value)return;creating.value=true;
  try{
    await api.post('/samples',form);dialog.value=false;
    Object.assign(form,{customer_id:'',opportunity_id:'',product:'',quantity:'1',fee:0,currency:'USD',courier:'',tracking_no:'',status:'requested'});
    await load();ElMessage.success('样品申请已创建');
  }catch(e:any){ElMessage.error(e.response?.data?.message||'样品申请创建失败')}
  finally{creating.value=false}
}
async function markSent(r:any){await runBusy('sent-'+r.id,async()=>{try{await api.patch(`/samples/${r.id}`,{status:'sent',sent_at:new Date().toISOString()});await load();ElMessage.success('已标记寄出')}catch(e:any){ElMessage.error(e.response?.data?.message||'标记寄出失败')}})}
async function markDelivered(r:any){await runBusy('delivered-'+r.id,async()=>{try{const {data}=await api.post(`/workflows/samples/${r.id}/mark-delivered`,{});await load();ElMessage.success(`已签收，并自动创建任务：${data.task.title}`)}catch(e:any){ElMessage.error(e.response?.data?.message||'确认签收失败')}})}
function openFeedback(r:any){selected.value=r;feedback.value=r.feedback||'';feedbackDialog.value=true}
async function saveFeedback(){
  if(!selected.value||feedbackSaving.value)return;feedbackSaving.value=true;
  try{await api.patch(`/samples/${selected.value.id}`,{feedback:feedback.value,status:'feedback'});feedbackDialog.value=false;await load();ElMessage.success('样品反馈已保存')}
  catch(e:any){ElMessage.error(e.response?.data?.message||'样品反馈保存失败')}
  finally{feedbackSaving.value=false}
}
onMounted(load);
</script>
<template><AppLayout><div class="toolbar"><div><h2 style="margin:0">样品管理</h2><span class="muted">申请、寄送、签收、反馈，并自动触发跟进任务</span></div><el-button v-if="canEdit" type="primary" @click="dialog=true">新增样品</el-button></div>
<div class="card"><el-table v-loading="loading" :data="rows"><el-table-column label="客户" min-width="180"><template #default="s">{{customerMap[s.row.customer_id]||s.row.customer_id}}</template></el-table-column><el-table-column prop="product" label="产品" min-width="180"/><el-table-column prop="quantity" label="数量"/><el-table-column prop="courier" label="快递"/><el-table-column prop="tracking_no" label="运单号"/><el-table-column prop="sent_at" label="寄出时间" width="180"/><el-table-column prop="delivered_at" label="签收时间" width="180"/><el-table-column prop="status" label="状态"/><el-table-column label="操作" width="210"><template #default="s"><el-button v-if="canEdit&&s.row.status==='requested'" link :loading="actionBusy==='sent-'+s.row.id" :disabled="!!actionBusy&&actionBusy!==('sent-'+s.row.id)" @click="markSent(s.row)">标记寄出</el-button><el-button v-if="canEdit&&s.row.status==='sent'" link type="success" :loading="actionBusy==='delivered-'+s.row.id" :disabled="!!actionBusy&&actionBusy!==('delivered-'+s.row.id)" @click="markDelivered(s.row)">确认签收</el-button><el-button v-if="canEdit" link type="primary" :disabled="!!actionBusy" @click="openFeedback(s.row)">反馈</el-button></template></el-table-column></el-table></div>
<el-dialog v-model="dialog" title="新增样品申请" width="680"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="客户"><el-select v-model="form.customer_id" filterable style="width:100%"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item><el-form-item label="关联商机"><el-select v-model="form.opportunity_id" clearable filterable style="width:100%"><el-option v-for="o in opps.filter(x=>!form.customer_id||x.customer_id===form.customer_id)" :key="o.id" :label="o.name" :value="o.id"/></el-select></el-form-item><el-form-item label="产品"><el-input v-model="form.product"/></el-form-item><el-form-item label="数量"><el-input v-model="form.quantity"/></el-form-item><el-form-item label="样品费"><el-input v-model.number="form.fee" type="number"/></el-form-item><el-form-item label="币种"><el-select v-model="form.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="快递公司"><el-input v-model="form.courier"/></el-form-item><el-form-item label="运单号"><el-input v-model="form.tracking_no"/></el-form-item></div></el-form><template #footer><el-button :disabled="creating" @click="dialog=false">取消</el-button><el-button type="primary" :loading="creating" @click="save">保存</el-button></template></el-dialog>
<el-dialog v-model="feedbackDialog" title="记录样品反馈"><el-input v-model="feedback" type="textarea" :rows="6" placeholder="质量、规格、包装、价格、客户试用结论及下一步"/><template #footer><el-button :disabled="feedbackSaving" @click="feedbackDialog=false">取消</el-button><el-button type="primary" :loading="feedbackSaving" @click="saveFeedback">保存反馈</el-button></template></el-dialog>
</AppLayout></template>