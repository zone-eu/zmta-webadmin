'use strict';

const config = require('wild-config');

module.exports = (req, res, next) => {
    if (!config.auth || req.session.sitepass) {
        return next();
    }

    let error = false;

    if (req.method === 'POST') {
        if (req.body.sitepass && req.body.username === config.user && req.body.password === config.pass) {
            req.session.sitepass = true;

            if (req.body.remember) {
                // Cookie expires after 90 days
                req.session.cookie.maxAge = 90 * 24 * 60 * 60 * 1000;
            } else {
                // Cookie expires at end of session
                req.session.cookie.expires = false;
            }

            req.flash('success', 'You are now allowed to access the ZMTA Web Service');
            return res.redirect('/');
        }

        error = 'Invalid credentials';
    }

    res.render('sitepass-content', {
        layout: 'sitepass-layout',
        error
    });
};
