<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const shipments=ref<any[]>([]),orders=ref<any[]>([]),customers=ref<any[]>([]),detail=ref<any>(null),drawer=ref(false),createDialog=ref(false),selectedOrder=ref<any>(null),orderFull=ref<any>(null);
const form=reactive<any>({order_id:'',booking_no:'',carrier:'',forwarder:'',vessel_voyage:'',bl_no:'',port_of_loading:'',destination_port:'',etd:'',eta:'',status:'booking',tracking_url:'',notes:'',items:[],containers:[{container_type:'40HQ',container_no:'',seal_no:''}]});
const orderMap=computed(()=>Object.fromEntries(orders.value.map(x=>[x.id,x.order_no])));
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x.name])));
const statuses=['booking','booked','stuffed','customs','departed','arrived','delivered'];

async function load(){shipments.value=(await api.get('/shipments',{params:{size:300}})).data.data;orders.value=(await api.get('/orders',{params:{size:300}})).data.data;customers.value=(await api.get('/customers',{params:{size:300}})).data.data}
async function chooseOrder(){
  if(!form.order_id){orderFull.value=null;return}
  orderFull.value=(await api.get(`/workflows/orders/${form.order_id}/full`)).data;
  form.items=(orderFull.value.items||[]).map((x:any)=>({order_item_id:x.id,product_name:x.product_name,unit:x.unit,ordered_quantity:x.quantity,quantity:0}));
}
function addContainer(){form.containers.push({container_type:'40HQ',container_no:'',seal_no:''})}
function removeContainer(i:number){form.containers.splice(i,1);if(!form.containers.length)addContainer()}
async function createShipment(){
  if(!form.order_id)return ElMessage.warning('请选择订单');
  const items=form.items.filter((x:any)=>Number(x.quantity||0)>0).map((x:any)=>({order_item_id:x.order_item_id,product_name:x.product_name,unit:x.unit,quantity:Number(x.quantity)}));
  if(!items.length)return ElMessage.warning('至少填写一个本次出货数量');
  await api.post(`/workflows/orders/${form.order_id}/shipments`,{...form,items,containers:form.containers.filter((x:any)=>x.container_no||x.container_type)});
  createDialog.value=false;Object.assign(form,{order_id:'',booking_no:'',carrier:'',forwarder:'',vessel_voyage:'',bl_no:'',port_of_loading:'',destination_port:'',etd:'',eta:'',status:'booking',tracking_url:'',notes:'',items:[],containers:[{container_type:'40HQ',container_no:'',seal_no:''}]});await load();ElMessage.success('出运批次已创建')
}
async function open(r:any){detail.value=(await api.get(`/workflows/shipments/${r.id}/full`)).data;drawer.value=true}
async function changeStatus(v:string){const {data}=await api.post(`/workflows/shipments/${detail.value.id}/status`,{status:v});detail.value={...detail.value,...data.shipment};await load();ElMessage.success(`出运状态已更新；订单已出货 ${data.summary.shipped}/${data.summary.ordered}`)}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">出运执行</h2><span class="muted">分批出货、多货柜、ETD/ETA、BL 和物流状态</span></div><el-button type="primary" @click="createDialog=true">新建出运批次</el-button></div>
<div class="card"><el-table :data="shipments" @row-dblclick="open">
<el-table-column label="订单" width="180"><template #default="s">{{orderMap[s.row.order_id]||s.row.order_id}}</template></el-table-column>
<el-table-column prop="booking_no" label="订舱号"/><el-table-column prop="carrier" label="船公司"/><el-table-column prop="forwarder" label="货代"/><el-table-column prop="vessel_voyage" label="船名/航次"/>
<el-table-column prop="bl_no" label="BL"/><el-table-column prop="etd" label="ETD"/><el-table-column prop="eta" label="ETA"/><el-table-column prop="status" label="状态"/>
<el-table-column label="操作" width="80"><template #default="s"><el-button link type="primary" @click="open(s.row)">详情</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="createDialog" title="新建出运批次" width="900"><el-form label-position="top">
<div class="grid" style="grid-template-columns:repeat(3,1fr)">
<el-form-item label="订单"><el-select v-model="form.order_id" filterable style="width:100%" @change="chooseOrder"><el-option v-for="o in orders" :key="o.id" :label="`${o.order_no} · ${customerMap[o.customer_id]||''}`" :value="o.id"/></el-select></el-form-item>
<el-form-item label="订舱号"><el-input v-model="form.booking_no"/></el-form-item><el-form-item label="船公司"><el-input v-model="form.carrier"/></el-form-item>
<el-form-item label="货代"><el-input v-model="form.forwarder"/></el-form-item><el-form-item label="船名/航次"><el-input v-model="form.vessel_voyage"/></el-form-item><el-form-item label="提单号"><el-input v-model="form.bl_no"/></el-form-item>
<el-form-item label="起运港"><el-input v-model="form.port_of_loading"/></el-form-item><el-form-item label="目的港"><el-input v-model="form.destination_port"/></el-form-item>
<el-form-item label="ETD"><el-input v-model="form.etd" type="date"/></el-form-item><el-form-item label="ETA"><el-input v-model="form.eta" type="date"/></el-form-item>
</div>
<template v-if="orderFull"><h4>本次出货产品</h4><el-table :data="form.items"><el-table-column prop="product_name" label="产品"/><el-table-column prop="ordered_quantity" label="订单数量"/><el-table-column prop="unit" label="单位"/><el-table-column label="本次出货"><template #default="s"><el-input-number v-model="s.row.quantity" :min="0" :max="Number(s.row.ordered_quantity||0)"/></template></el-table-column></el-table></template>
<h4 style="margin-top:18px">货柜</h4><div v-for="(c,i) in form.containers" :key="i" class="grid" style="grid-template-columns:1fr 1fr 1fr auto;margin-bottom:8px"><el-select v-model="c.container_type"><el-option v-for="x in ['20GP','40GP','40HQ','45HQ','LCL']" :key="x" :label="x" :value="x"/></el-select><el-input v-model="c.container_no" placeholder="柜号"/><el-input v-model="c.seal_no" placeholder="封条号"/><el-button @click="removeContainer(i)">删除</el-button></div><el-button link type="primary" @click="addContainer">+ 添加货柜</el-button>
<el-form-item label="物流跟踪链接"><el-input v-model="form.tracking_url"/></el-form-item><el-form-item label="备注"><el-input v-model="form.notes" type="textarea"/></el-form-item>
</el-form><template #footer><el-button @click="createDialog=false">取消</el-button><el-button type="primary" @click="createShipment">创建出运批次</el-button></template></el-dialog>

<el-drawer v-model="drawer" size="72%" title="出运批次详情"><template v-if="detail">
<div class="toolbar"><div><h3>{{detail.booking_no||detail.id}}</h3><span class="muted">{{detail.order_no}} · {{detail.carrier}} {{detail.vessel_voyage}}</span></div><el-select v-model="detail.status" style="width:170px" @change="changeStatus"><el-option v-for="x in statuses" :key="x" :label="x" :value="x"/></el-select></div>
<el-descriptions :column="3" border><el-descriptions-item label="提单号">{{detail.bl_no||'-'}}</el-descriptions-item><el-descriptions-item label="起运港">{{detail.port_of_loading||'-'}}</el-descriptions-item><el-descriptions-item label="目的港">{{detail.destination_port||'-'}}</el-descriptions-item><el-descriptions-item label="ETD">{{detail.etd||'-'}}</el-descriptions-item><el-descriptions-item label="ETA">{{detail.eta||'-'}}</el-descriptions-item><el-descriptions-item label="货代">{{detail.forwarder||'-'}}</el-descriptions-item></el-descriptions>
<h4>本批次产品</h4><el-table :data="detail.items"><el-table-column prop="product_name" label="产品"/><el-table-column prop="quantity" label="数量"/><el-table-column prop="unit" label="单位"/></el-table>
<h4>货柜</h4><el-table :data="detail.containers"><el-table-column prop="container_type" label="柜型"/><el-table-column prop="container_no" label="柜号"/><el-table-column prop="seal_no" label="封条号"/></el-table>
</template></el-drawer>
</AppLayout></template>