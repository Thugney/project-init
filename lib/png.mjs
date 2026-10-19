// Strict PNG 8-bit decoder and difference renderer. No image libraries or downloads required.
import fs from 'node:fs';
import zlib from 'node:zlib';
const SIG=Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_PIXELS=8_000_000;
function crc32(data){let crc=0xffffffff;for(const b of data){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type,'ascii'),l=Buffer.alloc(4),c=Buffer.alloc(4);l.writeUInt32BE(data.length);c.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([l,t,data,c]);}
export function readPng(file){
 const input=fs.readFileSync(file);if(input.length<40||!input.subarray(0,8).equals(SIG)||input.length>40*1024*1024)throw Error('Invalid or oversized PNG');
 let offset=8,header=null,idat=[],ended=false;
 while(offset+12<=input.length){const length=input.readUInt32BE(offset),type=input.toString('ascii',offset+4,offset+8);if(length>40*1024*1024||offset+12+length>input.length)throw Error('Corrupt PNG chunk');const bytes=input.subarray(offset+8,offset+8+length);const crc=input.readUInt32BE(offset+8+length);if(crc32(Buffer.concat([Buffer.from(type),bytes]))!==crc)throw Error(`PNG CRC failed (${type})`);offset+=length+12;
 if(type==='IHDR'){if(header||length!==13)throw Error('Invalid PNG header');const width=bytes.readUInt32BE(0),height=bytes.readUInt32BE(4),depth=bytes[8],color=bytes[9];if(width===0||height===0||width*height>MAX_PIXELS||depth!==8||![0,2,4,6].includes(color)||bytes[10]!==0||bytes[11]!==0||bytes[12]!==0)throw Error('Unsupported PNG format or dimensions');header={width,height,color};}
 else if(type==='IDAT'){idat.push(bytes);}
 else if(type==='IEND'){ended=true;break;}
 else if(type[0]===type[0].toUpperCase())throw Error(`Unknown critical PNG chunk ${type}`);
 }
 if(!header||!ended||!idat.length)throw Error('Incomplete PNG');
 const channels={0:1,2:3,4:2,6:4}[header.color],stride=header.width*channels;
 const raw=zlib.inflateSync(Buffer.concat(idat),{maxOutputLength:(stride+1)*header.height});
 if(raw.length!==(stride+1)*header.height)throw Error('Unexpected PNG data size');
 const rgba=Buffer.alloc(header.width*header.height*4),prior=Buffer.alloc(stride);let pos=0;
 for(let y=0;y<header.height;y++){const filter=raw[pos++],line=Buffer.alloc(stride);if(filter>4)throw Error('Unsupported PNG filter');for(let x=0;x<stride;x++){const left=x>=channels?line[x-channels]:0,up=prior[x],upLeft=x>=channels?prior[x-channels]:0;let prediction=0;
 if(filter===1)prediction=left;else if(filter===2)prediction=up;else if(filter===3)prediction=Math.floor((left+up)/2);else if(filter===4){const p=left+up-upLeft,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-upLeft);prediction=a<=b&&a<=c?left:b<=c?up:upLeft;}
 line[x]=(raw[pos++]+prediction)&255;}
 for(let x=0;x<header.width;x++){const source=x*channels,dest=(y*header.width+x)*4;if(header.color===6){rgba[dest]=line[source];rgba[dest+1]=line[source+1];rgba[dest+2]=line[source+2];rgba[dest+3]=line[source+3];}else if(header.color===2){rgba[dest]=line[source];rgba[dest+1]=line[source+1];rgba[dest+2]=line[source+2];rgba[dest+3]=255;}else{const grey=line[source];rgba[dest]=grey;rgba[dest+1]=grey;rgba[dest+2]=grey;rgba[dest+3]=channels===2?line[source+1]:255;}}
 line.copy(prior);
 }
 return {...header,rgba};
}
export function writePng(file,{width,height,rgba}){
 if(width*height>MAX_PIXELS||rgba.length!==width*height*4)throw Error('Invalid PNG dimensions');
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const scan=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++){const off=y*(width*4+1);scan[off]=0;rgba.copy(scan,off+1,y*width*4,(y+1)*width*4);}
 fs.writeFileSync(file,Buffer.concat([SIG,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]),{flag:'w',mode:0o600});
}
export function comparePng(reference,actual,{pixelThreshold=24,maxDiffRatio=0.02,diffOutput}={}){
 if(!(Number.isInteger(pixelThreshold)&&pixelThreshold>=0&&pixelThreshold<=255&&Number.isFinite(maxDiffRatio)&&maxDiffRatio>=0&&maxDiffRatio<=1))throw Error('Invalid visual thresholds');
 const base=readPng(reference),seen=readPng(actual);if(base.width!==seen.width||base.height!==seen.height) return {passed:false,reason:`Dimension mismatch: expected ${base.width}x${base.height}, actual ${seen.width}x${seen.height}`,expected:{width:base.width,height:base.height},actual:{width:seen.width,height:seen.height}};
 let different=0;const output=diffOutput?Buffer.alloc(base.rgba.length):null;
 for(let i=0;i<base.rgba.length;i+=4){const a=base.rgba,b=seen.rgba;
 // Compare effective RGB on white so transparent pixels cannot hide a visible color difference.
 const blend=(arr,c)=>Math.round((arr[i+c]*arr[i+3]+255*(255-arr[i+3]))/255);
 const delta=Math.max(Math.abs(blend(a,0)-blend(b,0)),Math.abs(blend(a,1)-blend(b,1)),Math.abs(blend(a,2)-blend(b,2)));
 const change=delta>pixelThreshold;if(change)different++;
 if(output){output[i]=change?245:Math.round(blend(b,0)*.25+190);output[i+1]=change?75:Math.round(blend(b,1)*.25+190);output[i+2]=change?81:Math.round(blend(b,2)*.25+190);output[i+3]=255;}
 }
 const pixels=base.width*base.height,ratio=different/pixels;
 if(diffOutput)writePng(diffOutput,{width:base.width,height:base.height,rgba:output});
 return {passed:ratio<=maxDiffRatio,changedPixels:different,totalPixels:pixels,diffRatio:ratio,maxDiffRatio,pixelThreshold,width:base.width,height:base.height};
}
