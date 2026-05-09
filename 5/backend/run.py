from app import create_app, db
from app.models import Room, Category

app = create_app()

def init_db():
    with app.app_context():
        db.create_all()
        if not Room.query.first():
            default_rooms = ['客厅', '卧室', '厨房', '卫生间', '书房', '阳台']
            for room in default_rooms:
                db.session.add(Room(name=room))
        if not Category.query.first():
            default_categories = ['家电', '家具', '电子产品', '厨房用品', '个人用品', '其他']
            for cat in default_categories:
                db.session.add(Category(name=cat))
        db.session.commit()

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
