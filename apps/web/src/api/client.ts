import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'http://127.0.0.1:8787/api',timeout:15000});
api.interceptors.request.use(c=>{const t=localStorage.getItem('token'); if(t)c.headers.Authorization=`Bearer ${t}`; return c;});
api.interceptors.response.use(r=>r,e=>{if(e.response?.status===401 && location.pathname!='/login'){localStorage.removeItem('token'); location.href='/login';} return Promise.reject(e);});
