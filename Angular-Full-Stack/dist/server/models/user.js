"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = require("bcryptjs");
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    email: { type: String, unique: true, lowercase: true, trim: true },
    username: String,
    password: String,
    role: String
});
// Before saving the user, hash the password
userSchema.pre('save', function (next) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const user = this;
    if (!user.isModified('password')) {
        return next();
    }
    (0, bcryptjs_1.genSalt)(10, (err, salt) => {
        if (err) {
            return next(err);
        }
        (0, bcryptjs_1.hash)(user.password, salt, (error, hashedPassword) => {
            if (error) {
                return next(error);
            }
            user.password = hashedPassword;
            next();
        });
    });
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
userSchema.methods.comparePassword = function (candidatePassword, callback) {
    (0, bcryptjs_1.compare)(candidatePassword, this.password, (err, isMatch) => {
        if (err) {
            return callback(err);
        }
        callback(null, isMatch);
    });
};
// Omit the password when returning a user
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.password;
        return ret;
    }
});
const User = (0, mongoose_1.model)('User', userSchema);
exports.default = User;
