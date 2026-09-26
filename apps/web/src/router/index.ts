import {createRouter,createWebHashHistory} from 'vue-router';
import Login from '../pages/Login.vue';

const Dashboard=()=>import('../pages/Dashboard.vue');
const Knowledge=()=>import('../pages/Knowledge.vue');
const Reports=()=>import('../pages/Reports.vue');
const DataQuality=()=>import('../pages/DataQuality.vue');
const AttachmentBackup=()=>import('../pages/AttachmentBackup.vue');
const OpsStatus=()=>import('../pages/OpsStatus.vue');
const MobileQuickCreate=()=>import('../pages/MobileQuickCreate.vue');
const PrivacySettings=()=>import('../pages/PrivacySettings.vue');
const Backups=()=>import('../pages/Backups.vue');
const RecycleBin=()=>import('../pages/RecycleBin.vue');
const SecuritySettings=()=>import('../pages/SecuritySettings.vue');
const TeamSettings=()=>import('../pages/TeamSettings.vue');
const ExchangeRates=()=>import('../pages/ExchangeRates.vue');
const BrandChannels=()=>import('../pages/BrandChannels.vue');
const ChannelSettings=()=>import('../pages/ChannelSettings.vue');
const Customs=()=>import('../pages/Customs.vue');
const Contracts=()=>import('../pages/Contracts.vue');
const PublicPool=()=>import('../pages/PublicPool.vue');
const ProductsPricing=()=>import('../pages/ProductsPricing.vue');
const Marketing=()=>import('../pages/Marketing.vue');
const Integrations=()=>import('../pages/Integrations.vue');
const Analytics=()=>import('../pages/Analytics.vue');
const Aftersales=()=>import('../pages/Aftersales.vue');
const Shipments=()=>import('../pages/Shipments.vue');
const Finance=()=>import('../pages/Finance.vue');
const Orders=()=>import('../pages/Orders.vue');
const Automation=()=>import('../pages/Automation.vue');
const ExcelData=()=>import('../pages/ExcelData.vue');
const Customers=()=>import('../pages/Customers.vue');
const CustomerDetail=()=>import('../pages/CustomerDetail.vue');
const GenericModule=()=>import('../pages/GenericModule.vue');
const Audit=()=>import('../pages/Audit.vue');
const CustomFields=()=>import('../pages/CustomFields.vue');
const Search=()=>import('../pages/Search.vue');
const Inquiries=()=>import('../pages/Inquiries.vue');
const Opportunities=()=>import('../pages/Opportunities.vue');
const Quotations=()=>import('../pages/Quotations.vue');
const Samples=()=>import('../pages/Samples.vue');

const r=createRouter({history:createWebHashHistory(),routes:[
  {path:'/login',component:Login},
  {path:'/',component:Dashboard},
  {path:'/knowledge',component:Knowledge},
  {path:'/reports',component:Reports},
  {path:'/data-quality',component:DataQuality},
  {path:'/settings/attachment-backup',component:AttachmentBackup},
  {path:'/settings/ops',component:OpsStatus},
  {path:'/mobile/quick-create',component:MobileQuickCreate},
  {path:'/settings/privacy',component:PrivacySettings},
  {path:'/settings/backups',component:Backups},
  {path:'/recycle-bin/customers',component:RecycleBin},
  {path:'/settings/security',component:SecuritySettings},
  {path:'/settings/team',component:TeamSettings},
  {path:'/settings/exchange-rates',component:ExchangeRates},
  {path:'/brands-channels',component:BrandChannels},
  {path:'/settings/channels',component:ChannelSettings},
  {path:'/customs',component:Customs},
  {path:'/contracts',component:Contracts},
  {path:'/public-pool',component:PublicPool},
  {path:'/products-pricing',component:ProductsPricing},
  {path:'/marketing',component:Marketing},
  {path:'/integrations',component:Integrations},
  {path:'/analytics',component:Analytics},
  {path:'/aftersales',component:Aftersales},
  {path:'/shipments',component:Shipments},
  {path:'/finance',component:Finance},
  {path:'/orders',component:Orders},
  {path:'/automation',component:Automation},
  {path:'/data/excel',component:ExcelData},
  {path:'/search',component:Search},
  {path:'/customers',component:Customers},
  {path:'/customers/:id',component:CustomerDetail},
  {path:'/sales/inquiries',component:Inquiries},
  {path:'/sales/opportunities',component:Opportunities},
  {path:'/sales/quotations',component:Quotations},
  {path:'/sales/samples',component:Samples},
  {path:'/settings/custom-fields',component:CustomFields},
  {path:'/module/:key',component:GenericModule},
  {path:'/audit',component:Audit}
]});

const roleRules=[
  {match:(p:string)=>p==='/settings/team',roles:['admin']},
  {match:(p:string)=>p==='/settings/backups',roles:['admin']},
  {match:(p:string)=>p==='/settings/attachment-backup',roles:['admin']},
  {match:(p:string)=>p==='/settings/privacy',roles:['admin']},
  {match:(p:string)=>p==='/settings/ops',roles:['admin','manager']},
  {match:(p:string)=>p==='/settings/channels',roles:['admin','manager']},
  {match:(p:string)=>p==='/settings/exchange-rates',roles:['admin','manager','finance']},
  {match:(p:string)=>p.startsWith('/recycle-bin/'),roles:['admin','manager']},
  {match:(p:string)=>p==='/marketing',roles:['admin','manager']},
  {match:(p:string)=>p==='/data/excel',roles:['admin','manager']},
  {match:(p:string)=>p==='/settings/custom-fields',roles:['admin','manager']},
  {match:(p:string)=>p==='/automation',roles:['admin','manager']},
  {match:(p:string)=>p==='/integrations',roles:['admin','manager']},
  {match:(p:string)=>p==='/audit',roles:['admin','manager']},
  {match:(p:string)=>p==='/public-pool',roles:['admin','manager','sales']},
  {match:(p:string)=>p==='/mobile/quick-create',roles:['admin','manager','sales','followup']},
  {match:(p:string)=>p.startsWith('/sales/'),roles:['admin','manager','sales','followup','readonly']},
  {match:(p:string)=>p==='/finance',roles:['admin','manager','finance','readonly']}
];
function cachedAuthUser(){
  try{return JSON.parse(localStorage.getItem('auth_user')||'null')}catch{return null}
}
r.beforeEach(to=>{
  if(to.path==='/login')return true;
  if(!localStorage.getItem('token'))return '/login';
  const user=cachedAuthUser();
  if(user?.must_change_password&&to.path!=='/settings/security')return '/settings/security';
  const rule=roleRules.find(x=>x.match(to.path));
  if(rule&&user&&!rule.roles.includes(String(user.role||'')))return '/';
  return true;
});

export default r;
