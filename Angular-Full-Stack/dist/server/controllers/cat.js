"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const cat_1 = tslib_1.__importDefault(require("../models/cat"));
const base_1 = tslib_1.__importDefault(require("./base"));
class CatCtrl extends base_1.default {
    model = cat_1.default;
    getDefaultFields() {
        return ['_id', 'name', 'age', 'weight'];
    }
}
exports.default = CatCtrl;
