var app = require('koa')();
var send = require('koa-send');
var serve = require('koa-static');

app.use(serve('.'));

var server = require('http').Server(app.callback());

var io = require('socket.io')(server);
io.on('connection', function(socket){
  socket.on('message', function(data){
  	console.log('Recieved data', data);
  	io.sockets.emit('message',data);
  });
  socket.on('disconnect', function(){
  	
  });
});



server.listen(3000);