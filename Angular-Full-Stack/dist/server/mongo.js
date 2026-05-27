"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectMongo = exports.connectToMongo = void 0;
const mongoose_1 = require("mongoose");
const connectToMongo = async () => {
    let mongodbURI;
    if (process.env.NODE_ENV === 'test') {
        mongodbURI = process.env.MONGODB_TEST_URI;
    }
    else {
        mongodbURI = process.env.MONGODB_URI;
    }
    await (0, mongoose_1.connect)(mongodbURI);
    console.log(`Connected to MongoDB (db: ${mongodbURI.split('/').pop()})`);
};
exports.connectToMongo = connectToMongo;
const disconnectMongo = async () => {
    await mongoose_1.connection.close();
};
exports.disconnectMongo = disconnectMongo;
