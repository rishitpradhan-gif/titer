import {randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,readdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
export const keyDirectory = () => resolve(process.env.TITER_KEY_DIR || '.titer/keys');
const digest = token => createHash('sha256').update(token).digest('hex');
export function issueKey(dir, label, days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw Error('Expiry must be 1–365 days');
  if (typeof label !== 'string' || !label.trim() || label.length > 80) throw Error('Label must be 1–80 characters');
  mkdirSync(dir, {recursive:true, mode:0o700});
  const id = randomBytes(8).toString('hex'), token = `tt_${id}_${randomBytes(32).toString('base64url')}`;
  const entry = {id, label, hash:digest(token), created_at:new Date().toISOString(), expires_at:new Date(Date.now()+days*86400000).toISOString()};
  writeFileSync(join(dir,`${id}.json`),JSON.stringify(entry),{flag:'wx', mode:0o600});
  return {token, ...entry};
}
export function verifyKey(dir, token, now=Date.now()) {
  if (typeof token !== 'string' || !/^tt_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  try { const id=token.split('_')[1], e=JSON.parse(readFileSync(join(dir,`${id}.json`),'utf8'));
    if (e.id!==id || !/^[a-f0-9]{64}$/.test(e.hash) || !Number.isFinite(Date.parse(e.expires_at)) || Date.parse(e.expires_at)<=now) return null;
    return timingSafeEqual(Buffer.from(e.hash,'hex'),Buffer.from(digest(token),'hex')) ? {id:e.id,expires_at:e.expires_at} : null;
  } catch { return null; }
}
export function listKeys(dir) {
  try { return readdirSync(dir).filter(n=>/^[a-f0-9]{16}\.json$/.test(n)).map(n=>{const {hash,...e}=JSON.parse(readFileSync(join(dir,n),'utf8'));return e;}); }
  catch(e){ if(e.code==='ENOENT')return [];throw e; }
}
export function revokeKey(dir,id){if(!/^[a-f0-9]{16}$/.test(id))throw Error('Invalid key ID');unlinkSync(join(dir,`${id}.json`));}
