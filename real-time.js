const { getAllServers, getServerPlayers, getServer } = require("./DB/Servers");
const { getPlayer } = require("./DB/PlayersSockets");
const { io } = require("./server");

const API = require("./api");

io.on("connection", (socket) => {
  socket.on("get-servers", (_, cb = () => {}) => {
    try {
      cb(null, getAllServers());
    } catch (error) {
      cb(error);
      console.log(error);
    }
  });

  socket.on("get-server-players", (_, cb = () => {}) => {
    try {
      const { serverId } = getPlayer(socket.id);
      cb(null, getServerPlayers(serverId));
    } catch (error) {
      cb(error);
      console.log(error);
    }
  });

  socket.on(
    "create-server",
    ({ serverName, serverPassword, player }, cb = () => {}) => {
      try {
        const serverId = API.createServer({ serverName, serverPassword });
        API.joinServer({ serverId, serverPassword, player, socket, cb });
      } catch (error) {
        cb(error);
        console.log(error);
      }
    }
  );

  socket.on(
    "join-server",
    ({ serverId, serverPassword, player }, cb = () => {}) => {
      try {
        API.joinServer({ serverId, serverPassword, player, socket, cb });
      } catch (error) {
        cb(error);
        console.log(error);
      }
    }
  );

  socket.on("add-bots", (_, cb = () => {}) => {
    try {
      API.addBots({ socket });
    } catch (error) {
      cb(error);
      console.log(error);
    }
  });

  socket.on("start-game", (_, cb = () => {}) => {
    console.log("start-game");
    try {
      const { serverId } = getPlayer(socket.id);
      API.startGame({ serverId });
    } catch (err) {
      cb(err);
    }
  });

  socket.on("next", ({ answerIndex }, cb = () => {}) => {
    try {
      const { serverId } = getPlayer(socket.id);
      API.next({ serverId, answerIndex });
      cb(null);
    } catch (error) {
      cb(error);
      console.log(error);
    }
  });

  socket.on("next-player", (_, cb = () => {}) => {
    try {
      const { serverId } = getPlayer(socket.id);
      API.nextPlayer({ socket, serverId });
      cb(null);
    } catch (error) {
      cb(error);
      console.log(error);
    }
  });

  socket.on("start-questions", (_, cb = () => {}) => {
    const { serverId } = getPlayer(socket.id);
    const server = getServer(serverId);
    API.startQuestions(server);
  });

  socket.on("get-player-surprise", (_, cb = () => {}) => {
    console.log('surpriseee')
    const { serverId } = getPlayer(socket.id);
    const server = getServer(serverId);
    API.emitPlayerSurprise(server);
  });

  socket.on("leave-server", () => {
    API.leaveServer(socket);
  });

  socket.on("disconnect", () => {
    API.leaveServer(socket);
  });
});
