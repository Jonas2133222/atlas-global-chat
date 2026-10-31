"use strict";
// Solar System Scope Earth maps (CC BY 4.0), derived from NASA imagery.
// Only install verified genuine 8192x4096 JPEGs. Failures never create a fake 8K file.
const fs=require('node:fs');
const path=require('node:path');
const dir=path.join(__dirname,'..','textures');
const names=['8k_earth_daymap.jpg','8k_earth_nightmap.jpg','8k_earth_clouds.jpg'];
fs.mkdirSync(dir,{recursive:true});
function jpegDimensions(buf){
 if(!buf||buf.length<130000||buf[0]!==0xff||buf[1]!==0xd8)return null;
 let p=2;
 while(p+9<buf.length){
  if(buf[p]!==0xff){p++;continue;}
  while(buf[p]===0xff)p++;
  const marker=buf[p++];
  if(marker===0xd8||marker===0xd9)continue;
  if(marker===0xda||p+2>buf.length)break;
  const len=buf.readUInt16BE(p);
  if(len<2||p+len>buf.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))
   return {width:buf.readUInt16BE(p+5),height:buf.readUInt16BE(p+3)};
  p+=len;
 }
 return null;
}
function is8k(buf){const d=jpegDimensions(buf);return !!(d&&d.width>=8000&&d.height>=4000);}
function validSaved(name){try{return is8k(fs.readFileSync(path.join(dir,name)));}catch{return false;}}
function sources(name){return [
 `https://sites.solarsystemscope.com/textures/download/${name}`,
 `https://raw.githubusercontent.com/ZGdadong/Three.js-3D-Earth/main/images/${name}`,
 `https://cdn.solarsystemscope.com/textures/download/${name}`,
 `https://www.solarsystemscope.com/textures/download/${name}`,
 ];}
async function download(name){
 if(validSaved(name)){console.log('ATLAS 8K:',name,'is ready');return true;}
 if(process.env.ATLAS_SKIP_TEXTURE_DOWNLOAD==='1')return false;
 for(const url of sources(name)){
  try{
   console.log('ATLAS 8K: fetching',name,'from',new URL(url).hostname);
   const response=await fetch(url,{signal:AbortSignal.timeout(18000),redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (ATLAS globe; CC BY 4.0 maps)'}});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   if(Number(response.headers.get('content-length')||'0')>30000000)throw Error('too large');
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>30000000||!is8k(bytes))throw Error('not a genuine 8K JPEG');
   const finalPath=path.join(dir,name);
   fs.writeFileSync(finalPath+'.part',bytes);
   fs.renameSync(finalPath+'.part',finalPath);
   console.log('ATLAS 8K: downloaded',name,bytes.length,'bytes');return true;
  }catch(e){console.warn('ATLAS 8K:',name,new URL(url).hostname,e.message);}
 }
 console.warn('ATLAS 8K: all automatic download hosts failed for',name);
 return false;
}
async function installTextures(){
 const results=await Promise.all(names.map(download));
 const okay=results.every(Boolean);
 console.log(okay?'ATLAS 8K: all full-resolution maps installed.':'ATLAS 8K: incomplete; check logs or add original JPEGs to textures/.');
 return okay;
}
module.exports={installTextures,validSaved};
if(require.main===module) installTextures().catch(e=>{console.error('ATLAS 8K:',e);process.exitCode=1});
