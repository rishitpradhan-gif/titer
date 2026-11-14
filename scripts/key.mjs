import {issueKey,listKeys,revokeKey,keyDirectory} from '../lib/keys.mjs';
try {
 const [action,argument,days] = process.argv.slice(2),dir=keyDirectory();
 if(action==='create'){const {token,id,expires_at}=issueKey(dir,argument||'local-client',days===undefined?30:Number(days));console.error(`Key ${id}; expires ${expires_at}. Save this token now; only its hash is stored.`);console.log(token);}
 else if(action==='list')console.log(JSON.stringify(listKeys(dir),null,2));
 else if(action==='revoke'){revokeKey(dir,argument);console.log('Key revoked.');}
 else throw Error('Usage: npm run key -- create LABEL [DAYS] | list | revoke ID');
} catch(e){console.error(e.message);process.exitCode=1;}
