import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['dist/sandbox.mjs'],{env:{...process.env,NODE_ENV:'production',PORT:'3035'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
const origin='http://127.0.0.1:3035';
try {
 let ready=false;for(let i=0;i<90;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,log);
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'demo',password:'Demo-2026!'})});assert.equal(login.status,200,await login.clone().text());
 const cookie=login.headers.get('set-cookie').split(';')[0];const headers={'Content-Type':'application/json',Cookie:cookie};
 const read=await fetch(origin+'/api/database',{headers});const body=await read.json();const db=body.data;assert.equal(db.orders.length,12);
 const next=structuredClone(db);next.orders[0].Note='DEMO saved فارسی EHA-2 / 25 KG';
 const save=await fetch(origin+'/api/database',{method:'PUT',headers:{...headers,'X-Arca-Revision':read.headers.get('x-arca-revision')||body.revision},body:JSON.stringify({data:next,base:db})});assert.equal(save.status,200,await save.clone().text());
 const after=await (await fetch(origin+'/api/database',{headers})).json();assert.equal(after.data.orders[0].Note,next.orders[0].Note);
 const pdf=await fetch(origin+'/api/print/merged-pdf',{method:'POST',headers,body:JSON.stringify({filename:'DEMO.pdf',segments:[{kind:'html',html:'<h1>SAMPLE Commercial Invoice</h1><p>EHA-2 20.16 MT</p>'}]})});assert.equal(pdf.status,200,await pdf.clone().text());const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');
 console.log(JSON.stringify({login:true,orders:12,saveAndReload:true,mixedTextUnchanged:true,pdfBytes:bytes.length}));
}finally{child.kill('SIGTERM');setTimeout(()=>process.exit(0),500).unref();}
