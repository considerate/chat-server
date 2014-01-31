var app = require('koa')();
var send = require('koa-send');
var serve = require('koa-static');
var co = require('co');

var mongo = require('co-easymongo')({
  dbname: 'chattest'
});

var messages = mongo.collection('messages');


app.use(serve('.'));

var server = require('http').Server(app.callback());



var io = require('socket.io')(server);
io.on('connection', function(socket) {

  socket.on('message', function(data){
  	console.log('Recieved data', data);
  	io.sockets.emit('message',data);
    co(function* () {
      yield messages.save({
        user: data.user,
        body: data.body
      });
    })();
  });

  socket.on('room message', function(data){
  	console.log('Recieved data', data);
  	io.sockets.in(data.room).emit('room message',{
  		body: data.body,
  		user: data.user
  	});
  });

  socket.on('join lobby', function(data){
  	console.log(data);
  	socket.join(data.lobby);
  });

  socket.on('disconnect', function(){});
});



server.listen(3000);