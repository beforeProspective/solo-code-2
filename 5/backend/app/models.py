from datetime import datetime
from app import db

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    items = db.relationship('Item', backref='room', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name
        }

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    items = db.relationship('Item', backref='category', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name
        }

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    purchase_date = db.Column(db.Date, nullable=False)
    warranty_months = db.Column(db.Integer, nullable=False)
    image_url = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=False)

    @property
    def warranty_end_date(self):
        from dateutil.relativedelta import relativedelta
        return self.purchase_date + relativedelta(months=self.warranty_months)
    
    def to_dict(self):
        from dateutil.relativedelta import relativedelta
        return {
            'id': self.id,
            'name': self.name,
            'purchase_date': self.purchase_date.strftime('%Y-%m-%d'),
            'warranty_months': self.warranty_months,
            'warranty_end_date': self.warranty_end_date.strftime('%Y-%m-%d'),
            'image_url': self.image_url,
            'notes': self.notes,
            'room_id': self.room_id,
            'room_name': self.room.name if self.room else None,
            'category_id': self.category_id,
            'category_name': self.category.name if self.category else None
        }
