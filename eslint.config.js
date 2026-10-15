'use strict';

const js = require('@eslint/js');
const globals = require('globals');
const nodemailer = require('eslint-config-nodemailer');
const prettier = require('eslint-config-prettier');

module.exports = [
    { ignores: ['public/**'] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node
        },
        rules: Object.assign({}, nodemailer.rules, prettier.rules, {
            indent: 0,
            'no-await-in-loop': 0,
            'require-atomic-updates': 0
        })
    }
];
