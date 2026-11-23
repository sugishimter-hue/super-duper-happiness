import { database, adminAllowed, sameOrigin, ensureSchema } from '@/lib/server';
import { z } from 'zod';

const number = z.number().int().min(0).max(1000000000).nullable();
const schema = z.object({
  price: number, commission: z.number().min(0).max(100).nullable(),
  scope: z.string().max(2000), refund: z.string().max(2000),
  plans: z.array(z.object({name:z.string().trim().min(1).max(80), price:number, quota:number})).max(30)
});
const empty = {price:null, commission:null, scope:'', refund:'', plans:[]};
async function table() {
  await ensureSchema();
  return database();
}
const denied = () => Response.json({error:'관리 권한이 필요합니다.'},{status:403});
export async function GET() {
  if (!await adminAllowed()) return denied();
  const db = await table();
  const row = await db.prepare('SELECT policy, revision FROM operating_policy WHERE id=1').first<{policy:string;revision:number}>();
  return Response.json({policy:row ? JSON.parse(row.policy) : empty, revision:row?.revision ?? 0},{headers:{'Cache-Control':'no-store'}});
}
export async function PUT(request:Request) {
  if (!sameOrigin(request) || !await adminAllowed()) return denied();
  const data = z.object({policy:schema, revision:z.number().int().nonnegative()}).safeParse(await request.json().catch(()=>null));
  if (!data.success) return Response.json({error:'상품명과 입력 범위를 확인해 주세요.'},{status:400});
  const {policy, revision} = data.data;
  const db = await table();
  const value = JSON.stringify(policy);
  const result = revision === 0
    ? await db.prepare('INSERT OR IGNORE INTO operating_policy VALUES (1,?,1)').bind(value).run()
    : await db.prepare('UPDATE operating_policy SET policy=?, revision=revision+1 WHERE id=1 AND revision=?').bind(value,revision).run();
  if (!result.meta.changes) return Response.json({error:'다른 창에서 변경했습니다. 새로고침 후 다시 입력해 주세요.'},{status:409});
  return Response.json({revision:revision+1});
}
