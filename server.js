const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

mongoose.connect("mongodb+srv://admin:123456mini@cluster0.j6xbddq.mongodb.net/miniZap?retryWrites=true&w=majority")
  .then(() => console.log("Mongo conectado"));

const User = mongoose.model("User", { id: String, username: String, photo: String });
const Message = mongoose.model("Message", { fromId: String, toId: String, text: String, timestamp: Number });

let usuariosOnline = {}; 

io.on("connection", (socket) => {
    socket.on("register", (userId) => {
        socket.userId = userId;
        usuariosOnline[userId] = socket.id;
        io.emit("updateStatus", Object.keys(usuariosOnline));
    });

    socket.on("disconnect", () => {
        if (socket.userId) {
            delete usuariosOnline[socket.userId];
            io.emit("updateStatus", Object.keys(usuariosOnline));
        }
    });
});

app.post("/user", async (req, res) => {
    const id = Math.floor(1000 + Math.random() * 9000).toString();
    const user = new User({ id, username: req.body.username, photo: req.body.photo });
    await user.save();
    res.json(user);
});

app.put("/updateUser/:id", async (req, res) => {
    const user = await User.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    res.json(user);
});

app.get("/getUser/:id", async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    res.send(user || { error: "Não encontrado" });
});

app.post("/sendMessage", async (req, res) => {
    const msg = await Message.create({ ...req.body, timestamp: Date.now() });
    res.json(msg);
});

app.get("/getMessages/:id", async (req, res) => {
    const msgs = await Message.find({ $or: [{ fromId: req.params.id }, { toId: req.params.id }] }).sort({ timestamp: 1 });
    res.send(msgs);
});

server.listen(3000, () => console.log("Rodando na 3000"));
