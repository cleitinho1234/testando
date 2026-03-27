const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  numero: { type: String, unique: true }, // pode ser usado para login/busca
  nome: String,
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);