"use strict";
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname,'..','textures');
fs.mkdirSync(dir,{recursive:true});
const filenames=['8k_earth_daymap.jpg','8k_earth_nightmap.jpg','8k_earth_clouds.jpg'];
function is8k(buf){
  if(buf.length<130000||buf[0]!==0xff||buf[1]!==0xd8)return false;
  let pos=2;
  while(pos+9<buf.length){
    if(buf[pos]!==0xff){pos++;continue;}
    while(buf[pos]===0xff)pos++;
    const marker=buf[pos++];
    if(marker===0xd8||marker===0xd9)continue;
    if(marker===0xda)break;
    const length=buf.readUInt16BE(pos);
    if(length<2||pos+length>buf.length)break;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      return buf.readUInt16BE(pos+5)>=8000 && buf.readUInt16BE(pos+3)>=4000;
    }
    pos+=length;
  }
  return false;
}
async function getTexture(file){
  const target=path.join(dir,file);
  if(fs.existsSync(target)&&is8k(fs.readFileSync(target))){console.log('ATLAS: using provided 8K map',file);return true;}
  if(process.env.ATLAS_SKIP_TEXTURE_DOWNLOAD==='1')return false;
  const url='https://sites.solarsystemscope.com/textures/download/'+file;
  console.log('ATLAS: downloading',file);
  try {
    const result=await fetch(url,{signal:AbortSignal.timeout(80000),headers:{'User-Agent':'Mozilla/5.0 (ATLAS site; CC BY 4.0 texture user)'}});
    if(!result.ok)throw new Error('HTTP '+result.status);
    const length=Number(result.headers.get('content-length')||'0');
    if(length>30000000)throw new Error('Unexpectedly large file');
    const bytes=Buffer.from(await result.arrayBuffer());
    if(bytes.length>30000000||!is8k(bytes))throw new Error('Invalid image or not 8K');
    fs.writeFileSync(target,bytes);console.log('ATLAS: installed',file, Math.round(bytes.length/1024/1024)+' MB');return true;
  }catch(err){console.warn('ATLAS: 8K download unavailable for',file,err.message);return false;}
}
(async()=>{
  const result=await Promise.all(filenames.map(getTexture));
  if(result.every(Boolean))console.log('ATLAS: Ultra 8K ready on Render.');
  else console.log('ATLAS: Balanced globe works. To enable Ultra, upload missing JPEGs to textures/ in GitHub.');
})().catch(e=>{console.warn('ATLAS: skipping optional 8K assets',e.message)});
