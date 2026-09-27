<script setup lang="ts">
import {computed,onMounted,reactive,ref} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import TradeHero from '../components/TradeHero.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();
if(!auth.user)auth.me().catch(()=>{});
const canEdit=computed(()=>['admin','manager','sales'].includes(auth.user?.role));

const shipments=ref<any[]>([]);
const orders=ref<any[]>([]);
const customers=ref<any[]>([]);
const detail=ref<any>(null);
const selectedId=ref('');
const detailTab=ref('basic');
const createDialog=ref(false);
const orderFull=ref<any>(null);
const loading=ref(false);
const orderLoading=ref(false);
const detailLoading=ref(false);
const creating=ref(false);
const statusUpdating=ref(false);

const filters=reactive<any>({status:'',carrier:'',destination:'',keyword:'',dateRange:[]});
const form=reactive<any>({order_id:'',booking_no:'',carrier:'',forwarder:'',vessel_voyage:'',bl_no:'',port_of_loading:'',destination_port:'',etd:'',eta:'',status:'booking',tracking_url:'',notes:'',items:[],containers:[{container_type:'40HQ',container_no:'',seal_no:''}]});

const statusOptions=[
  {value:'booking',label:'待订舱'},
  {value:'booked',label:'已订舱'},
  {value:'stuffed',label:'已装柜'},
  {value:'customs',label:'待报关'},
  {value:'departed',label:'在途中'},
  {value:'arrived',label:'已到港'},
  {value:'delivered',label:'已签收'}
];
const orderMap=computed(()=>Object.fromEntries(orders.value.map(x=>[x.id,x.order_no])));
const orderById=computed(()=>Object.fromEntries(orders.value.map(x=>[x.id,x])));
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
const carriers=computed(()=>[...new Set(shipments.value.map(x=>x.carrier).filter(Boolean))].sort());
const destinations=computed(()=>[...new Set(shipments.value.map(x=>x.destination_port).filter(Boolean))].sort());

const filteredShipments=computed(()=>{
  const keyword=String(filters.keyword||'').trim().toLowerCase();
  const range=Array.isArray(filters.dateRange)?filters.dateRange:[];
  return shipments.value.filter(s=>{
    if(filters.status&&s.status!==filters.status)return false;
    if(filters.carrier&&s.carrier!==filters.carrier)return false;
    if(filters.destination&&s.destination_port!==filters.destination)return false;
    if(keyword){
      const hay=[orderMap.value[s.order_id],s.booking_no,s.carrier,s.forwarder,s.vessel_voyage,s.bl_no,s.destination_port].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(keyword))return false;
    }
    const d=String(s.created_at||'').slice(0,10);
    if(range.length===2&&d&&(d<range[0]||d>range[1]))return false;
    return true;
  });
});

const summary=computed(()=>{
  const now=Date.now();
  const week=shipments.value.filter(x=>{
    const t=new Date(x.created_at||0).getTime();
    return Number.isFinite(t)&&now-t<=7*86400000;
  }).length;
  return {
    week,
    booking:shipments.value.filter(x=>x.status==='booking').length,
    customs:shipments.value.filter(x=>x.status==='customs').length,
    transit:shipments.value.filter(x=>['departed','arrived'].includes(x.status)).length,
    delivered:shipments.value.filter(x=>x.status==='delivered').length
  };
});

function statusLabel(v:string){return statusOptions.find(x=>x.value===v)?.label||v||'-'}
function statusType(v:string){
  if(v==='delivered')return 'success';
  if(v==='customs'||v==='booking')return 'warning';
  if(v==='departed'||v==='arrived'||v==='booked')return 'primary';
  return 'info';
}
function customerNameForShipment(s:any){
  const order=orderById.value[s.order_id];
  return order?customerMap.value[order.customer_id]||'-':'-';
}
async function load(){
  loading.value=true;
  try{
    const [s,o,c]=await Promise.all([
      api.get('/shipments',{params:{size:300}}),
      api.get('/orders',{params:{size:300}}),
      api.get('/customers',{params:{size:300}})
    ]);
    shipments.value=s.data.data||[];
    orders.value=o.data.data||[];
    customers.value=c.data.data||[];
  }catch(e:any){
    ElMessage.error(e.response?.data?.message||'出运数据加载失败，请稍后重试');
  }finally{loading.value=false}
}
async function chooseOrder(){
  if(!form.order_id){orderFull.value=null;form.items=[];return}
  orderLoading.value=true;
  try{
    orderFull.value=(await api.get('/workflows/orders/'+form.order_id+'/full')).data;
    form.items=(orderFull.value.items||[]).map((x:any)=>({
      order_item_id:x.id,product_name:x.product_name,unit:x.unit,
      ordered_quantity:Number(x.quantity||0),allocated_quantity:Number(x.allocated_quantity||0),
      remaining_quantity:Number(x.remaining_quantity??x.quantity??0),quantity:0
    }));
  }catch(e:any){
    orderFull.value=null;form.items=[];ElMessage.error(e.response?.data?.message||'订单出运数据加载失败');
  }finally{orderLoading.value=false}
}
function addContainer(){form.containers.push({container_type:'40HQ',container_no:'',seal_no:''})}
function removeContainer(i:string|number){form.containers.splice(Number(i),1);if(!form.containers.length)addContainer()}
function resetForm(){
  Object.assign(form,{order_id:'',booking_no:'',carrier:'',forwarder:'',vessel_voyage:'',bl_no:'',port_of_loading:'',destination_port:'',etd:'',eta:'',status:'booking',tracking_url:'',notes:'',items:[],containers:[{container_type:'40HQ',container_no:'',seal_no:''}]});
  orderFull.value=null;
}
async function createShipment(){
  if(!form.order_id)return ElMessage.warning('请选择订单');
  const items=form.items.filter((x:any)=>Number(x.quantity||0)>0).map((x:any)=>({order_item_id:x.order_item_id,product_name:x.product_name,unit:x.unit,quantity:Number(x.quantity)}));
  if(!items.length)return ElMessage.warning('至少填写一个本次出货数量');
  creating.value=true;
  try{
    const {data}=await api.post('/workflows/orders/'+form.order_id+'/shipments',{...form,items,containers:form.containers.filter((x:any)=>x.container_no||x.container_type)});
    createDialog.value=false;
    resetForm();
    await load();
    ElMessage.success('出运批次已创建');
    if(data?.id)await open(data);
  }catch(e:any){
    const data=e.response?.data||{};
    if(data.error==='shipment_quantity_exceeds_order'){
      ElMessage.error('出货数量超过剩余可出数量：订单 '+data.ordered+'，已分配 '+data.already_allocated+'，本次最多可出 '+data.remaining);
      await chooseOrder();
    }else if(data.error==='shipment_item_not_in_order'){
      ElMessage.error('出运明细与当前订单不匹配，请重新选择订单后再提交');
      await chooseOrder();
    }else ElMessage.error(data.message||'出运批次创建失败，请检查输入后重试');
  }finally{creating.value=false}
}
async function open(r:any){
  selectedId.value=r.id;
  detail.value=null;
  detailLoading.value=true;
  detailTab.value='basic';
  try{detail.value=(await api.get('/workflows/shipments/'+r.id+'/full')).data}
  catch(e:any){ElMessage.error(e.response?.data?.message||'出运详情加载失败')}
  finally{detailLoading.value=false}
}
async function changeStatus(v:string){
  if(!detail.value)return;
  statusUpdating.value=true;
  try{
    const {data}=await api.post('/workflows/shipments/'+detail.value.id+'/status',{status:v});
    detail.value={...detail.value,...data.shipment};
    await load();
    ElMessage.success('出运状态已更新；订单已出货 '+data.summary.shipped+'/'+data.summary.ordered);
  }catch(e:any){ElMessage.error(e.response?.data?.message||'出运状态更新失败')}
  finally{statusUpdating.value=false}
}
function exportCsv(){
  const lines=[['订单号','订舱号','船公司','货代','船名/航次','提单号','ETD','ETA','状态'],...filteredShipments.value.map(s=>[
    orderMap.value[s.order_id]||'',s.booking_no||'',s.carrier||'',s.forwarder||'',s.vessel_voyage||'',s.bl_no||'',s.etd||'',s.eta||'',statusLabel(s.status)
  ])];
  const csv='\ufeff'+lines.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=u;a.download='shipments.csv';a.click();URL.revokeObjectURL(u);
}
function openTracking(){
  if(detail.value?.tracking_url)window.open(detail.value.tracking_url,'_blank','noopener,noreferrer');
  else ElMessage.info('请先选择带有物流跟踪链接的出运批次');
}
onMounted(async()=>{await load();if(shipments.value[0])await open(shipments.value[0])});
</script>

<template><AppLayout>
  <TradeHero title="出运执行" subtitle="管理订舱、货柜、报关、ETD、ETA、提单及物流进度，确保订单按时安全交付。" slogan="让中国好产品&#10;走向全球市场">
    <el-button v-if="canEdit" type="primary" @click="createDialog=true">＋ 新建出运批次</el-button>
    <el-button @click="exportCsv">导出</el-button>
    <el-button @click="openTracking">物流跟踪</el-button>
  </TradeHero>

  <div class="kpi-grid five">
    <div class="kpi-card"><span class="kpi-icon blue">♨</span><span class="kpi-copy"><span class="kpi-label">本周出运批次</span><span class="kpi-main"><b class="kpi-value">{{summary.week}}</b></span><span class="kpi-hint">近 7 天创建批次</span></span></div>
    <div class="kpi-card"><span class="kpi-icon orange">▣</span><span class="kpi-copy"><span class="kpi-label">待订舱</span><span class="kpi-main"><b class="kpi-value">{{summary.booking}}</b></span><span class="kpi-hint">等待安排订舱</span></span></div>
    <div class="kpi-card"><span class="kpi-icon purple">⚓</span><span class="kpi-copy"><span class="kpi-label">待报关</span><span class="kpi-main"><b class="kpi-value">{{summary.customs}}</b></span><span class="kpi-hint">报关流程处理中</span></span></div>
    <div class="kpi-card"><span class="kpi-icon blue">▰</span><span class="kpi-copy"><span class="kpi-label">在途批次</span><span class="kpi-main"><b class="kpi-value">{{summary.transit}}</b></span><span class="kpi-hint">离港或已到港</span></span></div>
    <div class="kpi-card"><span class="kpi-icon green">✓</span><span class="kpi-copy"><span class="kpi-label">已交付</span><span class="kpi-main"><b class="kpi-value">{{summary.delivered}}</b></span><span class="kpi-hint">完成签收批次</span></span></div>
  </div>

  <div class="shipment-workbench">
    <section class="card shipment-list-panel">
      <div class="shipment-panel-head">
        <h2>出运批次列表</h2>
        <div class="shipment-filters">
          <el-select v-model="filters.status" clearable placeholder="全部状态"><el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select>
          <el-select v-model="filters.carrier" clearable filterable placeholder="全部船公司"><el-option v-for="x in carriers" :key="x" :label="x" :value="x"/></el-select>
          <el-select v-model="filters.destination" clearable filterable placeholder="全部目的港"><el-option v-for="x in destinations" :key="x" :label="x" :value="x"/></el-select>
          <el-date-picker v-model="filters.dateRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="~"/>
          <el-input v-model="filters.keyword" clearable placeholder="搜索订单号、提单号、船名等..." class="shipment-search"/>
        </div>
      </div>

      <el-table v-loading="loading" :data="filteredShipments" empty-text="当前范围暂无出运批次" :row-class-name="({row}:any)=>row.id===selectedId?'selected-row':''" @row-click="open">
        <el-table-column label="订单号" min-width="145"><template #default="s"><button class="shipment-link" type="button" @click.stop="open(s.row)">{{orderMap[s.row.order_id]||s.row.order_id}}</button></template></el-table-column>
        <el-table-column prop="booking_no" label="订舱号" min-width="120"/>
        <el-table-column prop="carrier" label="船公司" width="100"/>
        <el-table-column prop="forwarder" label="货代" min-width="120"/>
        <el-table-column prop="vessel_voyage" label="船名 / 航次" min-width="145" show-overflow-tooltip/>
        <el-table-column prop="bl_no" label="提单号" min-width="130" show-overflow-tooltip/>
        <el-table-column prop="etd" label="ETD" width="88"/>
        <el-table-column prop="eta" label="ETA" width="88"/>
        <el-table-column label="状态" width="96"><template #default="s"><el-tag :type="statusType(s.row.status)">{{statusLabel(s.row.status)}}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="72" fixed="right"><template #default="s"><el-button link type="primary" @click.stop="open(s.row)">查看</el-button></template></el-table-column>
      </el-table>
      <div class="shipment-footer">共 {{filteredShipments.length}} 条记录</div>
    </section>

    <aside class="shipment-detail-panel">
      <div v-loading="detailLoading" class="shipment-detail-inner">
        <template v-if="detail">
          <div class="shipment-detail-top">
            <div><div class="shipment-title-row"><h2>{{detail.order_no||orderMap[detail.order_id]}}</h2><el-tag :type="statusType(detail.status)">{{statusLabel(detail.status)}}</el-tag></div><div class="shipment-customer">{{customerMap[detail.customer_id]||customerNameForShipment(detail)}}</div></div>
            <button type="button" class="detail-close" @click="detail=null;selectedId=''">×</button>
          </div>

          <el-tabs v-model="detailTab" class="shipment-tabs">
            <el-tab-pane label="基本信息" name="basic">
              <div class="shipment-basic-grid">
                <label>订单号<strong>{{detail.order_no||'-'}}</strong></label>
                <label>订舱号<strong>{{detail.booking_no||'-'}}</strong></label>
                <label>客户名称<strong>{{customerMap[detail.customer_id]||'-'}}</strong></label>
                <label>船公司<strong>{{detail.carrier||'-'}}</strong></label>
                <label>起运港<strong>{{detail.port_of_loading||'-'}}</strong></label>
                <label>目的港<strong>{{detail.destination_port||'-'}}</strong></label>
                <label>ETD<strong>{{detail.etd||'-'}}</strong></label>
                <label>ETA<strong>{{detail.eta||'-'}}</strong></label>
                <label>货代<strong>{{detail.forwarder||'-'}}</strong></label>
                <label>船名/航次<strong>{{detail.vessel_voyage||'-'}}</strong></label>
                <label class="span2">提单号<strong>{{detail.bl_no||'-'}}</strong></label>
                <label class="span2">出运备注<strong>{{detail.notes||'-'}}</strong></label>
              </div>
              <div class="shipment-status-row">
                <span>当前状态</span>
                <el-select v-if="canEdit" v-model="detail.status" size="small" :loading="statusUpdating" style="width:140px" @change="changeStatus"><el-option v-for="x in statusOptions" :key="x.value" :label="x.label" :value="x.value"/></el-select>
                <el-tag v-else :type="statusType(detail.status)">{{statusLabel(detail.status)}}</el-tag>
              </div>
            </el-tab-pane>

            <el-tab-pane label="本批次产品" name="items">
              <div class="detail-section-title">本批次产品（{{detail.items?.length||0}}）</div>
              <el-table :data="detail.items" size="small"><el-table-column prop="product_name" label="产品名称" min-width="160"/><el-table-column prop="quantity" label="数量" width="85"/><el-table-column prop="unit" label="单位" width="70"/></el-table>
            </el-tab-pane>

            <el-tab-pane label="货柜信息" name="containers">
              <div class="detail-section-title">货柜信息（{{detail.containers?.length||0}}）</div>
              <el-table :data="detail.containers" size="small"><el-table-column prop="container_type" label="柜型"/><el-table-column prop="container_no" label="柜号" min-width="130"/><el-table-column prop="seal_no" label="封条号" min-width="110"/></el-table>
            </el-tab-pane>

            <el-tab-pane label="港口与时间" name="ports">
              <div class="timeline-card">
                <div><span>起运港</span><b>{{detail.port_of_loading||'-'}}</b><small>ETD {{detail.etd||'-'}}</small></div>
                <div class="route-line">→</div>
                <div><span>目的港</span><b>{{detail.destination_port||'-'}}</b><small>ETA {{detail.eta||'-'}}</small></div>
              </div>
            </el-tab-pane>

            <el-tab-pane label="物流轨迹" name="tracking">
              <div class="tracking-box">
                <b>物流跟踪链接</b>
                <p>{{detail.tracking_url||'当前批次暂未录入物流跟踪链接'}}</p>
                <el-button v-if="detail.tracking_url" type="primary" @click="openTracking">打开物流跟踪</el-button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
        <el-empty v-else description="选择一个出运批次查看详情"/>
      </div>
    </aside>
  </div>

  <el-dialog v-model="createDialog" title="新建出运批次" width="900">
    <el-form label-position="top" v-loading="orderLoading">
      <div class="shipment-create-grid">
        <el-form-item label="订单"><el-select v-model="form.order_id" filterable style="width:100%" @change="chooseOrder"><el-option v-for="o in orders" :key="o.id" :label="o.order_no+' · '+(customerMap[o.customer_id]||'')" :value="o.id"/></el-select></el-form-item>
        <el-form-item label="订舱号"><el-input v-model="form.booking_no"/></el-form-item>
        <el-form-item label="船公司"><el-input v-model="form.carrier"/></el-form-item>
        <el-form-item label="货代"><el-input v-model="form.forwarder"/></el-form-item>
        <el-form-item label="船名/航次"><el-input v-model="form.vessel_voyage"/></el-form-item>
        <el-form-item label="提单号"><el-input v-model="form.bl_no"/></el-form-item>
        <el-form-item label="起运港"><el-input v-model="form.port_of_loading"/></el-form-item>
        <el-form-item label="目的港"><el-input v-model="form.destination_port"/></el-form-item>
        <el-form-item label="ETD"><el-input v-model="form.etd" type="date"/></el-form-item>
        <el-form-item label="ETA"><el-input v-model="form.eta" type="date"/></el-form-item>
      </div>

      <template v-if="orderFull">
        <h4>本次出货产品</h4>
        <el-table :data="form.items">
          <el-table-column prop="product_name" label="产品"/>
          <el-table-column prop="ordered_quantity" label="订单数量" width="100"/>
          <el-table-column prop="allocated_quantity" label="已分配出运" width="110"/>
          <el-table-column prop="remaining_quantity" label="剩余可出" width="100"><template #default="s"><b>{{s.row.remaining_quantity}}</b></template></el-table-column>
          <el-table-column prop="unit" label="单位" width="80"/>
          <el-table-column label="本次出货" width="190"><template #default="s"><el-input-number v-model="s.row.quantity" :min="0" :max="Number(s.row.remaining_quantity||0)" :disabled="Number(s.row.remaining_quantity||0)<=0"/></template></el-table-column>
        </el-table>
        <el-alert v-if="form.items.some((x:any)=>Number(x.remaining_quantity||0)<=0)" type="info" :closable="false" title="剩余可出为 0 的订单明细已全部分配到已有出运批次，不能重复出运。" style="margin-top:10px"/>
      </template>

      <h4 style="margin-top:18px">货柜</h4>
      <div v-for="(c,i) in form.containers" :key="i" class="container-editor-row">
        <el-select v-model="c.container_type"><el-option v-for="x in ['20GP','40GP','40HQ','45HQ','LCL']" :key="x" :label="x" :value="x"/></el-select>
        <el-input v-model="c.container_no" placeholder="柜号"/>
        <el-input v-model="c.seal_no" placeholder="封条号"/>
        <el-button @click="removeContainer(i)">删除</el-button>
      </div>
      <el-button link type="primary" @click="addContainer">＋ 添加货柜</el-button>
      <el-form-item label="物流跟踪链接"><el-input v-model="form.tracking_url"/></el-form-item>
      <el-form-item label="备注"><el-input v-model="form.notes" type="textarea"/></el-form-item>
    </el-form>
    <template #footer><el-button @click="createDialog=false">取消</el-button><el-button type="primary" :loading="creating" @click="createShipment">创建出运批次</el-button></template>
  </el-dialog>
</AppLayout></template>

<style scoped>
.shipment-workbench{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(380px,.75fr);gap:11px}.shipment-list-panel{padding:0;overflow:hidden}.shipment-panel-head{padding:13px 13px 10px;border-bottom:1px solid #edf1f6}.shipment-panel-head h2{font-size:17px;margin:0 0 10px}.shipment-filters{display:grid;grid-template-columns:110px 120px 130px minmax(245px,1fr) minmax(220px,1fr);gap:7px}.shipment-search{min-width:0}.selected-row td.el-table__cell{background:#edf5ff!important}.shipment-link{border:0;background:transparent;color:#1268f4;font-weight:750;padding:0;cursor:pointer}.shipment-footer{padding:9px 12px;color:#7f8da2;font-size:11px;border-top:1px solid #edf1f6}
.shipment-detail-panel{background:#fff;border:1px solid #e2eaf4;border-radius:11px;min-width:0;overflow:hidden}.shipment-detail-inner{min-height:570px}.shipment-detail-top{display:flex;justify-content:space-between;gap:10px;padding:14px 14px 7px}.shipment-title-row{display:flex;align-items:center;gap:8px}.shipment-title-row h2{margin:0;font-size:18px}.shipment-customer{font-size:11px;color:#71809a;margin-top:5px}.detail-close{border:0;background:transparent;color:#8391a5;font-size:24px;cursor:pointer}.shipment-tabs{padding:0 13px 13px}.shipment-basic-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;padding:6px 2px 12px}.shipment-basic-grid label{display:flex;flex-direction:column;gap:4px;color:#8190a4;font-size:10px}.shipment-basic-grid strong{font-size:12px;color:#2f415d;font-weight:650}.shipment-basic-grid .span2{grid-column:span 2}.shipment-status-row{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #edf1f6;padding-top:12px;color:#61718a;font-size:11px}.detail-section-title{font-size:14px;font-weight:750;margin:4px 0 10px}.timeline-card{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:15px;padding:18px;border:1px solid #e5ecf4;border-radius:10px;background:#f8fbff}.timeline-card>div:not(.route-line){display:flex;flex-direction:column;gap:4px}.timeline-card span,.timeline-card small{font-size:10px;color:#7d8ba0}.timeline-card b{font-size:13px;color:#233754}.route-line{font-size:26px;color:#5b8ee8}.tracking-box{padding:16px;border:1px solid #e5ecf4;border-radius:10px;background:#f8fbff}.tracking-box p{font-size:12px;color:#66758b;word-break:break-all}
.shipment-create-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0 14px}.container-editor-row{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;margin-bottom:8px}
@media(max-width:1280px){.shipment-workbench{grid-template-columns:1fr}.shipment-detail-panel{order:-1}.shipment-filters{grid-template-columns:repeat(3,1fr)}.shipment-filters>*:nth-child(4),.shipment-filters>*:nth-child(5){grid-column:span 1}}
@media(max-width:760px){.shipment-filters{grid-template-columns:1fr}.shipment-create-grid{grid-template-columns:1fr}.container-editor-row{grid-template-columns:1fr}.shipment-basic-grid{grid-template-columns:1fr}.shipment-basic-grid .span2{grid-column:span 1}}
</style>