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
  letterAlreadyGuessed: "Den Buchstaben hatten wir schon!",
  rightLetter: "Richtiger Buchstabe!",
  wrongLetter: "Falscher Buschstabe!",
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
                rightGuesses = [],
                wrongGuesses = [],
                roundIsOver = false,  // used?
                gameOver = false ) {  // used?
		this.gameState = gameState;
    this.msg = msg;
    this.iAmRiddler = iAmRiddler;
    this.rightGuesses = rightGuesses;
    this.wrongGuesses = wrongGuesses;
    this.roundIsOver = roundIsOver;
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

const gameStates = {

  riddler: {},
  candidate: {},
  word: "",
  rightGuesses: [],
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
    players[0].isRiddler = !players[0].isRiddler;
    players[1].isRiddler = !players[0].isRiddler;
    gameStates.getRoles();
    timeoutIDs.push( setTimeout( this.riddlerChoosesWord.bind(this), 3000) );
  },

  riddlerChoosesWord() {
    const state = "chooseWord";
    let msg_riddler = `<span class="player">${this.riddler.name}</span>${masterSays.chooseAWord}`,
        msg_candidate = `<span class=opponent>${this.riddler.name}</span>${masterSays.chooseAWordWait}`;

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
        this.word = data.word.toUpperCase();
        this.rightGuesses = [];
        this.wrongGuesses = [];
        for (let i = 0; i < data.word.length; i++) {
          this.rightGuesses.push(null);
        }
        msg = masterSays.wordIsNoun;
        players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
        timeoutIDs.push( setTimeout(this.candidatesGuesses.bind(this), 3000) );
        break;
    }
  },

  candidatesGuesses() {
    const state = "candidatesGuesses";
    let msg_candidate = `Also <span class="player">${this.candidate.name}</span>,
                        dann mal los. Viel Erfolg! :)`,
        msg_riddler = `<span class="opponent">${this.candidate.name}</span>
                      darf jetzt raten.`;

    this.candidate.socket.emit("gameState", JSON.stringify(
        new StateToSend(state, msg_candidate, false, this.rightGuesses)
    ));
    this.riddler.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_riddler, true, this.rightGuesses)
    ));
  },

  receiveGuess(data) {
    const state = "candidatesGuesses";
    let roundIsOver = false,
        msg_candidate = "",
        msg_riddler = "";
    data = JSON.parse(data);
    const letter = data.letter.toUpperCase();
    //console.log("Candidates guess: " + data.letter);
    let msg = "Eingereichter Buchstabe:</br>" + letter + "</br>";
    players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));

    if ( this.rightGuesses.includes(letter) || this.wrongGuesses.includes(letter) ) {
      msg = masterSays.letterAlreadyGuessed;
    } else if ( this.word.includes(letter) ) {
      msg = masterSays.rightLetter;
      msg_candidate = " :)";
      //Adds the letter to Array:this.rightGuesses
      //corresponding to all matching digits of this.word:
      for (let i = 0; i < this.word.length; i++) {
        if ( letter === this.word[i] ) this.rightGuesses[i] = letter;
      }
      roundIsOver = this.rightGuesses.includes(null) ? false : (
        msg_riddler = `</br><span class="opponent">${this.candidate.name}</span>
                        war erfolgreich. Spielerwechsel!`,
        msg_candidate = `</br>Du hast das Wort erraten, <span class="player">
                        ${this.candidate.name}</span>.
                        Gut gemacht! :)</br>Spielerwechsel!`,
        true
      );
    } else {
      msg = masterSays.wrongLetter;
      msg_candidate = " :/";
      // Adds the wrong letter to Array:this.wrongGuesses:
      this.wrongGuesses.push(letter);
      // Is canditate still alive?
      if (this.wrongGuesses.length >= 12) {
        roundIsOver = true;
        msg_riddler = `</br><span class="opponent">${this.candidate.name}</span>
                      wurde gehängt. Spielerwechsel!`;
        msg_candidate = `</br><span class="player">Du</span> wurdest gehängt. :(</br>
                        Spielerwechsel!`;
      }
    }
    timeoutIDs.push( setTimeout( () => {
      this.candidate.socket.emit("gameState", JSON.stringify(
        new StateToSend(state, msg + msg_candidate, false, this.rightGuesses, this.wrongGuesses, roundIsOver)
      ));
      this.riddler.socket.emit("gameState", JSON.stringify(
        new StateToSend(state, msg + msg_riddler, true, this.rightGuesses, this.wrongGuesses, roundIsOver)
      ));
      
      roundIsOver && this.switchRiddler();
    }, 1000) );
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
    this.rightGuesses = [];
    this.wrongGuesses = [];
  
    players.forEach( p => {
      p.socket.emit("gameState", JSON.stringify(
        new StateToSend("gameTerminated", masterSays.termination, false, {}, true, true)
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
    socket.on("submitLetter", gameStates.receiveGuess.bind(gameStates));

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