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
      reqStr(data.user);
      reqStr(data.body);
    } catch(e) {
      return;
    }
  	io.sockets.emit('message',data);
    co(function* () {
      yield messages.save({
        user: data.user,
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
      socket.emit('chat started', result);
    })();
  });

  socket.on('room message', function(data){
    try {
      validate(data);
      reqStr(data.user);
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
        user: data.user,
        room: room
      });

      co(function* () {
        yield messages.save({
          user: data.user,
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

  socket.on('disconnect', function(){});
});



server.listen(3000);