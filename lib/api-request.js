'use strict';

async function fetchResponse(url, options = {}) {
    const target = new URL(url);
    const headers = new Headers(options.headers);
    if (target.username || target.password) {
        if (!headers.has('Authorization')) {
            const credentials = decodeURIComponent(target.username) + ':' + decodeURIComponent(target.password);
            headers.set('Authorization', 'Basic ' + Buffer.from(credentials).toString('base64'));
        }
        target.username = '';
        target.password = '';
    }
    return fetch(target, { ...options, headers });
}

// Preserve the handlers' callback interface while using Node's HTTP client.
function request(url, options, callback) {
    const headers = {};
    let body = options.body;
    if (options.json && options.json !== true) {
        body = JSON.stringify(options.json);
        headers['Content-Type'] = 'application/json';
    }
    if (options.json) {
        headers.Accept = 'application/json';
    }

    fetchResponse(url, { method: options.method || 'GET', headers, body })
        .then(async response => {
            const text = await response.text();
            let data = text;
            if (options.json && text) {
                data = JSON.parse(text);
            }
            return { response: { statusCode: response.status }, data };
        })
        .then(({ response, data }) => callback(null, response, data), err => callback(err));
}

for (const method of ['post', 'put', 'delete']) {
    request[method] = (url, options, callback) => request(url, Object.assign({}, options, { method: method.toUpperCase() }), callback);
}

request.fetch = fetchResponse;

module.exports = request;
