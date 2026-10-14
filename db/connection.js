const {DatabaseSync}=require('node:sqlite');
const path=require('path');
require('dotenv').config();
const file=process.env.DB_PATH||'./data/nexora.db';
const db=new DatabaseSync(path.resolve(file));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
