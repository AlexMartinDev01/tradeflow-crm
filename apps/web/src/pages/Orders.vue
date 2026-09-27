<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,reactive,ref} from 'vue';
import {useRouter} from 'vue-router';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import TradeHero from '../components/TradeHero.vue';
import AttachmentsPanel from '../components/AttachmentsPanel.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();
if(!auth.user)auth.me().catch(()=>{});
const router=useRouter();

const canEdit=computed(()=>['admin','manager','sales'].includes(auth.user?.role));
const canPlanPayments=computed(()=>['admin','manager','sales','finance'].includes(auth.user?.role));
const canGenerateDocs=computed(()=>['admin','manager','sales','followup'].includes(auth.user?.role));

const rows=ref<any[]>([]);
const customers=ref<any[]>([]);
const users=ref<any[]>([]);
const payments=ref<any[]>([]);
const detail=ref<any>(null);
const selectedId=ref('');
const detailTab=ref('info');
const loading=ref(false);
const detailLoading=ref(false);
const actionBusy=ref('');
const createDialog=ref(false);
const itemDialog=ref(false);
const paymentPlanDialog=ref(false);

const filters=reactive<any>({status:'',keyword:'',dateRange:[]});
const createForm=reactive<any>({order_no:'',customer_id:'',customer_po:'',currency:'USD',incoterm:'FOB',payment_terms:'',requested_delivery:'',notes:''});
const paymentPlan=reactive<any>({deposit_percent:30,deposit_due:new Date().toISOString().slice(0,10),balance_due:''});
const item=reactive<any>({product_id:'',product_name:'',quantity:1,unit:'pcs',unit_price:0,amount:0,delivery_date:''});

const statusOptions=[
  {value:'pending',label:'待确认'},
  {value:'confirmed',label:'已确认'},
  {value:'production',label:'生产中'},
  {value:'ready',label:'待出运'},
  {value:'partial_shipped',label:'部分出运'},
  {value:'shipped',label:'已出运'},
  {value:'partial_delivered',label:'部分交付'},
  {value:'completed',label:'已完成'},
  {value:'cancelled',label:'已取消'}
];

const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
const customerById=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x])));
const userMap=computed(()=>Object.fromEntries(users.value.map(x=>[x.id,x.display_name||x.username||x.id])));

const filteredRows=computed(()=>{
  const keyword=String(filters.keyword||'').trim().toLowerCase();
  const range=Array.isArray(filters.dateRange)?filters.dateRange:[];
  return rows.value.filter(r=>{
    if(filters.status&&r.status!==filters.status)return false;
    if(keyword){
      const hay=[r.order_no,r.customer_po,customerMap.value[r.customer_id],r.incoterm,r.currency].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(keyword))return false;
    }
    const d=String(r.created_at||'').slice(0,10);
    if(range.length===2&&d&&(d<range[0]||d>range[1]))return false;
    return true;
  });
});

const summary=computed(()=>{
  const active=rows.value.filter(x=>!['completed','cancelled'].includes(x.status)).length;
  const waitingProduction=rows.value.filter(x=>['pending','confirmed'].includes(x.status)).length;
  const waitingShipment=rows.value.filter(x=>x.status==='ready').length;
  const waitingPayment=rows.value.filter(x=>paymentPercent(x)<100&&!['cancelled'].includes(x.status)).length;
  const completed=rows.value.filter(x=>x.status==='completed').length;
  return {active,waitingProduction,waitingShipment,waitingPayment,completed};
});

function rowClassName({row}:any){return row.id===selectedId.value?'selected-row':''}
function statusLabel(v:string){return statusOptions.find(x=>x.value===v)?.label||v||'-'}
function statusType(v:string){
  if(v==='completed')return 'success';
  if(v==='cancelled')return 'danger';
  if(['ready','partial_shipped'].includes(v))return 'warning';
  if(['production','shipped','partial_delivered'].includes(v))return 'primary';
  return 'info';
}
function ownerName(r:any){
  const c=customerById.value[r.customer_id];
  return c?.owner_id?userMap.value[c.owner_id]||'未分配':'未分配';
}
function productionProgress(r:any){
  return ({pending:0,confirmed:10,production:60,ready:100,partial_shipped:100,shipped:100,partial_delivered:100,completed:100,cancelled:0} as any)[r.status]??0;
}
function productionStep(v:string){
  return ({pending:0,confirmed:1,production:2,ready:3,partial_shipped:3,shipped:4,partial_delivered:4,completed:5,cancelled:0} as any)[v]??0;
}
function paymentPercent(r:any){
  const list=payments.value.filter(p=>p.order_id===r.id);
  const paid=list.filter(p=>p.paid_at||p.status==='paid'||p.status==='completed').reduce((s,p)=>s+Number(p.amount||0),0);
  const planned=list.reduce((s,p)=>s+Number(p.amount||0),0);
  const base=Math.max(Number(r.total||0),planned);
  return base?Math.min(100,Math.round(paid/base*100)):0;
}
function daysLeft(date:string){
  if(!date)return null;
  const t=new Date(date+'T00:00:00').getTime()-Date.now();
  return Math.ceil(t/86400000);
}
function newOrderNo(){
  const d=new Date();
  const date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('');
  return 'SO'+date+String(Date.now()).slice(-4);
}
function openCreate(){
  Object.assign(createForm,{order_no:newOrderNo(),customer_id:'',customer_po:'',currency:'USD',incoterm:'FOB',payment_terms:'',requested_delivery:'',notes:''});
  createDialog.value=true;
}
async function runBusy(key:string,fn:()=>Promise<any>){
  if(actionBusy.value)return;
  actionBusy.value=key;
  try{return await fn()}finally{actionBusy.value=''}
}
async function load(){
  loading.value=true;
  try{
    const [or,cr]=await Promise.all([api.get('/orders',{params:{size:200}}),api.get('/customers',{params:{size:300}})]);
    rows.value=or.data.data||[];
    customers.value=cr.data.data||[];
    try{payments.value=(await api.get('/payments',{params:{size:500}})).data.data||[]}catch{payments.value=[]}
    try{users.value=(await api.get('/users/lookup')).data||[]}catch{users.value=[]}
  }catch(e:any){
    ElMessage.error(e.response?.data?.message||'订单数据加载失败，请稍后重试');
  }finally{loading.value=false}
}
async function open(r:any){
  selectedId.value=r.id;
  detailLoading.value=true;
  detail.value=null;
  detailTab.value='info';
  try{detail.value=(await api.get('/workflows/orders/'+r.id+'/full')).data}
  catch(e:any){ElMessage.error(e.response?.data?.message||'订单详情加载失败')}
  finally{detailLoading.value=false}
}
async function refresh(){
  const id=detail.value?.id||selectedId.value;
  if(id)detail.value=(await api.get('/workflows/orders/'+id+'/full')).data;
  await load();
}
async function createOrder(){
  if(!createForm.customer_id)return ElMessage.warning('请选择客户');
  if(!createForm.order_no.trim())return ElMessage.warning('请输入订单号');
  await runBusy('create',async()=>{
    try{
      const {data}=await api.post('/orders',createForm);
      createDialog.value=false;
      await load();
      ElMessage.success('订单已创建');
      if(data?.id)await open(data);
    }catch(e:any){ElMessage.error(e.response?.data?.message||e.response?.data?.error||'订单创建失败')}
  });
}
async function saveHeader(){
  if(!detail.value)return;
  await runBusy('header',async()=>{
    try{
      const p={customer_po:detail.value.customer_po,incoterm:detail.value.incoterm,payment_terms:detail.value.payment_terms,requested_delivery:detail.value.requested_delivery,notes:detail.value.notes};
      await api.patch('/orders/'+detail.value.id,p);
      await refresh();
      ElMessage.success('订单信息已保存');
    }catch(e:any){ElMessage.error(e.response?.data?.message||'订单信息保存失败')}
  });
}
async function changeStatus(v:string){
  if(!detail.value)return;
  await runBusy('status',async()=>{
    try{
      await api.post('/workflows/orders/'+detail.value.id+'/status',{status:v});
      await refresh();
      ElMessage.success('订单状态已更新');
    }catch(e:any){ElMessage.error(e.response?.data?.message||'订单状态更新失败')}
  });
}
async function addItem(){
  if(!detail.value)return;
  if(!item.product_name.trim())return ElMessage.warning('请输入产品名称');
  item.amount=Number(item.quantity||0)*Number(item.unit_price||0);
  await api.post('/orderItems',{...item,order_id:detail.value.id});
  itemDialog.value=false;
  Object.assign(item,{product_id:'',product_name:'',quantity:1,unit:'pcs',unit_price:0,amount:0,delivery_date:''});
  await api.post('/workflows/orders/'+detail.value.id+'/recalculate',{});
  await refresh();
}
async function removeItem(r:any){
  await ElMessageBox.confirm('确认删除该订单明细？','确认');
  await api.delete('/orderItems/'+r.id);
  await api.post('/workflows/orders/'+detail.value.id+'/recalculate',{});
  await refresh();
}
async function createPaymentPlan(){
  if(!detail.value)return;
  await runBusy('payment',async()=>{
    try{
      await api.post('/workflows/orders/'+detail.value.id+'/payment-plan',paymentPlan);
      paymentPlanDialog.value=false;
      await refresh();
      ElMessage.success('定金/尾款计划已生成');
    }catch(e:any){ElMessage.error(e.response?.data?.error==='payment_plan_exists'?'该订单已经存在收款计划':(e.response?.data?.message||'生成失败'))}
  });
}
async function generateDoc(type:string){
  if(!detail.value)return;
  await runBusy('doc-'+type,async()=>{
    try{
      await api.post('/workflows/orders/'+detail.value.id+'/generate-document',{type});
      await refresh();
      ElMessage.success(type+' 已生成');
    }catch(e:any){ElMessage.error(e.response?.data?.message||type+' 生成失败')}
  });
}
async function previewDoc(d:any){
  const r=await api.get('/documents/'+d.id+'/preview',{responseType:'blob'});
  const u=URL.createObjectURL(r.data);window.open(u,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(u),60000);
}
async function downloadDoc(d:any){
  const r=await api.get('/documents/'+d.id+'/download',{responseType:'blob'});
  const u=URL.createObjectURL(r.data);const a=document.createElement('a');a.href=u;a.download=d.name||'document';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function exportOrders(){
  const list=filteredRows.value;
  const lines=[['订单号','客户','金额','币种','状态','交期'],...list.map(r=>[r.order_no,customerMap.value[r.customer_id]||'',r.total||0,r.currency||'',statusLabel(r.status),r.requested_delivery||''])];
  const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=u;a.download='orders.csv';a.click();URL.revokeObjectURL(u);
}
function handleEscape(e:KeyboardEvent){
  if(e.key==='Escape'&&detail.value){detail.value=null;selectedId.value=''}
}
onMounted(async()=>{window.addEventListener('keydown',handleEscape);await load();if(rows.value[0])await open(rows.value[0])});
onBeforeUnmount(()=>window.removeEventListener('keydown',handleEscape));
</script>

<template><AppLayout>
  <TradeHero title="订单执行" subtitle="跟踪订单全流程进度，管理产品生产、交付计划、回款计划及相关单据，确保订单按时、按质、按量完成。" slogan="从订单到交付&#10;让全球贸易更简单">
    <el-button v-if="canEdit" type="primary" @click="openCreate">＋ 新建订单</el-button>
    <el-button @click="exportOrders">导出订单</el-button>
  </TradeHero>

  <div class="kpi-grid five">
    <div class="kpi-card"><span class="kpi-icon ui-sprite sprite-order_active"></span><span class="kpi-copy"><span class="kpi-label">进行中订单</span><span class="kpi-main"><b class="kpi-value">{{summary.active}}</b></span><span class="kpi-hint">总订单 {{rows.length}} 单</span></span></div>
    <div class="kpi-card"><span class="kpi-icon ui-sprite sprite-order_production"></span><span class="kpi-copy"><span class="kpi-label">待生产</span><span class="kpi-main"><b class="kpi-value">{{summary.waitingProduction}}</b></span><span class="kpi-hint">待确认与已确认订单</span></span></div>
    <div class="kpi-card"><span class="kpi-icon ui-sprite sprite-order_shipment"></span><span class="kpi-copy"><span class="kpi-label">待出运</span><span class="kpi-main"><b class="kpi-value">{{summary.waitingShipment}}</b></span><span class="kpi-hint">生产完成等待安排</span></span></div>
    <div class="kpi-card"><span class="kpi-icon ui-sprite sprite-order_payment"></span><span class="kpi-copy"><span class="kpi-label">待收款</span><span class="kpi-main"><b class="kpi-value">{{summary.waitingPayment}}</b></span><span class="kpi-hint">按现有回款计划统计</span></span></div>
    <div class="kpi-card"><span class="kpi-icon ui-sprite sprite-order_complete"></span><span class="kpi-copy"><span class="kpi-label">已完成</span><span class="kpi-main"><b class="kpi-value">{{summary.completed}}</b></span><span class="kpi-hint">已完成订单</span></span></div>
  </div>

  <section class="order-filter-bar">
    <el-select v-model="filters.status" clearable placeholder="全部订单状态" class="order-status-filter">
      <el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/>
    </el-select>
    <el-date-picker v-model="filters.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="~"/>
    <el-input v-model="filters.keyword" clearable placeholder="搜索订单号、客户名称、客户PO..." class="order-search"/>
    <el-button type="primary">搜索</el-button>
    <span class="filter-spacer"></span>
    <el-button v-if="canEdit" type="primary" @click="openCreate">＋ 新建订单</el-button>
    <el-button @click="exportOrders">导出订单</el-button>
  </section>

  <div class="order-workbench" :class="{withDetail:detail||detailLoading}">
    <section class="card table-card order-list-panel">
      <el-table v-loading="loading" :data="filteredRows" empty-text="当前范围暂无订单" highlight-current-row :row-class-name="rowClassName" @row-click="open">
        <el-table-column prop="order_no" label="订单号" min-width="150"><template #default="s"><button class="order-link" type="button" @click.stop="open(s.row)">{{s.row.order_no}}</button></template></el-table-column>
        <el-table-column label="客户" min-width="170"><template #default="s"><b>{{customerMap[s.row.customer_id]||s.row.customer_id}}</b></template></el-table-column>
        <el-table-column label="订单金额" width="130"><template #default="s">{{s.row.currency}} {{Number(s.row.total||0).toLocaleString()}}</template></el-table-column>
        <el-table-column label="订单状态" width="110"><template #default="s"><el-tag :type="statusType(s.row.status)">{{statusLabel(s.row.status)}}</el-tag></template></el-table-column>
        <el-table-column label="生产进度" width="150"><template #default="s"><div class="progress-cell"><el-progress :percentage="productionProgress(s.row)" :stroke-width="7" :show-text="false"/><span>{{productionProgress(s.row)}}%</span></div></template></el-table-column>
        <el-table-column label="交期" width="120"><template #default="s"><div>{{s.row.requested_delivery||'-'}}</div><small v-if="daysLeft(s.row.requested_delivery)!=null" :class="{urgent:(daysLeft(s.row.requested_delivery)||0)<=14}">剩余 {{daysLeft(s.row.requested_delivery)}} 天</small></template></el-table-column>
        <el-table-column label="回款进度" width="145"><template #default="s"><div class="progress-cell"><el-progress :percentage="paymentPercent(s.row)" :stroke-width="7" :show-text="false"/><span>{{paymentPercent(s.row)}}%</span></div></template></el-table-column>
        <el-table-column label="负责人" width="105"><template #default="s">{{ownerName(s.row)}}</template></el-table-column>
        <el-table-column label="操作" width="62" fixed="right"><template #default="s"><el-button link type="primary" @click.stop="open(s.row)">详情</el-button></template></el-table-column>
      </el-table>
      <div class="list-footer">共 {{filteredRows.length}} 条记录</div>
    </section>

    <aside v-if="detail||detailLoading" class="order-detail-panel" role="dialog" aria-label="订单执行详情">
      <div v-loading="detailLoading" class="detail-panel-inner">
        <template v-if="detail">
          <div class="detail-top">
            <div><div class="detail-title-row"><h2>{{detail.order_no}}</h2><el-tag :type="statusType(detail.status)">{{statusLabel(detail.status)}}</el-tag></div><div class="detail-customer">{{detail.customer_name||customerMap[detail.customer_id]}}</div></div>
            <button type="button" class="detail-close" @click="detail=null;selectedId=''">×</button>
          </div>
          <div class="detail-meta"><span>下单日期 {{String(detail.created_at||'').slice(0,10)||'-'}}</span><span>交货日期 {{detail.requested_delivery||'-'}}</span><span v-if="daysLeft(detail.requested_delivery)!=null" class="urgent">剩余 {{daysLeft(detail.requested_delivery)}} 天</span></div>

          <el-tabs v-model="detailTab" class="detail-tabs">
            <el-tab-pane label="订单信息" name="info">
              <div class="detail-section-head"><b>基本信息</b><el-select v-if="canEdit" v-model="detail.status" size="small" style="width:126px" :loading="actionBusy==='status'" @change="changeStatus"><el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select></div>
              <div class="info-grid">
                <label>客户名称<strong>{{detail.customer_name||'-'}}</strong></label>
                <label>订单金额<strong>{{detail.currency}} {{Number(detail.total||0).toLocaleString()}}</strong></label>
                <label>客户PO<el-input v-model="detail.customer_po" size="small"/></label>
                <label>贸易条款<el-input v-model="detail.incoterm" size="small"/></label>
                <label class="span2">付款条件<el-input v-model="detail.payment_terms" size="small"/></label>
                <label class="span2">交货日期<el-input v-model="detail.requested_delivery" type="date" size="small"/></label>
              </div>
              <label class="notes-field">订单备注<el-input v-model="detail.notes" type="textarea" :rows="3"/></label>
              <el-button v-if="canEdit" type="primary" plain size="small" :loading="actionBusy==='header'" @click="saveHeader">保存订单信息</el-button>

              <div class="detail-section-head production-head"><b>生产进度</b></div>
              <el-steps :active="productionStep(detail.status)" finish-status="success" align-center>
                <el-step title="订单确认"/>
                <el-step title="生产排期"/>
                <el-step title="生产中"/>
                <el-step title="质检"/>
                <el-step title="完成"/>
              </el-steps>
              <div class="detail-actions">
                <el-button v-if="canEdit" type="primary" @click="detailTab='products'">更新进度</el-button>
                <el-button @click="router.push('/shipments')">生成出运单</el-button>
                <el-button @click="detailTab='docs'">上传/生成单据</el-button>
              </div>
            </el-tab-pane>

            <el-tab-pane label="产品明细" name="products">
              <div class="detail-section-head"><b>订单产品</b><el-button v-if="canEdit" type="primary" size="small" @click="itemDialog=true">＋ 添加产品</el-button></div>
              <el-table :data="detail.items" size="small"><el-table-column prop="product_name" label="产品" min-width="150"/><el-table-column prop="quantity" label="数量" width="75"/><el-table-column prop="unit" label="单位" width="65"/><el-table-column prop="amount" label="金额" width="100"/><el-table-column label="操作" width="55"><template #default="s"><el-button v-if="canEdit" link type="danger" @click="removeItem(s.row)">删除</el-button></template></el-table-column></el-table>
            </el-tab-pane>

            <el-tab-pane label="交付计划" name="delivery">
              <el-table :data="detail.shipments" size="small" empty-text="尚未创建出运批次"><el-table-column prop="booking_no" label="订舱号"/><el-table-column prop="carrier" label="船公司"/><el-table-column prop="etd" label="ETD"/><el-table-column prop="eta" label="ETA"/><el-table-column prop="status" label="状态"/></el-table>
            </el-tab-pane>

            <el-tab-pane label="回款计划" name="payments">
              <div class="detail-section-head"><b>回款计划</b><el-button v-if="canPlanPayments" size="small" type="primary" @click="paymentPlanDialog=true">生成计划</el-button></div>
              <el-table :data="detail.payments" size="small"><el-table-column prop="type" label="类型"/><el-table-column prop="amount" label="金额"/><el-table-column prop="due_at" label="应付日期"/><el-table-column prop="paid_at" label="到账日期"/><el-table-column prop="status" label="状态"/></el-table>
            </el-tab-pane>

            <el-tab-pane label="单据附件" name="docs">
              <div class="doc-actions" v-if="canGenerateDocs"><el-button size="small" @click="generateDoc('PI')">生成 PI</el-button><el-button size="small" @click="generateDoc('CI')">生成 CI</el-button><el-button size="small" @click="generateDoc('PL')">生成 PL</el-button><el-button size="small" @click="generateDoc('BL')">Draft BL</el-button><el-button size="small" @click="generateDoc('CO')">Draft CO</el-button></div>
              <el-table :data="detail.documents" size="small"><el-table-column prop="category" label="类别"/><el-table-column prop="name" label="名称" min-width="170"/><el-table-column label="操作" width="100"><template #default="s"><el-button link type="primary" @click="previewDoc(s.row)">预览</el-button><el-button link @click="downloadDoc(s.row)">下载</el-button></template></el-table-column></el-table>
              <div class="attachments-wrap"><AttachmentsPanel entity-type="order" :entity-id="detail.id" title="订单附件"/></div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </div>
    </aside>
  </div>

  <el-dialog v-model="createDialog" title="新建订单" width="760">
    <el-form label-position="top"><div class="create-order-grid">
      <el-form-item label="订单号"><el-input v-model="createForm.order_no"/></el-form-item>
      <el-form-item label="客户"><el-select v-model="createForm.customer_id" filterable style="width:100%"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item>
      <el-form-item label="客户PO"><el-input v-model="createForm.customer_po"/></el-form-item>
      <el-form-item label="币种"><el-select v-model="createForm.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','CNY','GBP','JPY']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
      <el-form-item label="贸易条款"><el-input v-model="createForm.incoterm"/></el-form-item>
      <el-form-item label="要求交期"><el-input v-model="createForm.requested_delivery" type="date"/></el-form-item>
      <el-form-item class="span2" label="付款条件"><el-input v-model="createForm.payment_terms"/></el-form-item>
      <el-form-item class="span2" label="备注"><el-input v-model="createForm.notes" type="textarea" :rows="3"/></el-form-item>
    </div></el-form>
    <template #footer><el-button @click="createDialog=false">取消</el-button><el-button type="primary" :loading="actionBusy==='create'" @click="createOrder">创建订单</el-button></template>
  </el-dialog>

  <el-dialog v-model="itemDialog" title="添加订单产品" width="650"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr">
    <el-form-item label="产品名称"><el-input v-model="item.product_name"/></el-form-item><el-form-item label="数量"><el-input v-model.number="item.quantity" type="number"/></el-form-item>
    <el-form-item label="单位"><el-input v-model="item.unit"/></el-form-item><el-form-item label="单价"><el-input v-model.number="item.unit_price" type="number"/></el-form-item>
    <el-form-item label="计划交期"><el-input v-model="item.delivery_date" type="date"/></el-form-item>
  </div></el-form><template #footer><el-button @click="itemDialog=false">取消</el-button><el-button type="primary" @click="addItem">添加并重算</el-button></template></el-dialog>

  <el-dialog v-model="paymentPlanDialog" title="生成定金/尾款计划" width="520"><el-form label-position="top">
    <el-form-item label="定金比例 %"><el-input-number v-model="paymentPlan.deposit_percent" :min="0" :max="100"/></el-form-item>
    <el-form-item label="定金到期日"><el-input v-model="paymentPlan.deposit_due" type="date"/></el-form-item>
    <el-form-item label="尾款到期日"><el-input v-model="paymentPlan.balance_due" type="date"/></el-form-item>
  </el-form><template #footer><el-button @click="paymentPlanDialog=false">取消</el-button><el-button type="primary" :loading="actionBusy==='payment'" @click="createPaymentPlan">生成计划</el-button></template></el-dialog>
</AppLayout></template>

<style scoped>
.order-filter-bar{display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #e2eaf4;border-radius:11px;padding:10px 11px;margin-bottom:11px}.order-status-filter{width:145px}.order-search{width:270px}.filter-spacer{flex:1}
.order-workbench{display:grid;grid-template-columns:minmax(0,1fr);gap:11px}.order-workbench.withDetail{grid-template-columns:minmax(0,1.55fr) minmax(360px,.65fr)}.order-list-panel{min-width:0}.selected-row td.el-table__cell{background:#edf5ff!important}.order-link{border:0;background:transparent;color:#1268f4;font-weight:750;padding:0;cursor:pointer}.progress-cell{display:flex;align-items:center;gap:7px}.progress-cell .el-progress{width:78px}.progress-cell span{font-size:10px;color:#72829a}.urgent{color:#ef334f!important}.list-footer{padding:9px 12px;color:#7f8da2;font-size:11px;border-top:1px solid #edf1f6}
.order-detail-panel{background:#fff;border:1px solid #e2eaf4;border-radius:11px;min-width:0;overflow:hidden}.detail-panel-inner{min-height:530px}.detail-top{display:flex;justify-content:space-between;gap:12px;padding:14px 15px 5px}.detail-title-row{display:flex;align-items:center;gap:9px}.detail-title-row h2{margin:0;font-size:18px}.detail-customer{font-size:12px;color:#596a84;margin-top:5px}.detail-close{border:0;background:transparent;color:#8b98aa;font-size:24px;cursor:pointer}.detail-meta{display:flex;gap:10px;flex-wrap:wrap;padding:5px 15px 6px;color:#71809a;font-size:10px;border-bottom:1px solid #edf1f6}.detail-tabs{padding:0 13px 13px}.detail-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 10px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.info-grid label,.notes-field{display:flex;flex-direction:column;gap:5px;font-size:10px;color:#8390a3}.info-grid strong{font-size:12px;color:#283a56}.info-grid .span2{grid-column:span 2}.notes-field{margin:10px 0}.production-head{margin-top:18px}.detail-actions{display:flex;gap:7px;margin-top:15px;flex-wrap:wrap}.doc-actions{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}.attachments-wrap{margin-top:12px}.create-order-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.create-order-grid .span2{grid-column:span 2}
@media(max-width:1200px){.order-workbench.withDetail{grid-template-columns:1fr}.order-detail-panel{order:-1}.order-search{width:220px}}
@media(max-width:760px){.order-filter-bar{flex-wrap:wrap}.order-status-filter,.order-search{width:100%}.filter-spacer{display:none}.kpi-grid.five{grid-template-columns:1fr 1fr}.info-grid,.create-order-grid{grid-template-columns:1fr}.info-grid .span2,.create-order-grid .span2{grid-column:span 1}}
</style>