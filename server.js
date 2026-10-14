require('dotenv').config();
const express = require('express');
const session = require('express-session');
const {DatabaseSync}=require('node:sqlite');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');

const path = require('path');
const fs = require('fs');
const app = express();
const dbFile = path.resolve(process.env.DB_PATH || './data/nexora.db');
fs.mkdirSync(path.dirname(dbFile), {recursive:true});
const db = new DatabaseSync(dbFile); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
require('./db/init'); // additive schema migrations and missing catalog rows run on every startup.
const q = (sql,...args)=>db.prepare(sql).all(...args);
const one = (sql,...args)=>db.prepare(sql).get(...args);
const safeUser = u => u ? ({id:u.id,name:u.name,email:u.email}) : null;
class SqliteSessionStore extends session.Store {
  constructor(database) { super(); this.db=database; this.read=database.prepare('SELECT data,expires FROM sessions WHERE sid=?'); this.write=database.prepare('INSERT INTO sessions(sid,data,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data,expires=excluded.expires'); this.remove=database.prepare('DELETE FROM sessions WHERE sid=?'); }
  get(sid,cb) { try { const row=this.read.get(sid); if(!row)return cb(null,null); if(row.expires && row.expires<Date.now()){this.remove.run(sid);return cb(null,null)} cb(null,JSON.parse(row.data)); } catch(e){cb(e)} }
  set(sid,sess,cb=()=>{}) { try { const exp=sess.cookie?.expires?new Date(sess.cookie.expires).getTime():Date.now()+7*86400000; this.write.run(sid,JSON.stringify(sess),exp); cb(null); } catch(e){cb(e)} }
  destroy(sid,cb=()=>{}) { try { this.remove.run(sid); cb(null); } catch(e){cb(e)} }
  touch(sid,sess,cb=()=>{}) { this.set(sid,sess,cb); }
}
db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);');
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],imgSrc:["'self'",'data:','https://images.unsplash.com'],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],scriptSrc:["'self'"],connectSrc:["'self'"]}}}));
app.use(express.json({limit:'30kb'}));
app.use(session({store:new SqliteSessionStore(db),secret:process.env.SESSION_SECRET||'development-only-change-this-secret',resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*24*60*60*1000}}));
app.use(express.static(path.join(__dirname,'public')));
const auth=(req,res,next)=>req.session.userId?next():res.status(401).json({error:'Please sign in to continue.'});
const validEmail=s=>typeof s==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const serialize=p=>({...p,category:p.category,finalPrice:Math.round(p.price*(100-p.discount))/100,images:[p.image]});
const productSelect=`SELECT p.*, c.name category FROM products p JOIN categories c ON c.id=p.category_id`;
app.get('/api/me',(req,res)=>res.json({user:safeUser(req.session.user)}));
app.post('/api/register',async(req,res)=>{const{name,email,password}=req.body||{};if(typeof name!=='string'||name.trim().length<2||name.length>80||!validEmail(email)||typeof password!=='string'||password.length<8||password.length>100)return res.status(400).json({error:'Enter a name, a valid email and a password of at least 8 characters.'});try{const result=db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim(),email.trim().toLowerCase(),await bcrypt.hash(password,12));const newUser=one('SELECT id,name,email FROM users WHERE id=?',result.lastInsertRowid);req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Unable to create your account.'});req.session.userId=newUser.id;req.session.user=newUser;res.status(201).json({user:safeUser(newUser)});});}catch(e){if(String(e.code||'').includes('CONSTRAINT')||String(e.message||'').toLowerCase().includes('unique constraint'))return res.status(409).json({error:'An account with that email already exists.'});res.status(500).json({error:'Unable to create your account.'});}});
app.post('/api/login',async(req,res)=>{const{email,password}=req.body||{};if(!validEmail(email)||typeof password!=='string')return res.status(400).json({error:'Enter a valid email and password.'});const u=one('SELECT * FROM users WHERE email=?',email.trim().toLowerCase());if(!u||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:'Email or password is incorrect.'});req.session.regenerate(err=>{if(err)return res.status(500).json({error:'Unable to sign in.'});req.session.userId=u.id;req.session.user={id:u.id,name:u.name,email:u.email};res.json({user:safeUser(req.session.user)});});});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/categories',(req,res)=>res.json(q('SELECT * FROM categories ORDER BY name')));
app.get('/api/products',(req,res)=>{const {search='',category,min,max,sort='featured',page=1,limit=12}=req.query;const where=[],vals=[];if(search){where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)');const s=`%${String(search).slice(0,80)}%`;vals.push(s,s,s);}if(category){where.push('c.slug=?');vals.push(String(category));}if(min!==undefined&&min!==''&&Number.isFinite(+min)){where.push('p.price*(100-p.discount)/100>=?');vals.push(Math.max(0,+min));}if(max!==undefined&&max!==''&&Number.isFinite(+max)){where.push('p.price*(100-p.discount)/100<=?');vals.push(Math.max(0,+max));}const orders={featured:'p.featured DESC,p.created_at DESC',price_asc:'p.price*(100-p.discount)/100 ASC',price_desc:'p.price*(100-p.discount)/100 DESC',rating:'p.rating DESC',newest:'p.created_at DESC'};const clause=where.length?' WHERE '+where.join(' AND '):'';const total=one(`SELECT COUNT(*) n FROM products p JOIN categories c ON c.id=p.category_id${clause}`,...vals).n;const take=Math.min(48,Math.max(1,parseInt(limit)||12)),pg=Math.max(1,parseInt(page)||1);const items=q(`${productSelect}${clause} ORDER BY ${orders[sort]||orders.featured} LIMIT ? OFFSET ?`,...vals,take,(pg-1)*take).map(serialize);res.json({items,total,page:pg,pages:Math.ceil(total/take)});});
app.get('/api/products/:id',(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(404).json({error:'We could not find that product.'});const p=one(`${productSelect} WHERE p.id=?`,id);if(!p)return res.status(404).json({error:'We could not find that product.'});res.json(serialize(p));});
app.get('/api/cart',auth,(req,res)=>{const items=q(`${productSelect} JOIN carts ca ON ca.product_id=p.id WHERE ca.user_id=? ORDER BY p.name`,req.session.userId).map(p=>({...serialize(p),quantity:one('SELECT quantity FROM carts WHERE user_id=? AND product_id=?',req.session.userId,p.id).quantity}));const subtotal=items.reduce((s,p)=>s+p.finalPrice*p.quantity,0);const gross=items.reduce((s,p)=>s+p.price*p.quantity,0);res.json({items,subtotal,gross,discount:gross-subtotal});});
app.post('/api/cart',auth,(req,res)=>{const id=Number(req.body.productId),quantity=Number(req.body.quantity||1);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Choose a valid product.'});const p=one('SELECT id,stock FROM products WHERE id=?',id);if(!p)return res.status(404).json({error:'Product not found.'});if(!Number.isInteger(quantity)||quantity<1||quantity>p.stock)return res.status(400).json({error:'That quantity is not available.'});const current=one('SELECT quantity FROM carts WHERE user_id=? AND product_id=?',req.session.userId,id)?.quantity||0;if(current+quantity>p.stock)return res.status(400).json({error:`Only ${p.stock-current} more available.`});db.prepare('INSERT INTO carts(user_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=quantity+excluded.quantity').run(req.session.userId,id,quantity);res.json({ok:true});});
app.patch('/api/cart/:id',(req,res)=>{if(!req.session.userId)return res.status(401).json({error:'Please sign in.'});const id=Number(req.params.id),n=Number(req.body.quantity);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Choose a valid product.'});const p=one('SELECT stock FROM products WHERE id=?',id);if(!Number.isInteger(n)||n<1||!p||n>p.stock)return res.status(400).json({error:'Quantity exceeds available stock.'});db.prepare('UPDATE carts SET quantity=? WHERE user_id=? AND product_id=?').run(n,req.session.userId,id);res.json({ok:true});});
app.delete('/api/cart/:id',(req,res)=>{if(!req.session.userId)return res.status(401).json({error:'Please sign in.'});const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'Choose a valid product.'});db.prepare('DELETE FROM carts WHERE user_id=? AND product_id=?').run(req.session.userId,id);res.json({ok:true});});
app.delete('/api/cart',(req,res)=>{if(!req.session.userId)return res.status(401).json({error:'Please sign in.'});db.prepare('DELETE FROM carts WHERE user_id=?').run(req.session.userId);res.json({ok:true});});
app.get('/api/wishlist',auth,(req,res)=>res.json(q('SELECT p.id,p.name FROM wishlists w JOIN products p ON p.id=w.product_id WHERE w.user_id=?',req.session.userId)));
app.post('/api/wishlist/:id',auth,(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1||!one('SELECT id FROM products WHERE id=?',id))return res.status(404).json({error:'Product not found.'});db.prepare('INSERT OR IGNORE INTO wishlists(user_id,product_id) VALUES(?,?)').run(req.session.userId,id);res.json({ok:true});});
app.get('/api/orders',auth,(req,res)=>res.json(q('SELECT id,order_number,status,total,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC',req.session.userId)));
app.get('/api/orders/:id',auth,(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(404).json({error:'Order not found.'});const o=one('SELECT * FROM orders WHERE id=? AND user_id=?',id,req.session.userId);if(!o)return res.status(404).json({error:'Order not found.'});o.items=q('SELECT * FROM order_items WHERE order_id=?',o.id);res.json(o);});
app.post('/api/checkout',auth,(req,res)=>{
  const f=req.body||{};
  for(const k of ['name','email','phone','address','city','postalCode'])if(typeof f[k]!=='string'||!f[k].trim()||f[k].length>200)return res.status(400).json({error:'Complete all shipping details.'});
  if(!validEmail(f.email)||f.phone.trim().length<7||f.phone.length>30)return res.status(400).json({error:'Enter a valid email and phone number.'});
  const userId=req.session.userId,key=f.idempotencyKey;
  if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))return res.status(400).json({error:'Refresh checkout and try placing your order again.'});
  const previous=one('SELECT o.id,o.order_number,o.total FROM checkout_requests c JOIN orders o ON o.id=c.order_id WHERE c.user_id=? AND c.idempotency_key=?',userId,key);
  if(previous)return res.json({id:previous.id,orderNumber:previous.order_number,total:previous.total,duplicate:true});
  const items=q(productSelect+' JOIN carts ca ON ca.product_id=p.id WHERE ca.user_id=?',userId).map(p=>({...p,quantity:one('SELECT quantity FROM carts WHERE user_id=? AND product_id=?',userId,p.id).quantity}));
  if(!items.length)return res.status(400).json({error:'Your cart is empty.'});
  for(const p of items)if(p.quantity>p.stock)return res.status(409).json({error:p.name+' no longer has enough stock.'});
  const subtotal=items.reduce((s,p)=>s+p.price*p.quantity,0),discount=items.reduce((s,p)=>s+(p.price*p.discount/100)*p.quantity,0),shipping=subtotal-discount>=100?0:9.95,total=Number((subtotal-discount+shipping).toFixed(2));
  const orderNumber='NX-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  try{
    db.exec('BEGIN IMMEDIATE');
    let result;
    try{
      const repeated=one('SELECT o.id,o.order_number,o.total FROM checkout_requests c JOIN orders o ON o.id=c.order_id WHERE c.user_id=? AND c.idempotency_key=?',userId,key);
      if(repeated){db.exec('COMMIT');result={...repeated,duplicate:true};}
      else{
        const order=db.prepare('INSERT INTO orders(user_id,order_number,status,name,email,phone,address,city,postal_code,subtotal,discount,shipping,total) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(userId,orderNumber,'Processing',f.name.trim(),f.email.trim(),f.phone.trim(),f.address.trim(),f.city.trim(),String(f.postalCode).trim(),subtotal,discount,shipping,total);
        for(const p of items){
          const changed=db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(p.quantity,p.id,p.quantity);
          if(!changed.changes)throw Error('STOCK');
          db.prepare('INSERT INTO order_items(order_id,product_id,product_name,image,unit_price,quantity,line_total) VALUES(?,?,?,?,?,?,?)').run(order.lastInsertRowid,p.id,p.name,p.image,p.price*(100-p.discount)/100,p.quantity,p.price*(100-p.discount)/100*p.quantity);
        }
        db.prepare('DELETE FROM carts WHERE user_id=?').run(userId);
        db.prepare('INSERT INTO checkout_requests(user_id,idempotency_key,order_id) VALUES(?,?,?)').run(userId,key,order.lastInsertRowid);
        db.exec('COMMIT');result={id:order.lastInsertRowid,order_number:orderNumber,total,duplicate:false};
      }
    }catch(err){db.exec('ROLLBACK');throw err;}
    res.status(result.duplicate?200:201).json({id:result.id,orderNumber:result.order_number,total:result.total,duplicate:result.duplicate});
  }catch(e){res.status(409).json({error:e.message==='STOCK'?'Stock changed while placing your order. Please review your cart.':'Unable to place the order. Please try again.'});}
});
app.post('/api/newsletter',(req,res)=>{const email=req.body?.email;if(!validEmail(email))return res.status(400).json({error:'Enter a valid email address.'});res.json({ok:true,message:'You’re on the list. Look out for a note from us soon.'});});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{console.error(err.message);res.status(500).json({error:'Something went wrong. Please try again.'});});
if(process.env.NODE_ENV==='production'&&!process.env.SESSION_SECRET)throw new Error('SESSION_SECRET must be set in production.');if(process.env.NODE_ENV==='production')app.set('trust proxy',1);
if(require.main===module){
  const port=Number(process.env.PORT)||3000;
  const start=(candidate,isFallback=false)=>{
    const server=app.listen(candidate,'0.0.0.0',()=>{
      if(isFallback)console.warn(`Port 3000 is unavailable; using port ${candidate}. Set PORT to choose a different port.`);
      console.log(`NEXORA is ready at http://localhost:${candidate}`);
    });
    server.on('error',err=>{
      if(err.code==='EADDRINUSE'&&!process.env.PORT&&candidate<3010)return start(candidate+1,true);
      console.error(`Unable to start NEXORA on port ${candidate}: ${err.message}`);
      process.exitCode=1;
    });
  };
  start(port);
} app.locals.db=db; module.exports=app;







