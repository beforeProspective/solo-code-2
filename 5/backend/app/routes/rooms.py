from flask import Blueprint, request, jsonify
from app import db
from app.models import Room

rooms_bp = Blueprint('rooms', __name__)

@rooms_bp.route('/', methods=['GET'])
@rooms_bp.route('', methods=['GET'])
def get_rooms():
    rooms = Room.query.all()
    return jsonify([room.to_dict() for room in rooms])

@rooms_bp.route('/', methods=['POST'])
@rooms_bp.route('', methods=['POST'])
def create_room():
    data = request.get_json()
    existing = Room.query.filter_by(name=data['name']).first()
    if existing:
        return jsonify({'error': '房间已存在'}), 400
    
    room = Room(name=data['name'])
    db.session.add(room)
    db.session.commit()
    return jsonify(room.to_dict()), 201

@rooms_bp.route('/<int:room_id>', methods=['GET'])
def get_room(room_id):
    room = Room.query.get_or_404(room_id)
    return jsonify(room.to_dict())

@rooms_bp.route('/<int:room_id>', methods=['PUT'])
def update_room(room_id):
    room = Room.query.get_or_404(room_id)
    data = request.get_json()
    
    existing = Room.query.filter_by(name=data['name']).first()
    if existing and existing.id != room_id:
        return jsonify({'error': '房间名已被使用'}), 400
    
    room.name = data['name']
    db.session.commit()
    return jsonify(room.to_dict())

@rooms_bp.route('/<int:room_id>', methods=['DELETE'])
def delete_room(room_id):
    room = Room.query.get_or_404(room_id)
    if room.items:
        return jsonify({'error': '该房间下还有物品，无法删除'}), 400
    db.session.delete(room)
    db.session.commit()
    return '', 204
