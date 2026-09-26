import axios from 'axios';
import {demoApi} from './mock';

const isPagesDemo=import.meta.env.VITE_DEMO_MODE==='true'||location.hostname.endsWith('github.io');
const defaultApiBase=import.meta.env.DEV?'http://127.0.0.1:8787/api':'/api';
const live=axios.create({baseURL:import.meta.env.VITE_API_URL||defaultApiBase,timeout:15000});
live.interceptors.request.use(c=>{const t=localStorage.getItem('token');if(t)c.headers.Authorization=`Bearer ${t}`;return c;});
live.interceptors.response.use(r=>r,e=>{if(e.response?.status===401&&location.pathname!='/login'){localStorage.removeItem('token');location.href='/login';}return Promise.reject(e);});
export const api:any=isPagesDemo?demoApi:live;
export const demoMode=isPagesDemo;
