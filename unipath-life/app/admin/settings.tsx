"use client";
import {useEffect,useState} from 'react';

type Amount = number | null;
type Plan = {name:string; price:Amount; quota:Amount};
type Policy = {price:Amount; commission:Amount; scope:string; refund:string; plans:Plan[]};
function Numeric({label,value,max=1000000000,step=1,change}:{label:string;value:Amount;max?:number;step?:number;change:(value:Amount)=>void}){
  return <label>{label}<input type="number" placeholder="미정" min={0} max={max} step={step} value={value??''} onChange={e=>change(e.target.value===''?null:e.target.valueAsNumber)}/></label>
}
export default function Settings(){
  const [policy,set]=useState<Policy|null>(null),[revision,rev]=useState(0),[message,msg]=useState(''),[busy,saving]=useState(false);
  useEffect(()=>{fetch('/api/admin/settings').then(async r=>{
    if(!r.ok)throw Error();const data=await r.json() as {policy:Policy;revision:number};set(data.policy);rev(data.revision)
  }).catch(()=>msg('운영 설정을 불러오지 못했습니다. 새로고침해 주세요.'))},[]);
  if(!policy)return <p role="status">{message||'운영 설정을 불러오는 중입니다.'}</p>;
  const update=(patch:Partial<Policy>)=>{set({...policy,...patch});msg('저장 전 변경사항이 있습니다.')};
  const edit=(i:number,patch:Partial<Plan>)=>update({plans:policy.plans.map((p,j)=>i===j?{...p,...patch}:p)});
  return <form className="adminRecord" onSubmit={async e=>{
    e.preventDefault();saving(true);
    try{const r=await fetch('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy,revision})});
    const data=await r.json() as {error?:string;revision:number};if(!r.ok)throw Error(data.error);rev(data.revision);msg('운영 설정을 저장했습니다.')}
    catch(e){msg(e instanceof Error?e.message:'저장에 실패했습니다.')}finally{saving(false)}
  }}><fieldset disabled={busy}><h2>운영 설정</h2><p>빈 항목은 미정으로 저장됩니다. 저장한 기준은 관리자가 상담을 안내하고 고객을 배정할 때 참고합니다.</p>
  <h3>상담사 상품</h3>{policy.plans.map((p,i)=><div className="adminControls" key={i}><label>상품명<input required maxLength={80} value={p.name} onChange={e=>edit(i,{name:e.target.value})}/></label><Numeric label="상품 금액 (원)" value={p.price} change={price=>edit(i,{price})}/><Numeric label="고객 배정 인원 (명)" value={p.quota} change={quota=>edit(i,{quota})}/><button type="button" onClick={()=>update({plans:policy.plans.filter((_,j)=>i!==j)})}>상품 삭제</button></div>)}
  <button type="button" className="outline" disabled={policy.plans.length>=30} onClick={()=>update({plans:[...policy.plans,{name:'',price:null,quota:null}]})}>상품 추가</button>
  <h3 className="mt-6">상담 운영 기준</h3><div className="adminControls"><Numeric label="상담 가격 (원)" value={policy.price} change={price=>update({price})}/><Numeric label="수수료율 (%)" value={policy.commission} max={100} step={0.01} change={commission=>update({commission})}/></div>
  <label>상담 제공 범위<textarea value={policy.scope} maxLength={2000} onChange={e=>update({scope:e.target.value})}/></label>
  <label>취소·환불 기준<textarea value={policy.refund} maxLength={2000} onChange={e=>update({refund:e.target.value})}/></label>
  <button className="primary mt-4">{busy?'저장 중…':'설정 저장'}</button><p role="status">{message}</p></fieldset></form>
}
