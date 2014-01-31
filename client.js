(function (window, undefined) {
	var socket = io.connect('http://localhost');
	socket.emit('message', {
		body: "My awesome message goes here!"
	});
}(window));