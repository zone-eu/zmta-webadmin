'use strict';

const express = require('express');
const router = new express.Router();
const handler = require('../lib/handler');
const db = require('../lib/db');
const libmime = require('libmime');
const mailsplit = require('mailsplit');
const util = require('util');
const SearchString = require('search-string');
const Joi = require('joi');
const MongoPaging = require('mongo-cursor-pagination-node6');

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

    db.client
        .collection('messages')
        .find({ id: req.params.id })
        .sort({ t: 1 })
        .toArray((err, logEntries) => {
            if (err) {
                // ignore
            }

            logEntries = [].concat(logEntries || []).map(entry => {
                if (seq && entry.seq && entry.seq === seq && !seqTo) {
                    seqTo = entry.to;
                }
                let data = {
                    time: entry.t.toISOString(),
                    id: entry.id + (entry.seq ? '.' + entry.seq : ''),
                    action: entry.action,
                    actionLabel: {
                        SPAMCHECK: 'default',
                        QUEUED: 'primary',
                        DEFERRED: 'warning',
                        ACCEPTED: 'success',
                        REJECTED: 'danger',
                        DELETED: 'danger',
                        DROP: 'danger'
                    }[entry.action],
                    message: Object.keys(entry)
                        .filter(key => !['t', 'e', 'id', 'seq', 'action', '_id'].includes(key))
                        .map(key => {
                            let value = (entry[key] || '').toString().trim();
                            switch (key) {
                                case 'size':
                                case 'body':
                                    value += ' B';
                                    break;
                                case 'start':
                                case 'timer':
                                    value = (Number(value) || 0) / 1000 + ' sec';
                                    break;
                            }
                            return {
                                key,
                                value
                            };
                        })
                        .filter(data => data.value)
                        .sort((a, b) => a.key.localeCompare(b.key))
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

                message.meta = message.meta || {};
                message.headers = message.headers || [];

                let time = (typeof message.meta.time === 'number' && message.meta.time) || Date.now();

                message.logId = id;
                message.logSeq = seq;
                message.seqTo = seqTo;
                message.logEntries = logEntries;
                message.created = new Date(time).toISOString();

                if (message.meta.expiresAfter) {
                    message.meta.expiresAfter = new Date(message.meta.expiresAfter).toISOString();
                }

                let headers = new mailsplit.Headers(message.meta.headers || []);
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
                message.rcptTo = []
                    .concat(message.meta.to || [])
                    .map(a => a.trim())
                    .filter(a => a);

                message.headers = headers.build();
                message.size = message.headers.length + message.meta.bodySize;
                message.headers = message.headers
                    .toString()
                    .replace(/\r/g, '')
                    .trim();

                message.messages = message.messages.map((entry, i) => {
                    entry.index = i + 1;

                    if (entry.deferred) {
                        message.hasDeferred = true;
                        entry.label = 'warning';
                        entry.nextAttempt = new Date(entry.deferred.next).toISOString();
                        entry.serverResponse = entry.deferred.response;
                        entry.smtpLog = (entry.deferred.log && entry.deferred.log.length) || false;
                    } else {
                        entry.label = 'success';
                        entry.nextAttempt = 'Whenever possible';
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
                let transaction = '';
                if (Array.isArray(entry.deferred.log)) {
                    transaction = entry.deferred.log
                        .map(row =>
                            util.format(
                                '%s [%s]: %s',
                                new Date(row.time ? row.time : 0).toISOString(),
                                row.level,
                                row.message.replace(/\n/g, '\n' + ' '.repeat(48))
                            )
                        )
                        .join('\n');
                }
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

router.get('/find', (req, res, next) => {
    const schema = Joi.object().keys({
        query: Joi.string()
            .max(255)
            .empty(''),
        next: Joi.string()
            .max(100)
            .empty(''),
        previous: Joi.string()
            .max(100)
            .empty(''),
        page: Joi.number()
            .empty('')
            .default(1),
        limit: Joi.number()
            .empty('')
            .min(1)
            .max(200)
            .default(50)
    });

    let result = Joi.validate(req.query, schema, {
        abortEarly: false,
        convert: true,
        stripUnknown: true
    });

    if (result.error) {
        if (result.error && result.error.details) {
            result.error.details.forEach(detail => {
                req.flash('danger', detail.message);
            });
        }
        return res.redirect('/');
    }

    let cursorType, cursorValue;

    if (result.value.next) {
        cursorType = 'next';
        cursorValue = result.value.next;
    } else if (result.value.previous) {
        cursorType = 'previous';
        cursorValue = result.value.previous;
    }

    const searchString = SearchString.parse(result.value.query);
    let keys = searchString.getParsedQuery();
    let term = searchString
        .getTextSegments()
        .map(text =>
            (text.text || '')
                .toString()
                .trim()
                .replace(/^[<\s]+|[>\s]+$/g, '')
        )
        .join(' ')
        .trim();

    let query = result.value.query;
    let page = result.value.page;
    let limit = result.value.limit;
    let filter = {};
    let hasQueryKeys = false;

    Object.keys(keys).forEach(key => {
        let fkey = key.toLowerCase().trim();
        if (['from', 'to', 'id', 'message-id'].includes(fkey)) {
            if (fkey === 'message-id') {
                fkey = 'mid';
            }

            filter[fkey] = keys[key]
                .map(val =>
                    (val || '')
                        .toString()
                        .trim()
                        .replace(/^[<\s]+|[>\s]+$/g, '')
                )
                .join(' ')
                .trim();
            hasQueryKeys = true;
        }
        switch (fkey) {
            case 'start': {
                let date = new Date(keys[key].shift());
                if (date.toString() !== 'Invalid Date') {
                    if (!filter.t) {
                        filter.t = {};
                    }
                    filter.t.$gte = date;
                    hasQueryKeys = true;
                }
                break;
            }

            case 'end': {
                let date = new Date(keys[key].shift());
                if (date.toString() !== 'Invalid Date') {
                    if (!filter.t) {
                        filter.t = {};
                    }
                    filter.t.$lte = date;
                    hasQueryKeys = true;
                }
                break;
            }
        }
    });

    if (!hasQueryKeys && !term) {
        return res.redirect('/');
    }

    if (!hasQueryKeys && /^[0-9a-z]{18}(\.[0-9a-z]{3})?$/i.test(term)) {
        return res.redirect('/message/' + term);
    }

    if (term) {
        filter.mid = {
            $regex: escapeRegexStr(term),
            $options: ''
        };
    }

    db.client.collection('mids').count(filter, (err, total) => {
        if (err) {
            return next(err);
        }

        let opts = {
            limit,
            query: filter,
            paginatedField: '_id',
            sortAscending: false
        };

        if (cursorType === 'next') {
            opts.next = cursorValue;
        } else if (cursorType === 'previous') {
            opts.previous = cursorValue;
        }

        MongoPaging.find(db.client.collection('mids'), opts, (err, result) => {
            if (err) {
                return next(err);
            }

            if (!result.hasPrevious) {
                page = 1;
            }

            res.render('message-ids', {
                query,
                total,
                page,
                limit,
                previousCursor: result.hasPrevious ? result.previous : false,
                previousPage: Math.max(page - 1, 1),
                nextPage: Math.min(page + 1, Math.ceil(total / limit)) || 1,
                nextCursor: result.hasNext ? result.next : false,
                results: (result.results || []).map((entry, i) => ({
                    id: entry.id,
                    index: page * limit - limit + i + 1,
                    from: entry.from,
                    to: entry.to,
                    toStr: ((entry.to && entry.to[0]) || '') + (entry.to && entry.to.length > 1 ? ' +' + (entry.to.length - 1) + ' more…' : ''),
                    mid: '<' + entry.mid + '>',
                    time: entry.t.toISOString()
                }))
            });
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

router.get('/suppressionlist', (req, res, next) => {
    handler.fetchSuppressionlist((err, list) => {
        if (err) {
            return next(err);
        }

        res.render('suppressionlist', {
            items: list.map((item, i) => {
                item.index = i + 1;
                item.time = new Date(item.created ? item.created : 0).toISOString();
                return item;
            })
        });
    });
});

router.post('/suppressionlist/add', (req, res, next) => {
    let address = (req.body.address || '').toString().trim();
    let domain = (req.body.domain || '').toString().trim();

    if (!address && !domain) {
        req.flash('danger', 'Empty values');
        return res.redirect('/suppressionlist');
    }

    handler.addToSuppressionlist(
        {
            address,
            domain
        },
        (err, message) => {
            if (err) {
                return next(err);
            }

            if (err) {
                req.flash('danger', err.message);
            }

            if (message && message.suppressed) {
                req.flash('success', 'New entry added with id ' + message.suppressed.id);
            }

            res.redirect('/suppressionlist');
        }
    );
});

router.post('/suppressionlist/delete', (req, res, next) => {
    let id = (req.body.id || '').toString().trim();

    if (!id) {
        req.flash('danger', 'Empty values');
        return res.redirect('/suppressionlist');
    }

    handler.deleteFromSuppressionlist(
        {
            id
        },
        (err, message) => {
            if (err) {
                return next(err);
            }

            if (err) {
                req.flash('danger', err.message);
            }

            if (message && message.deleted) {
                req.flash('success', 'Entry deleted with id ' + message.deleted);
            }

            res.redirect('/suppressionlist');
        }
    );
});

router.get('/logout', (req, res, next) => {
    req.session.regenerate(err => {
        if (err) {
            return next(err);
        }
        res.redirect('/');
    });
});

module.exports = router;

function escapeRegexStr(string) {
    let specials = ['-', '[', ']', '/', '{', '}', '(', ')', '*', '+', '?', '.', '\\', '^', '$', '|'];
    return string.replace(RegExp('[' + specials.join('\\') + ']', 'g'), '\\$&');
}
