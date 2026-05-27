"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const supertest_1 = tslib_1.__importDefault(require("supertest"));
const globals_1 = require("@jest/globals");
process.env.NODE_ENV = 'test';
const app_1 = require("../app");
const mongo_1 = require("../mongo");
const newUser = { username: 'Dave', email: 'dave@example.com', role: 'user' };
let userId = '';
beforeAll(async () => {
    await (0, mongo_1.connectToMongo)();
});
afterAll(async () => {
    await (0, supertest_1.default)(app_1.app).delete('/api/users/delete');
    await (0, mongo_1.disconnectMongo)();
});
(0, globals_1.describe)('User tests', () => {
    (0, globals_1.test)('should get all users', async () => {
        const res = await (0, supertest_1.default)(app_1.app).get('/api/users');
        (0, globals_1.expect)(res.statusCode).toBe(200);
        (0, globals_1.expect)(res.body).toStrictEqual([]);
    });
    (0, globals_1.test)('should count all users', async () => {
        const res = await (0, supertest_1.default)(app_1.app).get('/api/users/count');
        (0, globals_1.expect)(res.statusCode).toBe(200);
        (0, globals_1.expect)(res.body).toStrictEqual(0);
    });
    (0, globals_1.test)('should create a new user', async () => {
        const res = await (0, supertest_1.default)(app_1.app).post('/api/user').send(newUser);
        (0, globals_1.expect)(res.statusCode).toBe(201);
        (0, globals_1.expect)(res.body).toMatchObject(newUser);
        userId = res.body._id;
    });
    (0, globals_1.test)('should get a user by id', async () => {
        const res = await (0, supertest_1.default)(app_1.app).get(`/api/user/${userId}`);
        (0, globals_1.expect)(res.statusCode).toBe(200);
        (0, globals_1.expect)(res.body).toMatchObject(newUser);
    });
    (0, globals_1.test)('should update a user by id', async () => {
        const res = await (0, supertest_1.default)(app_1.app).put(`/api/user/${userId}`).send({ username: 'Dave2' });
        (0, globals_1.expect)(res.statusCode).toBe(200);
    });
    (0, globals_1.test)('should delete a user by id', async () => {
        const res = await (0, supertest_1.default)(app_1.app).delete(`/api/user/${userId}`);
        (0, globals_1.expect)(res.statusCode).toBe(200);
    });
});
