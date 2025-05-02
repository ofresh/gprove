import { CosmicSlots } from './cosmic-slots.js';

let gameInstance = null;
let isMuted = false;

function openGame() {
  const initialContent = document.querySelector(".initial-content");
  const gameContainer = document.getElementById("game-container");
  const muteButton = document.querySelector(".mute-button");
  const audio = document.getElementById("background-music");

  if (initialContent && gameContainer) {
    initialContent.style.display = "none";
    gameContainer.style.display = "block";
    if (muteButton) {
      muteButton.style.display = "block"; // Показати кнопку Mute
    }
    if (audio) {
      audio.play().catch((error) => {
        console.error("Error playing audio:", error);
      });
    }
    if (!gameInstance) {
      try {
        gameInstance = new CosmicSlots("game-container");
      } catch (error) {
        console.error("Error initializing CosmicSlots:", error);
      }
    }
  } else {
    console.error("initial-content or game-container not found");
  }
}

function closeGame() {
  if (gameInstance) {
    try {
      gameInstance.destroy();
      gameInstance = null;
    } catch (error) {
      console.error("Error destroying game:", error);
    }
  }
  const initialContent = document.querySelector(".initial-content");
  const gameContainer = document.getElementById("game-container");
  const muteButton = document.querySelector(".mute-button");
  const audio = document.getElementById("background-music");

  if (initialContent && gameContainer) {
    initialContent.style.display = "flex";
    gameContainer.style.display = "none";
    if (muteButton) {
      muteButton.style.display = "none"; // Приховати кнопку Mute
    }
    if (audio) {
      audio.pause(); // Зупинити музику
      audio.currentTime = 0; // Скинути на початок
      isMuted = false; // Скинути стан
      muteButton.textContent = "MUTE";
    }
  } else {
    console.error("initial-content or game-container not found");
  }
}

function toggleMute() {
  const audio = document.getElementById("background-music");
  const muteButton = document.querySelector(".mute-button");
  if (audio && muteButton) {
    isMuted = !isMuted;
    audio.muted = isMuted;
    muteButton.textContent = isMuted ? "UNMUTE" : "MUTE";
  } else {
    console.error("audio or mute-button not found");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const playButton = document.querySelector(".play-button");
  const muteButton = document.querySelector(".mute-button");
  const closeButton = document.querySelector(".close-button");

  if (playButton) {
    playButton.addEventListener("click", openGame);
  } else {
    console.error("play-button not found");
  }

  if (muteButton) {
    muteButton.addEventListener("click", toggleMute);
  } else {
    console.error("mute-button not found");
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeGame);
  } else {
    console.error("close-button not found");
  }
});