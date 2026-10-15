'use strict';

const config = require('wild-config');
const request = require('./api-request');
const Readable = require('stream').Readable;
const redis = require('./db').redis;
const URL = require('url').URL;

let lastCheck = false;
let currentSpeed = new Map();
let cachedZones = false;

function fetchCounters(zones, callback) {
    zones = [].concat(zones || []);

    let top = [];

    let prefix = config.counterPrefix ? config.counterPrefix + '_' : '';
    let date = new Date();
    let year = date.getUTCFullYear() + '';
    let month = date.getUTCMonth() + 1;
    let day = date.getUTCDate();

    month = (month < 10 ? '0' : '') + month;
    day = (day < 10 ? '0' : '') + day;

    let query = redis.multi();

    zones.forEach(zone => {
        query.get(prefix + 'delivered_' + zone.name + '^' + year + '/' + month + '/' + day);
        query.get(prefix + 'bounced_' + zone.name + '^' + year + '/' + month + '/' + day);
    });
    query.zRangeWithScores(prefix + 'domains^' + year + '/' + month + '/' + day, 0, 9, { REV: true });

    query.exec().then(results => {
        let total = 0;
        let totals = {};
        results.forEach((counter, i) => {
            let index = Math.floor(i / 2);
            if (index < zones.length) {
                let zone = zones[index];
                let key = i % 2 === 0 ? 'delivered' : 'bounced';
                let value = Number(counter);
                zone['counter_' + key] = value;
                total += value;
                if (!totals['counter_' + key]) {
                    totals['counter_' + key] = value;
                } else {
                    totals['counter_' + key] += value;
                }
            } else if (i === zones.length * 2 && Array.isArray(counter)) {
                top = counter.map((entry, index) => ({
                    index: index + 1,
                    domain: entry.value,
                    messages: entry.score
                }));
            }
        });

        zones.forEach(zone => {
            let value = currentSpeed.get(zone.name) || 0;
            zone.speed = value;
            if (!totals.speed) {
                totals.speed = value;
            } else {
                totals.speed += value;
            }
            if (!totals.active) {
                totals.active = zone.active;
            } else {
                totals.active += zone.active;
            }
            if (!totals.deferred) {
                totals.deferred = zone.deferred;
            } else {
                totals.deferred += zone.deferred;
            }
        });

        top.forEach(entry => {
            entry.share = total ? (entry.messages / total) * 100 : 0;
        });

        callback(null, zones, top, totals);
    }, callback);
}

function fetchZoneList(callback) {
    request(
        config.apiServer + '/zones?includeDisabled=true',
        {
            json: true
        },
        (error, response, zones) => {
            if (error || response.statusCode !== 200) {
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }

            request(
                config.apiServer + '/counter/zone/',
                {
                    json: true
                },
                (error, response, data) => {
                    if (error || response.statusCode !== 200) {
                        return callback(error || new Error('Invalid response code ' + response.statusCode));
                    }

                    let active = new Map();
                    if (data.active && data.active.entries) {
                        data.active.entries.forEach(entry => {
                            active.set(entry.key, entry.value);
                        });
                    }

                    let deferred = new Map();
                    if (data.deferred && data.deferred.entries) {
                        data.deferred.entries.forEach(entry => {
                            deferred.set(entry.key, entry.value);
                        });
                    }

                    zones.forEach(zone => {
                        zone.active = active.get(zone.name) || 0;
                        zone.deferred = deferred.get(zone.name) || 0;
                    });

                    callback(null, zones);
                }
            );
        }
    );
}

function fetchQueued(zone, type, query, callback) {
    const url = new URL('/queued/' + encodeURIComponent(type) + '/' + encodeURIComponent(zone), config.apiServer);

    for (let key of Object.keys(query || {})) {
        url.searchParams.append(key, query[key]);
    }

    request(
        url.href,
        {
            json: true
        },
        (error, response, queued) => {
            if (error || response.statusCode !== 200) {
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            callback(null, queued);
        }
    );
}

function fetchCounter(zone, callback) {
    request(
        config.apiServer + '/counter/zone/' + encodeURIComponent(zone),
        {
            json: true
        },
        (error, response, data) => {
            if (error || response.statusCode !== 200) {
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            callback(null, data);
        }
    );
}

function fetchMessageData(id, callback) {
    request(
        config.apiServer + '/message/' + encodeURIComponent(id),
        {
            json: true
        },
        (error, response, message) => {
            if (error || response.statusCode !== 200) {
                if (response && response.statusCode === 404) {
                    let err = new Error('Message "' + id + '" is not in queue');
                    err.statusCode = response.statusCode;
                    err.status = 'Most probably this means that the message was already delivered or bounced';
                    return callback(err);
                }
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            callback(null, message);
        }
    );
}

function fetchBlacklist(callback) {
    request(
        config.apiServer + '/blacklist',
        {
            json: true
        },
        (error, response, data) => {
            if (error || response.statusCode !== 200) {
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            callback(null, (data && data.list) || []);
        }
    );
}

function fetchSuppressionlist(callback) {
    request(
        config.apiServer + '/suppressionlist',
        {
            json: true
        },
        (error, response, data) => {
            if (error || response.statusCode !== 200) {
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            callback(null, (data && data.suppressed) || []);
        }
    );
}

function addToSuppressionlist(payload, callback) {
    request.post(
        config.apiServer + '/suppressionlist',
        {
            json: payload
        },
        (error, response, message) => {
            if (error || response.statusCode !== 200) {
                if (message && message.error) {
                    error = new Error(message.error);
                }
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            return callback(null, message);
        }
    );
}

function deleteFromSuppressionlist(payload, callback) {
    request.delete(
        config.apiServer + '/suppressionlist?id=' + encodeURIComponent(payload.id),
        {
            json: true
        },
        (error, response, message) => {
            if (error || response.statusCode !== 200) {
                if (message && message.error) {
                    error = new Error(message.error);
                }
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            return callback(null, message);
        }
    );
}

async function getFetchStream(id) {
    const response = await request.fetch(config.apiServer + '/fetch/' + encodeURIComponent(id));
    if (response.status !== 200) {
        if (response.body) {
            await response.body.cancel();
        }
        let err = new Error('Invalid response code ' + response.status);
        err.statusCode = response.status;
        throw err;
    }
    return { stream: Readable.fromWeb(response.body), headers: response.headers };
}

function postMessage(payload, callback) {
    request.post(
        config.apiServer + '/send-raw',
        {
            body: payload
        },
        (error, response, message) => {
            if (error || response.statusCode !== 200) {
                try {
                    message = JSON.parse(message.toString());
                } catch {
                    // ignore
                }
                if (message && message.error) {
                    error = new Error(message.error);
                }
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            try {
                message = JSON.parse(message.toString());
            } catch (E) {
                return callback(E);
            }
            return callback(null, message);
        }
    );
}

function deleteMessage(id, seq, callback) {
    request.delete(
        config.apiServer + '/message/' + id + '/' + (seq ? seq : ''),
        {
            json: true
        },
        (error, response, info) => {
            if (error || response.statusCode !== 200) {
                if (info && info.error) {
                    error = new Error(info.error);
                }
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            return callback(null, info);
        }
    );
}

function sendMessages(id, seq, callback) {
    request.put(
        config.apiServer + '/message/' + id + '/' + (seq ? seq : ''),
        {
            json: true
        },
        (error, response, info) => {
            if (error || response.statusCode !== 200) {
                if (info && info.error) {
                    error = new Error(info.error);
                }
                return callback(error || new Error('Invalid response code ' + response.statusCode));
            }
            return callback(null, info);
        }
    );
}

function updateSpeedCounter() {
    if (!cachedZones) {
        request(
            config.apiServer + '/zones',
            {
                json: true
            },
            (error, response, zones) => {
                if (error || response.statusCode !== 200) {
                    return;
                }
                cachedZones = zones;
                setImmediate(updateSpeedCounter);
            }
        );
        return;
    }

    let prevCounters = new Map();
    cachedZones.forEach(zone => {
        prevCounters.set(zone.name, {
            name: zone.name,
            delivered: Number(zone.counter_delivered) || 0,
            bounced: Number(zone.counter_bounced) || 0
        });
    });

    fetchCounters(cachedZones, (err, zones) => {
        if (err) {
            return;
        }
        let now = Date.now();
        zones.forEach(zone => {
            let delivered = Number(zone.counter_delivered) || 0;
            let bounced = Number(zone.counter_bounced) || 0;
            if (lastCheck) {
                let prev = prevCounters.get(zone.name);
                let speed = (delivered + bounced - (prev.delivered + prev.bounced)) / ((now - lastCheck) / 1000);
                currentSpeed.set(zone.name, speed);
            }
        });
        lastCheck = now;
    });
}

module.exports = {
    fetchZoneList,
    fetchQueued,
    fetchCounter,
    fetchMessageData,
    getFetchStream,
    fetchCounters,
    postMessage,
    fetchBlacklist,
    deleteMessage,
    sendMessages,
    fetchSuppressionlist,
    addToSuppressionlist,
    deleteFromSuppressionlist
};

setInterval(updateSpeedCounter, 2.5 * 1000).unref();
setTimeout(updateSpeedCounter, 100).unref();
