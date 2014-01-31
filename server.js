var app = require('koa')();
var send = require('koa-send');
var serve = require('koa-static');
var co = require('co');
var logger = require('koa-logger');

var mongo = require('co-easymongo')({
  dbname: 'chattest'
});

var messages = mongo.collection('messages');

var session = require('koa-sess');
var koaRedis = require('koa-redis');
var redisStore = koaRedis();

app.keys = ['some secret'];

app.use(session({
  store: redisStore
}));

app.use(logger());

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

io.use(function(socket, next) {
  console.log(socket.client.id);
  var Cookies = require('cookies');
  var cookies = new Cookies( socket.request, socket.request.res, app.keys);
  var sid = cookies.get('koa.sid');
  socket.koasid = sid;
  if(sid) {
    co(function* () {
      var session = yield redisStore.get(sid); 
      var myid = socket.client.id;
      session.socketID = myid;
      yield redisStore.set(sid,session);
      next();
    })();
  }
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
  	console.log('Recieved data', data);
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

  socket.on('room message', function(data){
    try {
      validate(data);
      reqStr(data.user);
      reqStr(data.body);
      reqStr(data.room);
    } catch (e) {
      return;
    }
  	console.log('Recieved data', data);
    if(data.rooms) {
      data.rooms.forEach(function(room) {
        sendMessageToRoom(room);
      });
    }
    if(data.room) {
      sendMessageToRoom(data.room);
    }
    function sendMessageToRoom(room) {
      console.log('Here', room);
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