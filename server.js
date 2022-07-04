const express = require("express");
const http = require("http");
const cors = require("cors");
const Socket = require("socket.io");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = Socket(server, {
  cors: {
    origin: "*",
  },
});

module.exports = {
  server,
  io,
};
