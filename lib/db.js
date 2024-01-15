'use strict';

const config = require('wild-config');
const yaml = require('js-yaml');
const fs = require('fs');
const log = require('npmlog');
const pathlib = require('path');
const setupIndexes = yaml.load(fs.readFileSync(pathlib.join(__dirname, '..', 'setup', 'indexes.yaml'), 'utf8'));
const mongodb = require('mongodb');
const Redis = require('ioredis');

const MongoClient = mongodb.MongoClient;

module.exports.redis = new Redis(config.redis);
module.exports.client = false;

module.exports.init = callback => {
    MongoClient.connect(config.mongo, (err, client) => {
        if (err) {
            return callback(err);
        }
        let db = (module.exports.client = client.db(config.logsdb));

        // setup indexes for the database
        let indexpos = 0;
        let ensureIndexes = next => {
            if (indexpos >= setupIndexes.indexes.length) {
                return next();
            }
            let index = setupIndexes.indexes[indexpos++];
            db.collection(index.collection).createIndexes([index.index], err => {
                if (err) {
                    log.error(
                        process.pid + '/Mongo',
                        'Failed creating index %s %s. %s',
                        indexpos,
                        JSON.stringify(index.collection + '.' + index.index.name),
                        err.message
                    );
                }

                ensureIndexes(next);
            });
        };

        ensureIndexes(() => callback(null, db));
    });
};
