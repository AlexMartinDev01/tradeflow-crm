<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import AttachmentsPanel from '../components/AttachmentsPanel.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const rows=ref<any[]>([]),orders=ref<any[]>([]),customers=ref<any[]>([]),detail=ref<any>(null),orderFull=ref<any>(null);
const dialog=ref(false),drawer=ref(false),loading=ref(false),saving=ref(false),syncProductMaster=ref(true);
const form=reactive<any>({order_id:'',shipment_id:'',export_country:'China',destination_country:'',customs_office:'',declaration_date:new Date().toISOString().slice(0,10),trade_mode:'General Trade',incoterm:'',currency:'USD',notes:''});
const statuses=['draft','reviewed','ready','submitted','cleared','rejected'];
const orderMap=computed(()=>Object.fromEntries(orders.value.map((x:any)=>[x.id,x])));
const customerMap=computed(()=>Object.fromEntries(customers.value.map((x:any)=>[x.id,x.name])));
const canEdit=computed(()=>['admin','manager','sales'].includes(auth.user?.role));

async function load(){
  loading.value=true;
  try{
    const [d,o,c]=await Promise.all([api.get('/customs-declarations'),api.get('/orders',{params:{size:300}}),api.get('/customers',{params:{size:300}})]);
    rows.value=d.data;orders.value=o.data.data;customers.value=c.data.data;
  }finally{loading.value=false}
}
async function chooseOrder(){
  if(!form.order_id){orderFull.value=null;return}
  orderFull.value=(await api.get(`/workflows/orders/${form.order_id}/full`)).data;
  const order=orderMap.value[form.order_id];
  form.destination_country=customerMap.value[order?.customer_id]?'':form.destination_country;
  form.incoterm=order?.incoterm||'';
  form.currency=order?.currency||'USD';
  form.shipment_id='';
}
async function createDeclaration(){
  if(!form.order_id)return ElMessage.warning('请选择订单');
  const {data}=await api.post(`/workflows/orders/${form.order_id}/customs-declaration`,form);
  dialog.value=false;await load();await open(data);ElMessage.success('报关草稿已创建');
}
async function open(r:any){detail.value=(await api.get(`/workflows/customs/${r.id}/full`)).data;drawer.value=true}
async function refresh(){if(detail.value)detail.value=(await api.get(`/workflows/customs/${detail.value.id}/full`)).data;await load()}
async function save(){
  saving.value=true;
  try{
    await api.put(`/workflows/customs/${detail.value.id}`,{
      export_country:detail.value.export_country,destination_country:detail.value.destination_country,customs_office:detail.value.customs_office,
      declaration_date:detail.value.declaration_date,trade_mode:detail.value.trade_mode,incoterm:detail.value.incoterm,currency:detail.value.currency,
      notes:detail.value.notes,items:detail.value.items,sync_product_master:syncProductMaster.value
    });
    await refresh();ElMessage.success('报关资料已保存');
  }finally{saving.value=false}
}
async function changeStatus(value:any){
  await api.post(`/workflows/customs/${detail.value.id}/status`,{status:String(value)});
  await refresh();ElMessage.success('状态已记录（仅系统内部状态，不代表海关实际回执）');
}
async function generateSheet(){
  const {data}=await api.post(`/workflows/customs/${detail.value.id}/generate-data-sheet`,{});
  const r=await api.get(`/documents/${data.id}/preview`,{responseType:'blob'});
  const url=URL.createObjectURL(r.data);window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),60000);
  await refresh();ElMessage.success('内部报关数据表已生成');
}
function statusType(v:string){return v==='cleared'?'success':v==='rejected'?'danger':v==='ready'||v==='submitted'?'warning':'info'}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">报关管理</h2><span class="muted">HS Code、申报要素、报关草稿、审核状态与内部数据表</span></div><el-button v-if="canEdit" type="primary" @click="dialog=true">新建报关草稿</el-button></div>
<el-alert type="warning" :closable="false" title="submitted / cleared 等状态为企业内部记录，不代表系统已连接海关或取得官方回执。" style="margin-bottom:16px"/>

<div class="card"><el-table v-loading="loading" :data="rows" @row-dblclick="open">
  <el-table-column prop="declaration_no" label="内部申报号" width="190"/>
  <el-table-column prop="order_no" label="订单" width="170"/>
  <el-table-column prop="customer_name" label="客户" min-width="170"/>
  <el-table-column prop="booking_no" label="Booking" width="140"/>
  <el-table-column prop="destination_country" label="目的国" width="120"/>
  <el-table-column prop="declaration_date" label="申报日期" width="120"/>
  <el-table-column label="申报金额" width="150"><template #default="s">{{s.row.currency}} {{Number(s.row.total_value||0).toLocaleString()}}</template></el-table-column>
  <el-table-column prop="status" label="状态" width="110"><template #default="s"><el-tag :type="statusType(s.row.status)">{{s.row.status}}</el-tag></template></el-table-column>
  <el-table-column label="操作" width="90"><template #default="s"><el-button link type="primary" @click="open(s.row)">详情</el-button></template></el-table-column>
</el-table></div>

<el-dialog v-model="dialog" title="新建报关草稿" width="780"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr">
  <el-form-item label="订单"><el-select v-model="form.order_id" filterable style="width:100%" @change="chooseOrder"><el-option v-for="o in orders" :key="o.id" :label="`${o.order_no} · ${customerMap[o.customer_id]||''}`" :value="o.id"/></el-select></el-form-item>
  <el-form-item label="关联出运批次"><el-select v-model="form.shipment_id" clearable filterable style="width:100%"><el-option v-for="s in (orderFull?.shipments||[])" :key="s.id" :label="`${s.booking_no||'Shipment'} · ${s.bl_no||''}`" :value="s.id"/></el-select></el-form-item>
  <el-form-item label="出口国"><el-input v-model="form.export_country"/></el-form-item><el-form-item label="目的国"><el-input v-model="form.destination_country"/></el-form-item>
  <el-form-item label="申报海关"><el-input v-model="form.customs_office"/></el-form-item><el-form-item label="申报日期"><el-input v-model="form.declaration_date" type="date"/></el-form-item>
  <el-form-item label="贸易方式"><el-select v-model="form.trade_mode" allow-create filterable style="width:100%"><el-option v-for="x in ['General Trade','Processing Trade','Cross-border E-commerce','Other']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
  <el-form-item label="Incoterm"><el-input v-model="form.incoterm"/></el-form-item>
</div><el-form-item label="备注"><el-input v-model="form.notes" type="textarea"/></el-form-item>
</el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="createDeclaration">创建草稿</el-button></template></el-dialog>

<el-drawer v-model="drawer" size="90%" title="报关资料工作台"><template v-if="detail">
<div class="toolbar"><div><h3 style="margin:0">{{detail.declaration_no}}</h3><span class="muted">{{detail.order_no}} · {{detail.customer_name}} · {{detail.booking_no||'未关联出运批次'}}</span></div><div style="display:flex;gap:8px"><el-button @click="generateSheet">生成内部报关数据表</el-button><el-select v-if="canEdit" :model-value="detail.status" style="width:160px" @change="changeStatus"><el-option v-for="x in statuses" :key="x" :label="x" :value="x"/></el-select><el-tag v-else :type="statusType(detail.status)">{{detail.status}}</el-tag></div></div>

<div class="card" style="margin-bottom:16px"><div class="grid" style="grid-template-columns:repeat(4,1fr)">
  <el-form-item label="出口国"><el-input v-model="detail.export_country" :disabled="!canEdit"/></el-form-item><el-form-item label="目的国"><el-input v-model="detail.destination_country" :disabled="!canEdit"/></el-form-item>
  <el-form-item label="申报海关"><el-input v-model="detail.customs_office" :disabled="!canEdit"/></el-form-item><el-form-item label="申报日期"><el-input v-model="detail.declaration_date" type="date" :disabled="!canEdit"/></el-form-item>
  <el-form-item label="贸易方式"><el-input v-model="detail.trade_mode" :disabled="!canEdit"/></el-form-item><el-form-item label="Incoterm"><el-input v-model="detail.incoterm" :disabled="!canEdit"/></el-form-item>
  <el-form-item label="币种"><el-input v-model="detail.currency" disabled/></el-form-item><el-form-item label="申报总额"><el-input :model-value="Number(detail.total_value||0).toFixed(2)" disabled/></el-form-item>
</div><el-form-item label="备注"><el-input v-model="detail.notes" type="textarea" :disabled="!canEdit"/></el-form-item>
<el-checkbox v-if="canEdit" v-model="syncProductMaster">保存时同步 HS Code / 报关品名 / 原产国 / 申报要素到产品主数据</el-checkbox>
</div>

<div class="card"><div class="toolbar"><h3 class="section-title">申报商品明细</h3><el-button v-if="canEdit" type="primary" plain :loading="saving" @click="save">保存全部报关资料</el-button></div>
<el-table :data="detail.items" max-height="520">
  <el-table-column prop="product_name" label="订单产品" min-width="160" fixed/>
  <el-table-column label="HS Code" width="140"><template #default="s"><el-input v-model="s.row.hs_code" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="报关品名" min-width="150"><template #default="s"><el-input v-model="s.row.customs_name" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="数量" width="110"><template #default="s"><el-input v-model.number="s.row.quantity" type="number" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="单位" width="90"><template #default="s"><el-input v-model="s.row.unit" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="单价" width="120"><template #default="s"><el-input v-model.number="s.row.unit_price" type="number" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="原产国" width="120"><template #default="s"><el-input v-model="s.row.origin_country" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="品牌" width="120"><template #default="s"><el-input v-model="s.row.brand" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="型号" width="120"><template #default="s"><el-input v-model="s.row.model" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="材质" width="120"><template #default="s"><el-input v-model="s.row.material" :disabled="!canEdit"/></template></el-table-column>
  <el-table-column label="用途" min-width="140"><template #default="s"><el-input v-model="s.row.usage" :disabled="!canEdit"/></template></el-table-column>
</el-table></div>

<div class="card" style="margin-top:16px"><AttachmentsPanel entity-type="customs" :entity-id="detail.id" title="报关资料附件"/></div>
</template></el-drawer>
</AppLayout></template>