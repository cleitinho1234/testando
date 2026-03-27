const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  de: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  para: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  texto: String,
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);