var app = require('koa')();
var send = require('koa-send');
var serve = require('koa-static');
var co = require('co');
var logger = require('koa-logger');
var redis = require("redis");
var redisClient = redis.createClient();
  var Cookies = require('cookies');

var mongo = require('co-easymongo')({
  dbname: 'chattest'
});

var messages = mongo.collection('messages');
var users = mongo.collection('users');
var chats = mongo.collection('chats');

var parse = require('co-body');
var session = require('koa-sess');
var koaRedis = require('koa-redis');
var redisStore = koaRedis();
var router = require('koa-router');
app.keys = ['some secret'];

app.use(session({
  store: redisStore
}));

app.use(router(app));

app.use(logger());

app.get('/login', function *() {
  yield send(this, __dirname+'/login.html');
});

var socketMap = new Map();
redisClient.keys('user:username:*', function (keys) {
  redisClient.del(keys, function() {
    console.log('deleted old keys');
  });
});
app.post('/login', function* () {
  var body = yield parse.form(this);
  var res = yield users.find({username: body.username},{limit: 1});
  var doc = res[0];
  if(doc) {
    this.session.loggedIn = true;
    this.session.username = body.username;
    this.redirect('/');
  }else {
    this.statusCode = 401;
  }
});

app.use(function *(next) {
  if(this.session.loggedIn) {
    yield next;
  }
  else {
    this.redirect('/login');
  }
});

app.use(serve('.'));

var server = require('http').Server(app.callback());


function* _(array) {
  for(var i = 0; i < array.length; i++) {
    yield array[i];
  }
}


function getFromRedis(key) {
  return function(done) {
    redisClient.get(key, done);
  }
}

function reqStr(obj) {
  if(typeof obj !== 'string') {
    throw new Error('This is not a string '+obj);
  }
}

function validate(data) {
  for(var key in data) {
    if(typeof data[key] === 'function') {
      throw new Error('Client posted a function');
    }
  }
}

var io = require('socket.io')(server);
function* getSession(socket) {
  var cookies = new Cookies( socket.request, socket.request.res, app.keys);
  var sid = cookies.get('koa.sid');
  socket.koasid = sid;
  if(sid) { 
    var session = yield redisStore.get(sid);
    socket.username = session.username;
    return session;
  }
}


io.use(function(socket, next) {
  co(function* () {
    var session = yield getSession(socket);
    if(session.loggedIn) {
      var key = 'user:username:'+session.username;
      var value = socket.client.id;
      redisClient.set(key, value, function() {
        next();
      });
    }
  })();
});

io.on('connection', function(socket) {
  socketMap.set(socket.id,socket);
  console.log('map size: ',socketMap.size);
  co(function* () {
    var result = yield chats.find({
      users: {
        $in: [socket.username]
      }
    });
    for(var chat of _(result)) {
      socket.join(chat._id);
      socket.emit('chat started', chat);
    }   
  })();
  co(function* (){
    var result = yield messages.find({
      room: '/'
    },{
      sort: {
        date: 1
      }
    });

    for(var message of _(result)) {
      socket.emit('message', {
        body: message.body,
        user: message.user,
      });
    }
  })();

  socket.on('message', function(data) {
    try {
      validate(data);
      reqStr(data.body);
    } catch(e) {
      return;
    }
  	io.sockets.emit('message',{
      body: data.body,
      user: socket.username
    });
    co(function* () {
      yield messages.save({
        user: socket.username,
        body: data.body,
        date: new Date(),
        room: '/'
      });
    })();
  });

  socket.on('start chat', function (data) {
    co(function* () {
      var friends = data.friends;
      var user = socket.username;
      var chatUsers = [user].concat(friends);
      var result = yield chats.save({
        users: chatUsers
      });
      socket.join(result._id);
      socket.emit('chat started', result);
      var chatRoom = result._id;
      var queries = [];
      for(var friend of _(friends)) {
        queries.push(getFromRedis('user:username:'+friend));
      }
      var results = yield queries;
      results.forEach(function (socketid) {
        var friendSocket = socketMap.get(socketid);
        if(friendSocket) {
          friendSocket.join(chatRoom);
          friendSocket.emit('chat started', result);
        }
      });
    })();
  });

  socket.on('room message', function(data){
    try {
      validate(data);
      reqStr(data.body);
      reqStr(data.room);
    } catch (e) {
      return;
    }
    if(data.rooms) {
      data.rooms.forEach(function(room) {
        sendMessageToRoom(room);
      });
    }
    if(data.room) {
      sendMessageToRoom(data.room);
    }
    function sendMessageToRoom(room) {
      io.sockets.in(room).emit('room message', {
        body: data.body,
        user: socket.username,
        room: room
      });
      co(function* () {
        yield messages.save({
          user: socket.username,
          body: data.body,
          date: new Date(),
          room: room
        });
      })();
    }
  });

  socket.on('join lobby', function(data) {
    try{
      validate(data);
      reqStr(data.lobby);
    } catch (e) {
      return;
    }
    socket.join(data.lobby);
    co(function* (){
      var result = yield messages.find({
        room: data.lobby
      },{
        sort: {
          date: 1
        }
      });
      for(var message of _(result)) {
        socket.emit('room message', {
          body: message.body,
          user: message.user,
          room: data.lobby
        });
      }
    })();
  });
  socket.on('disconnect', function(){
    socketMap.delete(socket.id);
    console.log('map size: ',socketMap.size);
  });
});


server.listen(3000);