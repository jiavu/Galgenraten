'use strict';

document.addEventListener('DOMContentLoaded', () => {

	// Digitales Wörterbuch der deutschen Sprache API:
	const url = "https://www.dwds.de/api/wb/snippet";
	// Because Access-Control-Allow-Origin Header is missing:
	const proxy = "https://cors-anywhere.herokuapp.com/";

	const messageBox = document.querySelector("#message-box");	// p
	const infoBox = document.querySelector("#info-box");		// p
	const guessInput = document.querySelector("#guess-input");	// input
	const classHide = document.querySelectorAll(".hide");	// Node List
	const sectionWord = document.querySelector("#section-word");	// section
	const wordSelection = document.querySelector("#word-selection"); // div
	const wordInput = document.querySelector("#word-input");	// input
	const submitWord = document.querySelector("#submit-word");	// form
	const dictionary = document.querySelector("#dictionary");		// div
	const dictResult = document.querySelector("#dict-result");	// p

	const socket = io.connect();

	// Helper:
	function resetClassHideElements() {
		// Reset hide sections and divisions:
		for (let i = 0; i < classHide.length; i++) {
			classHide[i].classList.add("hidden");
		}
	}
	
	// LISTENING:
	socket.on("message", data => {
		data = JSON.parse(data);
		messageBox.innerHTML = data.msg;
	});
	socket.on("writeInfo", data => {
		data = JSON.parse(data);
		infoBox.innerHTML = data.info;
	});


	// Get Game States from Server:
	socket.on("gameState", data => {
		data = JSON.parse(data);
		
		messageBox.innerHTML = data.msg;

		resetClassHideElements();
		
		// check if iAmRiddler;
		// for gameState, go through a switch to display relevant areas.
		switch ( data.gameState ) {
			case "chooseWord":
				wordInput.value = "";
				if (data.iAmRiddler) {
					// Show section-word and division word-selection:
					sectionWord.classList.remove("hidden");
					wordSelection.classList.remove("hidden");
				}
				break;
			case "gameTerminated":
				break;
		}
	});

	// BUTTON AND TEXT FIELD INPUTS LISTENING:
	submitWord.onsubmit = e => {
		e.preventDefault();
		dictResult.innerHTML = "";
		let word = wordInput.value;
		word = word.slice(0,1) + word.slice(1).toLowerCase();
		wordInput.value = "";
		//e.target.querySelector("button").disabled = true;
		wordSelection.classList.add("hidden");

		// Send a message to websocket server: Request is sent, Wort wird nachgeschlagen.
		socket.emit("submitWord", JSON.stringify({
			state: "sentToAPI"
		}) );

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
						state: "wordisNoun",
						word: data[0].lemma
					}));
				} else {
					dictResult.innerHTML = "Dies ist kein Substantiv. Bitte suche ein anderes Wort aus.";
					wordSelection.classList.remove("hidden");
					socket.emit("submitWord", JSON.stringify({
						state: "invalidWord",
					}));
				}
				
			} else {
				dictResult.innerHTML = "...konnte dieses Wort nicht finden. Bitte suche ein anderes Wort aus.";
				// continue here...
				// Eingabe wieder einblenden.
			}
		});
	};

	// Restrict Players input. Only Letters accepted.
	// and activate Submit if input has length.
	const handleInput = e => {
		// eher replace all, die nicht letters sind
		if ( ! /^[A-Za-zÄäÖöÜüß]+$/.test(e.target.value) ) {
			e.target.value = "";
		} else {
			if (e.target.value !== "ß") {
				e.target.value = e.target.value.toUpperCase();
			}
		}
		const submitButton = e.target.parentNode.querySelector("button");
		submitButton.disabled = e.target.value ? false : true;
		
	};
	wordInput.oninput = handleInput;
	guessInput.oninput = handleInput;
});