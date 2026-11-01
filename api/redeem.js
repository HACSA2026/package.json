const {createClient}=require('@supabase/supabase-js');
const fails=new Map();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).end();
 const ip=(req.headers['x-forwarded-for']||'x').split(',')[0],now=Date.now();
 const f=(fails.get(ip)||[]).filter(t=>now-t<600000);
 if(f.length>=8)return res.status(429).json({error:'Too many wrong attempts. Please wait 10 minutes.'});
 const {code,items}=req.body||{};
 if(!code)return res.status(400).json({error:'Enter your code.'});
 const c=String(code).slice(0,40),bad=()=>{fails.set(ip,f.concat(now));return res.status(400).json({error:'That code is not valid. Check it and try again.'})};
 const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 if(!Array.isArray(items)){
  const {data,error}=await s.rpc('code_balance',{p_code:c});
  if(error)return res.status(500).json({error:'Something went wrong. Try again.'});
  return data<0?bad():res.json({balance:data});
 }
 const clean=items.slice(0,50).map(i=>({nominee_id:String(i.nominee_id),votes:Math.floor(+i.votes)})).filter(i=>UUID.test(i.nominee_id)&&i.votes>=1&&i.votes<=100000);
 if(!clean.length||clean.length!==Math.min(items.length,50))return res.status(400).json({error:'Choose at least one nominee and a valid number of votes.'});
 const {data,error}=await s.rpc('redeem_votes',{p_code:c,p_items:clean});
 if(error)return res.status(500).json({error:'Something went wrong. Please try again.'});
 if(data.startsWith('ok:')){const [,t,l]=data.split(':');return res.json({ok:true,votes:+t,left:+l})}
 if(data==='invalid')return bad();
 if(data.startsWith('short:')){const need=clean.reduce((a,i)=>a+i.votes,0);return res.status(400).json({error:`This code has only ${data.slice(6)} vote(s) left but you chose ${need}. Reduce your votes or use another code.`})}
 const msg={closed:'Voting is closed.',bad_nominee:'A selected nominee is not available.',empty:'Choose at least one vote.'}[data]||'Failed.';
 res.status(400).json({error:msg});
};
