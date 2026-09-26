import fs from 'node:fs';
import path from 'node:path';

const sourceArg=process.argv[2];
if(!sourceArg){
  console.error('Usage: DB_FILE=/data/tradeflow.db node scripts/restore-backup.mjs /data/backups/tradeflow-*.sqlite');
  process.exit(1);
}
const source=path.resolve(sourceArg),target=path.resolve(process.env.DB_FILE||'./tradeflow.db');
if(!fs.existsSync(source)){console.error('Backup not found:',source);process.exit(2);}
const header=Buffer.alloc(16);const fd=fs.openSync(source,'r');fs.readSync(fd,header,0,16,0);fs.closeSync(fd);
if(header.toString('utf8')!=='SQLite format 3\u0000'){console.error('Refusing restore: source is not a valid SQLite database');process.exit(3);}
fs.mkdirSync(path.dirname(target),{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
if(fs.existsSync(target)){
  const safety=`${target}.pre-restore-${stamp}`;fs.copyFileSync(target,safety);console.log('Current DB safety copy:',safety);
}
for(const suffix of ['-wal','-shm']){try{fs.unlinkSync(target+suffix)}catch{}}
const temp=`${target}.restore-${process.pid}.tmp`;fs.copyFileSync(source,temp);fs.renameSync(temp,target);
console.log('Database restored:',target);
console.log('Source backup:',source);
console.log('Start TradeFlow again only after this command completes successfully.');
