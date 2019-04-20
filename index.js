'use strict';

// Global Variables
let players = [];
const maxPlayers = 2;

let timeoutIDs = [];

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
  dictionaryBroken : "Mein Wörterbuch ist kaputt!!! :(",
  wordIsNoun : "Das ist ein tolles Wort, das nehmen wir!",
};

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
  constructor(  gameState, msg="",
                iAmRiddler = false,
                letterGuesses = [],
                wrongGuesses = [],
                gameOver = false ) {
		this.gameState = gameState;
    this.msg = msg;
    this.iAmRiddler = iAmRiddler;
    this.letterGuesses = letterGuesses;
    this.wrongGuesses = wrongGuesses;
		this.gameOver = gameOver; // probably unused.
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

const gameStates = {

  riddler: {},
  candidate: {},
  word: "",
  letterGuesses: [],
  wrongGuesses: [],

  welcome(socket, msg) {
    socket.emit("gameState", JSON.stringify(
      new StateToSend("welcome", msg, false)
    ));
  },

  getRoles() {
    this.riddler = players.find(p => p.isRiddler);
    this.candidate = players.find(p => !p.isRiddler);
    /* return {
      riddler: this.riddler,
      candidate: this.candidate
    } */
  },

  raffleBeginner() {
    const state = "raffleBeginner";
      timeoutIDs.push( setTimeout( () => {
        // Inform all players about the raffling of the beginner:
        let msg = masterSays.raffle;
        players.forEach(p => {
          p.socket.emit("gameState", JSON.stringify(
            new StateToSend(state, msg, false)
          ));
        });

        // Raffle the beginner:

        let rand = Math.random() * 200 + 1;
        rand > 100 ? (
          players[0].isRiddler = true,
          players[1].isRiddler = !players[0].isRiddler
        ) : (
            players[0].isRiddler = false,
            players[1].isRiddler = !players[0].isRiddler
          );

        // find Riddler and find Candidate:
        gameStates.getRoles();

        timeoutIDs.push( setTimeout( () => {

          let msg_riddler = `<span class="player">Du</span>
                          suchst als erstes ein Wort aus.<br>
                          <span class="opponent">${this.candidate.name}</span>
                          muss dieses erraten.`;
          let msg_candidate = `<span class="opponent">${this.riddler.name}</span>
                            sucht als erstes ein Wort aus.<br>
                            <span class="player">Du</span> musst dieses erraten.`;

          this.riddler.socket.emit("message", JSON.stringify({ msg: msg_riddler }));
          this.candidate.socket.emit("message", JSON.stringify({ msg: msg_candidate }));

          timeoutIDs.push( setTimeout(this.riddlerChoosesWord.bind(this), 3000) );

        }, 3000) );

      }, 2000));
  },

  switchRiddler() {
    const state = "switchRiddler";
    players[0].isRiddler = !players[1].isRiddler;
    players[1].isRiddler = !players[0].isRiddler;
    gameStates.getRoles();
    // send an info that roles have changed... then:
    gameStates.riddlerChoosesWord();
  },

  riddlerChoosesWord() {
    const state = "chooseWord";
    let msg_riddler = `<span class="player">${this.riddler.name}</span>${masterSays.chooseAWord}`;
    let msg_candidate = `<span class=opponent>${this.riddler.name}</span>${masterSays.chooseAWordWait}`;

    this.riddler.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_riddler, true)
    ));
    this.candidate.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_candidate, false)
    ));
  },

  receiveWord(data) {
    data = JSON.parse(data);
    let msg, msg_riddler, msg_candidate;

    switch (data.state) {
      case "sentToAPI":
        msg = masterSays.lookUpWord;
        players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
        break;
      case "fetchFailed":
        msg = masterSays.dictionaryBroken;
        players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
        console.log(data.error);
        break;
      case "invalidWord":
        msg_riddler = `<span class="player">${this.riddler.name}</span>,
                      suche ein neues Wort aus.`;
        msg_candidate = `<span class=opponent>${this.riddler.name}</span>
                      sucht ein neues Wort aus. Wir warten nochmal.`;
        this.riddler.socket.emit("message", JSON.stringify({ msg: msg_riddler }));
        this.candidate.socket.emit("message", JSON.stringify({ msg: msg_candidate }));
        break;
      case "wordIsNoun":
        console.log("Wort: " + data.word);
        this.word = data.word;
        this.letterGuesses = [];
        for (let i = 0; i < data.word.length; i++) {
          this.letterGuesses.push(null);
        }
        msg = masterSays.wordIsNoun;
        players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
        timeoutIDs.push( setTimeout(this.candidatesGuesses.bind(this), 3000) );
        break;
    }
  },

  candidatesGuesses() {
    const state = "candidatesGuesses";
    let msg_candidate = `Also <span class="player">${this.candidate.name}</span>, dann mal los. Viel Erfolg! :)`;
    let msg_riddler = `<span class="opponent">${this.candidate.name}</span> darf jetzt raten.`;

    this.candidate.socket.emit("gameState", JSON.stringify(
        new StateToSend(state, msg_candidate, false, this.letterGuesses)
    ));
    this.riddler.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_riddler, true, this.letterGuesses)
    ));
  },

  receiveGuess() {
    // continue here. event listener for guesses...
  },


  gameTermination(id) {
    // players.find( p => p.id === id ).name; // left game.

    // reset and delete all setTimeouts:
    timeoutIDs.forEach( id => clearTimeout(id) );
    timeoutIDs = [];

    //reset progress and roles:
    this.riddler = {};
    this.candidate = {};
    this.word = "";
    this.letterGuesses = [];
    this.wrongGuesses = [];
  
    players.forEach( p => {
      p.socket.emit("gameState", JSON.stringify(
        new StateToSend("gameTerminated", masterSays.termination, false, {}, true)
      ));
    });
  }
};


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
    
    gameStates.welcome(socket, msg);
    
    // REGISTER ALL LISTENERS HERE:
    socket.on("submitWord", gameStates.receiveWord.bind(gameStates));

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
			gameStates.gameTermination(socket.id);
		});

	} else {
		socket.emit("message", JSON.stringify({
			msg: masterSays.toMuchPlayers
		}));
	}

	if ( players.length >= 2 ) gameStates.raffleBeginner();
});


// Server Listen
httpServer.listen(8080, err => {
	if (err) console.log(err);
	else console.log("Server läuft! :D");
});