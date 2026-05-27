"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const jsonwebtoken_1 = require("jsonwebtoken");
const user_1 = tslib_1.__importDefault(require("../models/user"));
const base_1 = tslib_1.__importDefault(require("./base"));
const secret = process.env.SECRET_TOKEN;
class UserCtrl extends base_1.default {
    model = user_1.default;
    getDefaultFields() {
        return ['_id', 'username', 'email', 'role'];
    }
    login = async (req, res) => {
        try {
            const user = await this.model.findOne({ email: req.body.email });
            if (!user) {
                return res.sendStatus(403);
            }
            return user.comparePassword(req.body.password, (error, isMatch) => {
                if (error || !isMatch) {
                    return res.sendStatus(403);
                }
                const token = (0, jsonwebtoken_1.sign)({ user }, secret, { expiresIn: '24h' });
                return res.status(200).json({ token });
            });
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
    update = async (req, res) => {
        try {
            const user = await this.model.findOneAndUpdate({ _id: req.params.id }, req.body, { new: true });
            if (!user) {
                return res.sendStatus(404);
            }
            const token = (0, jsonwebtoken_1.sign)({ user }, secret, { expiresIn: '24h' });
            return res.status(200).json({ token });
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
}
exports.default = UserCtrl;
