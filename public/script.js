const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔥 usuários online
let onlineUsers = {};

// 🔥 SOCKET.IO
io.on("connection", (socket) => {

  console.log("Usuário conectado");

  socket.on("userOnline", (userId) => {
    onlineUsers[userId] = socket.id;

    io.emit("updateOnline", Object.keys(onlineUsers));
  });

  socket.on("disconnect", () => {
    for (let id in onlineUsers) {
      if (onlineUsers[id] === socket.id) {
        delete onlineUsers[id];
      }
    }

    io.emit("updateOnline", Object.keys(onlineUsers));
  });

});

// 🔥 START
server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Servidor rodando");
});
