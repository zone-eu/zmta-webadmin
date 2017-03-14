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
    let id = (req.params.id || '').toString().trim();
    let seq;
    let seqTo;

    if (id.indexOf('.') >= 0) {
        seq = id.substr(id.lastIndexOf('.') + 1);
        id = id.substr(0, id.lastIndexOf('.'));
    }

    handler.fetchLogData(req.params.id, (err, logEntries) => {
        if (err) {
            // ignore
        }

        logEntries = [].concat(logEntries && logEntries.entries || []).map(entry => {
            if (seq && entry.seq && entry.seq === seq && !seqTo) {
                seqTo = entry.to;
            }
            let data = {
                time: new Date(entry.time).toISOString(),
                id: entry.id + (entry.seq ? '.' + entry.seq : ''),
                action: entry.action,
                actionLabel: {
                    SPAMCHECK: 'default',
                    QUEUED: 'primary',
                    DEFERRED: 'warning',
                    ACCEPTED: 'success',
                    REJECTED: 'danger',
                    DROP: 'danger'
                }[entry.action],
                message: Object.keys(entry).filter(key => !['time', 'id', 'seq', 'action'].includes(key)).map(key => {
                    let value = (entry[key] || '').toString().trim();
                    switch (key) {
                        case 'size':
                        case 'body':
                            value += ' B';
                            break;
                        case 'start':
                        case 'timer':
                            value = ((Number(value) || 0) / 1000) + ' sec';
                            break;
                    }
                    return {
                        key,
                        value
                    };
                }).filter(data => data.value).sort((a, b) => a.key.localeCompare(b.key))
            };
            return data;
        });

        handler.fetchMessageData(id, (err, message) => {
            if (err) {
                err.logId = id;
                err.logSeq = seq;
                err.seqTo = seqTo;
                err.logEntries = logEntries;
                return next(err);
            }

            let time = message.meta && message.meta.time && typeof message.meta.time === 'number' && message.meta.time || Date.now();

            message.logId = id;
            message.logSeq = seq;
            message.seqTo = seqTo;
            message.logEntries = logEntries;
            message.created = new Date(time).toISOString();

            if (message.meta.expiresAfter) {
                message.meta.expiresAfter = new Date(message.meta.expiresAfter).toISOString();
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
                    message.hasDeferred = true;
                    entry.label = 'warning';
                    entry.nextAttempt = new Date(entry.deferred.next).toISOString();
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

router.post('/find', (req, res, next) => {

    let term = (req.body.id || '').trim();
    if (!term) {
        return res.redirect('/');
    }

    if (term.length > 255) {
        term = term.substr(0, 255);
    }

    if (/^[0-9a-z]{18}(\.[0-9a-z]{3})?$/i.test(term)) {
        return res.redirect('/message/' + term);
    }

    handler.fetchMessageIdData(term, (err, result) => {
        if (err) {
            return next(err);
        }
        if (!result || !result.entries || !result.entries.length) {
            return next(new Error('Nothing found'));
        }

        let matcher = (term || '').toString().toLowerCase().replace(/[<>\s]/g, '').trim();
        res.render('message-ids', {
            query: term,
            items: result.entries.map((item, i) => {
                let messageId = item.messageId.replace(/</g, '').replace(/>/g, '').trim();
                if (matcher) {
                    if (messageId.indexOf(matcher) === 0) {
                        messageId = '<strong>' + messageId.substr(0, matcher.length) + '</strong>' + messageId.substr(matcher.length);
                    } else if (messageId.lastIndexOf(matcher) === messageId.length - matcher.length) {
                        messageId = messageId.substr(0, messageId.length - matcher.length) + '<strong>' + messageId.substr(-matcher.length) + '</strong>';
                    }
                }
                item.messageId = '&lt;' + messageId + '&gt;';
                item.index = i + 1;
                return item;
            })
        });
    });

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

router.post('/send-now', (req, res, next) => {
    handler.sendMessages(req.body.id, req.body.seq, err => {
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
                item.time = new Date(item.created ? item.created : 0).toISOString();
                return item;
            })
        });
    });
});

module.exports = router;
