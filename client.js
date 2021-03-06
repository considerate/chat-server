(function (window, undefined) {
	var id = document.getElementById.bind(document);
	var qsel = document.querySelectorAll.bind(document);
	var create = document.createElement.bind(document);
	var tnode = document.createTextNode.bind(document);

	var joinedRoom = false;
	var username = '';

	var socket = io.connect('http://'+window.location.hostname);

	function prependMesage(message, element) {
		var li = create('li');
		var text = tnode(message.user+': '+message.body);
		li.appendChild(text);
		var ul = element;
		ul.insertBefore(li,ul.firstChild);
	}

	socket.on('message', function(data) {
		prependMesage(data, id('messages'));
	});

	socket.on('room message', function(data) {
		prependMesage(data, id('room-messages'));
	});

	var messageForm = id('message-form');
	messageForm.addEventListener('submit', function(event) {
		event.preventDefault();
		var field = id('message-field');
		var messageText = field.value;
		field.value = '';
		socket.emit('message', {
			body: messageText,
			user: username
		});
	});

	var chatForm = id('start-chat-form');
	chatForm.addEventListener('submit', function(event) {
		event.preventDefault();
		var field = id('friend-field');
		var friendID = field.value;
		field.value = '';
		var friends = [friendID];
		socket.emit('start chat', {
			user: username,
			friends: friends
		});
	});

	socket.on('chat started', function(data) {
		console.log(data);
	});

	var roomForm = id('room-message-form');
	roomForm.addEventListener('submit', function(event) {
		event.preventDefault();
		var field = id('room-message-field');
		var messageText = field.value;
		field.value = '';
		socket.emit('room message', {
			body: messageText,
			room: joinedRoom,
			user: username
		});
	});

	var lobbyForm = id('join-lobby-form');
	lobbyForm.addEventListener('submit', function(event) {
		event.preventDefault();
		var field = id('lobby-field');
		var lobbyName = field.value;
		field.value = '';
		socket.emit('join lobby', {
			lobby: lobbyName
		});
		joinedRoom = lobbyName;
		var roomSpan = id('current-room');
		for(var i = 0; i < roomSpan.children.length; i++) {
			roomSpan.removeChild(roomSpan.children[i]);	
		}
		var text = tnode(joinedRoom);
		roomSpan.appendChild(text);
	});

}(window));