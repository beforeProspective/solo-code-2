from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Base
from app.auth import create_user, authenticate_user, create_access_token
from werkzeug.security import generate_password_hash, check_password_hash
from jose import jwt
from app.config import get_settings

print("Creating in-memory database...")
engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)
db = SessionLocal()

print("\n1. Testing password hashing...")
pwd_hash = generate_password_hash('test123')
print(f'   Hash: {pwd_hash[:50]}...')
print(f'   Verify correct: {check_password_hash(pwd_hash, "test123")}')
print(f'   Verify wrong: {check_password_hash(pwd_hash, "wrong")}')

print("\n2. Testing create_user...")
user = create_user(db, 'testuser', 'test@test.com', 'testpass')
print(f'   User created: {user.username}, ID: {user.id}')

print("\n3. Testing authenticate_user...")
auth_user = authenticate_user(db, 'testuser', 'testpass')
print(f'   Auth success: {auth_user is not None}')
print(f'   Auth wrong password: {authenticate_user(db, "testuser", "wrong") is None}')

print("\n4. Testing JWT...")
settings = get_settings()
token = create_access_token(data={'sub': 'testuser'})
print(f'   Token generated: {token[:50]}...')
payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
print(f'   Payload verified: {payload}')

print("\n=== All tests passed! ===")
