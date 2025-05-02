// Cosmic Slots Game
export function CosmicSlots(containerId) {
  // Game constants
  const PLAYER_WIDTH = 40;
  const PLAYER_HEIGHT = 40;
  const PLAYER_SPEED = 8;
  const BULLET_SPEED = 10;
  const ASTEROID_MIN_SPEED = 2;
  const ASTEROID_MAX_SPEED = 5;
  const ENEMY_SPEED = 1.5;
  const ENEMY_BULLET_SPEED = 6;
  const ASTEROID_SPAWN_RATE = 0.02;
  const ENEMY_SPAWN_RATE = 0.005;
  const ENEMY_FIRE_RATE = 0.01;
  
  // Game state
  let gameWidth = 600;
  let gameHeight = 800;
  let gameStarted = false;
  let gameOver = false;
  let isMobile = false;
  let animationFrameId = null;
  let lastTime = 0;
  let gameState = null;
  let movementState = {
    left: false,
    right: false,
    up: false,
    down: false
  };
  
  // DOM elements
  let container = null;
  let gameContainer = null;
  let canvas = null;
  let ctx = null;
  let startOverlay = null;
  let gameOverOverlay = null;
  
  // Initialize the game
  this.init = function() {
    // Get container
    container = document.getElementById(containerId);
    if (!container) {
      console.error('Container not found:', containerId);
      return;
    }
    
    // Check if mobile
    isMobile = window.innerWidth < 768;
    
    // Create game container
    gameContainer = document.createElement('div');
    gameContainer.className = 'cosmic-slots-container';
    gameContainer.style.position = 'relative';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.overflow = 'hidden';
    gameContainer.style.border = '4px solid #ff00ff';
    gameContainer.style.borderRadius = '8px';
    gameContainer.style.backgroundColor = '#000';
    gameContainer.style.boxShadow = '0 0 20px #ff00ff, 0 0 30px #ff00ff';
    gameContainer.style.animation = 'neon-pulse 2s infinite';
    
    // Create canvas
    canvas = document.createElement('canvas');
    canvas.width = gameWidth;
    canvas.height = gameHeight;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.imageRendering = 'pixelated';
    gameContainer.appendChild(canvas);
    
    // Get context
    ctx = canvas.getContext('2d');
    
    // Create stats overlay
    const statsOverlay = document.createElement('div');
    statsOverlay.className = 'cosmic-slots-stats';
    statsOverlay.style.position = 'absolute';
    statsOverlay.style.top = '18px';
    statsOverlay.style.left = '0';
    statsOverlay.style.right = '0';
    statsOverlay.style.zIndex = '30';
    statsOverlay.style.display = 'flex';
    statsOverlay.style.justifyContent = 'space-between';
    statsOverlay.style.alignItems = 'center';
    statsOverlay.style.padding = '0 8px';
    statsOverlay.style.marginTop = '2mm';
    statsOverlay.style.userSelect = 'none';
    gameContainer.appendChild(statsOverlay);
    
    // Create score display
    const scoreDisplay = document.createElement('span');
    scoreDisplay.className = 'cosmic-slots-score';
    scoreDisplay.style.color = '#ff00ff';
    scoreDisplay.style.fontFamily = '"Courier New", monospace';
    scoreDisplay.style.textTransform = 'uppercase';
    scoreDisplay.style.letterSpacing = '2px';
    scoreDisplay.style.fontSize = '2.8rem';
    scoreDisplay.style.fontWeight = '700';
    scoreDisplay.textContent = '000000';
    statsOverlay.appendChild(scoreDisplay);
    
    // Create lives display
    const livesDisplay = document.createElement('div');
    livesDisplay.className = 'cosmic-slots-lives';
    livesDisplay.style.display = 'flex';
    livesDisplay.style.alignItems = 'center';
    livesDisplay.style.marginLeft = '8px';
    statsOverlay.appendChild(livesDisplay);
    
    // Create life indicators
    for (let i = 0; i < 3; i++) {
      const lifeIndicator = document.createElement('div');
      lifeIndicator.className = 'cosmic-slots-life';
      lifeIndicator.style.width = '40px';
      lifeIndicator.style.height = '40px';
      lifeIndicator.style.margin = '0 4px';
      lifeIndicator.style.borderRadius = '4px';
      lifeIndicator.style.backgroundColor = '#ff00ff';
      lifeIndicator.style.boxShadow = '0 0 7px #ff00ff';
      livesDisplay.appendChild(lifeIndicator);
    }
    
    // Create start overlay
    startOverlay = document.createElement('div');
    startOverlay.className = 'cosmic-slots-start-overlay';
    startOverlay.style.position = 'absolute';
    startOverlay.style.inset = '0';
    startOverlay.style.display = 'flex';
    startOverlay.style.flexDirection = 'column';
    startOverlay.style.alignItems = 'center';
    startOverlay.style.justifyContent = 'center';
    startOverlay.style.zIndex = '50';
    startOverlay.style.backgroundColor = '#000';
    gameContainer.appendChild(startOverlay);
    
    // Create controls info
    const controlsInfo = document.createElement('div');
    controlsInfo.className = 'cosmic-slots-controls-info';
    controlsInfo.style.width = '192px';
    controlsInfo.style.backgroundColor = '#000';
    controlsInfo.style.border = '1px solid #ff00ff';
    controlsInfo.style.padding = '8px';
    controlsInfo.style.borderRadius = '4px';
    controlsInfo.style.color = '#fff';
    controlsInfo.style.fontSize = '14px';
    controlsInfo.style.marginBottom = '32px';
    controlsInfo.style.boxShadow = '0 0 10px #ff00ff';
    controlsInfo.style.zIndex = '100';
    controlsInfo.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="font-weight: bold; color: #ff00ff; margin: 0;">Controls</h3>
      </div>
      <ul style="font-size: 12px; padding-left: 16px; margin: 0;">
        <li>← / A: Move Left</li>
        <li>→ / D: Move Right</li>
        <li>↑ / W: Move Up</li>
        <li>↓ / S: Move Down</li>
        <li>Space / Click: Fire</li>
      </ul>
    `;
    startOverlay.appendChild(controlsInfo);
    
    // Create start button
    const startButton = document.createElement('button');
    startButton.className = 'cosmic-slots-start-button';
    startButton.style.padding = '12px 32px';
    startButton.style.color = '#000';
    startButton.style.backgroundColor = '#ff00ff';
    startButton.style.fontWeight = 'bold';
    startButton.style.borderRadius = '6px';
    startButton.style.border = 'none';
    startButton.style.cursor = 'pointer';
    startButton.style.boxShadow = '0 0 10px #ff00ff, 0 0 15px #ff00ff';
    startButton.style.fontSize = '2rem';
    startButton.style.fontFamily = '"Courier New", monospace';
    startButton.style.textTransform = 'uppercase';
    startButton.style.letterSpacing = '2px';
    startButton.style.marginTop = '40px';
    startButton.textContent = 'START GAME';
    startButton.onclick = startGame;
    startOverlay.appendChild(startButton);
    
    // Create game over overlay
    gameOverOverlay = document.createElement('div');
    gameOverOverlay.className = 'cosmic-slots-game-over-overlay';
    gameOverOverlay.style.position = 'absolute';
    gameOverOverlay.style.inset = '0';
    gameOverOverlay.style.display = 'none'; // Initially hidden
    gameOverOverlay.style.flexDirection = 'column';
    gameOverOverlay.style.alignItems = 'center';
    gameOverOverlay.style.justifyContent = 'center';
    gameOverOverlay.style.zIndex = '50';
    gameOverOverlay.style.backgroundColor = '#000';
    gameContainer.appendChild(gameOverOverlay);
    
    // Create game over score display
    const gameOverScore = document.createElement('p');
    gameOverScore.className = 'cosmic-slots-game-over-score';
    gameOverScore.style.color = '#ff00ff';
    gameOverScore.style.fontSize = '2.8rem';
    gameOverScore.style.fontWeight = '700';
    gameOverScore.style.textShadow = '0 0 10px #ff00ff';
    gameOverScore.style.marginBottom = '32px';
    gameOverScore.style.textAlign = 'center';
    gameOverScore.style.padding = '0 16px';
    gameOverScore.textContent = '000000';
    gameOverOverlay.appendChild(gameOverScore);
    
    // Create play again button
    const playAgainButton = document.createElement('button');
    playAgainButton.className = 'cosmic-slots-play-again-button';
    playAgainButton.style.padding = '12px 32px';
    playAgainButton.style.color = '#000';
    playAgainButton.style.backgroundColor = '#ff00ff';
    playAgainButton.style.fontWeight = 'bold';
    playAgainButton.style.borderRadius = '6px';
    playAgainButton.style.border = 'none';
    playAgainButton.style.cursor = 'pointer';
    playAgainButton.style.boxShadow = '0 0 10px #ff00ff, 0 0 15px #ff00ff';
    playAgainButton.style.fontSize = '2rem';
    playAgainButton.style.fontFamily = '"Courier New", monospace';
    playAgainButton.style.textTransform = 'uppercase';
    playAgainButton.style.letterSpacing = '2px';
    playAgainButton.style.marginTop = '24px';
    playAgainButton.textContent = 'PLAY AGAIN';
    playAgainButton.onclick = restartGame;
    gameOverOverlay.appendChild(playAgainButton);
    
    // Add to container
    container.appendChild(gameContainer);
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleResize);
    
    // Initialize game state
    initGameState();
    
    // Handle initial resize
    handleResize();
    
    // Add neon pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes neon-pulse {
        0%, 100% {
          box-shadow: 0 0 10px #ff00ff, 0 0 20px #ff00ff;
        }
        50% {
          box-shadow: 0 0 15px #ff00ff, 0 0 30px #ff00ff;
        }
      }
    `;
    document.head.appendChild(style);
    
    // Initial render
    render();
  };
  
  // Initialize game state
  function initGameState() {
    gameState = {
      player: {
        position: { x: gameWidth / 2, y: gameHeight - 60 },
        width: PLAYER_WIDTH,
        height: PLAYER_HEIGHT,
        speed: PLAYER_SPEED,
        isInvulnerable: false,
        lastFireTime: 0
      },
      bullets: [],
      enemyBullets: [],
      asteroids: [],
      enemies: [],
      explosions: [],
      score: 0,
      lives: 3,
      level: 1,
      gameTime: 0,
      asteroidSpawnRate: ASTEROID_SPAWN_RATE,
      enemySpawnRate: ENEMY_SPAWN_RATE,
      enemyKillCount: 0
    };
  }
  
  // Handle window resize
  function handleResize() {
    isMobile = window.innerWidth < 768;
    
    // Update mobile controls
    if (isMobile && gameStarted && !gameOver) {
      createMobileControls();
    } else {
      removeMobileControls();
    }
    
    // Update life indicators
    updateLives();
  }
  
  // Start the game
  function startGame() {
    gameStarted = true;
    gameOver = false;
    initGameState();
    startOverlay.style.display = 'none';
    gameOverOverlay.style.display = 'none';
    
    // Create mobile controls if needed
    if (isMobile) {
      createMobileControls();
    }
    
    // Start game loop
    lastTime = performance.now();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(gameLoop);
  }
  
  // Restart the game
  function restartGame() {
    gameStarted = true;
    gameOver = false;
    initGameState();
    startOverlay.style.display = 'none';
    gameOverOverlay.style.display = 'none';
    
    // Create mobile controls if needed
    if (isMobile) {
      createMobileControls();
    }
    
    // Start game loop
    lastTime = performance.now();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(gameLoop);
  }
  
  // End the game
  function endGame() {
    gameOver = true;
    
    // Update game over score
    const gameOverScore = gameOverOverlay.querySelector('.cosmic-slots-game-over-score');
    if (gameOverScore) {
      gameOverScore.textContent = gameState.score.toString().padStart(6, '0');
    }
    
    // Show game over overlay
    gameOverOverlay.style.display = 'flex';
    
    // Remove mobile controls
    removeMobileControls();
    
    // Stop game loop
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
  
  // Create mobile controls
  function createMobileControls() {
    // Remove existing controls
    removeMobileControls();
    
    // Create controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'cosmic-slots-mobile-controls';
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.bottom = '16px';
    controlsContainer.style.left = '0';
    controlsContainer.style.right = '0';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.justifyContent = 'space-between';
    controlsContainer.style.padding = '0 16px';
    controlsContainer.style.zIndex = '40';
    gameContainer.appendChild(controlsContainer);
    
    // Create directional controls
    const directionalControls = document.createElement('div');
    directionalControls.className = 'cosmic-slots-directional-controls';
    directionalControls.style.display = 'grid';
    directionalControls.style.gridTemplateColumns = 'repeat(3, 1fr)';
    directionalControls.style.gridTemplateRows = 'repeat(3, 1fr)';
    directionalControls.style.gap = '8px';
    controlsContainer.appendChild(directionalControls);
    
    // Create left button
    const leftButton = document.createElement('button');
    leftButton.className = 'cosmic-slots-control-button';
    leftButton.style.gridColumn = '1';
    leftButton.style.gridRow = '2';
    leftButton.style.width = '64px';
    leftButton.style.height = '64px';
    leftButton.style.backgroundColor = 'rgba(255, 0, 255, 0.7)';
    leftButton.style.borderRadius = '50%';
    leftButton.style.border = 'none';
    leftButton.style.display = 'flex';
    leftButton.style.alignItems = 'center';
    leftButton.style.justifyContent = 'center';
    leftButton.style.color = '#fff';
    leftButton.style.fontSize = '24px';
    leftButton.style.boxShadow = '0 0 10px #ff00ff';
    leftButton.textContent = '←';
    leftButton.addEventListener('touchstart', () => handleMobileMove(-1, 0));
    leftButton.addEventListener('mousedown', () => handleMobileMove(-1, 0));
    directionalControls.appendChild(leftButton);
    
    // Create right button
    const rightButton = document.createElement('button');
    rightButton.className = 'cosmic-slots-control-button';
    rightButton.style.gridColumn = '3';
    rightButton.style.gridRow = '2';
    rightButton.style.width = '64px';
    rightButton.style.height = '64px';
    rightButton.style.backgroundColor = 'rgba(255, 0, 255, 0.7)';
    rightButton.style.borderRadius = '50%';
    rightButton.style.border = 'none';
    rightButton.style.display = 'flex';
    rightButton.style.alignItems = 'center';
    rightButton.style.justifyContent = 'center';
    rightButton.style.color = '#fff';
    rightButton.style.fontSize = '24px';
    rightButton.style.boxShadow = '0 0 10px #ff00ff';
    rightButton.textContent = '→';
    rightButton.addEventListener('touchstart', () => handleMobileMove(1, 0));
    rightButton.addEventListener('mousedown', () => handleMobileMove(1, 0));
    directionalControls.appendChild(rightButton);
    
    // Create up button
    const upButton = document.createElement('button');
    upButton.className = 'cosmic-slots-control-button';
    upButton.style.gridColumn = '2';
    upButton.style.gridRow = '1';
    upButton.style.width = '64px';
    upButton.style.height = '64px';
    upButton.style.backgroundColor = 'rgba(255, 0, 255, 0.7)';
    upButton.style.borderRadius = '50%';
    upButton.style.border = 'none';
    upButton.style.display = 'flex';
    upButton.style.alignItems = 'center';
    upButton.style.justifyContent = 'center';
    upButton.style.color = '#fff';
    upButton.style.fontSize = '24px';
    upButton.style.boxShadow = '0 0 10px #ff00ff';
    upButton.textContent = '↑';
    upButton.addEventListener('touchstart', () => handleMobileMove(0, -1));
    upButton.addEventListener('mousedown', () => handleMobileMove(0, -1));
    directionalControls.appendChild(upButton);
    
    // Create down button
    const downButton = document.createElement('button');
    downButton.className = 'cosmic-slots-control-button';
    downButton.style.gridColumn = '2';
    downButton.style.gridRow = '3';
    downButton.style.width = '64px';
    downButton.style.height = '64px';
    downButton.style.backgroundColor = 'rgba(255, 0, 255, 0.7)';
    downButton.style.borderRadius = '50%';
    downButton.style.border = 'none';
    downButton.style.display = 'flex';
    downButton.style.alignItems = 'center';
    downButton.style.justifyContent = 'center';
    downButton.style.color = '#fff';
    downButton.style.fontSize = '24px';
    downButton.style.boxShadow = '0 0 10px #ff00ff';
    downButton.textContent = '↓';
    downButton.addEventListener('touchstart', () => handleMobileMove(0, 1));
    downButton.addEventListener('mousedown', () => handleMobileMove(0, 1));
    directionalControls.appendChild(downButton);
    
    // Create fire button
    const fireButton = document.createElement('button');
    fireButton.className = 'cosmic-slots-fire-button';
    fireButton.style.width = '80px';
    fireButton.style.height = '80px';
    fireButton.style.backgroundColor = 'rgba(255, 0, 255, 0.7)';
    fireButton.style.borderRadius = '50%';
    fireButton.style.border = 'none';
    fireButton.style.display = 'flex';
    fireButton.style.alignItems = 'center';
    fireButton.style.justifyContent = 'center';
    fireButton.style.color = '#fff';
    fireButton.style.fontSize = '16px';
    fireButton.style.boxShadow = '0 0 10px #ff00ff';
    fireButton.textContent = 'FIRE';
    fireButton.addEventListener('touchstart', fireBullet);
    fireButton.addEventListener('mousedown', fireBullet);
    controlsContainer.appendChild(fireButton);
  }
  
  // Remove mobile controls
  function removeMobileControls() {
    const controls = gameContainer.querySelector('.cosmic-slots-mobile-controls');
    if (controls) {
      controls.remove();
    }
  }
  
  // Handle mobile movement
  function handleMobileMove(dx, dy) {
    if (!gameStarted || gameOver) return;
    
    movementState = {
      left: dx < 0,
      right: dx > 0,
      up: dy < 0,
      down: dy > 0
    };
    
    setTimeout(() => {
      movementState = {
        left: false,
        right: false,
        up: false,
        down: false
      };
    }, 100);
  }
  
  // Handle key down
  function handleKeyDown(e) {
    if (!gameStarted || gameOver) return;
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        movementState.left = true;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        movementState.right = true;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        movementState.up = true;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        movementState.down = true;
        break;
      case ' ':
        fireBullet();
        break;
    }
  }
  
  // Handle key up
  function handleKeyUp(e) {
    if (!gameStarted || gameOver) return;
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        movementState.left = false;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        movementState.right = false;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        movementState.up = false;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        movementState.down = false;
        break;
    }
  }
  
  // Fire bullet
  function fireBullet() {
    if (!gameStarted || gameOver) return;
    
    const now = Date.now();
    if (now - gameState.player.lastFireTime < 250) {
      return;
    }
    
    const newBullet = {
      position: {
        x: gameState.player.position.x,
        y: gameState.player.position.y - gameState.player.height / 2
      },
      width: 4,
      height: 12,
      speed: BULLET_SPEED
    };
    
    gameState.bullets.push(newBullet);
    gameState.player.lastFireTime = now;
  }
  
  // Update game state
  function updateGameState(deltaTime) {
    if (!gameStarted || gameOver) return;
    
    // Update game time
    gameState.gameTime += deltaTime;
    
    // Update player position
    let playerX = gameState.player.position.x;
    let playerY = gameState.player.position.y;
    const speed = gameState.player.speed;
    
    if (movementState.left) playerX -= speed;
    if (movementState.right) playerX += speed;
    if (movementState.up) playerY -= speed;
    if (movementState.down) playerY += speed;
    
    playerX = Math.max(
      gameState.player.width / 2,
      Math.min(gameWidth - gameState.player.width / 2, playerX)
    );
    
    const minY = gameHeight * 0.7;
    const maxY = gameHeight - gameState.player.height / 2;
    playerY = Math.max(minY, Math.min(maxY, playerY));
    
    gameState.player.position.x = playerX;
    gameState.player.position.y = playerY;
    
    // Update bullets
    gameState.bullets = gameState.bullets
      .map(bullet => ({
        ...bullet,
        position: {
          ...bullet.position,
          y: bullet.position.y - bullet.speed
        }
      }))
      .filter(bullet => bullet.position.y > -bullet.height);
    
    // Update enemy bullets
    gameState.enemyBullets = gameState.enemyBullets
      .map(bullet => ({
        ...bullet,
        position: {
          ...bullet.position,
          y: bullet.position.y + bullet.speed
        }
      }))
      .filter(bullet => bullet.position.y < gameHeight + bullet.height);
    
    // Update asteroids
    gameState.asteroids = gameState.asteroids
      .map(asteroid => ({
        ...asteroid,
        position: {
          ...asteroid.position,
          y: asteroid.position.y + asteroid.speed
        },
        rotation: asteroid.rotation + asteroid.rotationSpeed
      }))
      .filter(asteroid => asteroid.position.y < gameHeight + asteroid.height);
    
    // Update enemies
    gameState.enemies = gameState.enemies
      .map(enemy => ({
        ...enemy,
        position: {
          ...enemy.position,
          y: enemy.position.y + enemy.speed
        }
      }))
      .filter(enemy => enemy.position.y < gameHeight + enemy.height);
    
    // Update explosions
    gameState.explosions = gameState.explosions
      .map(explosion => ({
        ...explosion,
        frame: explosion.frame + 0.2
      }))
      .filter(explosion => explosion.frame < explosion.maxFrames);
    
    // Spawn new asteroids
    const baseAsteroidRate = gameState.asteroidSpawnRate + (gameState.enemyKillCount * 0.001);
    if (Math.random() < baseAsteroidRate) {
      const size = Math.random() * 30 + 20;
      gameState.asteroids.push({
        position: {
          x: Math.random() * gameWidth,
          y: -size
        },
        width: size,
        height: size,
        speed: Math.random() * (ASTEROID_MAX_SPEED - ASTEROID_MIN_SPEED) + ASTEROID_MIN_SPEED,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 4
      });
    }
    
    // Spawn new enemies
    if (Math.random() < gameState.enemySpawnRate) {
      gameState.enemies.push({
        position: {
          x: Math.random() * (gameWidth - 50) + 25,
          y: -30
        },
        width: 40,
        height: 30,
        speed: ENEMY_SPEED,
        health: 1,
        lastFireTime: 0
      });
    }
    
    // Enemy firing
    gameState.enemies.forEach(enemy => {
      const now = gameState.gameTime;
      if (now - enemy.lastFireTime > 2000 && Math.random() < ENEMY_FIRE_RATE) {
        gameState.enemyBullets.push({
          position: {
            x: enemy.position.x,
            y: enemy.position.y + enemy.height / 2
          },
          width: 4,
          height: 12,
          speed: ENEMY_BULLET_SPEED
        });
        enemy.lastFireTime = now;
      }
    });
    
    // Check bullet-enemy collisions
    let remainingBullets = [];
    for (const bullet of gameState.bullets) {
      let hit = false;
      for (let i = 0; i < gameState.enemies.length; i++) {
        const enemy = gameState.enemies[i];
        if (checkCollision(bullet, enemy)) {
          enemy.health -= 1;
          hit = true;
          break;
        }
      }
      if (!hit) {
        remainingBullets.push(bullet);
      }
    }
    gameState.bullets = remainingBullets;
    
    // Remove dead enemies and add explosions/score
    let remainingEnemies = [];
    for (const enemy of gameState.enemies) {
      if (enemy.health <= 0) {
        gameState.score += 100;
        gameState.enemyKillCount += 1;
        gameState.explosions.push({
          position: { ...enemy.position },
          size: enemy.width * 1.5,
          frame: 0,
          maxFrames: 8
        });
      } else {
        remainingEnemies.push(enemy);
      }
    }
    gameState.enemies = remainingEnemies;
    
    // Check player-asteroid collisions
    let playerHit = false;
    gameState.asteroids.forEach(asteroid => {
      if (checkCollision(gameState.player, asteroid)) {
        playerHit = true;
      }
    });
    
    // Check player-enemy bullet collisions
    let remainingEnemyBullets = [];
    for (const bullet of gameState.enemyBullets) {
      if (checkCollision(gameState.player, bullet)) {
        playerHit = true;
      } else {
        remainingEnemyBullets.push(bullet);
      }
    }
    gameState.enemyBullets = remainingEnemyBullets;
    
    // Handle player hit
    if (playerHit && !gameState.player.isInvulnerable) {
      gameState.lives -= 1;
      gameState.explosions.push({
        position: { ...gameState.player.position },
        size: gameState.player.width * 2,
        frame: 0,
        maxFrames: 8
      });
      
      // Make player invulnerable briefly
      gameState.player.isInvulnerable = true;
      setTimeout(() => {
        if (gameState && gameState.player) {
          gameState.player.isInvulnerable = false;
        }
      }, 2000);
      
      // Update lives display
      updateLives();
    }
    
    // Check game over
    if (gameState.lives <= 0) {
      endGame();
    }
    
    // Update score display
    updateScore();
  }
  
  // Check collision between two objects
  function checkCollision(obj1, obj2) {
    const x1 = obj1.position.x - obj1.width / 2;
    const y1 = obj1.position.y - obj1.height / 2;
    const x2 = obj2.position.x - obj2.width / 2;
    const y2 = obj2.position.y - obj2.height / 2;
    
    return (
      x1 < x2 + obj2.width &&
      x1 + obj1.width > x2 &&
      y1 < y2 + obj2.height &&
      y1 + obj1.height > y2
    );
  }
  
  // Update score display
  function updateScore() {
    const scoreDisplay = gameContainer.querySelector('.cosmic-slots-score');
    if (scoreDisplay) {
      scoreDisplay.textContent = gameState.score.toString().padStart(6, '0');
    }
  }
  
  // Update lives display
  function updateLives() {
    const lifeIndicators = gameContainer.querySelectorAll('.cosmic-slots-life');
    lifeIndicators.forEach((indicator, index) => {
      if (index < gameState.lives) {
        indicator.style.backgroundColor = '#ff00ff';
        indicator.style.boxShadow = '0 0 7px #ff00ff';
      } else {
        indicator.style.backgroundColor = '#444';
        indicator.style.boxShadow = 'none';
      }
    });
  }
  
  // Game loop
  function gameLoop(timestamp) {
    if (!gameStarted || gameOver) return;
    
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    // Update game state
    updateGameState(deltaTime);
    
    // Render game
    render();
    
    // Request next frame
    animationFrameId = requestAnimationFrame(gameLoop);
  }
  
  // Render the game
  function render() {
    if (!ctx || !gameState) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, gameWidth, gameHeight);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, gameWidth, gameHeight);
    
    // Draw stars
    drawStars();
    
    // Draw player
    drawPlayer();
    
    // Draw bullets
    gameState.bullets.forEach(bullet => {
      drawBullet(bullet);
    });
    
    // Draw enemy bullets
    gameState.enemyBullets.forEach(bullet => {
      drawBullet(bullet, true);
    });
    
    // Draw asteroids
    gameState.asteroids.forEach(asteroid => {
      drawAsteroid(asteroid);
    });
    
    // Draw enemies
    gameState.enemies.forEach(enemy => {
      drawEnemy(enemy);
    });
    
    // Draw explosions
    gameState.explosions.forEach(explosion => {
      drawExplosion(explosion);
    });
    
    // Draw border
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 10;
    ctx.strokeRect(2, 2, gameWidth - 4, gameHeight - 4);
    ctx.shadowBlur = 0;
  }
  
  // Draw stars
  function drawStars() {
    ctx.save();
    
    for (let i = 0; i < 100; i++) {
      const x = (Math.sin(i * 567.8) * 0.5 + 0.5) * gameWidth;
      const y = ((Math.cos(i * 345.2) * 0.5 + 0.5) * gameHeight + gameState.gameTime * 0.05 * (i % 5 + 1)) % gameHeight;
      const size = (i % 3) + 1;
      
      if (i % 10 === 0) {
        ctx.fillStyle = '#FF00FF';
      } else if (i % 7 === 0) {
        ctx.fillStyle = '#00FFFF';
      } else {
        ctx.fillStyle = '#FFFFFF';
      }
      
      ctx.fillRect(x, y, size, size);
      
      if (i % 15 === 0) {
        ctx.shadowColor = '#FF00FF';
        ctx.shadowBlur = 5;
        ctx.fillRect(x, y, size, size);
        ctx.shadowBlur = 0;
      }
    }
    
    ctx.restore();
  }
  
  // Draw player
  function drawPlayer() {
    ctx.save();
    
    if (gameState.player.isInvulnerable && Math.floor(Date.now() / 100) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    
    ctx.fillStyle = '#FF00FF';
    ctx.beginPath();
    ctx.moveTo(gameState.player.position.x, gameState.player.position.y - gameState.player.height / 2);
    ctx.lineTo(gameState.player.position.x - gameState.player.width / 2, gameState.player.position.y + gameState.player.height / 2);
    ctx.lineTo(gameState.player.position.x + gameState.player.width / 2, gameState.player.position.y + gameState.player.height / 2);
    ctx.closePath();
    ctx.fill();
    
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(gameState.player.position.x, gameState.player.position.y - gameState.player.height / 2);
    ctx.lineTo(gameState.player.position.x - gameState.player.width / 2, gameState.player.position.y + gameState.player.height / 2);
    ctx.lineTo(gameState.player.position.x + gameState.player.width / 2, gameState.player.position.y + gameState.player.height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(
      gameState.player.position.x - gameState.player.width / 4,
      gameState.player.position.y,
      gameState.player.width / 2,
      gameState.player.height / 4
    );
    
    ctx.fillStyle = '#FF5500';
    ctx.beginPath();
    ctx.moveTo(gameState.player.position.x - gameState.player.width / 4, gameState.player.position.y + gameState.player.height / 2);
    ctx.lineTo(gameState.player.position.x, gameState.player.position.y + gameState.player.height / 2 + 10 + Math.random() * 5);
    ctx.lineTo(gameState.player.position.x + gameState.player.width / 4, gameState.player.position.y + gameState.player.height / 2);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }
  
  // Draw bullet
  function drawBullet(bullet, isEnemy = false) {
    ctx.save();
    
    ctx.fillStyle = isEnemy ? '#FF6600' : '#FF00FF';
    ctx.fillRect(
      bullet.position.x - bullet.width / 2,
      bullet.position.y - bullet.height / 2,
      bullet.width,
      bullet.height
    );
    
    ctx.shadowColor = isEnemy ? '#FF6600' : '#FF00FF';
    ctx.shadowBlur = 10;
    ctx.fillRect(
      bullet.position.x - bullet.width / 2,
      bullet.position.y - bullet.height / 2,
      bullet.width,
      bullet.height
    );
    
    ctx.restore();
  }
  
  // Draw asteroid
  function drawAsteroid(asteroid) {
    ctx.save();
    ctx.translate(asteroid.position.x, asteroid.position.y);
    ctx.rotate(asteroid.rotation * Math.PI / 180);
    
    ctx.fillStyle = '#A0A0A0';
    ctx.beginPath();
    const segments = 8;
    const angleStep = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const radius = asteroid.width / 2 * (0.8 + Math.sin(i * 3) * 0.2);
      const angle = i * angleStep;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#808080';
    for (let i = 0; i < 3; i++) {
      const craterSize = asteroid.width * (0.1 + Math.random() * 0.1);
      const angle = Math.random() * Math.PI * 2;
      const distance = asteroid.width * 0.3 * Math.random();
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      ctx.beginPath();
      ctx.arc(x, y, craterSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }
  
  // Draw enemy
  function drawEnemy(enemy) {
    ctx.save();
    
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(
      enemy.position.x - enemy.width / 2,
      enemy.position.y - enemy.height / 2,
      enemy.width,
      enemy.height
    );
    
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 10;
    ctx.fillRect(
      enemy.position.x - enemy.width / 2,
      enemy.position.y - enemy.height / 2,
      enemy.width,
      enemy.height
    );
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = '#FFFF00';
    ctx.fillRect(
      enemy.position.x - enemy.width / 4,
      enemy.position.y - enemy.height / 2,
      enemy.width / 2,
      enemy.height / 4
    );
    
    ctx.fillStyle = '#FF6600';
    ctx.beginPath();
    ctx.moveTo(enemy.position.x - enemy.width / 2, enemy.position.y);
    ctx.lineTo(enemy.position.x - enemy.width, enemy.position.y);
    ctx.lineTo(enemy.position.x - enemy.width / 2, enemy.position.y + enemy.height / 4);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(enemy.position.x + enemy.width / 2, enemy.position.y);
    ctx.lineTo(enemy.position.x + enemy.width, enemy.position.y);
    ctx.lineTo(enemy.position.x + enemy.width / 2, enemy.position.y + enemy.height / 4);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }
  
  // Draw explosion
  function drawExplosion(explosion) {
    ctx.save();
    
    const radius = explosion.size / 2 * (1 - explosion.frame / explosion.maxFrames);
    const opacity = 1 - explosion.frame / explosion.maxFrames;
    
    ctx.fillStyle = `rgba(255, 0, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = `rgba(255, 255, 0, ${opacity * 1.5})`;
    ctx.beginPath();
    ctx.arc(explosion.position.x, explosion.position.y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
  
  // Clean up
  this.destroy = function() {
    // Stop game loop
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    // Remove event listeners
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('resize', handleResize);
    
    // Remove game container
    if (gameContainer && gameContainer.parentNode) {
      gameContainer.parentNode.removeChild(gameContainer);
    }
  };
  
  // Initialize the game
  this.init();
}
// Make the game available globally
if (typeof window !== 'undefined') {
  window.CosmicSlots = CosmicSlots;
}
      