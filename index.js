'use strict';

// Global Variables
let players = [];
const maxPlayers = 2;

const masterSays = {
	toMuchPlayers: "Kein Zugang zum Spiel mehr möglich, es gibt schon 2 Spieler.",
	welcome: "Willkommen! :)",
	waitFor2ndPlayer : "<br>Wir warten noch auf einen zweiten Spieler.",
	termination : " Dein Mitspieler hat das Spiel verlassen. Das Spiel wurde beendet.",
	newPlayer : "Du hast einen Mitspieler bekommen. Nun kann es losgehen! :)",
	raffle : "Ich lose nun aus, wer von euch anfängt. Wartet kurz...",
	chooseAWord : ", überlege dir nun ein Wort. Es muss ein Substantiv sein!",
	chooseAWordWait : " überlegt sich nun ein Wort, wird warten so lange. :)",
	lookUpWord : "Ich schlage das Wort nach...",
	dictionaryBroken : "Mein Wörterbuch ist kaputt!!! :("
}

// Server
const express = require("express");
const server = express();
server.use(express.static("public"));

// HTTP
const http = require("http");
const httpServer = http.Server(server);

// Websocket
const socketIo = require("socket.io");
let io = socketIo(httpServer);

///////////////////////////////////////////////
// Classes

class Player {
	constructor(socket, no) {
		this.socket = socket;
		this.id = socket.id;
		this.no = no;
		this.name = "Spieler " + no;
		this.isRiddler = false;
	}
}

class StateToSend {
	constructor(gameState, iAmRiddler=false, msg="", gameOver=false ) {
		this.gameState = gameState;
		this.iAmRiddler = iAmRiddler;
		this.msg = msg;
		this.gameOver = gameOver;
	}
}

///////////////////////////////////////////////
// Helper

function registerPlayer(socket, no) {
  console.log("Player registriert. Player Nr.: " + no);
	players.push( new Player(socket, no) );
	players.forEach( p => {
		let info = `Du bist ${p.name}.`;
		p.socket.emit("writeInfo", JSON.stringify({ info }));
		if (players.length > 1 ) {
			let msg = masterSays.newPlayer;
			p.socket.emit("message", JSON.stringify( { msg } ));
		}
	});
}

///////////////////////////////////////////////
// Game States

function raffleBeginner() {
  console.log("raffleBeginner");
	let gameState = "raffleBeginner";
	// raffling the beginner:
	let rand = Math.random() * 200 + 1;

	setTimeout( ()=> {
		// Inform all players about the raffling of the beginner:
		players.forEach( p => {
			// This will hide the hidden-elements on clients page -> reset.
			p.socket.emit("gameState", JSON.stringify(
				new StateToSend(gameState, false)
			));
			let msg = masterSays.raffle;
			p.socket.emit("message", JSON.stringify( { msg } ));
			rand > 100 ? (
				players[0].isRiddler = true,
				players[1].isRiddler = ! players[0].isRiddler
			) : (
				players[0].isRiddler = false,
				players[1].isRiddler = ! players[0].isRiddler
			)
		});

		setTimeout( ()=> {

      // issue:
      // if both clients reconnect immedately one after another,
      // .name can be undefined...
			
			let riddler = players.find( p => p.isRiddler );
			let candidate = players.find( p => !p.isRiddler );

			let msg_riddler = `<span class="player">Du</span>
							suchst als erstes ein Wort aus.<br>
							<span class="opponent">${candidate.name}</span>
							muss dieses erraten.`;
			let msg_candidate = `<span class="opponent">${riddler.name}</span>
							sucht als erstes ein Wort aus.<br>
							<span class="player">Du</span> musst dieses erraten.`;

			riddler.socket.emit("message", JSON.stringify({ msg: msg_riddler }));
			candidate.socket.emit("message", JSON.stringify({ msg: msg_candidate }));

				/* Next round shouldn't be the raffle again.
			make a new function,
			Just switch isRiddler states then for both players.
			// ...*/
			setTimeout( chooseWord, 3000, riddler, candidate );

		}, 3000);
	}, 2000);
	
}

function chooseWord(riddler, candidate) {
	const gameState = "chooseWord";
	let msg;
	let msg_riddler = `<span class="player">${riddler.name}</span>${masterSays.chooseAWord}`;
	let msg_candidate = `<span class=opponent>${riddler.name}</span>${masterSays.chooseAWordWait}`;

	riddler.socket.emit("gameState", JSON.stringify(
		new StateToSend(gameState, true, msg_riddler)
	));
	candidate.socket.emit("gameState", JSON.stringify(
		new StateToSend(gameState, false, msg_candidate)
	));

	riddler.socket.on("submitWord", data => {
    data = JSON.parse(data);
    
		switch (data.state) {
			case "sentToAPI":
				msg = masterSays.lookUpWord;
				players.forEach( p => p.socket.emit("message", JSON.stringify( { msg } )));
				break;
			case "fetchFailed":
				msg = masterSays.dictionaryBroken;
				players.forEach( p => p.socket.emit("message", JSON.stringify( { msg } )));
				console.log(data.error);
				break;
			case "invalidWord":
				msg_riddler = `<span class="player">${riddler.name}</span>,
												suche ein neues Wort aus.`;
				msg_candidate = `<span class=opponent>${riddler.name}</span>
												sucht ein neues Wort aus. Wir warten nochmal.`;
				riddler.socket.emit("message", JSON.stringify( {msg:msg_riddler} ));
				candidate.socket.emit("message", JSON.stringify( {msg:msg_candidate} ));
				break;
			case "wordIsNoun":
        console.log(data.word);
        // hier geht es weiter.
        // Sende eine kurze Nachricht an alle (setTimeout).
        // rufe dann nächste gamestate function auf.
				break;
		}
	} );
}


function gameTermination(id) {
	// players.find( p => p.id === id ).name; // left game.
	players.forEach( p => {
		p.socket.emit("gameState", JSON.stringify(
			new StateToSend("gameTerminated", false, masterSays.termination, true)
		));
	});
}


///////////////////////////////////////////////
// LISTENERS:

io.on('connection', socket => {
	// Resctriction: only 2 Players:
	if (players.length < maxPlayers) {
    console.log(new Date());
		console.log(socket.id + " hat die Verbindung hergestellt");

		let msg = masterSays.welcome;

		if (!players.length ) {
			msg += masterSays.waitFor2ndPlayer;
			registerPlayer(socket, 1);
		} else {
			registerPlayer(socket, 2);
		}
		
		socket.emit("message", JSON.stringify({ msg }));

		// HANDLING DISCONNECTION
		socket.on('disconnect', () => {
      console.log(new Date());
			console.log(socket.id + " hat die Verbindung unterbrochen.");
			
			players = players.filter( p => p.id !== socket.id );

			if (players.length) {
				let newPlayer1 = players[0].socket;
				players = [];
				registerPlayer(newPlayer1, 1);
			}			

			// If one player leaves and only one is left, game is over.
			gameTermination(socket.id);
		});

	} else {
		socket.emit("message", JSON.stringify({
			msg: masterSays.toMuchPlayers
		}));
	}

	if ( players.length >= 2 ) raffleBeginner();
});

// Server Listen
httpServer.listen(8080, err => {
	if (err) console.log(err);
	else console.log("Server läuft! :D");
});