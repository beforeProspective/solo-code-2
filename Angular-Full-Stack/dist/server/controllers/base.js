"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class BaseCtrl {
    getDefaultFields() {
        return [];
    }
    // Get all with pagination and field projection
    getAll = async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
            const skip = (page - 1) * limit;
            let fieldsParam = req.query.fields;
            const defaultFields = this.getDefaultFields();
            let projection;
            if (fieldsParam) {
                const requestedFields = fieldsParam.split(',').filter(f => f.trim());
                const allowedFields = defaultFields.length > 0
                    ? requestedFields.filter(f => defaultFields.includes(f))
                    : requestedFields;
                projection = allowedFields.join(' ');
            }
            else if (defaultFields.length > 0) {
                projection = defaultFields.join(' ');
            }
            const [docs, total] = await Promise.all([
                projection
                    ? this.model.find({}).skip(skip).limit(limit).select(projection).lean()
                    : this.model.find({}).skip(skip).limit(limit).lean(),
                this.model.countDocuments()
            ]);
            const totalPages = Math.ceil(total / limit);
            const result = {
                data: docs,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            };
            return res.status(200).json(result);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
    // Count all
    count = async (req, res) => {
        try {
            const count = await this.model.countDocuments();
            return res.status(200).json(count);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
    // Insert
    insert = async (req, res) => {
        try {
            const obj = await new this.model(req.body).save();
            return res.status(201).json(obj);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
    // Get by id
    get = async (req, res) => {
        try {
            const obj = await this.model.findOne({ _id: req.params.id });
            return res.status(200).json(obj);
        }
        catch (err) {
            return res.status(500).json({ error: err.message });
        }
    };
    // Update by id
    update = async (req, res) => {
        try {
            await this.model.findOneAndUpdate({ _id: req.params.id }, req.body);
            return res.sendStatus(200);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
    // Delete by id
    delete = async (req, res) => {
        try {
            await this.model.findOneAndDelete({ _id: req.params.id });
            return res.sendStatus(200);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
    // Drop collection (for tests)
    deleteAll = async (_req, res) => {
        try {
            await this.model.deleteMany();
            return res.sendStatus(200);
        }
        catch (err) {
            return res.status(400).json({ error: err.message });
        }
    };
}
exports.default = BaseCtrl;
