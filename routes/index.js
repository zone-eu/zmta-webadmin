'use strict';

const express = require('express');
const router = new express.Router();
const handler = require('../lib/handler');
const libmime = require('libmime');
const mailsplit = require('mailsplit');
const util = require('util');

/* GET home page. */
router.get('/', (req, res, next) => {
    handler.fetchZoneList((err, zones) => {
        if (err) {
            return next(err);
        }

        handler.fetchCounters(zones, (err, zones, top, totals) => {
            if (err) {
                return next(err);
            }

            handler.fetchBlacklist((err, blacklist) => {
                if (err) {
                    return next(err);
                }

                res.render('index', {
                    title: 'Web Admin',
                    zones: zones.map((zone, i) => {
                        zone.index = i + 1;
                        return zone;
                    }),
                    top,
                    totals,
                    blacklist: blacklist.length
                });
            });
        });
    });
});

router.get('/zone/:zone/:type', (req, res, next) => {
    handler.fetchCounter(req.params.zone, (err, counter) => {
        if (err) {
            return next(err);
        }
        handler.fetchQueued(req.params.zone, req.params.type, (err, queue) => {
            if (err) {
                return next(err);
            }

            res.render('zone', {
                title: req.params.zone,
                zone: req.params.zone,
                type: req.params.type,
                counter,
                isActive: req.params.type !== 'deferred',
                isDeferred: req.params.type === 'deferred',
                items: queue.list.map((item, i) => {
                    item.index = i + 1;
                    return item;
                })
            });
        });
    });
});

router.get('/message/:id', (req, res, next) => {
    handler.fetchMessageData(req.params.id, (err, message) => {
        if (err) {
            return next(err);
        }

        message.created = new Date(message.meta.time).toISOString().substr(0, 19).replace(/T/, ' ') + ' UTC';

        if (message.meta.expiresAfter) {
            message.meta.expiresAfter = new Date(message.meta.expiresAfter).toISOString().substr(0, 19).replace(/T/, ' ') + ' UTC';
        }

        let headers = new mailsplit.Headers(message.meta.headers);
        message.subject = headers.getFirst('subject');
        try {
            message.subject = libmime.decodeWords(message.subject);
        } catch (E) {
            // ignore
        }

        if (message.meta.spam && message.meta.spam.default) {
            message.spamStatus = true;
            switch (message.meta.spam.default.action) {
                case 'no action':
                    message.spamLabel = 'success';
                    message.spamText = 'Clean';
                    break;
                case 'reject':
                    message.spamLabel = 'danger';
                    message.spamText = 'Spam';
                    break;
                default:
                    message.spamLabel = 'warning';
                    message.spamText = (message.meta.spam.default.action || '').replace(/^\w/, c => c.toUpperCase());
            }
            message.spamScore = (Number(message.meta.spam.default.score) || 0).toFixed(2);
            message.spamTests = message.meta.spam.tests.join(', ');
        }

        message.mailFrom = message.meta.from || '<>';
        message.rcptTo = [].concat(message.meta.to || []).join(', ');

        message.headers = headers.build();
        message.size = message.headers.length + message.meta.bodySize;
        message.headers = message.headers.toString().replace(/\r/g, '').trim();

        message.messages = message.messages.map((entry, i) => {
            entry.index = i + 1;

            if (entry.deferred) {
                entry.label = 'warning';
                entry.nextAttempt = new Date(entry.deferred.next).toISOString().substr(0, 19).replace(/T/, ' ') + ' UTC';
                entry.serverResponse = entry.deferred.response;
                entry.smtpLog = entry.deferred.log && entry.deferred.log.length || false;
            } else {
                entry.label = 'success';
                entry.nextAttempt = 'N/A';
                entry.serverResponse = 'N/A';
            }
            return entry;
        });

        res.render('message', message);
    });
});

router.get('/log/:id/:seq', (req, res, next) => {
    handler.fetchMessageData(req.params.id, (err, message) => {
        if (err) {
            return next(err);
        }

        for (let i = 0, len = message.messages.length; i < len; i++) {

            let entry = message.messages[i];
            if (entry.seq === req.params.seq) {
                let transaction = Array.isArray(entry.deferred.log) ? entry.deferred.log.map(row => util.format('%s [%s]: %s', new Date(row.time ? row.time : 0).toISOString(), row.level, row.message.replace(/\n/g, '\n' + ' '.repeat(48)))).join('\n') : '';
                res.render('log', {
                    id: entry.id,
                    transaction
                });
                return;
            }
        }

        return next(new Error('Log not found'));
    });
});

router.get('/fetch/:id', (req, res) => {
    handler.getFetchStream(req.params.id).pipe(res);
});

router.post('/find', (req, res) => {
    let id = (req.body.id || '').toString().replace(/\.[\w]{3}$/, '').trim();
    return res.redirect('/message/' + id);
});

router.get('/send', (req, res) => {
    res.render('send', {
        title: 'Send message'
    });
});

router.post('/send', (req, res, next) => {
    handler.postMessage(req.body.message, (err, message) => {
        if (err) {
            return next(err);
        }
        res.render('message-sent', {
            title: 'Message sent',
            message
        });
    });
});

router.post('/delete', (req, res, next) => {
    handler.deleteMessage(req.body.id, req.body.seq, err => {
        if (err) {
            return next(err);
        }
        return res.redirect('/message/' + req.body.id);
    });
});

router.get('/blacklist', (req, res, next) => {
    handler.fetchBlacklist((err, list) => {
        if (err) {
            return next(err);
        }

        res.render('blacklist', {
            items: list.map((item, i) => {
                item.index = i + 1;
                item.time = new Date(item.created ? item.created : 0).toISOString().substr(0, 19).replace(/T/, ' ');
                return item;
            })
        });
    });
});

module.exports = router;
