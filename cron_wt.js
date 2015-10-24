var _ = require('lodash');
var MongoClient = require('mongodb').MongoClient;
var Twit = require('twit')

module.exports = function (context, cb) {
  var index = -1;

  var stack = [
    connect,
    get_user,
    setup_twitter,
    get_followers,
    get_friends,
    save_user,
    function() { cb(null, 'DONE'); }
  ];

  function next() {
    index++;
    if (index < stack.length) {
      stack[index](next, context);
    }
  }

  next();
}

function connect (next, context) {
    if (global.db) {
      context.db = global.db;
      next();
    } else {
      MongoClient.connect(context.data.mongodb_connection_string, function(err, db) {
        if (err) {
          console.log(err);
        } else {
          context.db = db;
          global.db = db;
          next();
        }
      });
    }
  }

function get_user(next, context) {
  context.db.collection('users').findOne({user_id:"twitter|366141931"}, function(err, user) {
    user.last_update = new Date();
    context.a0_user = user;
    next();
  });
}


function setup_twitter(next, context) {
  context.twitter = new Twit({
        consumer_key:         context.data.consumer_key
      , consumer_secret:      context.data.consumer_secret
      , access_token:         context.a0_user.access_token
      , access_token_secret:  context.a0_user.access_token_secret
    });

  next();
}

function get_followers(next, context) {
    context.twitter.get('followers/ids', { },  function (err, data, response) {

      var ids = data.ids;

      var date = new Date();
      var day = date.getDate();
      var monthIndex = date.getMonth() + 1;
      var year = date.getFullYear();
      var today = year + "-" + monthIndex + "-" + day;

      var new_followers = _.difference(ids,context.a0_user.followers);
      var lost_followers = _.difference(context.a0_user.followers,ids);

      if (context.a0_user.changes[today] === undefined) {

        context.a0_user.changes[today] = {
          new_followers: new_followers,
          lost_followers: lost_followers
        };

      } else {
        context.a0_user.changes[today].new_followers = _.uniq( context.a0_user.changes[today].new_followers.concat(new_followers) );
        context.a0_user.changes[today].lost_followers = _.uniq( context.a0_user.changes[today].lost_followers.concat(lost_followers) );
      }

      context.a0_user.followers = ids;

      next();

    })

  }
function get_friends(next, context) {

    context.twitter.get('friends/ids', { },  function (err, data, response) {

      var ids = data.ids;

      context.a0_user.friends = ids;
      next();

    })

  }
function save_user(next, context) {

    context.db.collection('users').update({ user_id:context.a0_user.user_id }, context.a0_user, {upsert:true}, function(){

      next();

    });

  }