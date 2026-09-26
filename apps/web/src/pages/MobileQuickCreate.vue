<script setup lang="ts">
import {ref,reactive,onMounted} from 'vue';
import {ElMessage,ElMessageBox} from 'element-plus';
import {useRouter} from 'vue-router';
import AppLayout from '../layouts/AppLayout.vue';
import {api} from '../api/client';

const router=useRouter(),cardFile=ref<File|null>(null),previewUrl=ref(''),ocrStatus=ref<any>({configured:false}),ocrLoading=ref(false),saving=ref(false);
const form=reactive<any>({
  name:'',country:'',city:'',website:'',industry:'',customer_types:['Importer'],notes:'',
  contact_name:'',title:'',department:'',email:'',phone:'',whatsapp:''
});

function toDataUrl(f:File){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsDataURL(f)})}
async function chooseCard(e:Event){
  const input=e.target as HTMLInputElement,f=input.files?.[0]||null;if(!f)return;
  if(f.size>8*1024*1024){ElMessage.error('名片图片不能超过 8MB');input.value='';return}
  cardFile.value=f;if(previewUrl.value)URL.revokeObjectURL(previewUrl.value);previewUrl.value=URL.createObjectURL(f);
}
async function runOcr(){
  if(!cardFile.value)return ElMessage.warning('请先拍摄或选择名片图片');
  if(!ocrStatus.value.configured)return ElMessage.warning('管理员尚未配置 OCR 服务，可以先手工录入并保存名片照片');
  ocrLoading.value=true;
  try{
    const image=await toDataUrl(cardFile.value),{data}=await api.post('/ocr/business-card',{image_base64:image,mime_type:cardFile.value.type||'image/jpeg'}),x=data.fields||{};
    if(x.company_name)form.name=x.company_name;if(x.contact_name)form.contact_name=x.contact_name;if(x.title)form.title=x.title;if(x.department)form.department=x.department;
    if(x.email)form.email=x.email;if(x.phone)form.phone=x.phone;if(x.whatsapp)form.whatsapp=x.whatsapp;if(x.website)form.website=x.website;
    if(x.country)form.country=x.country;if(x.city)form.city=x.city;
    ElMessage.success('OCR 结果已填入，请人工核对后再保存');
  }catch(e:any){
    const code=e.response?.data?.error;
    ElMessage.error(code==='ocr_not_configured'?'OCR 服务尚未配置':e.response?.data?.message||'OCR 识别失败');
  }finally{ocrLoading.value=false}
}
async function uploadCard(customerId:string){
  if(!cardFile.value)return;
  const data=await toDataUrl(cardFile.value);
  await api.post('/files/upload',{entity_type:'customer',entity_id:customerId,file_name:cardFile.value.name||`business-card-${Date.now()}.jpg`,mime_type:cardFile.value.type||'image/jpeg',content_base64:data,category:'business_card',notes:'移动极速建档拍摄的名片原图'});
}
async function save(){
  if(!form.name.trim())return ElMessage.warning('客户/公司名称必填');
  saving.value=true;
  try{
    const duplicate=(await api.post('/customers/duplicate-check',{name:form.name,website:form.website,email:form.email,phone:form.phone,country:form.country})).data.matches||[];
    if(duplicate.length){
      const text=duplicate.slice(0,3).map((x:any)=>`${x.name}｜负责人：${x.owner_name||'未分配'}｜${(x.reasons||[]).join('、')}`).join('\n');
      await ElMessageBox.confirm(`发现可能重复/撞单客户：\n\n${text}\n\n仍然继续创建吗？`,'客户查重',{type:'warning',confirmButtonText:'仍然创建',cancelButtonText:'返回检查'});
    }
    const {data:customer}=await api.post('/customers',{name:form.name,country:form.country,city:form.city,website:form.website,industry:form.industry,customer_types:form.customer_types,status:'potential',source:'Mobile Quick Create',notes:form.notes});
    const needsContact=[form.contact_name,form.email,form.phone,form.whatsapp,form.title,form.department].some((x:any)=>String(x||'').trim());
    let contact:any=null;
    if(needsContact){
      const {data}=await api.post('/contacts',{customer_id:customer.id,name:form.contact_name||'Primary Contact',title:form.title,department:form.department,is_primary:1});contact=data;
      for(const [channel,value] of [['email',form.email],['phone',form.phone],['whatsapp',form.whatsapp]]){
        if(String(value||'').trim())await api.post('/channels',{contact_id:contact.id,channel,value,is_primary:channel==='email'?1:0});
      }
    }
    try{await uploadCard(customer.id)}catch{ElMessage.warning('客户已创建，但名片照片上传失败，可稍后在客户附件中重新上传')}
    if(form.notes)await api.post('/activities',{customer_id:customer.id,contact_id:contact?.id||null,type:'mobile_intake',subject:'移动极速建档',content:form.notes,occurred_at:new Date().toISOString()});
    ElMessage.success('客户已建档');router.push(`/customers/${customer.id}`);
  }finally{saving.value=false}
}
onMounted(async()=>{try{ocrStatus.value=(await api.get('/ocr/status')).data}catch{}})
</script>

<template><AppLayout>
<div class="mobile-quick">
  <div class="toolbar"><div><h2 style="margin:0">手机极速建档</h2><span class="muted">拍名片 → OCR（可选）→ 人工核对 → 创建客户与联系人</span></div></div>

  <div class="mobile-quick-grid">
    <div class="card">
      <h3 class="section-title">1. 拍摄名片</h3>
      <input type="file" accept="image/*" capture="environment" @change="chooseCard"/>
      <div v-if="previewUrl" style="margin-top:12px"><img :src="previewUrl" alt="名片预览" style="width:100%;max-height:320px;object-fit:contain;border-radius:10px;border:1px solid #e7ecf3"/></div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <el-button :loading="ocrLoading" :disabled="!cardFile" @click="runOcr">{{ocrStatus.configured?'OCR 识别并填充':'OCR 未配置'}}</el-button>
      </div>
      <el-alert v-if="!ocrStatus.configured" type="info" :closable="false" title="当前没有启用 OCR Provider。名片原图仍会作为客户附件保存，可先手工录入。" style="margin-top:12px"/>
      <el-alert v-else type="success" :closable="false" :title="`OCR 已连接：${ocrStatus.integration?.name||ocrStatus.integration?.provider||'Provider'}。识别结果仍需人工核对。`" style="margin-top:12px"/>
    </div>

    <div class="card">
      <h3 class="section-title">2. 客户与联系人</h3>
      <el-form label-position="top">
        <el-form-item label="客户 / 公司名称 *"><el-input v-model="form.name" size="large"/></el-form-item>
        <div class="mobile-two"><el-form-item label="国家"><el-input v-model="form.country"/></el-form-item><el-form-item label="城市"><el-input v-model="form.city"/></el-form-item></div>
        <el-form-item label="官网"><el-input v-model="form.website"/></el-form-item>
        <el-form-item label="行业"><el-input v-model="form.industry"/></el-form-item>
        <el-form-item label="客户类型"><el-select v-model="form.customer_types" multiple allow-create filterable style="width:100%"><el-option v-for="x in ['Importer','Distributor','Wholesaler','Retailer','Brand','Agent','Manufacturer','End User','E-commerce']" :key="x" :label="x" :value="x"/></el-select></el-form-item>
        <el-divider content-position="left">联系人</el-divider>
        <el-form-item label="姓名"><el-input v-model="form.contact_name"/></el-form-item>
        <div class="mobile-two"><el-form-item label="职位"><el-input v-model="form.title"/></el-form-item><el-form-item label="部门"><el-input v-model="form.department"/></el-form-item></div>
        <el-form-item label="Email"><el-input v-model="form.email" inputmode="email"/></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" inputmode="tel"/></el-form-item>
        <el-form-item label="WhatsApp"><el-input v-model="form.whatsapp" inputmode="tel"/></el-form-item>
        <el-form-item label="现场备注"><el-input v-model="form.notes" type="textarea" :rows="4" placeholder="例如：展会沟通重点、客户需求、下一步动作"/></el-form-item>
        <el-button type="primary" size="large" :loading="saving" style="width:100%" @click="save">查重并创建客户</el-button>
      </el-form>
    </div>
  </div>
</div>
</AppLayout></template>