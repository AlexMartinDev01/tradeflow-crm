import {createRouter,createWebHashHistory} from 'vue-router';
import Dashboard from '../pages/Dashboard.vue';import Knowledge from '../pages/Knowledge.vue';import Reports from '../pages/Reports.vue';import DataQuality from '../pages/DataQuality.vue';import AttachmentBackup from '../pages/AttachmentBackup.vue';import OpsStatus from '../pages/OpsStatus.vue';import MobileQuickCreate from '../pages/MobileQuickCreate.vue';import PrivacySettings from '../pages/PrivacySettings.vue';import Backups from '../pages/Backups.vue';import RecycleBin from '../pages/RecycleBin.vue';import SecuritySettings from '../pages/SecuritySettings.vue';import TeamSettings from '../pages/TeamSettings.vue';import ExchangeRates from '../pages/ExchangeRates.vue';import BrandChannels from '../pages/BrandChannels.vue';import ChannelSettings from '../pages/ChannelSettings.vue';import Customs from '../pages/Customs.vue';import Contracts from '../pages/Contracts.vue';import PublicPool from '../pages/PublicPool.vue';import ProductsPricing from '../pages/ProductsPricing.vue';import Marketing from '../pages/Marketing.vue';import Integrations from '../pages/Integrations.vue';import Analytics from '../pages/Analytics.vue';import Aftersales from '../pages/Aftersales.vue';import Shipments from '../pages/Shipments.vue';import Finance from '../pages/Finance.vue';import Orders from '../pages/Orders.vue';import Automation from '../pages/Automation.vue';import ExcelData from '../pages/ExcelData.vue';import Login from '../pages/Login.vue';import Customers from '../pages/Customers.vue';import CustomerDetail from '../pages/CustomerDetail.vue';import GenericModule from '../pages/GenericModule.vue';import Audit from '../pages/Audit.vue';import CustomFields from '../pages/CustomFields.vue';import Search from '../pages/Search.vue';
import Inquiries from '../pages/Inquiries.vue';import Opportunities from '../pages/Opportunities.vue';import Quotations from '../pages/Quotations.vue';import Samples from '../pages/Samples.vue';
const r=createRouter({history:createWebHashHistory(),routes:[
{path:'/login',component:Login},{path:'/knowledge',component:Knowledge},{path:'/reports',component:Reports},{path:'/data-quality',component:DataQuality},{path:'/settings/attachment-backup',component:AttachmentBackup},{path:'/settings/ops',component:OpsStatus},{path:'/mobile/quick-create',component:MobileQuickCreate},{path:'/settings/privacy',component:PrivacySettings},{path:'/settings/backups',component:Backups},{path:'/recycle-bin/customers',component:RecycleBin},{path:'/settings/security',component:SecuritySettings},{path:'/',component:Dashboard},{path:'/settings/team',component:TeamSettings},{path:'/settings/exchange-rates',component:ExchangeRates},{path:'/brands-channels',component:BrandChannels},{path:'/settings/channels',component:ChannelSettings},{path:'/customs',component:Customs},{path:'/contracts',component:Contracts},{path:'/public-pool',component:PublicPool},{path:'/products-pricing',component:ProductsPricing},{path:'/marketing',component:Marketing},{path:'/integrations',component:Integrations},{path:'/analytics',component:Analytics},{path:'/aftersales',component:Aftersales},{path:'/shipments',component:Shipments},{path:'/finance',component:Finance},{path:'/orders',component:Orders},{path:'/automation',component:Automation},{path:'/data/excel',component:ExcelData},{path:'/search',component:Search},{path:'/customers',component:Customers},{path:'/customers/:id',component:CustomerDetail},
{path:'/sales/inquiries',component:Inquiries},{path:'/sales/opportunities',component:Opportunities},{path:'/sales/quotations',component:Quotations},{path:'/sales/samples',component:Samples},
{path:'/settings/custom-fields',component:CustomFields},{path:'/module/:key',component:GenericModule},{path:'/audit',component:Audit}]});
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
});export default r;