from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_httpauth import HTTPBasicAuth
from datetime import datetime
from models import db, User, Category, Tag, Article, Like, SiteSettings, article_tags

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blog.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'your-secret-key-change-in-production'

CORS(app)
db.init_app(app)
auth = HTTPBasicAuth()

@auth.verify_password
def verify_password(username, password):
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password) and user.is_admin:
        return user
    return None

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password) and user.is_admin:
        return jsonify({'success': True, 'user': user.to_dict()})
    return jsonify({'success': False, 'message': '用户名或密码错误'}), 401

@app.route('/api/articles', methods=['GET'])
def get_articles():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    category_id = request.args.get('category_id', type=int)
    tag_id = request.args.get('tag_id', type=int)
    keyword = request.args.get('keyword', type=str)
    
    query = Article.query.filter_by(is_published=True)
    
    if category_id:
        query = query.filter_by(category_id=category_id)
    if tag_id:
        query = query.filter(Article.tags.any(id=tag_id))
    if keyword:
        query = query.filter(
            (Article.title.contains(keyword)) | 
            (Article.content.contains(keyword)) |
            (Article.summary.contains(keyword))
        )
    
    query = query.order_by(Article.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'articles': [article.to_dict(include_content=False) for article in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
    })

@app.route('/api/articles/<int:id>', methods=['GET'])
def get_article(id):
    article = Article.query.get_or_404(id)
    article.views += 1
    db.session.commit()
    return jsonify(article.to_dict())

@app.route('/api/articles', methods=['POST'])
@auth.login_required
def create_article():
    data = request.get_json()
    article = Article(
        title=data['title'],
        content=data['content'],
        summary=data.get('summary', ''),
        cover_image=data.get('cover_image', ''),
        category_id=data.get('category_id'),
        is_published=data.get('is_published', True)
    )
    
    tag_ids = data.get('tag_ids', [])
    for tag_id in tag_ids:
        tag = Tag.query.get(tag_id)
        if tag:
            article.tags.append(tag)
    
    db.session.add(article)
    db.session.commit()
    return jsonify(article.to_dict()), 201

@app.route('/api/articles/<int:id>', methods=['PUT'])
@auth.login_required
def update_article(id):
    article = Article.query.get_or_404(id)
    data = request.get_json()
    
    article.title = data.get('title', article.title)
    article.content = data.get('content', article.content)
    article.summary = data.get('summary', article.summary)
    article.cover_image = data.get('cover_image', article.cover_image)
    article.category_id = data.get('category_id', article.category_id)
    article.is_published = data.get('is_published', article.is_published)
    article.updated_at = datetime.utcnow()
    
    if 'tag_ids' in data:
        article.tags = []
        for tag_id in data['tag_ids']:
            tag = Tag.query.get(tag_id)
            if tag:
                article.tags.append(tag)
    
    db.session.commit()
    return jsonify(article.to_dict())

@app.route('/api/articles/<int:id>', methods=['DELETE'])
@auth.login_required
def delete_article(id):
    article = Article.query.get_or_404(id)
    db.session.delete(article)
    db.session.commit()
    return jsonify({'message': '删除成功'})

@app.route('/api/articles/<int:id>/like', methods=['POST'])
def like_article(id):
    article = Article.query.get_or_404(id)
    ip_address = request.remote_addr
    user_agent = request.user_agent.string
    
    existing_like = Like.query.filter_by(
        article_id=id,
        ip_address=ip_address
    ).first()
    
    if existing_like:
        return jsonify({'liked': False, 'message': '已经点过赞了', 'like_count': len(article.likes)})
    
    like = Like(
        article_id=id,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.session.add(like)
    db.session.commit()
    
    return jsonify({'liked': True, 'message': '点赞成功', 'like_count': len(article.likes)})

@app.route('/api/articles/<int:id>/like', methods=['GET'])
def check_like(id):
    article = Article.query.get_or_404(id)
    ip_address = request.remote_addr
    existing_like = Like.query.filter_by(
        article_id=id,
        ip_address=ip_address
    ).first()
    return jsonify({
        'liked': existing_like is not None,
        'like_count': len(article.likes)
    })

@app.route('/api/categories', methods=['GET'])
def get_categories():
    categories = Category.query.all()
    return jsonify([category.to_dict() for category in categories])

@app.route('/api/categories', methods=['POST'])
@auth.login_required
def create_category():
    data = request.get_json()
    category = Category(
        name=data['name'],
        description=data.get('description', '')
    )
    db.session.add(category)
    db.session.commit()
    return jsonify(category.to_dict()), 201

@app.route('/api/categories/<int:id>', methods=['PUT'])
@auth.login_required
def update_category(id):
    category = Category.query.get_or_404(id)
    data = request.get_json()
    category.name = data.get('name', category.name)
    category.description = data.get('description', category.description)
    db.session.commit()
    return jsonify(category.to_dict())

@app.route('/api/categories/<int:id>', methods=['DELETE'])
@auth.login_required
def delete_category(id):
    category = Category.query.get_or_404(id)
    for article in category.articles:
        article.category_id = None
    db.session.delete(category)
    db.session.commit()
    return jsonify({'message': '删除成功'})

@app.route('/api/tags', methods=['GET'])
def get_tags():
    tags = Tag.query.all()
    return jsonify([tag.to_dict() for tag in tags])

@app.route('/api/tags', methods=['POST'])
@auth.login_required
def create_tag():
    data = request.get_json()
    tag = Tag(name=data['name'])
    db.session.add(tag)
    db.session.commit()
    return jsonify(tag.to_dict()), 201

@app.route('/api/tags/<int:id>', methods=['PUT'])
@auth.login_required
def update_tag(id):
    tag = Tag.query.get_or_404(id)
    data = request.get_json()
    tag.name = data.get('name', tag.name)
    db.session.commit()
    return jsonify(tag.to_dict())

@app.route('/api/tags/<int:id>', methods=['DELETE'])
@auth.login_required
def delete_tag(id):
    tag = Tag.query.get_or_404(id)
    db.session.delete(tag)
    db.session.commit()
    return jsonify({'message': '删除成功'})

@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = SiteSettings.query.first()
    if not settings:
        settings = SiteSettings()
        db.session.add(settings)
        db.session.commit()
    return jsonify(settings.to_dict())

@app.route('/api/settings', methods=['PUT'])
@auth.login_required
def update_settings():
    settings = SiteSettings.query.first()
    if not settings:
        settings = SiteSettings()
        db.session.add(settings)
    data = request.get_json()
    settings.site_name = data.get('site_name', settings.site_name)
    settings.site_description = data.get('site_description', settings.site_description)
    settings.site_keywords = data.get('site_keywords', settings.site_keywords)
    settings.copyright_text = data.get('copyright_text', settings.copyright_text)
    settings.icp_number = data.get('icp_number', settings.icp_number)
    db.session.commit()
    return jsonify(settings.to_dict())

@app.route('/api/admin/articles', methods=['GET'])
@auth.login_required
def get_admin_articles():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    query = Article.query.order_by(Article.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        'articles': [article.to_dict(include_content=False) for article in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({'message': '资源不存在'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'message': '服务器内部错误'}), 500

def init_db():
    db.create_all()
    
    admin = User.query.filter_by(username='admin').first()
    if not admin:
        admin = User(username='admin', is_admin=True)
        admin.set_password('admin123')
        db.session.add(admin)
    
    settings = SiteSettings.query.first()
    if not settings:
        settings = SiteSettings()
        db.session.add(settings)
    
    sample_category = Category.query.filter_by(name='技术').first()
    if not sample_category:
        sample_category = Category(name='技术', description='技术相关文章')
        db.session.add(sample_category)
    
    sample_tag = Tag.query.filter_by(name='Python').first()
    if not sample_tag:
        sample_tag = Tag(name='Python')
        db.session.add(sample_tag)
    
    sample_article = Article.query.filter_by(title='欢迎来到我的博客').first()
    if not sample_article:
        sample_article = Article(
            title='欢迎来到我的博客',
            content='## 欢迎\n\n这是一篇示例文章，展示博客系统的基本功能。\n\n### 功能特性\n\n- 文章发布和管理\n- 分类和标签系统\n- 文章点赞功能\n- 响应式设计\n\n感谢您的访问！',
            summary='这是一篇示例文章，展示博客系统的基本功能。',
            category_id=1
        )
        sample_article.tags.append(sample_tag)
        db.session.add(sample_article)
    
    db.session.commit()

if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(host='0.0.0.0', port=8001, debug=True)
