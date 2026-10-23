import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
const XLSX=createRequire(import.meta.url)('xlsx');
try {
  const book=XLSX.read(Buffer.from(workerData),{type:'buffer',sheetRows:10002,cellFormula:false,cellHTML:false,cellStyles:false});
  const rows=[];let rowCount=0;
  for(const name of book.SheetNames) {
    const sheet=book.Sheets[name];
    const range=sheet['!fullref']||sheet['!ref'];
    if(range) rowCount+=XLSX.utils.decode_range(range).e.r+1;
    if(rowCount>10001) throw new Error('ROW_LIMIT');
    rows.push(...XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true}));
  }
  if(rows.length>10000) throw new Error('ROW_LIMIT');
  parentPort.postMessage({rows});
} catch(error) {parentPort.postMessage({error:error.message==='ROW_LIMIT'?'ROW_LIMIT':'INVALID_FILE'});}
