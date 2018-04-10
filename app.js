/* eslint no-invalid-this: 0 */

'use strict';

const config = require('wild-config');
const log = require('npmlog');

const db = require('./lib/db');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const flash = require('connect-flash');
const hbs = require('hbs');
const humanize = require('humanize');

const routes = require('./routes/index');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// Handle proxies. Needed to resolve client IP
if (config.proxy) {
    app.set('trust proxy', config.proxy);
}

// Do not expose software used
app.disable('x-powered-by');

/**
 * We need this helper to make sure that we consume flash messages only
 * when we are able to actually display these. Otherwise we might end up
 * in a situation where we consume a flash messages but then comes a redirect
 * and the message is never displayed
 */
hbs.registerHelper('flash_messages', function() {
    if (typeof this.flash !== 'function') {
        return '';
    }

    let messages = this.flash();
    let response = [];

    // group messages by type
    Object.keys(messages).forEach(key => {
        let el =
            '<div class="alert alert-' +
            key +
            ' alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>';

        if (key === 'danger') {
            el += '<span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ';
        }

        let rows = [];

        messages[key].forEach(message => {
            rows.push(hbs.handlebars.escapeExpression(message));
        });

        if (rows.length > 1) {
            el += '<p>' + rows.join('</p>\n<p>') + '</p>';
        } else {
            el += rows.join('');
        }

        el += '</div>';

        response.push(el);
    });

    return new hbs.handlebars.SafeString(response.join('\n'));
});

hbs.registerHelper('num', function(options) {
    // eslint-disable-line prefer-arrow-callback
    return new hbs.handlebars.SafeString(
        humanize.numberFormat(options.fn(this), 0, ',', ' ') // eslint-disable-line no-invalid-this
    );
});

hbs.registerHelper('dec', function(options) {
    // eslint-disable-line prefer-arrow-callback
    return new hbs.handlebars.SafeString(
        humanize.numberFormat(options.fn(this), 3, ',', ' ') // eslint-disable-line no-invalid-this
    );
});

app.use(
    logger(config.httplog, {
        stream: {
            write: message => {
                message = (message || '').toString();
                if (message && process.NODE_ENV !== 'production') {
                    log.info('HTTP', message.replace('\n', '').trim());
                }
            }
        }
    })
);

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
    session({
        store: new RedisStore({
            client: db.redis.duplicate()
        }),
        secret: config.secret,
        saveUninitialized: false,
        resave: false
    })
);
app.use(flash());

app.use(
    bodyParser.urlencoded({
        extended: true,
        limit: config.maxPostSize
    })
);

app.use(
    bodyParser.text({
        limit: config.maxPostSize
    })
);

app.use(
    bodyParser.json({
        limit: config.maxPostSize
    })
);

// make sure flash messages are available
app.use((req, res, next) => {
    res.locals.flash = req.flash.bind(req);

    let menu = [
        /*{
                title: 'Home',
                url: '/',
                selected: true
            }*/
    ];

    res.setSelectedMenu = key => {
        menu.forEach(item => {
            item.selected = item.key === key;
        });
    };

    res.locals.menu = menu;

    next();
});

app.use(require('./lib/sitepass'));

app.use('/', routes);

app.use((err, req, res, next) => {
    if (!err) {
        return next();
    }
    res.status(err.statusCode || 500);
    res.render('error', {
        message: err.message,
        error: err
    });
});

module.exports = app;
