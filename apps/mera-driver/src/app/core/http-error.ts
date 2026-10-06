/** HttpClient returns JSON errors as Blobs for binary download requests. */
export async function httpErrorMessage(error: {status?:number;message?:string;error?:unknown}):Promise<string>{
  let body=error.error;
  if(body instanceof Blob){try{const blob=body;const text=typeof blob.text==='function'?await blob.text():await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob);});body=JSON.parse(text);}catch{/* retain HTTP context */}}
  const message=(body as {error?:{message?:string};message?:string}|null)?.error?.message??(body as {message?:string}|null)?.message??error.message??'Request failed';
  return error.status===0?'Unable to connect to the API. Check that the backend is running.':`HTTP ${error.status??'error'}: ${message}`;
}
