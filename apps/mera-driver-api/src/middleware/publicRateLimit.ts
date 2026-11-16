import type { RequestHandler } from 'express';
/** Same bounded local IP-window protection as public location lookup. No identifiers logged. */
export function publicRateLimit(limit = 10, windowMs = 60000): RequestHandler {
  const windows = new Map<string,{start:number;count:number}>();
  return (req,res,next) => {
    const now=Date.now(),key=req.ip ?? 'unknown';
    for(const [ip,row] of windows) if(now-row.start >= windowMs) windows.delete(ip);
    if(!windows.has(key) && windows.size>=1000) {res.status(429).json({data:null,error:{code:'RATE_LIMITED',message:'Please wait before trying again.'}});return;}
    const row=windows.get(key) ?? {start:now,count:0};windows.set(key,row);
    if(++row.count>limit){res.setHeader('Retry-After',Math.ceil((windowMs-(now-row.start))/1000));res.status(429).json({data:null,error:{code:'RATE_LIMITED',message:'Too many requests. Please wait a minute and try again.'}});return;}
    next();
  };
}
