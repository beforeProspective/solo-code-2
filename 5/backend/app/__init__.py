from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///inventory.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    CORS(app, resources={
        r"/api/*": {
            "origins": ["http://localhost:3000", "http://127.0.0.1:3000"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })
    db.init_app(app)
    
    from app.routes import items_bp, rooms_bp, categories_bp, reminders_bp
    app.register_blueprint(items_bp, url_prefix='/api/items')
    app.register_blueprint(rooms_bp, url_prefix='/api/rooms')
    app.register_blueprint(categories_bp, url_prefix='/api/categories')
    app.register_blueprint(reminders_bp, url_prefix='/api/reminders')
    
    return app
