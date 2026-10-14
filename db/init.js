const {DatabaseSync}=require('node:sqlite');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const file = path.resolve(process.env.DB_PATH || './data/nexora.db');
fs.mkdirSync(path.dirname(file), {recursive:true});
const db = new DatabaseSync(path.resolve(file));
db.exec('PRAGMA foreign_keys=ON;');
db.exec('PRAGMA journal_mode=WAL;')
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, slug TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), description TEXT NOT NULL, price REAL NOT NULL CHECK(price>=0), discount INTEGER DEFAULT 0 CHECK(discount BETWEEN 0 AND 90), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock>=0), rating REAL DEFAULT 4.5, review_count INTEGER NOT NULL DEFAULT 0, specifications TEXT NOT NULL DEFAULT '{}', image TEXT NOT NULL, featured INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE TABLE IF NOT EXISTS carts (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(user_id, product_id));
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), order_number TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'Processing', name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT NOT NULL, subtotal REAL NOT NULL, discount REAL NOT NULL, shipping REAL NOT NULL, total REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id), product_name TEXT NOT NULL, image TEXT NOT NULL, unit_price REAL NOT NULL, quantity INTEGER NOT NULL, line_total REAL NOT NULL);
CREATE TABLE IF NOT EXISTS checkout_requests (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, idempotency_key TEXT NOT NULL, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, PRIMARY KEY(user_id,idempotency_key));
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS wishlists (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, PRIMARY KEY(user_id, product_id));
`);
// Additive migrations keep existing customer and order data intact.
const productColumns = new Set(db.prepare('PRAGMA table_info(products)').all().map(c => c.name));
if (!productColumns.has('review_count')) db.exec('ALTER TABLE products ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0');
if (!productColumns.has('specifications')) db.exec("ALTER TABLE products ADD COLUMN specifications TEXT NOT NULL DEFAULT '{}'");
const cats = [['Electronics','electronics'],['Mobiles','mobiles'],['Laptops','laptops'],['Fashion','fashion'],['Shoes','shoes'],['Beauty and Personal Care','beauty'],['Home and Living','home'],['Kitchen Appliances','kitchen'],['Grocery','grocery'],['Books','books'],['Sports and Fitness','sports'],['Accessories','accessories']];
const insertCat = db.prepare('INSERT INTO categories(name,slug) VALUES (?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name');
cats.forEach(([name,slug]) => insertCat.run(name,slug));
const data = [
['QuietComfort Ultra Headphones','Bose','Electronics','Immersive spatial audio with world-class noise cancellation and all-day comfort.',429,15,24,4.9,'photo-1505740420928-5e560c06d30e',1],
['Studio Wireless Headphones','Sony','Electronics','Pure sound, beautifully balanced. Adaptive noise cancelling for every journey.',349,10,18,4.8,'photo-1484704849700-f032a568e944',1],
['iPhone 16 Pro','Apple','Mobiles','A18 Pro chip, stunning titanium design and the most advanced camera system ever.',1199,0,12,4.9,'photo-1592750475338-74b7b21085ab',1],
['Galaxy S25 Ultra','Samsung','Mobiles','Epic AI, a built-in S Pen and a pro-grade camera in one remarkable device.',1299,8,15,4.8,'photo-1511707171634-5f897ff02aa9',0],
['Pixel 9 Pro','Google','Mobiles','The most helpful Pixel yet, with beautiful photos and Gemini built right in.',999,5,9,4.7,'photo-1598327105666-5b89351aff97',0],
['MacBook Air 15-inch','Apple','Laptops','Supercharged by M3. Lightweight, silent and ready for wherever your day takes you.',1499,5,11,4.9,'photo-1517336714731-489689fd1ca8',1],
['XPS 14 OLED','Dell','Laptops','A stunning OLED display meets finely crafted performance for creative work.',1699,12,7,4.7,'photo-1496181133206-80ce9b88a853',0],
['Everyday Leather Tote','Cuyana','Fashion','Responsibly crafted Italian leather with thoughtful pockets for everyday essentials.',248,0,20,4.6,'photo-1590874103328-eac38a683ce7',1],
['Merino Wool Crewneck','COS','Fashion','A relaxed, refined layer in exceptionally soft responsibly sourced merino wool.',150,20,30,4.5,'photo-1576566588028-4147f3842f27',0],
['Cloudrunner 2','On','Shoes','A cushioned daily running shoe designed to make every run feel effortless.',150,10,14,4.7,'photo-1542291026-7eec264c27ff',1],
['990v6 Made in USA','New Balance','Shoes','Premium suede and mesh with modern cushioning, made with enduring craft.',200,0,8,4.8,'photo-1542291026-7eec264c27ff',0],
['Hydro Grip Primer','Milk Makeup','Beauty','A refreshing, long-wearing primer that grips makeup with aloe and hyaluronic acid.',38,0,42,4.6,'photo-1601049541289-9b1b7bbbfe19',1],
['Vitamin C Serum','The Ordinary','Beauty','Brightening 12% vitamin C suspension for a more even, radiant complexion.',18,0,60,4.4,'photo-1608248543803-ba4f8c70ae0b',0],
['Ceramic Table Lamp','HAY','Home','A sculptural ceramic base and warm linen shade bring a quiet glow to any room.',225,15,10,4.8,'photo-1507473885765-e6ed057f782c',1],
['Linen Duvet Set','Brooklinen','Home','Stonewashed European flax linen gets softer with every wash.',289,10,16,4.7,'photo-1631049307264-da0ec9d70304',0],
['Pour-Over Coffee Set','Fellow','Kitchen','A considered brewing set for richer mornings and a more thoughtful ritual.',125,0,22,4.8,'photo-1495474472287-4d71bcdd2085',1],
['Cast Iron Dutch Oven','Le Creuset','Kitchen','An iconic enameled cast iron classic built for generations of slow cooking.',420,5,6,4.9,'photo-1584990347449-ae6e05514a2a',0],
['The Creative Act','Rick Rubin','Books','A generous course in creativity from legendary music producer Rick Rubin.',32,0,35,4.8,'photo-1544947950-fa07a98d237f',1],
['Architecture of Happiness','Alain de Botton','Books','A thoughtful exploration of the emotional power of the spaces we inhabit.',22,0,17,4.6,'photo-1541961017774-22349e4a1262',0],
['Leather Card Holder','Bellroy','Accessories','Slim, considered storage for the cards you reach for every day.',65,0,25,4.6,'photo-1627123424574-724758594e93',1],
['Classic Analog Watch','Junghans','Accessories','Minimal Bauhaus design, precise German engineering, timeless proportions.',495,10,5,4.8,'photo-1523275335684-37898b6baf30',0],
['Portable Bluetooth Speaker','Sonos','Electronics','Room-filling sound at home and on the go, with a durable, travel-ready design.',179,10,19,4.7,'photo-1608043152269-423dbba4e7e1',0],
['Instant Camera Mini 12','Fujifilm','Electronics','Make everyday moments memorable with easy-to-use instant photography.',79,0,27,4.5,'photo-1516035069371-29a1b244cc32',0],
['iPad Air 11-inch','Apple','Electronics','Brilliant Liquid Retina display and powerful M2 performance in a thin design.',599,0,10,4.8,'photo-1544244015-0df4b3ffc6b0',0],
['Ribbed Cotton Shirt','Arket','Fashion','An everyday essential, cut from organic cotton with a clean, relaxed fit.',75,15,32,4.4,'photo-1598033129183-c4f50c736f10',0],
['City Leather Sneakers','Veja','Shoes','A versatile low-top sneaker with considered materials and a clean profile.',165,0,13,4.6,'photo-1525966222134-fcfa99b8ae77',0],
['Daily Moisturizer SPF 30','Aesop','Beauty','Lightweight hydration and daily sun protection in one elegant formula.',55,0,21,4.5,'photo-1556229010-6c3f2c9ca5f8',0],
['Oak Side Table','Ferm Living','Home','A compact solid oak side table with a warm, natural finish.',350,12,4,4.7,'photo-1499933374294-4584851497cc',0],
['Electric Gooseneck Kettle','Fellow','Kitchen','Precise temperature control and a graceful pour for better brewed coffee.',195,5,12,4.8,'photo-1570197788417-0e82375c9371',0],
['Travel Journal Set','Moleskine','Books','A set of pocket notebooks for ideas, itineraries and the in-between moments.',28,0,40,4.4,'photo-1455390582262-044cdead277a',0],
['Canvas Weekend Bag','Away','Accessories','A durable carryall with a considered layout for short escapes.',195,10,9,4.6,'photo-1553062407-98eeb64c6a62',0],
['Smart Home Hub','Google','Electronics','A helpful hands-free companion for music, routines and your connected home.',99,10,15,4.5,'photo-1558089687-f282ffcbc126',0]
];
// Each row: name, brand, category slug, description, price, discount, stock,
// demo rating, demo review count, specifications, Unsplash photo id, featured.
const additions = [
['Mechanical Keyboard K2','Keychron','electronics','Compact wireless mechanical keyboard with hot-swappable switches and a sturdy aluminum frame.',99,10,24,4.7,184,{layout:'75%',connectivity:'Bluetooth / USB-C',switches:'Hot-swappable'},'photo-1587829741301-dc798b83add3',1],
['MX Master 3S Mouse','Logitech','electronics','Quiet clicks, precise tracking and a sculpted shape for focused all-day work.',99,5,20,4.8,236,{connectivity:'Bluetooth / USB receiver',dpi:'8,000',battery:'Up to 70 days'},'photo-1527814050087-3793815479db',0],
['Portable SSD 2TB','Samsung','electronics','A pocket-sized solid state drive with fast transfers and a durable metal shell.',169,12,18,4.7,142,{capacity:'2 TB',interface:'USB 3.2 Gen 2',readSpeed:'Up to 1,050 MB/s'},'photo-1597872200969-2b65d56bd16b',0],
['Smart LED Light Strip','Philips Hue','electronics','Color-rich ambient lighting with app control and simple smart-home integration.',89,10,31,4.5,98,{length:'2 m',connectivity:'Bluetooth / Hue Bridge',colors:'16 million'},'photo-1558618666-fcd25c85cd64',0],
['Mirrorless Camera ZV-E10','Sony','electronics','A compact interchangeable-lens camera made for clear everyday photos and video.',798,8,8,4.8,173,{sensor:'APS-C 24.2 MP',video:'4K',mount:'Sony E'},'photo-1516035069371-29a1b244cc32',1],
['Noise-Cancelling Earbuds','Jabra','electronics','Comfortable true wireless earbuds with adjustable noise cancellation and clear calls.',149,15,26,4.6,211,{battery:'Up to 8 hours',connectivity:'Bluetooth 5.3',waterResistance:'IP57'},'photo-1606220945770-b5b6c2c55bf1',0],
['Wi-Fi 6 Mesh Router','TP-Link','electronics','A two-node mesh system designed to deliver steady coverage across a busy home.',229,10,11,4.6,87,{standard:'Wi-Fi 6',coverage:'Up to 4,000 sq ft',ports:'Gigabit Ethernet'},'photo-1544197150-b99a580bb7a8',0],
['USB-C 100W Charger','Anker','electronics','A compact multi-port charger with intelligent power distribution for everyday devices.',59,0,45,4.7,304,{output:'100 W',ports:'2 USB-C, 1 USB-A',plug:'Foldable'},'photo-1583394838336-acd977736f90',0],
['iPhone 16','Apple','mobiles','A bright, durable smartphone with a capable camera system and all-day performance.',799,0,16,4.8,422,{storage:'128 GB',display:'6.1-inch OLED',connectivity:'5G'},'photo-1592750475338-74b7b21085ab',0],
['Galaxy Z Flip6','Samsung','mobiles','A pocketable foldable phone with a bright cover screen and versatile camera.',1099,8,9,4.6,198,{storage:'256 GB',display:'6.7-inch AMOLED',connectivity:'5G'},'photo-1511707171634-5f897ff02aa9',1],
['Pixel 9a','Google','mobiles','A streamlined Pixel with helpful software, reliable photos and a long-lasting battery.',499,5,19,4.7,315,{storage:'128 GB',display:'6.3-inch OLED',connectivity:'5G'},'photo-1598327105666-5b89351aff97',0],
['Moto G Power 5G','Motorola','mobiles','A practical large-screen phone with dependable battery life and smooth everyday use.',299,10,21,4.4,127,{storage:'128 GB',display:'6.7-inch LCD',battery:'5,000 mAh'},'photo-1511707171634-5f897ff02aa9',0],
['Nord CE 4 Lite','OnePlus','mobiles','A responsive everyday handset with a vivid display and fast-charging battery.',279,12,14,4.5,164,{storage:'256 GB',display:'6.67-inch AMOLED',battery:'5,110 mAh'},'photo-1598327105666-5b89351aff97',0],
['MagSafe Power Bank 10K','Belkin','mobiles','A slim magnetic battery pack for a reliable top-up while you are away from a desk.',79,0,33,4.5,92,{capacity:'10,000 mAh',output:'15 W wireless',port:'USB-C'},'photo-1609091839311-d5365f9ff1c5',0],
['USB-C Fast Charger 45W','Samsung','mobiles','A travel-friendly fast charger with a braided USB-C cable included.',39,0,51,4.6,183,{output:'45 W',port:'USB-C',cable:'1.8 m'},'photo-1583394838336-acd977736f90',0],
['Rugged Clear Phone Case','OtterBox','mobiles','A clear, protective case with raised edges and a secure grip for daily carry.',49,0,38,4.5,76,{material:'Recycled polycarbonate',protection:'Drop tested',finish:'Clear'},'photo-1603313011101-320f26a4f6f6',0],
['ThinkPad X1 Carbon Gen 12','Lenovo','laptops','A lightweight business laptop with a comfortable keyboard and a crisp productivity display.',1849,8,7,4.7,122,{memory:'16 GB',storage:'512 GB SSD',display:'14-inch OLED'},'photo-1496181133206-80ce9b88a853',1],
['Zenbook 14 OLED','ASUS','laptops','A travel-ready notebook with a vivid OLED panel and a refined aluminum chassis.',1099,10,10,4.6,95,{memory:'16 GB',storage:'1 TB SSD',display:'14-inch OLED'},'photo-1517336714731-489689fd1ca8',0],
['Surface Laptop 7','Microsoft','laptops','A slim everyday laptop with a responsive touchscreen and a precise trackpad.',1199,5,9,4.6,141,{memory:'16 GB',storage:'512 GB SSD',display:'13.8-inch touchscreen'},'photo-1496181133206-80ce9b88a853',0],
['MacBook Pro 14-inch','Apple','laptops','A powerful compact workstation with a bright display and long battery life.',1999,0,6,4.9,258,{memory:'18 GB',storage:'512 GB SSD',display:'14.2-inch Liquid Retina XDR'},'photo-1517336714731-489689fd1ca8',1],
['Inspiron 16 Plus','Dell','laptops','A spacious laptop for creative projects, multitasking and entertainment at home.',1299,12,8,4.5,83,{memory:'16 GB',storage:'1 TB SSD',display:'16-inch 2.5K'},'photo-1496181133206-80ce9b88a853',0],
['Chromebook Plus 514','Acer','laptops','A simple, lightweight laptop for browsing, documents and video calls.',429,10,17,4.4,69,{memory:'8 GB',storage:'128 GB SSD',display:'14-inch Full HD'},'photo-1517336714731-489689fd1ca8',0],
['Portable Laptop Stand','Rain Design','laptops','An adjustable aluminum riser that raises your screen and folds flat for travel.',49,0,25,4.6,188,{material:'Anodized aluminum',adjustment:'6 positions',weight:'1.2 lb'},'photo-1527864550417-7fd91fc51a46',0],
['USB-C Docking Station','CalDigit','laptops','A compact desktop dock with high-speed ports and a single-cable laptop connection.',249,5,13,4.7,111,{ports:'Thunderbolt 4, USB-A, Ethernet',power:'90 W host charging',display:'Dual 4K'},'photo-1625842268584-8f3296236761',0],
['Organic Cotton Oxford Shirt','Uniqlo','fashion','A crisp everyday shirt in breathable organic cotton with a relaxed, easy fit.',59,10,42,4.4,91,{material:'100% organic cotton',fit:'Relaxed',care:'Machine wash'},'photo-1598033129183-c4f50c736f10',0],
['Relaxed Chino Trousers','Everlane','fashion','A versatile mid-rise trouser cut from soft cotton twill with a clean tapered leg.',98,0,27,4.5,73,{material:'Cotton twill',fit:'Relaxed taper',rise:'Mid-rise'},'photo-1473966968600-fa801b869a1a',0],
['Recycled Nylon Puffer Vest','Patagonia','fashion','A lightweight insulated layer made with recycled materials for changing weather.',189,15,18,4.7,156,{shell:'Recycled nylon',insulation:'Recycled polyester',fit:'Regular'},'photo-1544923246-77307dd654cb',1],
['Linen Blend Midi Dress','& Other Stories','fashion','An airy midi dress with a softly defined waist for warm-weather days.',129,10,16,4.5,62,{material:'Linen / viscose blend',length:'Midi',closure:'Concealed zip'},'photo-1515886657613-9f3515b0c78f',0],
['Merino Beanie','Icebreaker','fashion','A soft, naturally temperature-regulating merino beanie for cool mornings.',45,0,34,4.6,119,{material:'100% merino wool',care:'Hand wash',fit:'One size'},'photo-1576871337622-98d48d1cf531',0],
['Classic Denim Jacket','Levi’s','fashion','A timeless denim layer with sturdy buttons and a comfortable regular fit.',98,8,22,4.6,207,{material:'Cotton denim',fit:'Regular',closure:'Button'},'photo-1543076447-215ad9ba6923',0],
['Leather Belt','Nudie Jeans','fashion','A durable vegetable-tanned leather belt designed to age beautifully.',75,0,20,4.5,48,{material:'Vegetable-tanned leather',width:'35 mm',origin:'Made in Italy'},'photo-1624222247344-550fb8c5c32b',0],
['Wool Blend Overcoat','Mango','fashion','A clean-lined single-breasted coat with a warm wool blend and useful pockets.',229,15,11,4.5,81,{material:'Wool blend',lining:'Fully lined',closure:'Button'},'photo-1539533018447-63fcce2678e3',1],
['Ultraboost Light','Adidas','shoes','A cushioned running shoe with a responsive midsole for everyday miles.',190,12,20,4.7,311,{upper:'Primeknit textile',midsole:'Light BOOST',activity:'Running'},'photo-1542291026-7eec264c27ff',1],
['Air Force 1 ’07','Nike','shoes','A durable leather low-top sneaker with classic court styling and cushioned comfort.',115,0,25,4.8,508,{upper:'Leather',sole:'Rubber',closure:'Lace-up'},'photo-1525966222134-fcfa99b8ae77',0],
['Chuck 70 High Top','Converse','shoes','A heritage canvas high-top with reinforced details and a comfortable vintage fit.',90,5,29,4.6,272,{upper:'Canvas',sole:'Rubber',height:'High top'},'photo-1495555961986-6d4c1ecb7be3',0],
['Gel-Kayano 31','ASICS','shoes','A supportive daily trainer with soft cushioning for longer road runs.',160,10,15,4.7,144,{drop:'10 mm',support:'Stability',activity:'Running'},'photo-1542291026-7eec264c27ff',0],
['Arizona Soft Footbed','Birkenstock','shoes','An adjustable two-strap sandal with a contoured cork footbed.',140,0,18,4.7,163,{upper:'Oiled leather',footbed:'Cork / latex',origin:'Made in Germany'},'photo-1603487742131-4160ec999306',0],
['Leather Chelsea Boot','Blundstone','shoes','A pull-on leather boot with elastic side panels and a durable everyday sole.',229,0,9,4.8,116,{upper:'Leather',sole:'Slip-resistant TPU',closure:'Pull-on'},'photo-1543163521-1bf539c55dd2',1],
['Trail Running Shoe','Salomon','shoes','A grippy, lightweight trail shoe built for confident footing on mixed terrain.',140,8,13,4.6,105,{outsole:'Contagrip',drop:'8 mm',activity:'Trail running'},'photo-1552346154-21d32810aba3',0],
['Canvas Slip-On','Vans','shoes','An easy low-profile canvas shoe with a flexible rubber waffle outsole.',65,0,31,4.5,234,{upper:'Canvas',sole:'Rubber waffle',closure:'Slip-on'},'photo-1525966222134-fcfa99b8ae77',0],
['Gentle Facial Cleanser','CeraVe','beauty','A fragrance-free daily cleanser with ceramides for a comfortable, non-stripped feel.',15,0,63,4.7,622,{size:'355 ml',skinType:'Normal to dry',keyIngredients:'Ceramides, hyaluronic acid'},'photo-1608248543803-ba4f8c70ae0b',0],
['Daily Sunscreen SPF 50','Supergoop!','beauty','A lightweight broad-spectrum sunscreen made to layer comfortably under makeup.',38,0,45,4.6,418,{size:'50 ml',protection:'SPF 50 broad spectrum',finish:'Weightless'},'photo-1556229010-6c3f2c9ca5f8',1],
['Hydrating Face Cream','Kiehl’s','beauty','A rich but fast-absorbing moisturizer for soft, comfortable skin through the day.',38,5,34,4.6,301,{size:'50 ml',skinType:'All skin types',keyIngredients:'Glacial glycoprotein'},'photo-1601049541289-9b1b7bbbfe19',0],
['Rosehip Seed Oil','Pai Skincare','beauty','A cold-pressed facial oil with a light texture for an evening skincare routine.',34,0,29,4.5,139,{size:'30 ml',keyIngredient:'Organic rosehip oil',certification:'Vegan'},'photo-1608248543803-ba4f8c70ae0b',0],
['Ceramic Hair Dryer','ghd','beauty','A salon-inspired dryer with controlled airflow and a balanced, comfortable handle.',229,10,12,4.7,97,{power:'1,600 W',settings:'3 heat / 2 speed',cord:'2.7 m'},'photo-1522337360788-8b13dee7a37e',0],
['Body Wash Hinoki','Salt & Stone','beauty','A gentle, aromatic body cleanser with a fresh wood and citrus character.',36,0,22,4.4,88,{size:'450 ml',scent:'Hinoki / citrus',formula:'Sulfate-free'},'photo-1608248543803-ba4f8c70ae0b',0],
['Retinol Night Serum','Paula’s Choice','beauty','A measured retinol treatment designed for a gradual, consistent nighttime routine.',56,5,18,4.5,174,{size:'30 ml',keyIngredients:'Retinol, peptides',use:'Evening'},'photo-1601049541289-9b1b7bbbfe19',0],
['Hand Cream Trio','L’Occitane','beauty','Three nourishing hand creams in portable sizes with classic botanical scents.',39,0,26,4.6,212,{size:'3 × 30 ml',scents:'Shea, almond, verbena',origin:'Made in France'},'photo-1556229010-6c3f2c9ca5f8',0],
['Arc Floor Lamp','West Elm','home','A slender floor lamp with a warm linen shade for a calm reading corner.',349,10,6,4.7,63,{height:'170 cm',material:'Steel / linen',bulb:'E27 LED'},'photo-1507473885765-e6ed057f782c',1],
['Oak Frame Wall Mirror','Umbra','home','A round oak-framed mirror that brings a natural finish to an entryway or bedroom.',159,0,10,4.6,78,{diameter:'60 cm',frame:'Solid oak',mount:'Wall mounted'},'photo-1618221195710-dd6b41faaea6',0],
['Woven Storage Basket Set','The Citizenry','home','A pair of handwoven baskets for tidy, flexible storage around the home.',125,8,13,4.6,51,{quantity:'2 baskets',material:'Seagrass',origin:'Handwoven'},'photo-1494438639946-1ebd1d20bf85',0],
['Cotton Throw Blanket','Parachute','home','A soft, textured cotton throw for an extra layer on a sofa or at the foot of a bed.',99,0,21,4.7,204,{size:'50 × 70 in',material:'100% cotton',care:'Machine wash'},'photo-1600210492486-724fe5c67fb0',0],
['Scented Candle No. 01','P.F. Candle Co.','home','A clean-burning soy candle with a quiet amber and moss fragrance.',28,0,44,4.5,146,{weight:'7.2 oz',burnTime:'40–50 hours',wax:'Soy blend'},'photo-1603006905003-be475563bc59',0],
['Ceramic Dinnerware Set','East Fork','home','A durable, thoughtfully glazed dinnerware set made for everyday meals.',180,5,8,4.8,132,{pieces:'4 place settings',material:'Lead-free ceramic',care:'Dishwasher safe'},'photo-1603199506016-b9a594b593c0',1],
['Indoor Watering Can','Haws','home','A balanced metal watering can with a fine rose for gentle indoor watering.',59,0,17,4.6,69,{capacity:'1 liter',material:'Powder-coated steel',origin:'Made in England'},'photo-1485955900006-10f4d324d411',0],
['Linen Cushion Cover','H&M Home','home','A relaxed flax-linen cushion cover with a discreet envelope closure.',39,10,28,4.4,97,{size:'20 × 20 in',material:'European flax linen',insert:'Not included'},'photo-1616486338812-3dadae4b4ace',0],
['Barista Express Espresso Machine','Breville','kitchen','A compact espresso machine with an integrated grinder and hands-on milk texturing.',699,8,7,4.8,386,{pressure:'15 bar',grinder:'Integrated conical burr',capacity:'2 L'},'photo-1517668808822-9ebb02f2a0e6',1],
['Air Fryer 5.5L','Ninja','kitchen','A roomy countertop air fryer with simple controls for crisp weeknight cooking.',149,12,14,4.6,278,{capacity:'5.5 L',power:'1,750 W',functions:'Air fry, roast, reheat'},'photo-1556911220-bff31c812dba',0],
['Stand Mixer Artisan','KitchenAid','kitchen','A sturdy tilt-head mixer with a generous bowl for baking and everyday prep.',449,5,5,4.9,421,{capacity:'4.8 L',speeds:'10',attachments:'Flat beater, dough hook, whisk'},'photo-1578643463396-0997cb5328c1',0],
['Precision Pour Kettle','Fellow','kitchen','A temperature-controlled kettle with a balanced handle and graceful pour.',165,0,10,4.8,193,{capacity:'0.9 L',temperature:'135–212°F',material:'Stainless steel'},'photo-1570197788417-0e82375c9371',0],
['Bamboo Cutting Board','John Boos','kitchen','A sturdy end-grain board with a generous surface for daily prep.',89,0,18,4.7,104,{size:'18 × 12 in',material:'Hard maple',care:'Hand wash'},'photo-1556911220-bff31c812dba',0],
['Digital Kitchen Scale','OXO','kitchen','A slim digital scale with a pull-out display and precise gram measurements.',55,0,25,4.6,156,{capacity:'11 lb / 5 kg',display:'Pull-out LCD',units:'g, kg, oz, lb'},'photo-1556911220-bff31c812dba',0],
['Rice Cooker 5.5 Cup','Zojirushi','kitchen','A dependable rice cooker with fuzzy logic for consistent grains and simple cleanup.',189,5,11,4.8,241,{capacity:'5.5 cups uncooked',functions:'White, brown, sushi',keepWarm:'Automatic'},'photo-1556911220-bff31c812dba',0],
['Glass Food Storage Set','Pyrex','kitchen','Stackable glass containers with secure lids for meal prep and leftovers.',42,0,32,4.5,311,{pieces:'10',material:'Tempered glass',care:'Microwave / dishwasher safe'},'photo-1603199506016-b9a594b593c0',0],
['Extra Virgin Olive Oil','Brightland','grocery','A fresh, peppery finishing oil made from carefully selected California olives.',37,0,24,4.7,98,{volume:'375 ml',origin:'California',harvest:'Single-origin'},'photo-1474979266404-7eaacbcd87c5',1],
['Organic Matcha Powder','Jade Leaf','grocery','A finely milled ceremonial-style green tea powder for whisking or smoothies.',24,0,38,4.6,213,{weight:'30 g',origin:'Uji, Japan',certification:'Organic'},'photo-1515823064-d6e0c04616a7',0],
['Dark Chocolate 70%','Theo Chocolate','grocery','A balanced dark chocolate bar with notes of roasted cacao and dried fruit.',6,0,55,4.5,178,{weight:'85 g',cacao:'70%',certification:'Fair trade'},'photo-1511381939415-e44015466834',0],
['Whole Bean House Coffee','Stumptown','grocery','A rounded medium roast with chocolate and citrus notes for everyday brewing.',18,0,27,4.7,355,{weight:'340 g',roast:'Medium',origin:'Seasonal blend'},'photo-1442512595331-e89e73853f31',0],
['Rolled Oats','Bob’s Red Mill','grocery','Whole grain rolled oats for warm breakfasts, baking and pantry staples.',8,0,41,4.6,152,{weight:'907 g',ingredient:'Whole grain oats',certification:'Non-GMO'},'photo-1517673132405-a56a62b18caf',0],
['Almond Butter','MaraNatha','grocery','Smooth roasted almond butter made with a short, simple ingredient list.',13,0,29,4.5,117,{weight:'454 g',ingredients:'Roasted almonds',certification:'Non-GMO'},'photo-1589367920969-ab8e050bbb04',0],
['Chamomile Herbal Tea','Traditional Medicinals','grocery','A soothing caffeine-free herbal tea made with carefully sourced chamomile.',7,0,43,4.4,91,{quantity:'16 tea bags',caffeine:'None',certification:'Organic'},'photo-1544787219-7f47ccb76574',0],
['Maple Syrup Grade A','Runamok','grocery','Pure maple syrup with a rich amber profile for pancakes, oats and baking.',22,0,19,4.8,84,{volume:'250 ml',origin:'Vermont',grade:'Amber / rich'},'photo-1484723091739-30a097e8f929',0],
['Atomic Habits','James Clear','books','A practical guide to building small habits and making steady, lasting changes.',19,0,37,4.8,603,{format:'Hardcover',pages:'320',language:'English'},'photo-1544947950-fa07a98d237f',1],
['Braiding Sweetgrass','Robin Wall Kimmerer','books','Essays connecting botanical knowledge, Indigenous wisdom and the living world.',18,0,25,4.9,517,{format:'Paperback',pages:'408',language:'English'},'photo-1544947950-fa07a98d237f',0],
['The Design of Everyday Things','Don Norman','books','A clear introduction to human-centered design and the objects around us.',21,0,21,4.7,289,{format:'Paperback',pages:'368',language:'English'},'photo-1544947950-fa07a98d237f',0],
['Pachinko','Min Jin Lee','books','A multigenerational novel following a Korean family through a changing century.',17,5,23,4.7,346,{format:'Paperback',pages:'512',language:'English'},'photo-1544947950-fa07a98d237f',0],
['A Field Guide to Getting Lost','Rebecca Solnit','books','Reflective essays on uncertainty, place and the unexpected paths of a life.',16,0,18,4.6,174,{format:'Paperback',pages:'224',language:'English'},'photo-1544947950-fa07a98d237f',0],
['The Creative Act','Rick Rubin','books','A generous course in creativity from legendary music producer Rick Rubin.',32,0,35,4.8,441,{format:'Hardcover',pages:'432',language:'English'},'photo-1544947950-fa07a98d237f',0],
['Braided Leather Bookmark','Paperblanks','books','A slim woven bookmark that keeps your place without marking the page.',12,0,42,4.4,62,{material:'Woven leather',length:'18 cm',origin:'Hand finished'},'photo-1455390582262-044cdead277a',0],
['Reading Journal','Leuchtturm1917','books','A guided journal for notes, favorite passages and the books you want to remember.',24,0,30,4.6,108,{pages:'120',paper:'Acid-free',binding:'Hardcover'},'photo-1455390582262-044cdead277a',0],
['Adjustable Kettlebell 12kg','Bowflex','sports','A space-saving adjustable kettlebell for strength work at home.',199,10,8,4.7,127,{weight:'8–12 kg',material:'Steel / polymer',adjustments:'Dial selectable'},'photo-1517836357463-d25dfeac3438',1],
['Everyday Yoga Mat','Manduka','sports','A supportive grippy mat with a comfortable surface for daily movement.',98,0,17,4.7,241,{length:'71 in',thickness:'5 mm',material:'Natural rubber'},'photo-1544367567-0f2fcb009e0b',0],
['Insulated Water Bottle 750ml','Hydro Flask','sports','A stainless steel bottle that keeps cold drinks chilled through a long day.',45,0,36,4.6,319,{capacity:'750 ml',material:'Insulated stainless steel',lid:'Flex cap'},'photo-1602143407151-7111542de6e8',0],
['Resistance Band Set','Bala','sports','Three fabric resistance bands for compact strength and mobility sessions.',35,0,40,4.5,146,{quantity:'3 bands',resistance:'Light / medium / heavy',material:'Recycled polyester'},'photo-1517836357463-d25dfeac3438',0],
['Road Cycling Helmet','Giro','sports','A lightweight ventilated helmet with an adjustable fit system for road rides.',129,5,12,4.7,113,{fit:'Adjustable',construction:'In-mold polycarbonate',vents:'22'},'photo-1541625602330-2277a4c46182',0],
['Foam Roller 18-inch','TriggerPoint','sports','A textured foam roller for warm-ups, cooldowns and everyday mobility work.',39,0,22,4.5,171,{length:'18 in',density:'Medium',surface:'Multi-density grid'},'photo-1517836357463-d25dfeac3438',0],
['Trail Daypack 20L','Osprey','sports','A lightweight daypack with a breathable back panel and practical trail storage.',110,8,14,4.7,92,{capacity:'20 L',material:'Recycled nylon',hydration:'Compatible'},'photo-1553062407-98eeb64c6a62',0],
['Dumbbell Pair 5kg','Nike','sports','A compact pair of coated dumbbells with a comfortable grip for home training.',58,0,16,4.5,87,{weight:'2 × 5 kg',coating:'Neoprene',shape:'Hexagonal'},'photo-1517836357463-d25dfeac3438',0],
['Leather Zip Wallet','Fossil','accessories','A compact leather wallet with organized card slots and a secure coin pocket.',65,10,24,4.5,132,{material:'Leather',slots:'6 card slots',closure:'Zip coin pocket'},'photo-1627123424574-724758594e93',0],
['Minimalist Sunglasses','Warby Parker','accessories','Lightweight acetate frames with polarized lenses for bright everyday commutes.',145,0,15,4.6,204,{frame:'Acetate',lens:'Polarized UV400',fit:'Medium'},'photo-1511499767150-a48a237f0083',1],
['Everyday Backpack 18L','Bellroy','accessories','A streamlined recycled-fabric backpack with a padded laptop sleeve and quick-access pockets.',159,8,17,4.7,189,{capacity:'18 L',material:'Recycled woven fabric',laptop:'Fits 16-inch'},'photo-1553062407-98eeb64c6a62',0],
['Classic Silk Scarf','Madewell','accessories','A softly draping printed silk scarf that adds a considered accent to daily layers.',58,0,13,4.5,76,{material:'100% silk',size:'65 × 65 cm',care:'Dry clean'},'photo-1601924994987-69e26d50dc26',0],
['Stainless Steel Water Bottle','Klean Kanteen','accessories','A durable single-wall bottle with a leak-resistant cap for daily hydration.',32,0,37,4.6,216,{capacity:'800 ml',material:'18/8 stainless steel',finish:'Powder coat'},'photo-1602143407151-7111542de6e8',0],
['Travel Organizer Pouch','Peak Design','accessories','A weatherproof zip pouch with thoughtful compartments for cables and small essentials.',49,0,28,4.6,104,{material:'Recycled nylon',closure:'Weatherproof zip',size:'Small'},'photo-1553062407-98eeb64c6a62',0],
['Silver Pendant Necklace','Mejuri','accessories','A fine sterling-silver pendant on an adjustable chain made for everyday wear.',98,0,12,4.7,143,{material:'Sterling silver',chain:'18 in + 2 in extender',finish:'Recycled silver'},'photo-1611652022419-a9419f74343d',0],
['Automatic Field Watch','Timex','accessories','A legible field watch with a brushed steel case and a comfortable canvas strap.',189,5,9,4.6,121,{movement:'Automatic',case:'40 mm stainless steel',waterResistance:'100 m'},'photo-1523275335684-37898b6baf30',0]
];
const ins = db.prepare(`INSERT INTO products(name,brand,category_id,description,price,discount,stock,rating,review_count,specifications,image,featured)
SELECT ?,?,(SELECT id FROM categories WHERE slug=?),?,?,?,?,?,?,?,?,?
WHERE NOT EXISTS (SELECT 1 FROM products WHERE lower(name)=lower(?) AND brand=? AND category_id=(SELECT id FROM categories WHERE slug=?))`);
for (const p of data) {
  const [name,brand,category,...rest] = p;
  const slug=category.toLowerCase();
  ins.run(name,brand,slug,rest[0],rest[1],rest[2],rest[3],rest[4],0,'{}',rest[5],rest[6],name,brand,slug);
}
for (const p of additions) {
  const [name,brand,category,description,price,discount,stock,rating,reviewCount,specifications,photo,featured] = p;
  ins.run(name,brand,category,description,price,discount,stock,rating,reviewCount,JSON.stringify(specifications),`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=85`,featured,name,brand,category);
}
console.log(`Database ready at ${path.resolve(file)} (${db.prepare('SELECT COUNT(*) n FROM products').get().n} products)`);
db.close();

