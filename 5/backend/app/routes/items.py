from datetime import datetime
from flask import Blueprint, request, jsonify
from app import db
from app.models import Item

items_bp = Blueprint('items', __name__)

@items_bp.route('/', methods=['GET'])
@items_bp.route('', methods=['GET'])
def get_items():
    room_id = request.args.get('room_id', type=int)
    category_id = request.args.get('category_id', type=int)
    
    query = Item.query
    if room_id:
        query = query.filter_by(room_id=room_id)
    if category_id:
        query = query.filter_by(category_id=category_id)
    
    items = query.all()
    return jsonify([item.to_dict() for item in items])

@items_bp.route('/', methods=['POST'])
@items_bp.route('', methods=['POST'])
def create_item():
    data = request.get_json()
    item = Item(
        name=data['name'],
        purchase_date=datetime.strptime(data['purchase_date'], '%Y-%m-%d').date(),
        warranty_months=data['warranty_months'],
        image_url=data.get('image_url'),
        notes=data.get('notes'),
        room_id=data['room_id'],
        category_id=data['category_id']
    )
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201

@items_bp.route('/<int:item_id>', methods=['GET'])
def get_item(item_id):
    item = Item.query.get_or_404(item_id)
    return jsonify(item.to_dict())

@items_bp.route('/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    item = Item.query.get_or_404(item_id)
    data = request.get_json()
    
    item.name = data['name']
    item.purchase_date = datetime.strptime(data['purchase_date'], '%Y-%m-%d').date()
    item.warranty_months = data['warranty_months']
    item.image_url = data.get('image_url')
    item.notes = data.get('notes')
    item.room_id = data['room_id']
    item.category_id = data['category_id']
    
    db.session.commit()
    return jsonify(item.to_dict())

@items_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    item = Item.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return '', 204
