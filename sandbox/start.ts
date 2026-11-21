import fs from 'node:fs/promises';
import path from 'node:path';
import { initialDatabase } from '../src/data/initialData';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Fixed project-local isolation. Production ARCA_* paths are deliberately ignored.
const directory=path.join(process.cwd(),'sandbox-data');
await fs.mkdir(directory,{recursive:true});
const database=path.join(directory,'arca-demo-database.json');
try{await fs.access(database);}catch{
 const seed=structuredClone(initialDatabase);
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=2;i++){const page=pdf.addPage([595,842]);page.drawText('SAMPLE - NOT A REAL CERTIFICATE',{x:42,y:785,size:20,font,color:rgb(.4,.2,.7)});page.drawText(`DEMO COA - Page ${i}`,{x:42,y:740,size:18,font});page.drawText('Product: EHA-2 / Synthetic design data',{x:42,y:700,size:13,font});page.drawText('Purity: 99.5% | Water: 0.05% | Quantity: 20.16 MT',{x:42,y:670,size:12,font});page.drawText('Original content must remain visible under a letterhead.',{x:42,y:630,size:12,font});}
 const bytes=await pdf.save();const data='data:application/pdf;base64,'+Buffer.from(bytes).toString('base64');
 seed.orders[0].coaFiles=[{id:'demo-coa-file',name:'DEMO-COA.pdf',mimeType:'application/pdf',data,pageNumber:1,uploadedAt:'2026-11-20T12:00:00.000Z'}];
 seed.orders[0].blFiles=[{id:'demo-bl-file',name:'DEMO-BL.pdf',mimeType:'application/pdf',data,pageNumber:1,uploadedAt:'2026-11-20T12:00:00.000Z'}];
 await fs.writeFile(database,JSON.stringify(seed));
}
process.env.PORT ||= '3035';
// Use a browser only for the original PDF renderer; ordinary CRUD needs none.
if(!process.env.CHROMIUM_PATH){for(const candidate of ['/usr/bin/chromium-browser','/usr/bin/chromium','/usr/bin/google-chrome']){try{await fs.access(candidate);process.env.CHROMIUM_PATH=candidate;break;}catch{}}}
console.log('ARCA DESIGN DEMO: isolated synthetic data. Login demo / Demo-2026!');
await import('../server');
