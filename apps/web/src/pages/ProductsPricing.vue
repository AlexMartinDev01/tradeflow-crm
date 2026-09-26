<script setup lang="ts">
import {ref,reactive,onMounted,computed} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';
import {useAuth} from '../stores/auth';

const auth=useAuth();if(!auth.user)auth.me().catch(()=>{});
const products=ref<any[]>([]),customers=ref<any[]>([]),preferences=ref<any[]>([]),priceLists=ref<any[]>([]),rules=ref<any[]>([]);
const productDialog=ref(false),editingProduct=ref<any>(null),prefDialog=ref(false),listDialog=ref(false),listDrawer=ref(false),ruleDialog=ref(false),resolveDialog=ref(false),historyDialog=ref(false);
const selectedList=ref<any>(null),resolved=ref<any>(null),history=ref<any[]>([]);
const canManage=computed(()=>['admin','manager'].includes(auth.user?.role));
const productMap=computed(()=>Object.fromEntries(products.value.map(x=>[x.id,x])));
const customerMap=computed(()=>Object.fromEntries(customers.value.map(x=>[x.id,x])));

const product=reactive<any>({sku:'',name:'',category:'',description:'',certifications:[],base_price:0,floor_price:0,currency:'USD',active:1,hs_code:'',customs_name:'',origin_country:'',declaration_elements:{brand:'',model:'',material:'',usage:''}});
const pref=reactive<any>({customer_id:'',product_id:'',preference_type:'interested',interest_level:'medium',notes:''});
const listForm=reactive<any>({name:'',customer_id:'',currency:'USD',valid_from:'',valid_to:'',status:'active',notes:''});
const itemForm=reactive<any>({product_id:'',min_qty:1,max_qty:'',unit_price:0,discount_percent:'',notes:''});
const rule=reactive<any>({product_id:'',country:'',rule_type:'prohibited',required_certifications:[],notes:'',active:1});
const resolver=reactive<any>({customer_id:'',product_id:'',quantity:1});
const histFilter=reactive<any>({customer_id:'',product_id:''});

async function load(){
  const [p,c,pr,pl,r]=await Promise.all([
    api.get('/products',{params:{size:300}}),api.get('/customers',{params:{size:300}}),
    api.get('/customerProductPreferences',{params:{size:500}}),api.get('/pricing/price-lists'),
    api.get('/productMarketRules',{params:{size:500}})
  ]);
  products.value=p.data.data;customers.value=c.data.data;preferences.value=pr.data.data;priceLists.value=pl.data;rules.value=r.data.data;
}
function resetProduct(){editingProduct.value=null;Object.assign(product,{sku:'',name:'',category:'',description:'',certifications:[],base_price:0,floor_price:0,currency:'USD',active:1,hs_code:'',customs_name:'',origin_country:'',declaration_elements:{brand:'',model:'',material:'',usage:''}})}
function newProduct(){resetProduct();productDialog.value=true}
function editProduct(r:any){editingProduct.value=r;Object.assign(product,{...r,certifications:[...(r.certifications||[])],declaration_elements:{brand:'',model:'',material:'',usage:'',...(r.declaration_elements||{})}});productDialog.value=true}
async function saveProduct(){
  if(!product.name.trim())return ElMessage.warning('产品名称必填');
  const payload=JSON.parse(JSON.stringify(product));
  if(editingProduct.value)await api.patch(`/products/${editingProduct.value.id}`,payload);else await api.post('/products',payload);
  const wasEditing=!!editingProduct.value;productDialog.value=false;resetProduct();await load();ElMessage.success(wasEditing?'产品已更新':'产品已保存')
}
async function savePref(){
  if(!pref.customer_id||!pref.product_id)return ElMessage.warning('客户和产品必填');
  await api.post('/customerProductPreferences',pref);prefDialog.value=false;Object.assign(pref,{customer_id:'',product_id:'',preference_type:'interested',interest_level:'medium',notes:''});await load()
}
async function deletePref(r:any){await api.delete(`/customerProductPreferences/${r.id}`);await load()}
async function saveList(){
  if(!listForm.name.trim())return ElMessage.warning('价目表名称必填');
  await api.post('/pricing/price-lists',listForm);listDialog.value=false;Object.assign(listForm,{name:'',customer_id:'',currency:'USD',valid_from:'',valid_to:'',status:'active',notes:''});await load()
}
async function openList(r:any){selectedList.value=(await api.get(`/pricing/price-lists/${r.id}`)).data;listDrawer.value=true}
async function addTier(){
  if(!itemForm.product_id||Number(itemForm.unit_price)<0)return ElMessage.warning('产品和单价必填');
  await api.post('/pricing/price-list-items',{...itemForm,price_list_id:selectedList.value.id});Object.assign(itemForm,{product_id:'',min_qty:1,max_qty:'',unit_price:0,discount_percent:'',notes:''});await openList(selectedList.value);await load()
}
async function deleteTier(r:any){await api.delete(`/pricing/price-list-items/${r.id}`);await openList(selectedList.value)}
async function deleteList(r:any){await ElMessageBox.confirm(`删除价目表“${r.name}”？`,'确认');await api.delete(`/pricing/price-lists/${r.id}`);await load()}
async function saveRule(){
  if(!rule.product_id)return ElMessage.warning('请选择产品');
  await api.post('/productMarketRules',rule);ruleDialog.value=false;Object.assign(rule,{product_id:'',country:'',rule_type:'prohibited',required_certifications:[],notes:'',active:1});await load()
}
async function deleteRule(r:any){await api.delete(`/productMarketRules/${r.id}`);await load()}
async function resolvePrice(){
  if(!resolver.customer_id||!resolver.product_id)return ElMessage.warning('请选择客户和产品');
  resolved.value=(await api.get('/pricing/resolve',{params:{customer_id:resolver.customer_id,product_id:resolver.product_id,quantity:resolver.quantity}})).data;resolveDialog.value=true
}
async function showHistory(){
  if(!histFilter.customer_id||!histFilter.product_id)return ElMessage.warning('请选择客户和产品');
  history.value=(await api.get('/pricing/history',{params:histFilter})).data;historyDialog.value=true
}
function money(v:any){return Number(v||0).toLocaleString(undefined,{maximumFractionDigits:4})}
onMounted(load);
</script>

<template><AppLayout>
<div class="toolbar"><div><h2 style="margin:0">产品与价格</h2><span class="muted">产品、客户偏好、专属价目表、阶梯价、历史价与市场限制</span></div><div style="display:flex;gap:8px"><el-button @click="showHistory">查询历史价</el-button><el-button type="primary" @click="resolvePrice">价格解析</el-button></div></div>

<div class="card" style="margin-bottom:16px"><div class="grid" style="grid-template-columns:1fr 1fr 160px auto">
<el-select v-model="resolver.customer_id" filterable placeholder="选择客户"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select>
<el-select v-model="resolver.product_id" filterable placeholder="选择产品"><el-option v-for="p in products" :key="p.id" :label="`${p.sku||'-'} · ${p.name}`" :value="p.id"/></el-select>
<el-input-number v-model="resolver.quantity" :min="1"/><el-button type="primary" plain @click="resolvePrice">解析当前价格</el-button>
</div></div>

<el-tabs>
<el-tab-pane label="产品主数据">
<div class="toolbar"><span class="muted">{{products.length}} 个产品</span><el-button v-if="canManage" type="primary" @click="newProduct">新增产品</el-button></div>
<div class="card"><el-table :data="products"><el-table-column prop="sku" label="SKU" width="130"/><el-table-column prop="name" label="产品" min-width="170"/><el-table-column prop="category" label="分类"/><el-table-column prop="hs_code" label="HS Code" width="130"/><el-table-column prop="customs_name" label="报关品名" min-width="150"/><el-table-column prop="origin_country" label="原产国" width="100"/><el-table-column label="认证" min-width="150"><template #default="s"><el-tag v-for="x in (s.row.certifications||[])" :key="x" size="small" style="margin:2px">{{x}}</el-tag></template></el-table-column><el-table-column label="基础价" width="130"><template #default="s">{{s.row.currency}} {{money(s.row.base_price)}}</template></el-table-column><el-table-column v-if="canManage" label="底价" width="130"><template #default="s">{{s.row.floor_price?`${s.row.currency} ${money(s.row.floor_price)}`:'-'}}</template></el-table-column><el-table-column label="启用" width="75"><template #default="s">{{s.row.active?'是':'否'}}</template></el-table-column><el-table-column v-if="canManage" label="操作" width="80" fixed="right"><template #default="s"><el-button link type="primary" @click="editProduct(s.row)">编辑</el-button></template></el-table-column></el-table></div>
</el-tab-pane>

<el-tab-pane label="客户产品偏好">
<div class="toolbar"><span class="muted">兴趣、已报价、已采购、禁售或不适配。</span><el-button type="primary" @click="prefDialog=true">新增关系</el-button></div>
<div class="card"><el-table :data="preferences"><el-table-column label="客户" min-width="170"><template #default="s">{{customerMap[s.row.customer_id]?.name||s.row.customer_id}}</template></el-table-column><el-table-column label="产品" min-width="170"><template #default="s">{{productMap[s.row.product_id]?.name||s.row.product_id}}</template></el-table-column><el-table-column prop="preference_type" label="关系"/><el-table-column prop="interest_level" label="兴趣等级"/><el-table-column prop="notes" label="备注"/><el-table-column label="操作" width="80"><template #default="s"><el-button link type="danger" @click="deletePref(s.row)">删除</el-button></template></el-table-column></el-table></div>
</el-tab-pane>

<el-tab-pane label="价目表 / 阶梯价">
<div class="toolbar"><span class="muted">支持全局价目表和客户专属价目表。</span><el-button v-if="canManage" type="primary" @click="listDialog=true">新增价目表</el-button></div>
<div class="card"><el-table :data="priceLists" @row-dblclick="openList"><el-table-column prop="name" label="价目表" min-width="180"/><el-table-column label="客户" min-width="160"><template #default="s">{{s.row.customer_id?(customerMap[s.row.customer_id]?.name||s.row.customer_id):'通用'}}</template></el-table-column><el-table-column prop="currency" label="币种"/><el-table-column prop="valid_from" label="生效"/><el-table-column prop="valid_to" label="失效"/><el-table-column prop="status" label="状态"/><el-table-column label="操作" width="140"><template #default="s"><el-button link @click="openList(s.row)">阶梯价</el-button><el-button v-if="canManage" link type="danger" @click="deleteList(s.row)">删除</el-button></template></el-table-column></el-table></div>
</el-tab-pane>

<el-tab-pane label="市场规则">
<div class="toolbar"><span class="muted">按国家配置禁售或所需认证。</span><el-button v-if="canManage" type="primary" @click="ruleDialog=true">新增规则</el-button></div>
<div class="card"><el-table :data="rules"><el-table-column label="产品" min-width="170"><template #default="s">{{productMap[s.row.product_id]?.name||s.row.product_id}}</template></el-table-column><el-table-column prop="country" label="国家（空=全球）"/><el-table-column prop="rule_type" label="规则"/><el-table-column label="要求认证" min-width="170"><template #default="s">{{(s.row.required_certifications||[]).join('、')||'-'}}</template></el-table-column><el-table-column prop="notes" label="备注"/><el-table-column v-if="canManage" label="操作" width="80"><template #default="s"><el-button link type="danger" @click="deleteRule(s.row)">删除</el-button></template></el-table-column></el-table></div>
</el-tab-pane>
</el-tabs>

<el-dialog v-model="productDialog" :title="editingProduct?'编辑产品':'新增产品'" width="780"><el-form label-position="top">
<div class="grid" style="grid-template-columns:1fr 1fr">
<el-form-item label="SKU"><el-input v-model="product.sku"/></el-form-item><el-form-item label="产品名称"><el-input v-model="product.name"/></el-form-item>
<el-form-item label="分类"><el-input v-model="product.category"/></el-form-item><el-form-item label="认证"><el-select v-model="product.certifications" multiple allow-create filterable style="width:100%"/></el-form-item>
<el-form-item label="基础价格"><el-input v-model.number="product.base_price" type="number"/></el-form-item><el-form-item label="底价（审批红线）"><el-input v-model.number="product.floor_price" type="number"/></el-form-item>
<el-form-item label="币种"><el-select v-model="product.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="HS Code"><el-input v-model="product.hs_code"/></el-form-item>
<el-form-item label="报关品名"><el-input v-model="product.customs_name"/></el-form-item><el-form-item label="原产国"><el-input v-model="product.origin_country"/></el-form-item>
</div>
<el-divider content-position="left">常用申报要素</el-divider>
<div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="品牌"><el-input v-model="product.declaration_elements.brand"/></el-form-item><el-form-item label="型号"><el-input v-model="product.declaration_elements.model"/></el-form-item><el-form-item label="材质"><el-input v-model="product.declaration_elements.material"/></el-form-item><el-form-item label="用途"><el-input v-model="product.declaration_elements.usage"/></el-form-item></div>
<el-form-item label="描述"><el-input v-model="product.description" type="textarea"/></el-form-item>
<el-form-item><el-checkbox v-model="product.active" :true-value="1" :false-value="0">启用产品</el-checkbox></el-form-item>
</el-form><template #footer><el-button @click="productDialog=false">取消</el-button><el-button type="primary" @click="saveProduct">保存</el-button></template></el-dialog>

<el-dialog v-model="prefDialog" title="客户产品关系" width="620"><el-form label-position="top"><el-form-item label="客户"><el-select v-model="pref.customer_id" filterable style="width:100%"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item><el-form-item label="产品"><el-select v-model="pref.product_id" filterable style="width:100%"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id"/></el-select></el-form-item><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="关系"><el-select v-model="pref.preference_type" style="width:100%"><el-option v-for="x in ['interested','quoted','purchased','prohibited','unsuitable']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="兴趣等级"><el-select v-model="pref.interest_level" style="width:100%"><el-option v-for="x in ['low','medium','high']" :key="x" :label="x" :value="x"/></el-select></el-form-item></div><el-form-item label="备注"><el-input v-model="pref.notes" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="prefDialog=false">取消</el-button><el-button type="primary" @click="savePref">保存</el-button></template></el-dialog>

<el-dialog v-model="listDialog" title="新增价目表" width="680"><el-form label-position="top"><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="名称"><el-input v-model="listForm.name"/></el-form-item><el-form-item label="客户（留空=通用）"><el-select v-model="listForm.customer_id" clearable filterable style="width:100%"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select></el-form-item><el-form-item label="币种"><el-select v-model="listForm.currency" style="width:100%"><el-option v-for="x in ['USD','EUR','GBP','CNY']" :key="x" :label="x" :value="x"/></el-select></el-form-item><el-form-item label="状态"><el-select v-model="listForm.status" style="width:100%"><el-option label="active" value="active"/><el-option label="inactive" value="inactive"/></el-select></el-form-item><el-form-item label="生效日期"><el-input v-model="listForm.valid_from" type="date"/></el-form-item><el-form-item label="失效日期"><el-input v-model="listForm.valid_to" type="date"/></el-form-item></div><el-form-item label="备注"><el-input v-model="listForm.notes" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="listDialog=false">取消</el-button><el-button type="primary" @click="saveList">保存</el-button></template></el-dialog>

<el-drawer v-model="listDrawer" size="70%" title="价目表阶梯价"><template v-if="selectedList"><div class="toolbar"><div><h3 style="margin:0">{{selectedList.name}}</h3><span class="muted">{{selectedList.currency}} · {{selectedList.customer_id?(customerMap[selectedList.customer_id]?.name||'客户专属'):'通用价目表'}}</span></div></div><div v-if="canManage" class="card" style="margin-bottom:16px"><h4>新增阶梯价</h4><div class="grid" style="grid-template-columns:2fr 1fr 1fr 1fr 1fr auto"><el-select v-model="itemForm.product_id" filterable placeholder="产品"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id"/></el-select><el-input-number v-model="itemForm.min_qty" :min="1"/><el-input v-model="itemForm.max_qty" type="number" placeholder="最大数量"/><el-input v-model.number="itemForm.unit_price" type="number" placeholder="单价"/><el-input v-model="itemForm.discount_percent" type="number" placeholder="折扣%"/><el-button type="primary" @click="addTier">添加</el-button></div></div><div class="card"><el-table :data="selectedList.items"><el-table-column prop="sku" label="SKU"/><el-table-column prop="product_name" label="产品"/><el-table-column prop="min_qty" label="最小量"/><el-table-column prop="max_qty" label="最大量"/><el-table-column prop="unit_price" label="单价"/><el-table-column prop="discount_percent" label="折扣%"/><el-table-column v-if="canManage" label="操作" width="80"><template #default="s"><el-button link type="danger" @click="deleteTier(s.row)">删除</el-button></template></el-table-column></el-table></div></template></el-drawer>

<el-dialog v-model="ruleDialog" title="新增市场规则" width="650"><el-form label-position="top"><el-form-item label="产品"><el-select v-model="rule.product_id" filterable style="width:100%"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id"/></el-select></el-form-item><div class="grid" style="grid-template-columns:1fr 1fr"><el-form-item label="国家（留空=全球）"><el-input v-model="rule.country"/></el-form-item><el-form-item label="规则类型"><el-select v-model="rule.rule_type" style="width:100%"><el-option label="禁止销售" value="prohibited"/><el-option label="需要认证" value="requires_certification"/></el-select></el-form-item></div><el-form-item v-if="rule.rule_type==='requires_certification'" label="要求认证"><el-select v-model="rule.required_certifications" multiple allow-create filterable style="width:100%"/></el-form-item><el-form-item label="备注"><el-input v-model="rule.notes" type="textarea"/></el-form-item></el-form><template #footer><el-button @click="ruleDialog=false">取消</el-button><el-button type="primary" @click="saveRule">保存</el-button></template></el-dialog>

<el-dialog v-model="resolveDialog" title="价格解析结果" width="650"><template v-if="resolved"><el-alert :type="resolved.allowed?'success':'error'" :closable="false" :title="resolved.allowed?'当前可报价':'当前存在销售限制'"/><el-descriptions :column="2" border style="margin-top:14px"><el-descriptions-item label="客户">{{resolved.customer.name}}</el-descriptions-item><el-descriptions-item label="国家">{{resolved.customer.country||'-'}}</el-descriptions-item><el-descriptions-item label="产品">{{resolved.product.name}}</el-descriptions-item><el-descriptions-item label="数量">{{resolved.quantity}}</el-descriptions-item><el-descriptions-item label="解析单价"><b>{{resolved.currency}} {{money(resolved.unit_price)}}</b></el-descriptions-item><el-descriptions-item label="总额"><b>{{resolved.currency}} {{money(resolved.total)}}</b></el-descriptions-item><el-descriptions-item label="价格来源">{{resolved.price_source.type}} {{resolved.price_source.price_list_name||''}}</el-descriptions-item><el-descriptions-item label="限制原因">{{resolved.block_reason||'-'}}</el-descriptions-item><el-descriptions-item label="要求认证" :span="2">{{(resolved.required_certifications||[]).join('、')||'-'}}</el-descriptions-item></el-descriptions></template></el-dialog>

<el-dialog v-model="historyDialog" title="客户产品历史价格" width="850"><div class="grid" style="grid-template-columns:1fr 1fr auto;margin-bottom:12px"><el-select v-model="histFilter.customer_id" filterable placeholder="客户"><el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id"/></el-select><el-select v-model="histFilter.product_id" filterable placeholder="产品"><el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id"/></el-select><el-button type="primary" @click="showHistory">查询</el-button></div><el-table :data="history"><el-table-column prop="occurred_at" label="时间" width="190"/><el-table-column prop="source_type" label="来源"/><el-table-column prop="reference" label="单据"/><el-table-column prop="quantity" label="数量"/><el-table-column prop="unit_price" label="单价"/><el-table-column prop="currency" label="币种"/><el-table-column prop="status" label="状态"/></el-table></el-dialog>
</AppLayout></template>