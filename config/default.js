'use strict';

module.exports = {
    auth: false, // set to true to enable authentication
    user: 'admin',
    pass: 'secretpass',

    port: 8082,
    host: '127.0.0.1', // set to false to listen on all interfaces
    proxy: true, // trust proxy headers
    httplog: 'dev',
    secret: 'a cat',
    maxPostSize: '2MB',
    apiServer: 'http://localhost:8080', // ZoneMTA API location
    // redis is needed to fetch delivery counters
    redis: {
        host: 'localhost',
        port: 6379,
        db: 2
    },
    log: {
        level: 'info'
    }
};
