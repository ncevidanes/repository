const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);

function databaseUri(env = process.env) {
  const uri = env.MONGODB_URI || env.MONGO_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error('Defina MONGODB_URI no ambiente privado.');
  }
  return uri;
}

async function connectDatabase() {
  await mongoose.connect(databaseUri(), {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 5000,
    maxPoolSize: 10,
    autoIndex: false,
  });
}

async function pingDatabase() {
  if (mongoose.connection.readyState !== 1) throw new Error('Database unavailable');
  const result = await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: 5000 });
  if (result.ok !== 1) throw new Error('Database unavailable');
}

module.exports = { databaseUri, connectDatabase, pingDatabase, disconnectDatabase: () => mongoose.disconnect() };
