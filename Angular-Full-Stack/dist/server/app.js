"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const tslib_1 = require("tslib");
require("dotenv/config");
const express_1 = tslib_1.__importDefault(require("express"));
const morgan_1 = tslib_1.__importDefault(require("morgan"));
const path_1 = require("path");
const mongo_1 = require("./mongo");
const routes_1 = tslib_1.__importDefault(require("./routes"));
const feDir = 'public/browser';
const app = (0, express_1.default)();
exports.app = app;
app.set('port', (process.env.PORT || 3000));
app.use('/', express_1.default.static((0, path_1.join)(__dirname, `../${feDir}`)));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: false }));
if (process.env.NODE_ENV !== 'test') {
    app.use((0, morgan_1.default)('dev'));
}
(0, routes_1.default)(app);
const main = async () => {
    try {
        await (0, mongo_1.connectToMongo)();
        app.get('/*splat', (req, res) => {
            res.sendFile((0, path_1.join)(__dirname, `../${feDir}/index.html`));
        });
        app.listen(app.get('port'), () => console.log(`Angular Full Stack listening on port ${app.get('port')}`));
    }
    catch (error) {
        console.error(error);
    }
};
if (process.env.NODE_ENV !== 'test') {
    main();
}
