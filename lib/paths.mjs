import fs from 'node:fs';
import path from 'node:path';

// Git may report an 8.3 alias while Node reports the long Windows path. Resolve
// existing objects through the filesystem rather than guessing from path text.
function physicalPath(value){return fs.realpathSync.native(path.resolve(value));}

export function existingPathIdentity(value){
 const physical=physicalPath(value),stat=fs.statSync(physical,{bigint:true});
 if(stat.dev!==0n&&stat.ino!==0n)return `inode:${stat.dev}:${stat.ino}`;
 // Native realpath expands existing aliases. Preserve case for filesystems with
 // case-sensitive directories; unavailable file IDs must not imply equality.
 return `realpath:${path.normalize(physical)}`;
}

export function sameExistingPath(left,right){
 try{return existingPathIdentity(left)===existingPathIdentity(right);}
 catch{return false;}
}

export function isWithinExistingPath(target,root){
 try{
  const physicalRoot=physicalPath(root);
  if(!fs.statSync(physicalRoot).isDirectory())return false;
  const rootIdentity=existingPathIdentity(physicalRoot);
  let cursor=physicalPath(target);
  while(true){
   if(existingPathIdentity(cursor)===rootIdentity)return true;
   const parent=path.dirname(cursor);
   if(parent===cursor)return false;
   cursor=parent;
  }
 }catch{return false;}
}
