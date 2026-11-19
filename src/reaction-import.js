(function(root,factory){if(typeof module==='object')module.exports=factory();else root.ReactionImport=factory();})(globalThis,function(){
  'use strict';
  const MAX_FILES=10000, MAX_TOTAL=64*1024*1024, MAX_FILE=262144;
  async function fromFiles(files) {
    const map=new Map(); let total=0;
    for (const file of files) {
      if (!/\.(json|crc32)$/i.test(file.name)) continue;
      if (map.size>=MAX_FILES) throw Error('Import exceeds 10,000 relevant files');
      if (file.size>MAX_FILE) throw Error('File exceeds 256 KiB: '+file.name);
      total+=file.size;
      if (total>MAX_TOTAL) throw Error('Import exceeds 64 MiB');
      const name=file.webkitRelativePath||file.relativeName||file.name;
      if(map.has(name)) throw Error('Duplicate path: '+name);
      map.set(name,await file.text());
    }
    return [...map].filter(([name])=>/\.json$/i.test(name)).map(([name,text])=>({name,text,crc:map.get(name+'.crc32')}));
  }
  async function fromDirectory(handle) {
    const files=[];
    async function visit(dir,prefix,depth) {
      if (depth>12) throw Error('Folder nesting exceeds 12 levels');
      for await (const [name,entry] of dir.entries()) {
        if(entry.kind==='directory') await visit(entry,prefix+name+'/',depth+1);
        else if(/\.(json|crc32)$/i.test(name)) {
          if(files.length>=MAX_FILES) throw Error('Too many files');
          const f=await entry.getFile();
          files.push({name:f.name,relativeName:prefix+name,size:f.size,text:()=>f.text()});
        }
      }
    }
    await visit(handle,'',0);
    return fromFiles(files);
  }
  return {fromFiles,fromDirectory,MAX_FILES,MAX_TOTAL,MAX_FILE};
});
