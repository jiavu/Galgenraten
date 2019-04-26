'use strict';


document.addEventListener('DOMContentLoaded', () => {

  //////////////////////////////////////////////////////////////////
  // Grab HTML Elements:

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
		for (let i = 0; i < classHide.length; i++) {
      //fadeChange(classHide[i], null, "hidden");
			classHide[i].classList.add("hidden");
		}
  }
  
  function drawGallow(step=0) {
    const img = document.createElement("img");
    img.src = `/img/gallow_${step}.png`;
    img.alt = step;
    img.classList.add("gallow-piece");
    if (!step) {
      gallow.innerHTML = "";  // reset if new round.
      img.style.zIndex = 2;
    }
    gallow.appendChild(img);
  }

  // unused, didn't work as intended :/
  function fadeChange (element, newContent=null, classToAdd=null, classToRemove=null) {
  // Element needs a transition setting for opacity in css.
  const fadeDurration = 1000;
  element.style.opacity = 0;
  window.setTimeout( ()=> {
    if (newContent) element.innerHTML = newContent;
    if (classToRemove) element.classList.remove(classToRemove);
    if (classToAdd) element.classList.add(classToAdd);
    element.style.opacity = 1;
  }, fadeDurration);
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

    drawGallow(data.wrongGuesses.length);

    // write dictionary result:
    const writeDictResult = () => {
      dictResult.innerHTML = `Wort: "${data.dictData[0].lemma}"<br>
      Wortart: ${data.dictData[0].wortart && data.dictData[0].wortart}<br>
      Definition: <a href=${data.dictData[0].url} target="_blank">www.dwds.de/</a>`;
    }
		
    // Check if data.iAmRiddler, display the relevant areas:
    
		switch ( data.gameState ) {
			case "chooseWord":
				wordInput.value = "";
				if (data.iAmRiddler) {
          infoBox.scrollIntoView();
          // Show section-word and division word-selection:
          sectionWord.classList.remove("hidden");
					wordSelection.classList.remove("hidden");
				}
        break;
      case "dictResult":
        sectionWord.classList.remove("hidden");
        dictionary.classList.remove("hidden");
        writeDictResult();
        break;
      case "wordIsNoun":
          // display Dictionary:
          if ( data.iAmRiddler ) {
            wordSelection.classList.remove("hidden");
            dictionary.classList.remove("hidden");
            writeDictResult();
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
          guessInput.disabled = false;
          // guessInput.focus(); // distracting on mobile..
        } else {
          sectionWord.classList.remove("hidden");
          dictionary.classList.remove("hidden");
        }
        break;
      case "roundIsOver":
        sectionRiddle.classList.remove("hidden");
        sectionWord.classList.remove("hidden");
        dictionary.classList.remove("hidden");
        guessDiv.classList.add("hidden");
        writeDictResult();
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
    wordInput.value = "";
		e.target.querySelector("[type='submit']").disabled = true;
    wordSelection.classList.add("hidden");
    //fadeChange(wordSelection, null, "hidden");

		// Send word to websocket server: Request is sent, Wort wird nachgeschlagen.
		socket.emit("submitWord", JSON.stringify({
      state: "sentToAPI", word
		}) );
  };
  
  /* Restrict Players input. Only Letters accepted.
	  Activate submit if input has length: */
	const handleInput = e => {
    e.target.value = e.target.value.replace(/[^A-Za-zÄäÖöÜüß]/g, "");
		const submitButton = e.target.parentNode.querySelector("[type='submit']");
		submitButton.disabled = e.target.value ? false : true;
		
	};
	wordInput.oninput = handleInput;
	guessInput.oninput = handleInput;
});