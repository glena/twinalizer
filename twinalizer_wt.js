var jwt = require('express-jwt');
var Express = require('express');
var Webtask = require('webtask-tools');
var bodyParser = require('body-parser');
var _ = require('lodash');
var MongoClient = require('mongodb').MongoClient;

var Twit = require('twit')

var app = Express();

app.use( jwt({ secret: function(req, payload, done){ 
    done(null, new Buffer(req.webtaskContext.data.client_secret, 'base64')); 
  } })
);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  next();
});

app.use(function(req, res, next) {
  if (req.method.toLowerCase() === 'options') {
    req.end();
  } else {
    next();
  }
});


app.use(function (req, res, next) {
    if (global.db) {
      req.db = global.db;
      next();
    } else {
      MongoClient.connect(req.webtaskContext.data.mongodb_connection_string, function(err, db) {
        if (err) {
          res.json(err).end();
        } else {
          req.db = db;
          global.db = db;
          next();
        }
      });
    }
  });

app.use(function (req, res, next) {
  req.db.collection('users').findOne({user_id:req.user.user_id}, function(err, user) {
    if (!user) {
      user = {
        user_id: req.user.sub,
        friends:[],
        followers:[],
        changes:{},
        last_update: new Date()
      }
      req.update_twitter_info = true;
    } else {
      var limitDate = new Date();
      var lastUpdate = new Date(user.last_update);
      limitDate.setMonth(limitDate.getDay() - 1);

      req.update_twitter_info = (lastUpdate < limitDate);
      user.last_update = new Date();
    }

    user.access_token = req.user.identities[0].access_token;
    user.access_token_secret = req.user.identities[0].access_token_secret;

    req.a0_user = user;
    next();
  });
});


app.use(function (req, res, next) {
  req.twitter = new Twit({
        consumer_key:         req.webtaskContext.data.consumer_key
      , consumer_secret:      req.webtaskContext.data.consumer_secret
      , access_token:         req.a0_user.access_token
      , access_token_secret:  req.a0_user.access_token_secret
    });

  next();
});

app.get('/changes/:date',
  function(req,res) {

    var ids = _.uniq( req.a0_user.changes[req.params.date].new_followers.concat( req.a0_user.changes[req.params.date].lost_followers ) );

    req.twitter.post('users/lookup', { user_id: ids },  function (err, data, response) {

      var users = _.reduce(data, function(result, user) {

        if ( req.a0_user.changes[req.params.date].new_followers.indexOf(user.id) !== -1 ) {
          result.new_followers.push(user);
        }

        if ( req.a0_user.changes[req.params.date].lost_followers.indexOf(user.id) !== -1 ) {
          result.lost_followers.push(user);
        }

        return result;

      }, { new_followers:[], lost_followers:[] } )

      res.json(users).end();
    });
  });

app.get('/friends-not-followers/:page',
  function(req,res) {

    var ids = _.difference(req.a0_user.friends, req.a0_user.followers);

    var start = req.params.page * 100;
    var end = start + 100;
    end = end > ids.length ? ids.length : end;

    ids = _.slice(ids, start, end);

    req.twitter.post('users/lookup', { user_id: ids },  function (err, data, response) {

      res.json(data).end();

    })

  });

module.exports = Webtask.fromExpress(app);