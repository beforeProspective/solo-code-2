from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from dateutil.relativedelta import relativedelta
from app.models import Item

reminders_bp = Blueprint('reminders', __name__)

@reminders_bp.route('/', methods=['GET'])
@reminders_bp.route('', methods=['GET'])
def get_reminders():
    days_ahead = request.args.get('days_ahead', default=30, type=int)
    today = datetime.now().date()
    
    all_items = Item.query.all()
    upcoming = []
    
    for item in all_items:
        warranty_end = item.purchase_date + relativedelta(months=item.warranty_months)
        days_left = (warranty_end - today).days
        
        if 0 <= days_left <= days_ahead:
            status = 'expiring_soon'
        elif days_left < 0:
            status = 'expired'
        else:
            continue
        
        upcoming.append({
            'id': item.id,
            'name': item.name,
            'purchase_date': item.purchase_date.strftime('%Y-%m-%d'),
            'warranty_end_date': warranty_end.strftime('%Y-%m-%d'),
            'days_left': days_left,
            'status': status,
            'room_name': item.room.name if item.room else None,
            'category_name': item.category.name if item.category else None
        })
    
    upcoming.sort(key=lambda x: x['days_left'])
    return jsonify(upcoming)
