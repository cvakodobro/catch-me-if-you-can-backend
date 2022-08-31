const { getServer, setServer, deleteServer } = require("./DB/Servers");
const { addPlayer, removePlayer, getPlayer } = require("./DB/PlayersSockets");
const { io } = require("./server");
const { getBots } = require("./DB/Bots");
const GameServer = require("./GameServer");

function joinServer({
  serverId,
  serverPassword = "",
  player,
  socket,
  cb = () => {},
}) {
  const server = getServer(serverId);

  if (!server) throw new Error("Server Doesn't Exist");
  if (server.serverPassword !== serverPassword)
    throw new Error("Invalid Server Password");
  if (player.name.trim().length <= 1) throw new Error("Player Name too short");
  if (server.players.length >= server.numberOfPlayers)
    throw new Error("Server is Already full");

  let playerId;
  if (socket) {
    player.socketId = socket.id;
    socket.join(serverId);
    playerId = server.joinPlayer(player);
    addPlayer(socket.id, playerId, serverId);
  } else {
    playerId = server.joinPlayer(player);
  }

  cb(null, playerId);

  io.to(serverId).emit("players-changed", server.players);

  // TO BE REMOVED (ONLY FOR DEVELOPMENT)
  if (server.players.length === 2) {
    setTimeout(() => {
      const botsToAdd = getBots(server.numberOfPlayers - server.players.length);
      for (const bot of botsToAdd) {
        joinServer({
          serverId,
          serverPassword: server.serverPassword,
          player: {
            ...bot,
            isBot: true,
          },
        });
      }
    }, 1000);
    return;
  }

  if (server.players.length === server.numberOfPlayers) {
    initGame({ socket, server });
  }
}

function createServer({ serverName, serverPassword }) {
  if (serverName.trim().length < 2) throw new Error();
  const server = new GameServer(serverName, serverPassword);
  const serverId = server.serverId;
  setServer(server);
  server.init();
  return serverId;
}

function initGame({ server }) {
  setTimeout(() => {
    server.start();
    for (const player of server.players) {
      if (player.socketId) {
        io.to(player.socketId).emit("init-game", {
          players: server.players,
        });
      }
    }
  }, 2000);
}

function startGame({ serverId }) {
  const server = getServer(serverId);
  if (!server.gameRunning) {
    console.log("server-startGame");
    server.gameRunning = true;

    if (
      server.players[server.curPlayer] &&
      (server.players[server.curPlayer].disconnected ||
        server.players[server.curPlayer].isBot)
    ) {
      setTimeout(() => {
        startQuestions(server);
      }, 3000);
    }

    server.onFinish((playersOrdered) => {
      io.to(serverId).emit("finished-game", playersOrdered);
    });
  }
}

function startQuestions(server) {
  console.log("start-questions");
  server.startQuestions();
  emitQuestion(server);
}

function answerQuestion(server, answerIndex) {
  server.answerQuestion(answerIndex);
  for (const player of server.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("question-answer", answerIndex);
    }
  }
}

function emitQuestion(server) {
  console.log("emiting-question");
  const data = server.getQuestion();
  for (const player of server.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("next-question", data);
    }
  }

  if (
    server.players[server.curPlayer] &&
    (server.players[server.curPlayer].disconnected ||
      server.players[server.curPlayer].isBot)
  ) {
    setTimeout(() => {
      moveBot(server);
    }, 3000);
  }
}

function next({ serverId, answerIndex }) {
  console.log("next", answerIndex);
  try {
    const server = getServer(serverId);
    answerQuestion(server, answerIndex);
    setTimeout(() => {
      if (server.currentQuestion < 5) {
        emitQuestion(server);
      } else {
        movePlayer(server);
      }
    }, 2000);
  } catch (error) {
    console.log("server removed");
  }
}

function movePlayer(server, step) {
  const { startPosition, endPosition, direction } = server.movePlayer(step);
  emitPlayersChanged(
    server,
    startPosition,
    endPosition,
    direction,
    server.players[server.curPlayer].id
  );

  if (
    server.players[server.curPlayer] &&
    (server.players[server.curPlayer].disconnected ||
      server.players[server.curPlayer].isBot)
  ) {
    setTimeout(() => {
      console.log("emiting surprise for bot");
      emitPlayerSurprise(server);
    }, (step ? Math.abs(step) : server.currentSetCorrectAnswers + 1) * 1000);
  }
}

function checkIfEnd(server) {
  if (server.surprise !== null) return false;
  if (
    server.players[server.curPlayer].moved &&
    server.players[server.curPlayer].position ===
      server.players[server.curPlayer].initialPosition
  ) {
    server.finishGame();
    return true;
  }

  return false;
}

function checkPlayerToRemove(server) {
  let playerToRemove = undefined;

  server.players.forEach((player, index) => {
    console.log(
      index,
      player.removed,
      player.position,
      server.players[server.curPlayer].position
    );
    if (index === server.curPlayer || player.removed) return;

    if (player.position === server.players[server.curPlayer].position) {
      playerToRemove = index;
    }
  });

  if (playerToRemove !== undefined) {
    const { newPlayers, removedPlayer } = server.removePlayer(playerToRemove);

    for (const player of server.players) {
      if (player.socketId) {
        io.to(player.socketId).emit("player-removed", {
          newPlayers,
          removedPlayer,
        });
      }
    }
    return true;
  }

  return false;
}

function emitPlayerSurprise(server) {
  console.log("emmiting surprise now now ");
  const end = checkIfEnd(server);

  if (end) return;

  const playerToRemove = checkPlayerToRemove(server);

  const surprise = server.getSurprise();

  setTimeout(
    () => {
      for (const player of server.players) {
        if (player.socketId) {
          io.to(player.socketId).emit("player-surprise", {
            surprise,
          });
        }
      }
    },
    playerToRemove ? 3000 : 0
  );

  setTimeout(
    () => {
      if (surprise.step !== 0) {
        movePlayer(server, surprise.step);
      } else {
        nextPlayer({ serverId: server.serverId });
      }
    },
    playerToRemove ? 6000 : 3000
  );
}

function emitPlayersChanged(
  server,
  startPosition,
  endPosition,
  direction,
  currentPlayerId
) {
  console.log("emiting players");
  for (const player of server.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("players-changed", {
        startPosition,
        endPosition,
        direction,
        currentPlayerId,
      });
    }
  }
}

function nextPlayer({ serverId }) {
  console.log("nextPlayer");
  try {
    const server = getServer(serverId);
    const data = server.nextPlayer();
    console.log(data);
    for (const player of server.players) {
      if (player.socketId) {
        io.to(player.socketId).emit("next-player", data);
      }
    }

    if (
      server.players[server.curPlayer] &&
      (server.players[server.curPlayer].disconnected ||
        server.players[server.curPlayer].isBot)
    ) {
      setTimeout(() => {
        startQuestions(server);
      }, 3000);
    }
  } catch (error) {
    console.log(error);
  }
}

function moveBot(server) {
  console.log("bot");
  next({
    serverId: server.serverId,
    // answerIndex: 3
    answerIndex: Math.floor(Math.random() * 4),
  });
}

function leaveServer(socket) {
  console.log("leave-server");
  try {
    const player = getPlayer(socket.id);
    const { playerId, serverId } = player;
    const server = getServer(serverId);

    server.leavePlayer(playerId);
    let connectedPlayer = 0;
    for (const p of server.players) {
      if (!p.disconnected && !p.isBot) connectedPlayer++;
    }
    if (connectedPlayer === 0) deleteServer(serverId);

    socket.leave(serverId);
    if (server.gameRunning) io.to(serverId).emit("player-left", playerId);
    else io.to(serverId).emit("players-changed", server.players);

    if (
      server.players[server.curPlayer].isBot &&
      server.players[server.curPlayer].id === playerId
    )
      moveBot(server);

    removePlayer(socket.id);
  } catch (error) {}
}

module.exports = {
  emitQuestion,
  joinServer,
  createServer,
  initGame,
  startGame,
  next,
  leaveServer,
  nextPlayer,
  startQuestions,
  emitPlayerSurprise,
};
