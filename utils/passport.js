// Copyright (c) 2019, Fexra, The TurtleCoin Developers
// Copyright (c) 2019 ExtraHash, The LightChain Developers
//
// Please see the included LICENSE file for more information.

'use strict';

const WB = require('lightchain-wallet-backend');
const db = require('../utils/utils').knex;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const moment = require('moment');
const crypto = require('crypto');

function generateKey() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = function(passport) {
  passport.serializeUser(function(user, done) {
    done(null, user.id);
  });

  passport.deserializeUser(async function(id, done) {
    try {
      const user = await db('users')
        .select()
        .where('id', id)
        .limit(1);

      done(null, user[0]);
    } catch (err) {
      done(err);
    }
  });

  passport.use(
    'local-signup',
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true,
      },
      async function(req, email, password, done) {
        try {
          if (process.env.APP_REGISTRATION === false) {
            throw new Error(
              'Registration is currently closed. Please check back another time.'
            );
          }

          req
            .checkBody('name')
            .not()
            .isEmpty()
            .trim()
            .escape()
            .withMessage('Please enter a valid name.');

          req
            .checkBody('email')
            .not()
            .isEmpty()
            .trim()
            .escape()
            .isEmail()
            .withMessage('Please enter a valid email.');

          req
            .checkBody('wallet')
            .not()
            .isEmpty()
            .trim()
            .escape()
            .withMessage('Please enter a valid LCX Address.');
            
          req
            .checkBody('password')
            .not()
            .isEmpty()
            .trim()
            .escape()
            .isLength({
              min: 8,
              max: 32,
            })
            .withMessage('Please enter a valid password.');

          req
            .checkBody('confirm')
            .not()
            .isEmpty()
            .trim()
            .escape()
            .equals(req.body.password)
            .isLength({
              min: 8,
              max: 32,
            })
            .withMessage('Please confirm your new password.');

          req
            .checkBody('verify')
            .not()
            .isEmpty()
            .withMessage('Please accept the terms.');

          let err = req.validationErrors();

          if (err) {
            throw err;
          }

          const address = req.body.wallet
          const validity = WB.validateAddresses([address]);
          if (validity.errorCode) {
            err = 'Please enter a valid LCX address.';
            throw err;
          }

          const checkUser = await db('users')
            .select()
            .where('email', email)
            .limit(1);

          if (checkUser.length) {
            return done(
              null,
              false,
              req.flash('error', 'This email is already been taken.')
            );
          }

          const validationKey = generateKey();
          //console.log(validationKey());

          const userConfig = {
            email: email,
            password: bcrypt.hashSync(password, bcrypt.genSaltSync(10)),
            recovery: req.body.recovery,
            wallet: req.body.wallet,
            name: req.body.name,
            role: 'user',
            validationkey: validationKey,
          };

          const user = await db('users')
            .insert(userConfig)
            .limit(1);

          userConfig.id = user[0];

          await db('shares')
            .insert({ id: userConfig.id })
            .limit(1);

          console.log(userConfig.id);

          req.session.verified = true;
          return done(null, userConfig);
        } catch (err) {
          //fix
          //if (err[0].msg) {
          //err = err[0].msg;
          //}
          console.log(JSON.stringify(err));
          return done(null, false, req.flash('error', err.toString()));
        }
      }
    )
  );

  passport.use(
    'local-login',
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true,
      },
      async function(req, email, password, done) {
        try {
          const user = await db('users')
            .select()
            .where('email', email)
            .limit(1);

          if (!user.length || !bcrypt.compareSync(password, user[0].password)) {
            return done(
              null,
              false,
              req.flash('error', 'Wrong login details.')
            );
          }

          await db('users')
            .where('id', user[0].id)
            .update({
              seen: moment().format('YYYY-MM-DD HH:mm'),
            });

          return done(null, user[0]);
        } catch (err) {
          // fix
          if (err[0].msg) {
            err = err[0].msg;
          }
          return done(null, false, req.flash('error', err));
        }
      }
    )
  );
};
