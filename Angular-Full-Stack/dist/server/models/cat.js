"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const catSchema = new mongoose_1.Schema({
    name: String,
    weight: Number,
    age: Number
});
const Cat = (0, mongoose_1.model)('Cat', catSchema);
exports.default = Cat;
