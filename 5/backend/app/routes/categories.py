from flask import Blueprint, request, jsonify
from app import db
from app.models import Category

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('/', methods=['GET'])
@categories_bp.route('', methods=['GET'])
def get_categories():
    categories = Category.query.all()
    return jsonify([category.to_dict() for category in categories])

@categories_bp.route('/', methods=['POST'])
@categories_bp.route('', methods=['POST'])
def create_category():
    data = request.get_json()
    existing = Category.query.filter_by(name=data['name']).first()
    if existing:
        return jsonify({'error': '分类已存在'}), 400
    
    category = Category(name=data['name'])
    db.session.add(category)
    db.session.commit()
    return jsonify(category.to_dict()), 201

@categories_bp.route('/<int:category_id>', methods=['GET'])
def get_category(category_id):
    category = Category.query.get_or_404(category_id)
    return jsonify(category.to_dict())

@categories_bp.route('/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    category = Category.query.get_or_404(category_id)
    data = request.get_json()
    
    existing = Category.query.filter_by(name=data['name']).first()
    if existing and existing.id != category_id:
        return jsonify({'error': '分类名已被使用'}), 400
    
    category.name = data['name']
    db.session.commit()
    return jsonify(category.to_dict())

@categories_bp.route('/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    category = Category.query.get_or_404(category_id)
    if category.items:
        return jsonify({'error': '该分类下还有物品，无法删除'}), 400
    db.session.delete(category)
    db.session.commit()
    return '', 204
