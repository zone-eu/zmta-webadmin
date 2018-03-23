'use strict';

const config = require('wild-config');
const Redis = require('ioredis');

module.exports.redis = new Redis(config.redis);
