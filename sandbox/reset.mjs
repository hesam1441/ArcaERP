import fs from 'node:fs/promises';
await fs.rm(new URL('../sandbox-data/',import.meta.url),{recursive:true,force:true});
console.log('Only isolated demo data removed. Restart to restore the synthetic seed.');
