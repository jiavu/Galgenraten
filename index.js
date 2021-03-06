'use strict';


// Global Variables
let players = [];
const maxPlayers = 2;

let timeoutIDs = [];
let msgSpeed = 3300;


// Digitales Wörterbuch der deutschen Sprache API:
const url = "https://www.dwds.de/api/wb/snippet";
// Because Access-Control-Allow-Origin Header is missing:
const proxy = "https://cors-anywhere.herokuapp.com/";


const masterSays = {
	toMuchPlayers: "Kein Zugang zum Spiel mehr möglich, es gibt schon 2 Spieler.",
	welcome: "Willkommen! :)",
	waitFor2ndPlayer : "<br>Wir warten noch auf einen zweiten Spieler.",
	termination : " Dein Mitspieler hat das Spiel verlassen. Das Spiel wurde beendet.",
	newPlayer : "Du hast einen Mitspieler bekommen. Nun kann es losgehen! :)",
	raffle : "Ich lose nun aus, wer von euch anfängt. Wartet kurz...",
	chooseAWord : ", überlege dir nun ein Wort. Es muss ein Substantiv sein!",
  chooseAWordWait : " überlegt sich nun ein Wort, wird warten so lange. :)",
  dictionaryBroken : "Mein Wörterbuch ist kaputt!!! :(",
  wordToShort : "Das Wort ist zu kurz. Es muss mindestens 2 Buchstaben enthalten.",
  lookUpWord : "Ich schlage das Wort nach...",
  alreadyTaken : "Dieses Wort hatten wir schon...",
  wordNotFound : "Ich konnte dieses Wort nicht finden. Bitte suche ein anderes Wort aus.",
  wordIsNotNoun : "Dies ist kein Substantiv. Bitte suche ein anderes Wort aus.",
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

// Axios for http requests (comfortable way)
const axios = require('axios');


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
  constructor(  gameState = "", msg="",
                iAmRiddler = false,
                dictData = {},
                rightGuesses = [],
                wrongGuesses = [],
                roundIsOver = false,  // used? Probably unnecessary.
                gameOver = false ) {  // used? Probably unnecessary.
		this.gameState = gameState;
    this.msg = msg;
    this.iAmRiddler = iAmRiddler;
    this.dictData = dictData;
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
  dictData : {},
  word: "",
  rightGuesses: [],
  wrongGuesses: [],
  wordsTaken : [],

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
    let state = "raffleBeginner";

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

          timeoutIDs.push( setTimeout(this.riddlerChoosesWord.bind(this), msgSpeed) );

        }, msgSpeed) );

      }, msgSpeed));
  },

  switchRiddler() {
    let state = "switchRiddler";
    let msg = "Spielerwechsel!";
    players.forEach( p => p.socket.emit("gameState", JSON.stringify(
      new StateToSend( state, msg)
    )) );
    
    players[0].isRiddler = !players[0].isRiddler;
    players[1].isRiddler = !players[0].isRiddler;

    gameStates.getRoles();
      timeoutIDs.push( setTimeout( this.riddlerChoosesWord.bind(this), msgSpeed) );
  },

  riddlerChoosesWord() {
    let state = "chooseWord";
    let msg_riddler = `<span class="player">${this.riddler.name}</span>${masterSays.chooseAWord}`,
        msg_candidate = `<span class=opponent>${this.riddler.name}</span>${masterSays.chooseAWordWait}`;

    this.riddler.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_riddler, true)
    ));
    this.candidate.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_candidate, false)
    ));
  },

  receiveWord(dataRiddler) {

    let msg, msg_riddler, msg_candidate;

    const invalidWord = () => {
      msg_riddler = `<span class="player">${this.riddler.name}</span>,
            suche ein neues Wort aus.`;
      msg_candidate = `<span class=opponent>${this.riddler.name}</span>
            sucht ein neues Wort aus. Wir warten nochmal.`;

      this.candidate.socket.emit("message", JSON.stringify({ msg: msg_candidate }));

      this.riddler.socket.emit("gameState", JSON.stringify(
        new StateToSend("chooseWord", msg_riddler, true)
      ));
    };

    dataRiddler = JSON.parse(dataRiddler);

    // word length has to be > 1.
    if (dataRiddler.word.length < 2) {
      msg_riddler = masterSays.wordToShort;
      this.riddler.socket.emit("gameState", JSON.stringify(
        new StateToSend("wordToShort", msg_riddler, true)
      ));
      timeoutIDs.push( setTimeout(invalidWord.bind(this), msgSpeed) );
    
    // has word already been taken in this session?
    } else if ( this.wordsTaken.includes(dataRiddler.word) ){
      msg = masterSays.alreadyTaken;
      players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
      timeoutIDs.push( setTimeout(invalidWord.bind(this), 1000) );
    
    // Game Master looks up word, requests dictionary API:
    } else {
      msg = masterSays.lookUpWord;
      players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));

      //////////////////////////
      // REQUEST TO dwds.de API:
      axios.get(proxy + url + "?q=" + dataRiddler.word, {
        headers: {
          origin: null
          /* 'X-Requested-With': "XMLHttpRequest" */
        }
      })
        .then(response => {
          const data = response.data;
          console.log("Treffer im Wörterbuch: " + response.data);

          if (data.length) {
            // send API response to riddler:
            this.riddler.socket.emit("gameState", JSON.stringify(
              new StateToSend("dictResult", "", true, data)
            ));
  
            // if word is a noun:
            if (data[0].wortart === "Substantiv") {
              this.dictData = data;
              console.log("Neu eingereichtes Wort: " + data[0].lemma);
              this.word = "";
              // save word with uppercase letters, unless it is "ß":
              for (let i = 0; i < data[0].lemma.length; i++) {
                this.word += data[0].lemma[i] === "ß" ? "ß" : data[0].lemma[i].toUpperCase();
              }
              this.rightGuesses = [];
              this.wrongGuesses = [];
              this.wordsTaken.push(data[0].lemma);
              for (let i = 0; i < data[0].lemma.length; i++) {
                this.rightGuesses.push(null);
              }
              msg = masterSays.wordIsNoun;
              players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
  
              timeoutIDs.push(setTimeout(this.candidatesGuesses.bind(this), msgSpeed));
            
            // word is not noun:
            } else {
              msg_riddler = masterSays.wordIsNotNoun;
              this.riddler.socket.emit("message", JSON.stringify({ msg: msg_riddler }));
              timeoutIDs.push( setTimeout(invalidWord.bind(this), msgSpeed) );
            }
  
          // no results (response = empty array), couldn't find word:
          } else {
            msg_riddler = masterSays.wordNotFound;
            this.riddler.socket.emit("message", JSON.stringify({ msg: msg_riddler} ));
            timeoutIDs.push( setTimeout(invalidWord.bind(this), msgSpeed) );
            
            // wordSelection.classList.remove("hidden");
          }
        })
        .catch(err => {
          console.log(err);
          msg = masterSays.dictionaryBroken;
          players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));
          timeoutIDs.push( setTimeout(this.riddlerChoosesWord.bind(this), msgSpeed) ) ;
        });
    }
  },

  candidatesGuesses() {
    let state = "candidatesGuesses";
    let msg_candidate = `Also <span class="player">${this.candidate.name}</span>,
                        dann mal los. Viel Erfolg! :)`,
        msg_riddler = `<span class="opponent">${this.candidate.name}</span>
                      darf jetzt raten.`;

    this.candidate.socket.emit("gameState", JSON.stringify(
        new StateToSend(state, msg_candidate, false, {}, this.rightGuesses)
    ));
    this.riddler.socket.emit("gameState", JSON.stringify(
      new StateToSend(state, msg_riddler, true, this.dictData, this.rightGuesses)
    ));
  },

  receiveGuess(data) {
    let state = "candidatesGuesses";
    let roundIsOver = false,
        msg_candidate = "",
        msg_riddler = "",
        letter,
        solution = {};
    data = JSON.parse(data);
    if (data.letter) {
      letter = data.letter === "ß" ? "ß" : data.letter.toUpperCase();

      let msg = "Eingereichter Buchstabe:</br>" + letter + "</br>";
      players.forEach(p => p.socket.emit("message", JSON.stringify({ msg })));

      if (this.rightGuesses.includes(letter) || this.wrongGuesses.includes(letter)) {
        msg = masterSays.letterAlreadyGuessed;
      } else if (this.word.includes(letter)) {
        msg = masterSays.rightLetter;
        msg_candidate = " :)";
        //Adds the letter to Array:this.rightGuesses
        //corresponding to all matching digits of this.word:
        for (let i = 0; i < this.word.length; i++) {
          if (letter === this.word[i]) this.rightGuesses[i] = letter;
        }
        roundIsOver = this.rightGuesses.includes(null) ? false : (
          state = "roundIsOver",
          solution = this.dictData,
          msg_riddler = `</br><span class="opponent">${this.candidate.name}</span>
                        war erfolgreich.`,
          msg_candidate = `</br>Du hast das Wort erraten, <span class="player">
                        ${this.candidate.name}</span>.
                        Gut gemacht! :)</br>`,
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
          state = "roundIsOver";
          solution = this.dictData;
          msg_riddler = `</br><span class="opponent">${this.candidate.name}</span>
                      wurde gehängt.`;
          msg_candidate = `</br><span class="player">Du</span> wurdest gehängt. :(</br>`;
        }
      }
      timeoutIDs.push(setTimeout( () => {
        this.candidate.socket.emit("gameState", JSON.stringify(
          new StateToSend(state, msg + msg_candidate, false, solution, this.rightGuesses, this.wrongGuesses, roundIsOver)
        ));
        this.riddler.socket.emit("gameState", JSON.stringify(
          new StateToSend(state, msg + msg_riddler, true, this.dictData, this.rightGuesses, this.wrongGuesses, roundIsOver)
        ));

        roundIsOver && timeoutIDs.push(setTimeout( this.switchRiddler.bind(this), msgSpeed ) );
      }, 1000));
    }
    
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
    this.wordsTaken = [];
  
    players.forEach( p => {
      p.socket.emit("gameState", JSON.stringify(
        new StateToSend("gameTerminated", masterSays.termination, false, {}, [], [], true, true)
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