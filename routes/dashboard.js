// Copyright (c) 2019, Fexra, The TurtleCoin Developers
// Copyright (c) 2019, Fexra, The LightChain Developers
//
// Please see the included LICENSE file for more information.
'use strict';

const express = require('express');
const router = express.Router();
const permission = require('permission');
const db = require('../utils/utils').knex;
const { check } = require('express-validator/check');
const validateInput = require('../middleware/validateInput');
const config = require('../config.json');

// Preference Panel
router.get('/', permission(), async function(req, res, next) {
  const nodeArray = await getNodeArray(req);
  const lastSeenPromises = nodeArray.map(item => getLastShare(item));
  const lastSeen = await Promise.all(lastSeenPromises)
  const paymentsArray = await getPaymentsArray(req);
  console.log(paymentsArray);
  const validationKey = await getValidateKey(req);
  const shares = await getShares(req);
  const roundNonce = getRoundNonce(Date.now())
  const totalNodes = await getTotalNodes();
  const roundBalance = await db('wallet')
        .select('*')
        .from('wallet')
        .where({
            nonce: roundNonce
        })
        .map(a => a.amount);
  const pendingBalance = humanReadable(roundBalance.reduce(add, 0) * shares[0][3])

  res.render('dashboard', {
    title: 'Dashboard',
    nodes: nodeArray,
    payments: paymentsArray,
    lastseen: lastSeen,
    validatestring: validationKey,
    shares: shares,
    pendingbalance: pendingBalance,
    totalnodes: totalNodes,
    user: req.user ? req.user : undefined,
  });
});

router.post('/registernode',  permission(),
[
  check('ip')
    .not()
    .isEmpty()
    .trim()
    .escape()
    .isIP()
    .withMessage('Please enter a valid IP Address.'),
  check('port')
    .not()
    .isEmpty()
    .trim()
    .escape()
    .isPort()
    .withMessage('Please enter a valid port.'),
],
validateInput,
async function(req, res, next) {
  try {

    const dupCheck = await db('nodes')
    .where({
      ip: req.body.ip,
      id: req.user.id})
    if (dupCheck.length) {
      console.log(dupCheck.length);
      throw new Error(
        'You have already registered this IP.'
      );
    }
    let err = req.validationErrors();
    if (err) {
      throw err;
    }

    const ipPort = `${req.body.ip}:${req.body.port}`;

    // Insert node
    await db('nodes')
    .insert({
      id: req.user.id,
      ip: req.body.ip,
      port: req.body.port,
      connectionstring: ipPort
    })
    .where('id', req.user.id)
    .limit(1);

    res.redirect('/');

  } catch (err) {
    console.log(err);
    req.flash('error', err.toString());
    res.redirect('/');
  }
});

router.get('/deletenode/:index', permission(),


async function(req, res, next) {
  const nodeArray = await getNodeArray(req);
  await db('nodes')
  .where({
  id: req.user.id,
  ip:  nodeArray[req.params.index]
  })
  .del();
  res.redirect('/');
})

async function getLastShare(ip) {
  const entireList = await db('pings')
    .select('*')
    .from('pings')
    .where('ip', ip);
  if (entireList.length === 0) {
    return 'Never';
  } else {
    return entireList[entireList.length - 1].timestamp
  }
}

// convert unix timestamp into human readable
function getRoundNonce(timestamp) {
  let d = new Date(parseInt(timestamp)) // Convert the passed timestamp to milliseconds
  let yyyy = d.getFullYear()
  let mm = ('0' + (d.getMonth() + 1)).slice(-2) // Months are zero based. Add leading 0.
  let dd = ('0' + d.getDate()).slice(-2) // Add leading 0.
  let hh = ('0' + d.getHours()).slice(-2) // Add leading 0
  let roundNonce;
  // ie: 2013032416
  roundNonce = yyyy + mm + dd + hh;
  return roundNonce;
};

function getShares(req) {
  return db('shares')
  .select('*')
  .from('shares')
  .where('id', req.user.id)
  .limit(1)
  .map(a => [a.shares, (a.percent / 10000).toFixed(2), numberWithCommas((a.percent/1000000*500.00000000).toFixed(8)), (a.percent / 1000000)]);
}

function getNodeArray(req) {
  return db('nodes')
  .select('ip')
  .from('nodes')
  .where('id', req.user.id)
  .map(a => a.ip);
}

async function getTotalNodes() {
  const nodes = await db('nodes')
  .select('ip')
  .from('nodes')
  .map(a => a.ip);
  return nodes.length;
}



function getValidateKey(req) {
  return db('users')
  .select('validationkey')
  .from('users')
  .where('id', req.user.id)
  .limit(1)
  .map(a => a.validationkey);
}

function getPaymentsArray(req) {
  return db('payments')
  .select('timestamp', 'amount', 'hash')
  .from('payments')
  .orderBy('timestamp', 'desc')
  .where('id', req.user.id)
  // .limit(10)
  .map(a => [a.timestamp, a.hash, (humanReadable(a.amount) + ' LCX')]);
}

// convert unix timestamp into human readable
function convertTimestamp(timestamp) {
  let d = new Date(parseInt(timestamp)), // Convert the passed timestamp to milliseconds
      yyyy = d.getFullYear(),
      mm = ('0' + (d.getMonth() + 1)).slice(-2), // Months are zero based. Add leading 0.
      dd = ('0' + d.getDate()).slice(-2), // Add leading 0.
      hh = ('0' + d.getHours()).slice(-2), // Add leading 0
      min = ('0' + d.getMinutes()).slice(-2), // Add leading 0.
      time;
  // ie: 2013-02-18, 16:35
  time = yyyy + '-' + mm + '-' + dd + ', ' + hh + ':' + min;
  return time;
};

function humanReadable(amount) {
  return (amount / 100000000).toFixed(8);
}

// function to format numbers with commas like currency
function numberWithCommas(x) {
    var parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

function add(accumulator, a) {
    return accumulator + a;
}

module.exports = router;
