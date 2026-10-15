'use strict';

const config = require('wild-config');
const yaml = require('js-yaml');
const fs = require('fs');
const log = require('npmlog');
const pathlib = require('path');
const setupIndexes = yaml.load(fs.readFileSync(pathlib.join(__dirname, '..', 'setup', 'indexes.yaml'), 'utf8'));
const mongodb = require('mongodb');
const createClient = require('redis').createClient;

const MongoClient = mongodb.MongoClient;

const { host, port, db: database, tls, ...redisOptions } = config.redis;

module.exports.redis = createClient({
    ...redisOptions,
    database: redisOptions.database ?? database,
    socket: { host, port, ...(tls ? { tls: true, ...tls } : {}), ...redisOptions.socket }
});
module.exports.redis.on('error', err => log.error('Redis', err));
module.exports.client = false;

module.exports.init = async () => {
    await module.exports.redis.connect();
    const client = await MongoClient.connect(config.mongo);
    const db = (module.exports.client = client.db(config.logsdb));

    for (const [indexpos, index] of setupIndexes.indexes.entries()) {
        try {
            await db.collection(index.collection).createIndexes([index.index]);
        } catch (err) {
            log.error(
                process.pid + '/Mongo',
                'Failed creating index %s %s. %s',
                indexpos + 1,
                JSON.stringify(index.collection + '.' + index.index.name),
                err.message
            );
        }
    }

    return db;
};
