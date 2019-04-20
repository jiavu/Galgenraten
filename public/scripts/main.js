'use strict';

document.addEventListener('DOMContentLoaded', () => {

  //////////////////////////////////////////////////////////////////
  // 

	// Digitales Wörterbuch der deutschen Sprache API:
	const url = "https://www.dwds.de/api/wb/snippet";
	// Because Access-Control-Allow-Origin Header is missing:
	const proxy = "https://cors-anywhere.herokuapp.com/";

  const infoBox = document.querySelector("#info-box");		// p
  const messageBox = document.querySelector("#message-box");	// p
  
  const classHide = document.querySelectorAll(".hide");	// Node List

  const sectionRiddle = document.querySelector("#section-riddle");   // section
  const enigma = document.querySelector("#enigma");
  const guessDiv = document.querySelector("#guess-div");   // div
  const submitGuess = document.querySelector("#submit-guess");   // form
  const guessInput = document.querySelector("#guess-input");	// input
  
  const wrongGuesses = document.querySelector("#wrong-guesses");	// div
  const gallow = document.querySelector("#gallow");   // div
  
	const sectionWord = document.querySelector("#section-word");	// section
	const wordSelection = document.querySelector("#word-selection"); // div
	const wordInput = document.querySelector("#word-input");	// input
	const submitWord = document.querySelector("#submit-word");	// form
	const dictionary = document.querySelector("#dictionary");		// div
	const dictResult = document.querySelector("#dict-result");	// p

	const socket = io.connect();

  //////////////////////////////////////////////////////////////////
  // HELPER:

	function resetClassHideElements() {
		// Reset hide sections and divisions:
		for (let i = 0; i < classHide.length; i++) {
			classHide[i].classList.add("hidden");
		}
	}
  
  //////////////////////////////////////////////////////////////////
  // LISTENING:
  
	socket.on("message", data => {
		data = JSON.parse(data);
    messageBox.innerHTML = data.msg;
    infoBox.scrollIntoView();
	});
	socket.on("writeInfo", data => {
		data = JSON.parse(data);
		infoBox.innerHTML = data.info;
	});


	// GET GAME STATES FROM SERVER:
	socket.on("gameState", data => {
		data = JSON.parse(data);
		
    messageBox.innerHTML = data.msg;
    infoBox.scrollIntoView();
    enigma.innerHTML = "";
    wrongGuesses.innerHTML = "";

		resetClassHideElements();
		
		// check if iAmRiddler;
		// for gameState, go through a switch to display relevant areas.
		switch ( data.gameState ) {
			case "chooseWord":
				wordInput.value = "";
				if (data.iAmRiddler) {
          messageBox.scrollIntoView();
					// Show section-word and division word-selection:
					sectionWord.classList.remove("hidden");
					wordSelection.classList.remove("hidden");
				}
        break;
      case "candidatesGuesses":
        sectionRiddle.classList.remove("hidden");
        messageBox.scrollIntoView();

        // write right and wrong guesses:
        for (let i = 0; i < data.rightGuesses.length; i++) {
          let span = document.createElement("span");
          span.innerText = data.rightGuesses[i] ?
            data.rightGuesses[i] : "_";
          enigma.appendChild(span);
        }
        for (let i = 0; i < data.wrongGuesses.length; i++) {
          let span = document.createElement("span");
          span.innerText = data.wrongGuesses[i];
          wrongGuesses.appendChild(span);
        }

        if (!data.iAmRiddler) {
          guessDiv.classList.remove("hidden");
          submitGuess.querySelector("[type='submit']").disabled = false;
          guessInput.disabled = false;
          // guessInput.focus();
        } else {
          sectionWord.classList.remove("hidden");
          dictionary.classList.remove("hidden");
        }
        break;
			case "gameTerminated":
				break;
		}
	});

  // BUTTON AND TEXT FIELD INPUTS LISTENING:
  
  submitGuess.onsubmit = e => {
    e.preventDefault();
    let letter = guessInput.value;
    guessInput.value = "";
    e.target.querySelector("[type='submit']").disabled = true;
    guessInput.disabled = true;
    // send letter to server:
    socket.emit("submitLetter", JSON.stringify({ letter }));
  };

	submitWord.onsubmit = e => {
		e.preventDefault();
		dictResult.innerHTML = "";
    let word = wordInput.value;
    word = word.slice(0,1).toUpperCase() + word.slice(1).toLowerCase();
    wordInput.value = "";
		e.target.querySelector("[type='submit']").disabled = true;
		wordSelection.classList.add("hidden");

		// Send a message to websocket server: Request is sent, Wort wird nachgeschlagen.
		socket.emit("submitWord", JSON.stringify({
			state: "sentToAPI"
		}) );

    // Request to dwds.de API:
		let req = new Request( proxy + url + "?q=" + word, {
				method: "GET"
		});
		fetch(req).then(
			response => response.json(),
			err => {
				console.log(err);
				socket.emit("submitWord", JSON.stringify({
					state: "fetchFailed",
					error: err
				}));
			}
		).then( data => {
			// Display Dictionary:
			dictionary.classList.remove("hidden");
			if (data.length) {
				dictResult.innerHTML = `Wort: "${data[0].lemma}"<br>
						Wortart: ${data[0].wortart && data[0].wortart}<br>
						Definition: <a href=${data[0].url} target="_blank">www.dwds.de/</a>`;
				if (data[0].wortart === "Substantiv") {
					socket.emit("submitWord", JSON.stringify({
						state: "wordIsNoun",
						word: data[0].lemma
					}));
				} else {
					dictResult.innerHTML = "Dies ist kein Substantiv. Bitte suche ein anderes Wort aus.";
          wordSelection.classList.remove("hidden");
          //wordInput.focus();
					socket.emit("submitWord", JSON.stringify({
						state: "invalidWord",
					}));
				}
			} else {
        dictResult.innerHTML = "...konnte dieses Wort nicht finden. Bitte suche ein anderes Wort aus.";
        wordSelection.classList.remove("hidden");
        //wordInput.focus();
        socket.emit("submitWord", JSON.stringify({
          state: "invalidWord",
        }));
			}
		});
  };
  
  
	// Restrict Players input. Only Letters accepted.
	// and activate Submit if input has length.
	const handleInput = e => {
    e.target.value = e.target.value.replace(/[^A-Za-zÄäÖöÜüß]/g, "");
		const submitButton = e.target.parentNode.querySelector("[type='submit']");
		submitButton.disabled = e.target.value ? false : true;
		
	};
	wordInput.oninput = handleInput;
	guessInput.oninput = handleInput;
});