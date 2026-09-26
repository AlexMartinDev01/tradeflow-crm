import {defineStore} from 'pinia';
import {api} from '../api/client';

function cachedUser(){
  try{return JSON.parse(localStorage.getItem('auth_user')||'null')}catch{return null}
}
function persistUser(user:any){
  if(user)localStorage.setItem('auth_user',JSON.stringify(user));else localStorage.removeItem('auth_user');
}

export const useAuth=defineStore('auth',{
  state:()=>({user:cachedUser() as any,loading:false,twoFactorChallenge:null as any}),
  actions:{
    async login(username:string,password:string){
      this.loading=true;
      try{
        const {data}=await api.post('/auth/login',{username,password});
        if(data.two_factor_required){
          this.twoFactorChallenge={challenge_token:data.challenge_token,expires_at:data.expires_at,user:data.user};
          return data;
        }
        localStorage.setItem('token',data.token);
        this.twoFactorChallenge=null;
        this.user=data.user;persistUser(data.user);
        return data;
      }finally{this.loading=false}
    },
    async verifyTwoFactor(code:string){
      if(!this.twoFactorChallenge?.challenge_token)throw new Error('missing two factor challenge');
      this.loading=true;
      try{
        const {data}=await api.post('/auth/2fa/verify',{challenge_token:this.twoFactorChallenge.challenge_token,code});
        localStorage.setItem('token',data.token);
        this.twoFactorChallenge=null;
        this.user=data.user;persistUser(data.user);
        return data;
      }finally{this.loading=false}
    },
    clearTwoFactor(){this.twoFactorChallenge=null},
    async me(){
      if(!localStorage.getItem('token'))return null;
      const {data}=await api.get('/auth/me');this.user=data;persistUser(data);return data;
    },
    async logout(){
      try{await api.post('/auth/logout')}finally{
        localStorage.removeItem('token');persistUser(null);this.user=null;this.twoFactorChallenge=null;location.hash='#/login';
      }
    }
  }
});