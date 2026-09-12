require('dotenv').config({ quiet: true });
const { connectDatabase, pingDatabase, disconnectDatabase } = require('../db');

(async () => {
  try {
    await connectDatabase();
    await pingDatabase();
    console.log('PASS: MongoDB connection and ping');
  } catch {
    console.error('FAIL: MongoDB connection/ping. Check private environment, credentials, DNS and Network Access.');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
})().catch(() => { process.exitCode = 1; });
