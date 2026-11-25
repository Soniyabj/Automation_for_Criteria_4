// usage: node resetPassword.js email newpassword
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./models/User');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/criteria4';
mongoose.connect(MONGO).then(async ()=>{
  console.log('Connected to MongoDB');
  const email = process.argv[2];
  const pwd = process.argv[3];
  if(!email || !pwd){ console.log('Usage: node resetPassword.js email password'); process.exit(1); }
  const hash = await bcrypt.hash(pwd, 10);
  const u = await User.findOneAndUpdate({ email: email.toLowerCase() }, { passwordHash: hash }, { upsert: true, new: true });
  console.log(`✅ Password for ${email} updated to "${pwd}"`);
  process.exit(0);
}).catch(err=>{
  console.error('Mongo error', err);
  process.exit(1);
});
