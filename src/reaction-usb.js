(function(root,factory){if(typeof module==='object')module.exports=factory(require('./sequential-core.js'));else root.ReactionUSB=factory(root.Sequential);})(globalThis,function(E){
  'use strict';
  const VERSION='usb-snapshot-v1';
  const check=(value,reason)=>{if(!value)throw Error(reason);};
  function frame(line){
    if(!line.startsWith('@USB1 '))return null;
    check(line.length<=4096,'USB line limit');
    return JSON.parse(line.slice(6));
  }
  class SnapshotDecoder {
    constructor(request){this.request=request;this.buffer='';this.started=false;this.done=false;this.current=null;this.files=new Map();this.total=0;this.entries=[];}
    push(text){
      this.buffer+=text;let index;
      while((index=this.buffer.indexOf('\n'))!==-1){const line=this.buffer.slice(0,index).replace(/\r$/,'');this.buffer=this.buffer.slice(index+1);const f=frame(line);if(f)this.accept(f);}
      check(this.buffer.length<=4096,'USB line limit');
    }
    accept(f){
      if(f.request!==this.request)return;
      if(f.type==='error')throw Error(f.reason||'USB export error');
      if(this.done)return;
      if(f.type==='begin'){check(!this.started&&f.version===VERSION,'USB version / repeated begin');this.started=true;return;}
      check(this.started,'USB snapshot has not begun');
      if(f.type==='file'){
        check(!this.current,'USB unfinished file');
        check(typeof f.path==='string'&&/^P\d{4}\/S\d{4}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,149}\.json(?:\.crc32)?$/.test(f.path)&&!f.path.includes('..'),'USB path');
        check(!this.files.has(f.path)&&this.files.size<10000,'USB duplicate path / file limit');
        check(Number.isInteger(f.bytes)&&f.bytes>=0&&f.bytes<=262144,'USB file size');
        this.total+=f.bytes;check(this.total<=67108864,'USB total size');
        this.current={path:f.path,data:new Uint8Array(f.bytes),at:0};return;
      }
      if(f.type==='chunk'){
        const c=this.current;check(c&&f.offset===c.at&&typeof f.hex==='string'&&f.hex.length<=256&&/^(?:[0-9a-f]{2})+$/.test(f.hex),'USB chunk order / encoding');
        const n=f.hex.length/2;check(c.at+n<=c.data.length,'USB chunk exceeds file');
        for(let i=0;i<n;i++)c.data[c.at++]=parseInt(f.hex.slice(i*2,i*2+2),16);return;
      }
      if(f.type==='file_end'){
        const c=this.current;check(c&&c.at===c.data.length,'USB incomplete file');
        check(E.crc32(c.data).toString(16).padStart(8,'0')===f.crc,'USB transport CRC mismatch');
        this.files.set(c.path,new TextDecoder('utf-8',{fatal:true}).decode(c.data));this.current=null;return;
      }
      if(f.type==='end'){
        check(!this.current&&f.files===this.files.size,'USB file count mismatch');
        this.entries=[...this.files].filter(([n])=>n.endsWith('.json')).map(([name,text])=>({name,text,crc:this.files.get(name+'.crc32')}));
        this.done=true;return;
      }
      throw Error('Unknown USB frame');
    }
  }
  class Connection {
    constructor(port){this.port=port;this.id=Math.floor(Math.random()*2147483646);this.pending=null;this.closed=false;this.ready=false;this.buffer='';this.onAvailability=null;}
    async open(){
      await this.port.open({baudRate:115200,flowControl:'none'});
      try{await this.port.setSignals({dataTerminalReady:false,requestToSend:false});}catch(e){await this.port.close();throw e;}
      this.writer=this.port.writable.getWriter();this.reader=this.port.readable.getReader();this.reading=this.readLoop();
    }
    settle(error,result,expectedId){
      const p=this.pending;if(!p||(expectedId!==undefined&&p.id!==expectedId))return;this.pending=null;clearTimeout(p.timer);
      if(error){error.usbAction=p.action;p.reject(error);}else p.resolve(result);
    }
    async readLoop(){
      const decoder=new TextDecoder();
      try{
        while(!this.closed){
          const {value,done}=await this.reader.read();if(done)break;
          this.buffer+=decoder.decode(value,{stream:true});let index;
          while((index=this.buffer.indexOf('\n'))!==-1){
            const line=this.buffer.slice(0,index).replace(/\r$/,'');this.buffer=this.buffer.slice(index+1);
            try{
              const f=frame(line),p=this.pending;if(!f)continue;
              if(f.type==='availability'&&f.request===0&&f.version===VERSION&&typeof f.ready==='boolean'){
                this.ready=f.ready;if(this.onAvailability)this.onAvailability(f.ready);continue;
              }
              if(!p||f.request!==p.id)continue;
              if(f.type==='error')throw Error(f.reason||'USB error');
              if(p.action==='PING'){
                check(f.type==='status'&&f.version===VERSION&&typeof f.ready==='boolean','Unsupported USB firmware');
                this.ready=f.ready;this.settle(null,f);
              }else{p.snapshot.accept(f);if(p.snapshot.done)this.settle(null,p.snapshot.entries);}
            }catch(e){this.settle(e);}
          }
          if(this.buffer.length>4096){this.buffer='';this.settle(Error('USB line limit'));}
        }
        if(!this.closed)this.settle(Error('USB disconnected'));
      }catch(e){this.settle(e);}finally{this.closed=true;this.reader.releaseLock();}
    }
    request(action,timeout){
      if(this.closed||this.pending)return Promise.reject(Error('USB disconnected or busy'));
      check(action==='PING'||action==='SYNC','Unsupported USB action');
      this.id=this.id%2147483647+1;const id=this.id;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>this.settle(Error(action==='PING'?'Waiting for idle device / USB firmware':'USB snapshot timeout'),undefined,id),timeout||(action==='PING'?2500:125000));
        this.pending={id,action,resolve,reject,timer,snapshot:action==='SYNC'?new SnapshotDecoder(id):null};
        this.writer.write(new TextEncoder().encode(`@USB1 ${action} ${id}\n`)).catch(e=>this.settle(e,undefined,id));
      });
    }
    async snapshot(){const status=await this.request('PING');if(!status.ready)return null;return this.request('SYNC');}
    async close(){
      const wasSync=this.pending?.action==='SYNC';this.closed=true;this.settle(Error('USB closed'));
      try{if(wasSync&&this.writer)await this.writer.write(new Uint8Array([3]));}
      finally{
        if(this.reader){try{await this.reader.cancel();}catch(_){}await this.reading;}
        if(this.writer){this.writer.releaseLock();this.writer=null;}
        try{await this.port.close();}catch(_){}
      }
    }
  }
  return {VERSION,SnapshotDecoder,Connection};
});
