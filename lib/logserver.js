'use strict';

const config = require('wild-config');
const dgram = require('dgram');
const db = require('./db');
const log = require('npmlog');
const udpRoutes = require('../routes/udp.js');

module.exports = callback => {
    if (!config.logserver.enabled) {
        return callback(null, false);
    }

    let returned = false;
    const server = dgram.createSocket(config.logserver.protocol);

    server.once('error', err => {
        try {
            server.close();
        } catch (E) {
            log.error('Server', E);
        }

        if (returned) {
            return log.error('UDP', err);
        }
        returned = true;
        callback(err);
    });

    server.once('close', () => {
        log.info('UDP', 'Closed server');
    });

    udpRoutes(server, db);

    server.bind(config.logserver.port, config.logserver.host, () => {
        if (returned) {
            log.error('UDP', 'Managed to open server but it was already errored');
            try {
                server.close();
            } catch (E) {
                log.error('Server', E);
            }
        }

        let address = server.address();
        log.info('UDP', 'Server listening on %s:%s', address.address, address.port);

        callback(null, server);
    });
};
