'use strict';

const config = require('wild-config');
const log = require('npmlog');
const http = require('http');
const db = require('./lib/db');
const logserver = require('./lib/logserver');

const port = config.port;
const host = config.host;

log.level = config.log.level;

db.init(err => {
    if (err) {
        throw err;
    }

    const app = require('./app'); // eslint-disable-line global-require
    app.set('port', port);

    let server = http.createServer(app);

    server.on('error', err => {
        if (err.syscall !== 'listen') {
            throw err;
        }

        let bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

        // handle specific listen errors with friendly messages
        switch (err.code) {
            case 'EACCES':
                log.error('Express', '%s requires elevated privileges', bind);
                return process.exit(1);
            case 'EADDRINUSE':
                log.error('Express', '%s is already in use', bind);
                return process.exit(1);
            default:
                throw err;
        }
    });

    server.on('listening', () => {
        let addr = server.address();
        let bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
        log.info('Express', 'WWW server listening on %s', bind);
    });

    process.on('uncaughtException', err => {
        log.error('App', err);
    });

    logserver(() => {
        server.listen(port, host);
    });
});
