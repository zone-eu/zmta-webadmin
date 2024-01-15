'use strict';

const config = require('wild-config');
const log = require('npmlog');
const msgpack = require('msgpack-js');
const db = require('../lib/db');

module.exports = server => {
    server.on('message', (payload, rinfo) => {
        let message;

        try {
            message = msgpack.decode(payload);
        } catch (E) {
            log.info('UDP', 'INVALIDMSG from=%s:%s encoded="%s"', rinfo.address, rinfo.port, payload.toString('base64'));
            return;
        }

        if (!message.id) {
            log.info('UDP', 'INVALIDMSG from=%s:%s message=%s', rinfo.address, rinfo.port, JSON.stringify(message));
            return;
        }

        message.t = new Date();
        message.e = new Date(message.t.getTime() + config.retention);
        db.client.collection('messages').insertOne(message, err => {
            if (err) {
                log.info('UDP', 'LOGFAIL %s from=%s:%s size=%s', message.id, rinfo.address, rinfo.port, payload.length);
                return;
            }
            log.verbose('UDP', 'LOGMSG %s from=%s:%s size=%s', message.id, rinfo.address, rinfo.port, payload.length);

            if (['DROP', 'QUEUED', 'NOQUEUE'].includes(message.action) && message['message-id']) {
                db.client.collection('mids').insertOne(
                    {
                        mid: (message['message-id'] || '').toString().replace(/^[<\s]+|[>\s]+$/g, ''),
                        from: (message.from || '').toString().trim().toLowerCase(),
                        to: (message.to || '')
                            .toString()
                            .split(',')
                            .map(a => a.trim().toLowerCase())
                            .filter(a => a),
                        id: message.id,
                        t: message.t,
                        e: message.e
                    },
                    err => {
                        if (err && err.code !== 11000) {
                            log.info('UDP', 'LOGFAIL %s from=%s:%s size=%s', message.id, rinfo.address, rinfo.port, payload.length);
                        }
                    }
                );
            }
        });
    });
};
